/**
 * Data sync — the modules drive ONE set of records.
 *
 * Renders the real stores together (inventory, incoming, issue & consumption)
 * and walks the plant through a working day. After every step it checks that
 * every place a quantity appears agrees:
 *
 *   inventory record  =  Σ its ledger transactions  =  its latest balance-after
 *   map / twin pile   =  Σ active records at the pile
 *   reports snapshot  =  Σ records,  value = Σ qty × unit cost
 *   balance identity  =  opening + inward − net consumed − losses ± adjustments = closing
 *   receipts, consumptions, returns  ↔  their INCOMING / CONSUMPTION / RETURN transactions
 *
 * A refused action must change nothing anywhere.
 */

import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { IncomingProvider, useIncoming } from "@/components/incoming/incoming-store"
import { IssueProvider, useIssues } from "@/components/issues/issue-store"
import { PileProvider, usePiles } from "@/components/shell/pile-store"
import { PURCHASE_ORDERS, qualityParameters } from "@/lib/incoming/catalog"
import { resetLedger, type InventoryTransaction } from "@/lib/inventory/ledger"
import { resetLots } from "@/lib/inventory/lots"
import { resetMasters } from "@/lib/masters/registry"
import { materialEntry } from "@/lib/inventory/catalog"
import { consumptionTransactionType } from "@/lib/issues/consumption"
import { netConsumedQty, returnedQty } from "@/lib/issues/types"
import { consumptionLocations } from "@/lib/masters/registry"
import { balanceIdentity, movementTotals, snapshotAt, snapshotTotals } from "@/lib/reports/insights"

const wrapper = ({ children }: { children: ReactNode }) => (
  <PileProvider>
    <IncomingProvider>
      <IssueProvider>{children}</IssueProvider>
    </IncomingProvider>
  </PileProvider>
)

function useApp() {
  return { piles: usePiles(), incoming: useIncoming(), issues: useIssues() }
}

type App = ReturnType<typeof useApp>

const txnNo = (t: InventoryTransaction) => Number(t.txnId.slice(3))
const OUTWARD = new Set(["CONSUMPTION", "ISSUE", "EXPIRY", "WASTE", "LOSS", "UNACCOUNTED"])
const INWARD = new Set(["INCOMING", "RETURN"])

/** Every figure, everywhere, must agree. Returns a short summary for step-to-step deltas. */
function assertInSync(app: App, label: string) {
  const { inventory, ledger, records, silos } = app.piles
  const byRecord = new Map<string, InventoryTransaction[]>()
  for (const t of ledger) byRecord.set(t.inventoryId, [...(byRecord.get(t.inventoryId) ?? []), t])

  // 1. Each record equals its transactions; the before/after chain is unbroken and never negative.
  for (const r of inventory) {
    const txns = (byRecord.get(r.inventoryId) ?? []).slice().sort((a, b) => txnNo(a) - txnNo(b))
    const sum = txns.reduce((s, t) => s + t.quantity, 0)
    expect(r.quantity, `${label}: ${r.inventoryId} = Σ transactions`).toBeCloseTo(sum, 6)
    let running = 0
    for (const t of txns) {
      expect(t.balanceBefore, `${label}: ${t.txnId} before`).toBeCloseTo(running, 6)
      expect(t.balanceAfter, `${label}: ${t.txnId} after`).toBeCloseTo(t.balanceBefore + t.quantity, 6)
      expect(t.balanceAfter, `${label}: ${t.txnId} never negative`).toBeGreaterThanOrEqual(0)
      expect(t.locationId).toBe(r.locationId)
      expect(t.materialId).toBe(r.materialId)
      if (INWARD.has(t.type)) expect(t.quantity, `${label}: ${t.type} adds`).toBeGreaterThan(0)
      if (OUTWARD.has(t.type)) expect(t.quantity, `${label}: ${t.type} deducts`).toBeLessThan(0)
      running = t.balanceAfter
    }
  }
  // Every transaction belongs to a record.
  const ids = new Set(inventory.map((r) => r.inventoryId))
  for (const t of ledger) expect(ids.has(t.inventoryId), `${label}: ${t.txnId} has a record`).toBe(true)

  // 2. Map / twin / plant-flow figures are the records at each location.
  for (const p of records) {
    const held = inventory.filter((r) => r.active && r.locationId === p.pileId).reduce((s, r) => s + r.quantity, 0)
    expect(p.quantityMt, `${label}: pile ${p.pileId}`).toBeCloseTo(held, 6)
  }
  for (const s of silos) {
    const held = inventory.filter((r) => r.active && r.locationId === s.id).reduce((sum, r) => sum + r.quantity, 0)
    expect(s.quantityMt, `${label}: silo ${s.id}`).toBeCloseTo(held, 6)
  }

  // 3. Receipts and their INCOMING transactions.
  const byId = new Map(ledger.map((t) => [t.txnId, t]))
  for (const d of app.incoming.records) {
    if (d.status !== "RECEIVED") {
      expect(ledger.some((t) => t.type === "INCOMING" && t.links.incomingId === d.incomingId), `${label}: ${d.incomingId} not received, not posted`).toBe(false)
      continue
    }
    const t = byId.get(d.receipt!.transactionId)
    expect(t?.type, `${label}: ${d.incomingId} receipt`).toBe("INCOMING")
    expect(t!.quantity).toBeCloseTo(d.receipt!.receivedMt, 6)
    expect(t!.inventoryId).toBe(d.receipt!.inventoryId)
    expect(t!.links.incomingId).toBe(d.incomingId)
    expect(t!.links.poNumber).toBe(d.poNumber)
  }
  for (const t of ledger.filter((x) => x.type === "INCOMING")) {
    expect(app.incoming.records.some((d) => d.receipt?.transactionId === t.txnId), `${label}: ${t.txnId} has a receipt`).toBe(true)
  }

  // 4. Consumptions and returns and their transactions.
  for (const r of app.issues.records) {
    if (r.consumption && r.postingPoint === "CONSUMPTION") {
      const t = byId.get(r.consumption.transactionId!)
      expect(t?.type, `${label}: ${r.issueId} consumption`).toBe(consumptionTransactionType(r.consumption.category))
      expect(t!.quantity).toBeCloseTo(-r.consumption.consumedQty, 6)
      expect(t!.inventoryId).toBe(r.sourceInventoryId)
    }
    for (const ret of r.returns ?? []) {
      const t = byId.get(ret.transactionId!)
      expect(t?.type, `${label}: ${ret.returnId}`).toBe("RETURN")
      expect(t!.quantity).toBeCloseTo(ret.quantity, 6)
    }
    const net = netConsumedQty(r)
    if (net !== null) {
      expect(net).toBeCloseTo(r.consumption!.consumedQty - returnedQty(r), 6)
      expect(net, `${label}: ${r.issueId} net ≥ 0`).toBeGreaterThanOrEqual(0)
    }
  }

  // 5. Reports: the ledger snapshot is the records; the balance identity closes.
  const now = Math.max(Date.now(), ...ledger.map((t) => new Date(t.at).getTime()))
  const snap = snapshotTotals(snapshotAt(ledger, now), (m) => materialEntry(m)?.unitCost)
  const mt = inventory.filter((r) => r.uom === "MT").reduce((s, r) => s + r.quantity, 0)
  const value = inventory.reduce((s, r) => s + r.quantity * (materialEntry(r.materialId)?.unitCost ?? 0), 0)
  expect(snap.quantity, `${label}: reports total MT`).toBeCloseTo(mt, 6)
  expect(snap.value, `${label}: reports value`).toBeCloseTo(value, 4)
  for (const range of [
    { from: 0, to: now },
    { from: now - 7 * 86_400_000, to: now },
    { from: now - 60_000, to: now },
  ]) {
    const id = balanceIdentity(ledger, range)
    expect(id.computed, `${label}: identity closes`).toBeCloseTo(id.closing, 6)
  }
  expect(balanceIdentity(ledger, { from: 0, to: now }).closing).toBeCloseTo(mt, 6)

  return { mt, ledger: ledger.length, value }
}

async function mount() {
  const hook = renderHook(useApp, { wrapper })
  await waitFor(() => expect(hook.result.current.piles.canWriteInventory).toBe(true))
  return hook
}

describe("data stays in sync across Inventory, Incoming, Issue & Consumption, the twin and Reports", () => {
  // The ledger, lots and masters are module singletons (one per page load in
  // the app). Each test mounts a fresh app, so it starts from a fresh seed.
  beforeEach(() => {
    resetLedger()
    resetLots()
    resetMasters()
  })

  it("expiry management: dates move no stock, are audited, and only expired stock is written off", async () => {
    const { result, unmount } = await mount()
    const app = () => result.current
    const before = assertInSync(app(), "expiry start")

    // Not for materials where expiry does not apply.
    const limestone = app().piles.inventory.find((r) => r.materialId === "MAT-LIMESTONE")!
    act(() => void expect(app().piles.setExpiryDate(limestone.inventoryId, "2027-01-01T00:00:00.000Z", "Test").ok).toBe(false))
    expect(app().piles.recordOf(limestone.inventoryId)!.expiryDate).toBeUndefined()

    // An expiry-tracked balance still in date.
    const lub = app().piles.inventory.find((r) => r.active && materialEntry(r.materialId)?.expiryApplicable && r.expiryDate && new Date(r.expiryDate).getTime() > Date.now())!
    expect(lub).toBeTruthy()
    const q = lub.quantity
    const auditBefore = lub.audit.length
    // A reason is required.
    act(() => void expect(app().piles.setExpiryDate(lub.inventoryId, "2027-03-31T00:00:00.000Z", " ").ok).toBe(false))
    // Writing off stock that has not expired is refused.
    act(() => void expect(app().piles.writeOffExpired(lub.inventoryId, 1, "Early").ok).toBe(false))
    expect(assertInSync(app(), "refusals")).toEqual(before)

    // Correct the date into the past (label misread): no quantity moves, the audit records old → new.
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString()
    act(() => void expect(app().piles.setExpiryDate(lub.inventoryId, past, "Drum label shows an earlier date").ok).toBe(true))
    const after = app().piles.recordOf(lub.inventoryId)!
    expect(after.quantity).toBe(q)
    expect(after.expiryDate).toBe(new Date(past).toISOString())
    expect(after.audit).toHaveLength(auditBefore + 1)
    expect(after.audit.at(-1)!.action).toMatch(/Expiry date changed .* → .* — Drum label shows an earlier date/)
    expect(assertInSync(app(), "date changed")).toEqual(before)

    // Now expired: the write-off posts EXPIRY (−) and every figure follows.
    act(() => void expect(app().piles.writeOffExpired(lub.inventoryId, q, "Past expiry").ok).toBe(true))
    expect(app().piles.recordOf(lub.inventoryId)!.quantity).toBe(0)
    const txn = app().piles.ledger[0]
    expect(txn).toMatchObject({ type: "EXPIRY", inventoryId: lub.inventoryId, quantity: -q, balanceBefore: q, balanceAfter: 0 })
    assertInSync(app(), "expiry write-off")
    unmount()
  })

  it("expiry at Incoming: counted, dated, never blended, and expired stock is never issued", async () => {
    const { result, unmount } = await mount()
    const app = () => result.current
    const rec = (id: string) => app().piles.recordOf(id)!
    const { allLots } = await import("@/lib/inventory/lots")

    // PO-10305 is Gear Lubricant in DRUM — expiry-tracked and lot-tracked.
    let incomingId = ""
    act(() => {
      const r = app().incoming.register({
        poNumber: "PO-10305", identifiedBy: "MANUAL", receivingInventoryId: "SP-LUB-002",
        gateEntryNo: "", grnNo: "", vehicleRef: "", batch: "", origin: "",
      })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      if (r.ok) incomingId = r.value.incomingId
    })
    // Counted, not weighed: the count is the net.
    act(() => void expect(app().incoming.recordWeighing(incomingId, { grossMt: 12, tareMt: 0 }).ok).toBe(true))
    act(() => void expect(app().incoming.recordQuality(incomingId, { result: "PASS", notes: "", readings: [] }).ok).toBe(true))
    const before = assertInSync(app(), "lubricant before receipt")
    const receive = (expiryDate?: string, into = "SP-LUB-002") =>
      app().incoming.confirmReceipt(incomingId, { receivedMt: 12, receivingInventoryId: into, expiryDate })

    // Required, not already expired, and never blended into stock of another date.
    act(() => void expect(receive(undefined).ok).toBe(false))
    act(() => void expect(receive("2026-01-31T00:00:00.000Z").ok).toBe(false))
    let blended: { ok: boolean; error?: string } = { ok: true }
    act(() => void (blended = receive("2027-03-31T00:00:00.000Z") as typeof blended))
    expect(blended.ok).toBe(false)
    expect(blended.error).toMatch(/SP-LUB-002 holds 2 DRUM expiring 31 Aug 2026/)
    expect(assertInSync(app(), "refused receipts")).toEqual(before)

    // Write off the expired drums; the empty record then takes the new batch and its date.
    act(() => void expect(app().piles.writeOffExpired("SP-LUB-002", 2, "Past expiry").ok).toBe(true))
    act(() => void expect(receive("2027-03-31T00:00:00.000Z").ok).toBe(true))
    expect(rec("SP-LUB-002").quantity).toBe(12)
    expect(rec("SP-LUB-002").expiryDate).toBe("2027-03-31T00:00:00.000Z")
    const delivery = app().incoming.records.find((r) => r.incomingId === incomingId)!
    expect(delivery.receipt?.expiryDate).toBe("2027-03-31T00:00:00.000Z")
    const newLot = allLots().find((l) => l.incomingId === incomingId)!
    expect(newLot.expiryDate).toBe("2027-03-31T00:00:00.000Z")
    // The emptied record now names the batch it holds, not the one written off.
    expect(rec("SP-LUB-002").lotId).toBe(newLot.lotId)
    expect(delivery.receipt?.lotId).toBe(newLot.lotId)
    expect(rec("SP-LUB-002").audit.at(-1)!.action).toMatch(
      new RegExp(`Expiry date changed 31 Aug 2026 → 31 Mar 2027, lot LUB-2025-08 → ${newLot.lotId} — Received with ${incomingId}`),
    )
    assertInSync(app(), "lubricant received")

    // A material where expiry does not apply refuses an expiry date.
    let bearing = ""
    act(() => {
      const r = app().incoming.register({
        poNumber: "PO-10306", identifiedBy: "MANUAL", receivingInventoryId: "SP-BRG-001",
        gateEntryNo: "", grnNo: "", vehicleRef: "", batch: "", origin: "",
      })
      if (r.ok) bearing = r.value.incomingId
    })
    act(() => void app().incoming.recordWeighing(bearing, { grossMt: 4, tareMt: 0 }))
    act(() => void app().incoming.recordQuality(bearing, { result: "PASS", notes: "", readings: [] }))
    act(() => {
      const r = app().incoming.confirmReceipt(bearing, { receivedMt: 4, receivingInventoryId: "SP-BRG-001", expiryDate: "2027-01-01T00:00:00.000Z" })
      expect(r.ok).toBe(false)
    })
    act(() => void expect(app().incoming.confirmReceipt(bearing, { receivedMt: 4, receivingInventoryId: "SP-BRG-001" }).ok).toBe(true))

    // Expired stock is not issued.
    const maint = consumptionLocations().find((l) => l.locationId === "MAINT-01")!
    act(() => void expect(app().piles.setExpiryDate("SP-LUB-001", new Date(Date.now() - 86_400_000).toISOString(), "Label re-read").ok).toBe(true))
    let refused: { ok: boolean; error?: string } = { ok: true }
    act(() => {
      refused = app().issues.createIssue(
        { materialId: "MAT-SPARE-LUBRICANT", sourceInventoryId: "SP-LUB-001", quantity: 1, consumingAreaId: maint.locationId, productionRef: "", reason: "", notes: "", assetId: "KLN-01" },
        true,
      ) as typeof refused
    })
    expect(refused.ok).toBe(false)
    expect(refused.error).toMatch(/SP-LUB-001 expired on .* not issued/)
    // The in-date batch can be.
    act(() => {
      const r = app().issues.createIssue(
        { materialId: "MAT-SPARE-LUBRICANT", sourceInventoryId: "SP-LUB-002", quantity: 1, consumingAreaId: maint.locationId, productionRef: "", reason: "", notes: "", assetId: "KLN-01" },
        true,
      )
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    assertInSync(app(), "expiry end")
    unmount()
  })

  it("the PO list offers open purchase orders beyond the seeded deliveries", async () => {
    const { result, unmount } = await mount()
    const used = new Set(result.current.incoming.records.map((r) => r.poNumber))
    const open = PURCHASE_ORDERS.filter((p) => !used.has(p.poNumber))
    expect(open.length).toBeGreaterThanOrEqual(20)
    // Each resolves to a material that has an active balance to receive into.
    for (const p of open) {
      expect(result.current.piles.inventory.some((r) => r.active && r.materialId === p.materialId)).toBe(true)
    }
    unmount()
  })

  it("the seeded plant is internally consistent", async () => {
    const { result, unmount } = await mount()
    assertInSync(result.current, "seed")
    unmount()
  })

  it("a working day: every addition and deduction lands everywhere, and refusals change nothing", async () => {
    const { result, unmount } = await mount()
    const app = () => result.current
    const qty = (id: string) => app().piles.recordOf(id)!.quantity
    const before0 = assertInSync(app(), "start")

    /* ── Create inventory: starts at 0, no transaction ─────────────────── */
    let created = ""
    act(() => {
      const r = app().piles.createInventory({
        materialId: "MAT-LIMESTONE",
        gradeId: "GRD-LS-B",
        inventoryId: "RM-LS-900",
        locationId: "PILE-RM-01",
        quantity: 0,
        uom: "MT",
        minStock: 100,
        targetStock: 500,
        maxStock: 1000,
      })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      created = "RM-LS-900"
    })
    expect(qty(created)).toBe(0)
    let s = assertInSync(app(), "create inventory")
    expect(s.ledger).toBe(before0.ledger)
    expect(s.mt).toBeCloseTo(before0.mt, 6)

    /* ── Opening balance > 0 needs its approval reference, then posts ADJUSTMENT (+) ── */
    act(() => {
      const refused = app().piles.createInventory({
        materialId: "MAT-LIMESTONE", gradeId: "GRD-LS-B", inventoryId: "RM-LS-901", locationId: "PILE-RM-07",
        quantity: 200, uom: "MT", minStock: 0, targetStock: 100, maxStock: 500,
      })
      expect(refused.ok).toBe(false)
    })
    expect(app().piles.recordOf("RM-LS-901")).toBeUndefined()
    act(() => {
      const r = app().piles.createInventory({
        materialId: "MAT-LIMESTONE", gradeId: "GRD-LS-B", inventoryId: "RM-LS-901", locationId: "PILE-RM-07",
        quantity: 200, openingReference: "APP-2026-014", uom: "MT", minStock: 0, targetStock: 100, maxStock: 500,
      })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    expect(qty("RM-LS-901")).toBe(200)
    s = assertInSync(app(), "opening balance")
    expect(s.mt).toBeCloseTo(before0.mt + 200, 6)

    /* ── Incoming: identify → weigh → sample/quality → RECEIVED adds the net ── */
    const po = PURCHASE_ORDERS.find((p) => !app().incoming.records.some((r) => r.poNumber === p.poNumber))!
    const target = app().piles.inventory.find((r) => r.active && r.locationId === po.destinationLocationId && r.materialId === po.materialId)!
    let incomingId = ""
    act(() => {
      const r = app().incoming.register({
        poNumber: po.poNumber, identifiedBy: "MANUAL", receivingInventoryId: target.inventoryId,
        gateEntryNo: "GE-09001", grnNo: "GRN-09001", vehicleRef: "TRK-9001", batch: "", origin: "",
      })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      if (r.ok) incomingId = r.value.incomingId
    })
    act(() => {
      const r = app().incoming.recordWeighing(incomingId, { grossMt: 540, tareMt: 40 })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    // Weighing moves no stock.
    expect(qty(target.inventoryId)).toBeCloseTo(target.quantity, 6)
    const delivery = () => app().incoming.records.find((r) => r.incomingId === incomingId)!
    if (delivery().sampleRequired) act(() => void app().incoming.collectSample(incomingId))
    const readings = qualityParameters(delivery().gradeId).map((p) => ({
      parameter: p.parameter, unit: p.unit, value: String(p.target ?? p.min ?? p.max ?? 0),
    }))
    act(() => {
      const r = app().incoming.recordQuality(incomingId, { result: "PASS", notes: "", readings })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    // Quality moves no stock.
    expect(qty(target.inventoryId)).toBeCloseTo(target.quantity, 6)
    const beforeReceipt = assertInSync(app(), "quality")
    act(() => {
      const r = app().incoming.confirmReceipt(incomingId, { receivedMt: 500, receivingInventoryId: target.inventoryId })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    expect(qty(target.inventoryId)).toBeCloseTo(target.quantity + 500, 6)
    s = assertInSync(app(), "receipt")
    expect(s.mt).toBeCloseTo(beforeReceipt.mt + 500, 6)
    const receiptTxn = app().piles.ledger.find((t) => t.links.incomingId === incomingId)!
    expect(receiptTxn.links).toMatchObject({ poNumber: po.poNumber, gateEntryNo: "GE-09001", grnNo: "GRN-09001", incomingId })
    expect(receiptTxn.links.qualityRef).toBeTruthy()
    expect(Boolean(receiptTxn.lotId)).toBe(Boolean(materialEntry(po.materialId)?.lotTracking))
    const day = { from: Date.now() - 60_000, to: Date.now() + 60_000 }
    expect(movementTotals(app().piles.ledger, day, "MT").inward).toBeCloseTo(500, 6)

    /* ── A FAILED delivery is never received ───────────────────────────── */
    const po2 = PURCHASE_ORDERS.find((p) => p.poNumber !== po.poNumber && !app().incoming.records.some((r) => r.poNumber === p.poNumber))!
    const target2 = app().piles.inventory.find((r) => r.active && r.locationId === po2.destinationLocationId && r.materialId === po2.materialId)!
    let failedId = ""
    act(() => {
      const r = app().incoming.register({
        poNumber: po2.poNumber, identifiedBy: "QR", receivingInventoryId: target2.inventoryId,
        gateEntryNo: "", grnNo: "", vehicleRef: "", batch: "", origin: "",
      })
      if (r.ok) failedId = r.value.incomingId
    })
    act(() => void app().incoming.recordWeighing(failedId, { grossMt: 300, tareMt: 20 }))
    if (app().incoming.records.find((r) => r.incomingId === failedId)!.sampleRequired) act(() => void app().incoming.collectSample(failedId))
    const failedReadings = qualityParameters(app().incoming.records.find((r) => r.incomingId === failedId)!.gradeId).map((p) => ({
      parameter: p.parameter, unit: p.unit, value: "0",
    }))
    act(() => void app().incoming.recordQuality(failedId, { result: "FAIL", notes: "Out of spec", readings: failedReadings }))
    const beforeFail = assertInSync(app(), "before failed receipt")
    act(() => {
      const r = app().incoming.confirmReceipt(failedId, { receivedMt: 280, receivingInventoryId: target2.inventoryId })
      expect(r.ok).toBe(false)
    })
    s = assertInSync(app(), "failed receipt refused")
    expect(s).toEqual(beforeFail)

    /* ── Issue 100 → consume 100 → return 20: stock −80 (spec §45) ────── */
    const area = consumptionLocations().find((l) => l.locationId === "RM-01") ?? consumptionLocations()[0]
    const src = target.inventoryId
    const srcBefore = qty(src)
    let issueId = ""
    act(() => {
      const r = app().issues.createIssue(
        { materialId: po.materialId, sourceInventoryId: src, quantity: 100, consumingAreaId: area.locationId, productionRef: "", reason: "", notes: "" },
        true,
      )
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      if (r.ok) issueId = r.value.issueId
    })
    // Posting at consumption: the issue commits stock but does not move it.
    expect(qty(src)).toBeCloseTo(srcBefore, 6)
    expect(app().issues.stockAt(src)!.committed).toBeGreaterThanOrEqual(100)
    assertInSync(app(), "issued")
    act(() => {
      const r = app().issues.recordConsumption(issueId, { consumedQty: 100, at: new Date().toISOString(), productionRef: "", comments: "", category: "RAW_MATERIAL" })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    expect(qty(src)).toBeCloseTo(srcBefore - 100, 6)
    assertInSync(app(), "consumed")
    act(() => {
      const r = app().issues.returnMaterial(issueId, 20, "Unused at the raw mill")
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    expect(qty(src)).toBeCloseTo(srcBefore - 80, 6)
    const issue = app().issues.records.find((r) => r.issueId === issueId)!
    expect(netConsumedQty(issue)).toBe(80)
    s = assertInSync(app(), "returned")
    const m = movementTotals(app().piles.ledger, day, "MT")
    expect(m.grossOutward).toBeCloseTo(100, 6)
    expect(m.returned).toBeCloseTo(20, 6)
    expect(m.netConsumed).toBeCloseTo(80, 6)
    // Cannot return more than went out.
    const beforeOverReturn = assertInSync(app(), "before over-return")
    act(() => void expect(app().issues.returnMaterial(issueId, 81, "Too much").ok).toBe(false))
    expect(assertInSync(app(), "over-return refused")).toEqual(beforeOverReturn)

    /* ── Partial consumption: issue 100, consume 80 → only 80 leaves; the
          unconsumed 20 never left, so it is released, not "returned" ────── */
    const committedBefore = app().issues.stockAt(src)!.committed
    const partialBefore = qty(src)
    let partial = ""
    act(() => {
      const r = app().issues.createIssue(
        { materialId: po.materialId, sourceInventoryId: src, quantity: 100, consumingAreaId: area.locationId, productionRef: "PO-RM-77", reason: "", notes: "" },
        true,
      )
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      if (r.ok) partial = r.value.issueId
    })
    expect(app().issues.stockAt(src)!.committed).toBeCloseTo(committedBefore + 100, 6)
    act(() => {
      const r = app().issues.recordConsumption(partial, { consumedQty: 80, at: new Date().toISOString(), productionRef: "", comments: "", category: "RAW_MATERIAL" })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    expect(qty(src)).toBeCloseTo(partialBefore - 80, 6)
    // Consumed: the commitment is released, not left hanging.
    expect(app().issues.stockAt(src)!.committed).toBeCloseTo(committedBefore, 6)
    const partialRecord = () => app().issues.records.find((r) => r.issueId === partial)!
    const { returnableQty } = await import("@/lib/issues/types")
    expect(returnableQty(partialRecord())).toBe(80)
    act(() => void expect(app().issues.returnMaterial(partial, 81, "More than left stock").ok).toBe(false))
    act(() => void expect(app().issues.returnMaterial(partial, 10, "Surplus from the job").ok).toBe(true))
    expect(qty(src)).toBeCloseTo(partialBefore - 70, 6)
    expect(returnableQty(partialRecord())).toBe(70)
    assertInSync(app(), "partial consumption")

    /* ── Issuing more than is available is refused; nothing moves ──────── */
    const beforeOver = assertInSync(app(), "before over-issue")
    act(() => {
      const r = app().issues.createIssue(
        { materialId: po.materialId, sourceInventoryId: src, quantity: qty(src) + 1, consumingAreaId: area.locationId, productionRef: "", reason: "", notes: "" },
        true,
      )
      expect(r.ok).toBe(false)
    })
    expect(assertInSync(app(), "over-issue refused")).toEqual(beforeOver)

    /* ── Direct increase / decrease: ADJUSTMENT (+), WASTE (−) ─────────── */
    act(() => void expect(app().piles.adjustInventory(created, "IN", 50, "Survey correction", "SV-01").ok).toBe(true))
    expect(qty(created)).toBe(50)
    act(() => void expect(app().piles.adjustInventory(created, "OUT", 30, "Spillage at reclaimer", undefined, undefined, "WASTE").ok).toBe(true))
    expect(qty(created)).toBe(20)
    // Cannot go negative.
    act(() => void expect(app().piles.adjustInventory(created, "OUT", 21, "Too much").ok).toBe(false))
    expect(qty(created)).toBe(20)
    assertInSync(app(), "adjustments")
    const m2 = movementTotals(app().piles.ledger, day, "MT")
    expect(m2.adjustmentsIn).toBeGreaterThanOrEqual(50)
    expect(m2.losses.WASTE).toBeCloseTo(30, 6)

    /* ── An exception outcome posts under its own type; it cannot be "returned" ── */
    const coal = app().piles.inventory.find((r) => r.active && r.materialId === "MAT-COAL")!
    const kiln = consumptionLocations().find((l) => l.locationId === "KLN-01") ?? area
    let wasteIssue = ""
    act(() => {
      const r = app().issues.createIssue(
        { materialId: "MAT-COAL", sourceInventoryId: coal.inventoryId, quantity: 10, consumingAreaId: kiln.locationId, productionRef: "", reason: "", notes: "" },
        true,
      )
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      if (r.ok) wasteIssue = r.value.issueId
    })
    const coalBefore = qty(coal.inventoryId)
    act(() => {
      const r = app().issues.recordConsumption(wasteIssue, { consumedQty: 10, at: new Date().toISOString(), productionRef: "", comments: "Wet coal dumped", category: "WASTED" })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    expect(qty(coal.inventoryId)).toBeCloseTo(coalBefore - 10, 6)
    const wasteTxn = app().piles.ledger.find((t) => t.links.issueId === wasteIssue)!
    expect(wasteTxn.type).toBe("WASTE")
    const beforeLossReturn = assertInSync(app(), "wasted consumption")
    act(() => void expect(app().issues.returnMaterial(wasteIssue, 5, "Found some").ok).toBe(false))
    expect(assertInSync(app(), "return of wasted refused")).toEqual(beforeLossReturn)
    // 80 net on the first issue + 70 net on the partial one; the wasted 10 is a loss, not consumption.
    expect(movementTotals(app().piles.ledger, day, "MT").netConsumed).toBeCloseTo(150, 6)
    expect(movementTotals(app().piles.ledger, day, "MT").losses.WASTE).toBeCloseTo(40, 6)

    /* ── Expiry write-off: EXPIRY (−), only once expired ───────────────── */
    const expired = app().piles.inventory.find((r) => r.active && r.expiryDate && new Date(r.expiryDate).getTime() < Date.now() && r.quantity > 0)
    if (expired) {
      const q = expired.quantity
      act(() => void expect(app().piles.writeOffExpired(expired.inventoryId, q, "Past expiry").ok).toBe(true))
      expect(qty(expired.inventoryId)).toBe(0)
      expect(app().piles.ledger[0].type).toBe("EXPIRY")
      assertInSync(app(), "expiry write-off")
    }
    const inDate = app().piles.inventory.find((r) => r.active && r.expiryDate && new Date(r.expiryDate).getTime() > Date.now() && r.quantity > 0)
    if (inDate) {
      const beforeEarly = assertInSync(app(), "before early write-off")
      act(() => void expect(app().piles.writeOffExpired(inDate.inventoryId, 1, "Early").ok).toBe(false))
      expect(assertInSync(app(), "early write-off refused")).toEqual(beforeEarly)
    }

    /* ── Archive only when empty; an archived record takes no movement ── */
    act(() => void expect(app().piles.archiveInventory(created, "Grade B stock moved").ok).toBe(false))
    act(() => void expect(app().piles.adjustInventory(created, "OUT", 20, "Moved to PILE-RM-07").ok).toBe(true))
    act(() => void expect(app().piles.archiveInventory(created, "Grade B stock moved").ok).toBe(true))
    const beforeArchived = assertInSync(app(), "archived")
    act(() => void expect(app().piles.adjustInventory(created, "IN", 5, "After archive").ok).toBe(false))
    expect(assertInSync(app(), "archived refuses movement")).toEqual(beforeArchived)

    // The whole day, end to end: 200 opening + 500 received − 80 and − 70 net
    // consumed − 10 wasted coal + 50 − 30 − 20 adjustments on the new record.
    expect(assertInSync(app(), "end").mt).toBeCloseTo(before0.mt + 200 + 500 - 80 - 70 - 10 + 50 - 30 - 20, 6)
    unmount()
  })
})

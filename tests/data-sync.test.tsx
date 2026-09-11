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
import { expiryBalance } from "@/lib/inventory/expiry"

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

  it("expiry comes from the PO, flows through Incoming and the GRN into dated batches, and leaves by EXPIRY", async () => {
    const { result, unmount } = await mount()
    const app = () => result.current
    const rec = (id: string) => app().piles.recordOf(id)!
    const open = (id: string) => app().piles.expiryOf(id).open

    // Seeded: the lubricant batch that reached its date on 8 Sept left by an EXPIRY transaction.
    const seeded = app().piles.ledger.find((t) => t.type === "EXPIRY" && t.inventoryId === "SP-LUB-002")!
    expect(seeded).toMatchObject({ actor: "system.expiry", quantity: -2 })
    expect(seeded.links.batchId).toBeTruthy()
    expect(rec("SP-LUB-002").quantity).toBe(0)

    // The specification's worked example: PO-10250, SRF, 75 MT received, expiry
    // 25 Oct 2026 from the PO — 75 MT available in a dated batch traced to its GRN.
    expect(open("RM-AF-006").find((b) => b.poNumber === "PO-10250")).toMatchObject({
      receivedQty: 75, remaining: 75, expiryDate: "2026-10-25T00:00:00.000Z", grnNo: "GRN-00405", source: "INCOMING",
    })

    // An SRF PO states the batch expiry. The receipt carries it — nobody re-enters it.
    const po = PURCHASE_ORDERS.find((p) => p.materialId === "MAT-ALT-FUEL" && p.expiryDate && !app().incoming.records.some((r) => r.poNumber === p.poNumber))!
    expect(po).toBeTruthy()
    let incomingId = ""
    act(() => {
      const r = app().incoming.register({
        poNumber: po.poNumber, identifiedBy: "MANUAL", receivingInventoryId: "RM-AF-006",
        gateEntryNo: "GE-09100", grnNo: "GRN-09100", vehicleRef: "", batch: "", origin: "",
      })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      if (r.ok) incomingId = r.value.incomingId
    })
    expect(app().incoming.records.find((r) => r.incomingId === incomingId)!.poExpiryDate).toBe(po.expiryDate)
    act(() => void expect(app().incoming.recordWeighing(incomingId, { grossMt: 200, tareMt: 20 }).ok).toBe(true))
    const delivery = () => app().incoming.records.find((r) => r.incomingId === incomingId)!
    if (delivery().sampleRequired) act(() => void app().incoming.collectSample(incomingId))
    const readings = qualityParameters(delivery().gradeId).map((q) => ({ parameter: q.parameter, unit: q.unit, value: String(q.target ?? q.min ?? q.max ?? 0) }))
    act(() => void expect(app().incoming.recordQuality(incomingId, { result: "PASS", notes: "", readings }).ok).toBe(true))
    act(() => {
      const r = app().incoming.confirmReceipt(incomingId, { receivedMt: 180, receivingInventoryId: "RM-AF-006" })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    const inTxn = app().piles.ledger.find((t) => t.type === "INCOMING" && t.links.incomingId === incomingId)!
    const poExpiry = new Date(po.expiryDate!).toISOString()
    expect(inTxn.expiryDate).toBe(poExpiry)
    expect(delivery().receipt?.expiryDate).toBe(poExpiry)
    // PO → Incoming → GRN → Inventory: the dated batch keeps its PO and GRN.
    expect(open("RM-AF-006").find((b) => b.batchId === inTxn.txnId)).toMatchObject({
      remaining: 180, expiryDate: poExpiry, poNumber: po.poNumber, grnNo: "GRN-09100", incomingId,
    })
    assertInSync(app(), "SRF received")

    // First expiry, first out: consumption draws the soonest-expiring batch; a return goes back to it.
    const soonest = open("RM-AF-006")[0]
    const area = consumptionLocations().find((l) => l.locationId === "GEO-01") ?? consumptionLocations()[0]
    let issueId = ""
    act(() => {
      const r = app().issues.createIssue(
        { materialId: "MAT-ALT-FUEL", sourceInventoryId: "RM-AF-006", quantity: 10, consumingAreaId: area.locationId, productionRef: "", reason: "", notes: "" },
        true,
      )
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
      if (r.ok) issueId = r.value.issueId
    })
    act(() => void expect(app().issues.recordConsumption(issueId, { consumedQty: 10, at: new Date().toISOString(), productionRef: "", comments: "", category: "RAW_MATERIAL" }).ok).toBe(true))
    const conTxn = app().piles.ledger.find((t) => t.type === "CONSUMPTION" && t.links.issueId === issueId)!
    expect(app().piles.batchIndex.allocations.get(conTxn.txnId)).toEqual([{ batchId: soonest.batchId, qty: 10 }])
    expect(open("RM-AF-006")[0].remaining).toBeCloseTo(soonest.remaining - 10, 6)
    act(() => void expect(app().issues.returnMaterial(issueId, 4, "Surplus").ok).toBe(true))
    expect(open("RM-AF-006")[0].remaining).toBeCloseTo(soonest.remaining - 6, 6)
    assertInSync(app(), "FEFO and return")

    // The expiry run: once the soonest batch reaches its date, its remaining
    // quantity is Expired and leaves by an EXPIRY transaction — traced to the batch.
    const due = new Date(new Date(soonest.expiryDate!).getTime() + 1000)
    const left = open("RM-AF-006")[0].remaining
    const before = rec("RM-AF-006").quantity
    let posted: ReturnType<App["piles"]["postDueExpiries"]> = []
    act(() => void (posted = app().piles.postDueExpiries(due)))
    const exp = posted.find((t) => t.inventoryId === "RM-AF-006")!
    expect(exp).toMatchObject({ type: "EXPIRY", quantity: -left, actor: "system.expiry" })
    expect(exp.links.batchId).toBe(soonest.batchId)
    expect(exp.reason).toMatch(/Reached expiry date/)
    expect(rec("RM-AF-006").quantity).toBeCloseTo(before - left, 6)
    expect(app().piles.expiryOf("RM-AF-006", due).duePendingQty).toBe(0)
    // Idempotent: nothing left to expire at that moment.
    act(() => void expect(app().piles.postDueExpiries(due)).toHaveLength(0))
    // Previous + Inward − Expired − Net Consumed (± other) = Current Available, from the ledger.
    const bal = expiryBalance(app().piles.ledger, "RM-AF-006", 0, Date.now() + 60_000)
    expect(bal.current).toBeCloseTo(rec("RM-AF-006").quantity, 6)
    expect(bal.expired).toBeCloseTo(left, 6)
    assertInSync(app(), "after the expiry run")
    unmount()
  })

  it("shelf life on the PO dates the batch at receipt; expiry is never asked of other materials", async () => {
    const { result, unmount } = await mount()
    const app = () => result.current
    const receive = (poNumber: string, into: string, qty: number, expiryDate?: string) => {
      let id = ""
      act(() => {
        const r = app().incoming.register({ poNumber, identifiedBy: "MANUAL", receivingInventoryId: into, gateEntryNo: "", grnNo: "", vehicleRef: "", batch: "", origin: "" })
        expect(r.ok, r.ok ? "" : r.error).toBe(true)
        if (r.ok) id = r.value.incomingId
      })
      act(() => void app().incoming.recordWeighing(id, { grossMt: qty, tareMt: 0 }))
      act(() => void app().incoming.recordQuality(id, { result: "PASS", notes: "", readings: [] }))
      let out: { ok: boolean; error?: string } = { ok: false }
      act(() => void (out = app().incoming.confirmReceipt(id, { receivedMt: qty, receivingInventoryId: into, expiryDate }) as typeof out))
      return { id, out }
    }

    // PO-10305 states an 540-day shelf life, counted from the day of receipt.
    const lub = receive("PO-10305", "SP-LUB-002", 12)
    expect(lub.out.ok, lub.out.error).toBe(true)
    const txn = app().piles.ledger.find((t) => t.links.incomingId === lub.id)!
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    expect(txn.expiryDate).toBe(new Date(today.getTime() + 540 * 86_400_000).toISOString())
    expect(app().piles.expiryOf("SP-LUB-002").open.map((b) => b.remaining)).toEqual([12])

    // Bearings: expiry does not apply, so a date is refused and none is recorded.
    const refused = receive("PO-10306", "SP-BRG-001", 4, "2027-01-01T00:00:00.000Z")
    expect(refused.out.ok).toBe(false)
    act(() => void expect(app().incoming.confirmReceipt(refused.id, { receivedMt: 4, receivingInventoryId: "SP-BRG-001" }).ok).toBe(true))
    expect(app().piles.ledger.find((t) => t.links.incomingId === refused.id)!.expiryDate).toBeUndefined()
    expect(app().piles.expiryOf("SP-BRG-001").open).toHaveLength(0)

    // An opening balance loaded without a date is visible as undated stock.
    act(() => {
      const r = app().piles.createInventory({
        materialId: "MAT-ALT-FUEL", gradeId: "GRD-AF-SRF", inventoryId: "RM-AF-900", locationId: "PILE-RM-07",
        quantity: 50, openingReference: "APP-2026-020", uom: "MT", minStock: 0, targetStock: 50, maxStock: 100,
      })
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    })
    expect(app().piles.expiryOf("RM-AF-900").undatedQty).toBe(50)
    assertInSync(app(), "shelf life")
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

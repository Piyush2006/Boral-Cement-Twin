/**
 * The seeded plant history, composed once.
 *
 *   opening balances ─┐
 *   incoming receipts ─┼─► ledger transactions, in time order ─► today's balances
 *   issues/consumption ┘
 *
 * Every seeded quantity is therefore explained by its transactions: opening
 * balance + receipts − consumption = the balance shown. Receipts and
 * consumption carry their real transaction IDs, so a seeded balance traces back
 * to its PO and forward to where it was used, exactly like a live one.
 *
 * All of it is DEMO data — flagged as such on every record.
 */

import { seedIncoming } from "@/lib/incoming/catalog"
import type { IncomingRecord } from "@/lib/incoming/types"
import { TXN_PLACEHOLDER, seedIssues } from "@/lib/issues/catalog"
import type { IssueRecord } from "@/lib/issues/types"
import { consumptionTransactionType } from "@/lib/issues/consumption"
import { readingPasses, type QualityReading } from "@/lib/masters/types"
import { gradeEntry, materialEntry } from "./catalog"
import { findPurchaseOrder } from "@/lib/incoming/catalog"
import { dueExpiries, expiryFromPo, replayBatches } from "./expiry"
import { formatTxnId, type InventoryTransaction, type TransactionLinks, type TransactionType } from "./ledger"
import { formatLotId, type InternalLot } from "./lots"
import type { InventoryRecord } from "./model"
import { INVENTORY_SEED } from "./seed-records"

export const OPENING_AT = "2026-09-01T00:00:00.000Z"

/**
 * Deterministic quality readings against the GRADE's parameters. Seeded from
 * the delivery reference so the same delivery always shows the same result and
 * the page renders identically on the server and in the browser.
 */
function gradeReadings(gradeId: string | undefined, sourceRef: string): QualityReading[] {
  const grade = gradeEntry(gradeId)
  if (!grade) return []
  let h = 2166136261
  for (const ch of sourceRef) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return grade.qualityParameters.map((p, i) => {
    h = Math.imul(h ^ (i + 1), 16777619) >>> 0
    const spread = (h / 4294967295) * 2 - 1
    const anchor = p.target ?? p.min ?? p.max ?? 0
    const band = Math.abs(anchor) * 0.02 || 0.05
    const raw = anchor + spread * band
    const value = Number(raw.toFixed(2))
    return {
      parameterId: p.parameterId,
      name: p.name,
      unit: p.unit,
      value,
      min: p.min,
      max: p.max,
      target: p.target,
      pass: readingPasses(value, p.min, p.max),
    }
  })
}

export type SeedBundle = {
  inventory: InventoryRecord[]
  ledger: InventoryTransaction[]
  incoming: IncomingRecord[]
  issues: IssueRecord[]
  lots: InternalLot[]
}

type Event = {
  at: string
  order: number
  inventoryId: string
  delta: number
  type: TransactionType
  links: TransactionLinks
  reason?: string
  reference?: string
  batch?: string
  lotId?: string
  /** Expiry-tracked inward: the batch's expiry date, from the PO. */
  expiryDate?: string
  actor: string
  onPosted?: (txnId: string) => void
}

/**
 * The seeded history ends here. A seeded batch whose expiry date falls before
 * it leaves by an EXPIRY transaction inside the history; anything later is
 * expired by the running application when its date is reached. Fixed, not
 * "now", so the server and browser renders agree.
 */
const SEED_HISTORY_END = "2026-09-09T12:00:00.000Z"

let cached: SeedBundle | null = null

export function seedBundle(): SeedBundle {
  if (cached) return cached

  const incoming = seedIncoming()
  const issues = seedIssues(incoming)
  const events: Event[] = []
  const lots: InternalLot[] = []
  let order = 0

  // A receipt posts the accepted quantity into inventory. Where the material is
  // lot-tracked it also records a lot / batch reference; otherwise the receipt
  // traces on PO, Gate Entry, GRN and Incoming ID alone.
  let lotNo = 420
  for (const r of [...incoming].sort((a, b) => a.expectedArrival.localeCompare(b.expectedArrival))) {
    const receipt = r.receipt
    if (!receipt) continue
    const seed = INVENTORY_SEED.find((s) => s.inventoryId === receipt.inventoryId)
    const docs = { poNumber: r.poNumber, gateEntryNo: r.gateEntryNo, grnNo: r.grnNo, incomingId: r.incomingId, qualityRef: r.quality ? `${r.incomingId} · ${r.quality.result}` : undefined }
    // Expiry comes from the PO and travels with the receipt — never re-entered.
    const expiryDate = materialEntry(r.materialId)?.expiryApplicable ? expiryFromPo(findPurchaseOrder(r.poNumber), new Date(receipt.at)) : undefined
    receipt.expiryDate = expiryDate
    if (!materialEntry(r.materialId)?.lotTracking) {
      events.push({
        at: receipt.at,
        order: order++,
        inventoryId: receipt.inventoryId,
        delta: receipt.receivedMt,
        type: "INCOMING",
        links: docs,
        batch: r.batch,
        expiryDate,
        actor: receipt.by,
        onPosted: (id) => {
          receipt.transactionId = id
          const last = r.audit[r.audit.length - 1]
          last.action = `Receipt confirmed — inventory transaction ${id}`
        },
      })
      continue
    }
    lotNo += 1
    const lot: InternalLot = {
      lotId: formatLotId(lotNo),
      materialId: r.materialId,
      gradeId: seed?.gradeId ?? "",
      receivedQty: receipt.receivedMt,
      uom: materialEntry(r.materialId)?.uom ?? "MT",
      locationId: receipt.locationId,
      inventoryId: receipt.inventoryId,
      poNumber: r.poNumber,
      incomingId: r.incomingId,
      supplier: r.supplier,
      supplierBatch: r.batch,
      quality: gradeReadings(seed?.gradeId, r.incomingId),
      qualityResult: r.quality?.result ?? "PASS",
      expiryDate,
      receivedAt: receipt.at,
      receivedBy: receipt.by,
      provenance: "DEMO",
    }
    lots.push(lot)
    receipt.lotId = lot.lotId
    events.push({
      at: receipt.at,
      order: order++,
      inventoryId: receipt.inventoryId,
      delta: receipt.receivedMt,
      type: "INCOMING",
      links: { ...docs, lotId: lot.lotId },
      batch: r.batch,
      lotId: lot.lotId,
      expiryDate,
      actor: receipt.by,
      onPosted: (id) => {
        receipt.transactionId = id
        const last = r.audit[r.audit.length - 1]
        last.action = `Receipt confirmed — lot ${lot.lotId}, inventory transaction ${id}`
      },
    })
  }

  for (const r of issues) {
    // A lot is carried onto an issue only where the operator linked the
    // receipt it came from — a blended pile is never assumed to be one lot.
    const drawnLot = r.origin ? lots.find((l) => l.incomingId === r.origin?.incomingId)?.lotId : undefined
    if (drawnLot) r.lotId = drawnLot
    const originReceipt = r.origin ? incoming.find((x) => x.incomingId === r.origin?.incomingId) : undefined
    const origin = {
      poNumber: r.origin?.poNumber,
      grnNo: originReceipt?.grnNo,
      incomingId: r.origin?.incomingId,
      lotId: drawnLot,
      consumingAreaId: r.consumingAreaId,
      assetId: r.assetId,
      maintenanceRef: r.maintenanceRef,
    }
    const substitute = (id: string) => {
      for (const a of r.audit) {
        if (a.transactionId === TXN_PLACEHOLDER) a.transactionId = id
        a.action = a.action.replace(TXN_PLACEHOLDER, id)
      }
    }
    if (r.issue?.transactionId === TXN_PLACEHOLDER) {
      const issue = r.issue
      events.push({
        at: issue.at,
        order: order++,
        inventoryId: r.sourceInventoryId,
        delta: -issue.issuedQty,
        type: "ISSUE",
        links: { ...origin, issueId: r.issueId },
        batch: r.batch,
        lotId: drawnLot,
        actor: issue.by,
        onPosted: (id) => {
          issue.transactionId = id
          substitute(id)
        },
      })
    }
    for (const ret of r.returns ?? []) {
      if (ret.transactionId !== TXN_PLACEHOLDER) continue
      events.push({
        at: ret.at,
        order: order++,
        inventoryId: r.sourceInventoryId,
        delta: ret.quantity,
        type: "RETURN",
        links: { ...origin, issueId: r.issueId, returnId: ret.returnId },
        reason: ret.reason,
        batch: r.batch,
        lotId: drawnLot,
        actor: ret.by,
        onPosted: (id) => {
          ret.transactionId = id
          substitute(id)
        },
      })
    }
    if (r.consumption?.transactionId === TXN_PLACEHOLDER) {
      const c = r.consumption
      events.push({
        at: c.postedAt,
        order: order++,
        inventoryId: r.sourceInventoryId,
        delta: -c.consumedQty,
        type: consumptionTransactionType(c.category),
        links: { ...origin, issueId: r.issueId, consumptionId: c.consumptionId },
        batch: r.batch,
        lotId: drawnLot,
        actor: c.by,
        onPosted: (id) => {
          c.transactionId = id
          substitute(id)
        },
      })
    }
  }

  // Opening balances: whatever makes the history arrive at today's figure,
  // raised if needed so no balance ever dips below zero along the way.
  events.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order)
  const inventory: InventoryRecord[] = []
  const opening = new Map<string, number>()
  for (const s of INVENTORY_SEED) {
    const own = events.filter((e) => e.inventoryId === s.inventoryId)
    const net = own.reduce((sum, e) => sum + e.delta, 0)
    let open = Math.max(0, s.target - net)
    let running = open
    let lowest = open
    for (const e of own) {
      running += e.delta
      lowest = Math.min(lowest, running)
    }
    if (lowest < 0) open -= lowest
    opening.set(s.inventoryId, open)
  }

  const ledger: InventoryTransaction[] = []
  const balance = new Map<string, number>()
  let txnNo = 0
  let adjNo = 0
  const post = (inventoryId: string, e: Omit<Event, "inventoryId" | "order">) => {
    const seed = INVENTORY_SEED.find((s) => s.inventoryId === inventoryId)!
    const before = balance.get(inventoryId) ?? 0
    const after = before + e.delta
    balance.set(inventoryId, after)
    txnNo += 1
    const txn: InventoryTransaction = {
      txnId: formatTxnId(txnNo),
      type: e.type,
      inventoryId,
      locationId: seed.locationId,
      materialId: seed.materialId,
      gradeId: seed.gradeId,
      lotId: e.lotId,
      quantity: e.delta,
      uom: materialEntry(seed.materialId)?.uom ?? "MT",
      balanceBefore: before,
      balanceAfter: after,
      reason: e.reason,
      reference: e.reference,
      batch: e.batch,
      expiryDate: e.expiryDate,
      links: e.links,
      actor: e.actor,
      at: e.at,
      provenance: "DEMO",
    }
    ledger.push(txn)
    e.onPosted?.(txn.txnId)
  }

  for (const s of INVENTORY_SEED) {
    const open = opening.get(s.inventoryId)!
    if (open <= 0) continue
    adjNo += 1
    post(s.inventoryId, {
      at: OPENING_AT,
      delta: open,
      type: "ADJUSTMENT",
      links: { adjustmentId: `ADJ-${String(adjNo).padStart(5, "0")}` },
      reason: "Opening balance",
      reference: "Approved opening balance — demo load",
      lotId: s.lotId,
      expiryDate: s.openingExpiry,
      actor: "inventory.admin",
    })
  }
  // Seeded batches that reach their expiry date inside the history leave by an
  // EXPIRY transaction when the date arrives — the same flow the running
  // application uses — so the ledger stays in time order.
  const tracked = (materialId: string) => Boolean(materialEntry(materialId)?.expiryApplicable)
  let flushedTo = ""
  const expireDue = (until: string) => {
    const dated = ledger.some((t) => t.expiryDate && t.expiryDate > flushedTo && t.expiryDate <= until)
    flushedTo = until
    if (!dated) return
    for (const b of dueExpiries(replayBatches(ledger, tracked), new Date(until))) {
      const day = new Date(b.expiryDate!).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
      const last = ledger[ledger.length - 1]?.at ?? b.expiryDate!
      post(b.inventoryId, {
        at: b.expiryDate! > last ? b.expiryDate! : last,
        delta: -b.remaining,
        type: "EXPIRY",
        links: { batchId: b.batchId, poNumber: b.poNumber, grnNo: b.grnNo, incomingId: b.incomingId, lotId: b.lotId },
        lotId: b.lotId,
        reason: `Reached expiry date ${day}`,
        actor: "system.expiry",
      })
    }
  }
  for (const e of events) {
    expireDue(e.at)
    post(e.inventoryId, e)
  }
  expireDue(SEED_HISTORY_END)

  for (const s of INVENTORY_SEED) {
    inventory.push({
      inventoryId: s.inventoryId,
      materialId: s.materialId,
      gradeId: s.gradeId,
      locationId: s.locationId,
      quantity: balance.get(s.inventoryId) ?? 0,
      uom: materialEntry(s.materialId)?.uom ?? "MT",
      minStock: s.minStock,
      targetStock: s.targetStock,
      maxStock: s.maxStock,
      lotId: s.lotId,
      description: s.description,
      active: true,
      createdAt: OPENING_AT,
      createdBy: "inventory.admin",
      updatedAt: ledger.filter((t) => t.inventoryId === s.inventoryId).at(-1)?.at ?? OPENING_AT,
      audit: [{ at: OPENING_AT, by: "inventory.admin", action: "Inventory record created with opening balance" }],
      provenance: "DEMO",
    })
  }

  cached = { inventory, ledger, incoming, issues, lots }
  return cached
}

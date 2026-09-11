/**
 * Expiry — an Inventory Management capability, only for materials where expiry
 * applies.
 *
 *   PO (expiry date or shelf life) → Incoming → GRN → INCOMING transaction
 *        → a dated BATCH in the balance → Expiry Monitoring
 *
 * Nothing here stores a quantity. Batches are REPLAYED from the ledger, the one
 * source of truth: every inward transaction of an expiry-tracked material is a
 * batch carrying the expiry date it arrived with; every outward transaction
 * draws from the batches first-expiry-first-out; a RETURN goes back to the
 * batches its issue drew from; an EXPIRY transaction removes a batch that has
 * reached its date. So a pile can hold deliveries with different expiry dates,
 * and every remaining quantity traces back to its PO / GRN.
 *
 *   Current Available = Previous + Inward − Expired − Net Consumed
 */

import type { InventoryTransaction } from "./ledger"

/** Days before expiry that count as "Approaching Expiry". Plant configuration. */
export const APPROACHING_EXPIRY_DAYS = 30

export type ExpiryStatus = "EXPIRED" | "APPROACHING" | "WITHIN_SHELF_LIFE" | "NO_EXPIRY_DATE"

export const EXPIRY_STATUS_LABEL: Record<ExpiryStatus, string> = {
  EXPIRED: "Expired",
  APPROACHING: "Approaching Expiry",
  WITHIN_SHELF_LIFE: "Within Shelf Life",
  NO_EXPIRY_DATE: "No Expiry Date",
}

export type ExpiryBatch = {
  /** The inward transaction that created the batch — its stable identity. */
  batchId: string
  inventoryId: string
  materialId: string
  gradeId: string
  locationId: string
  uom: string
  /** How the batch arrived. */
  source: "INCOMING" | "OPENING" | "ADJUSTMENT" | "RETURN"
  receivedAt: string
  receivedQty: number
  /** Still in stock. */
  remaining: number
  expiryDate?: string
  /** Traceability back to the purchase order. */
  poNumber?: string
  grnNo?: string
  gateEntryNo?: string
  incomingId?: string
  lotId?: string
  /** Quantity removed by EXPIRY transactions, and those transactions. */
  expiredQty: number
  expiryTxnIds: string[]
}

const byTxnNo = (a: InventoryTransaction, b: InventoryTransaction) => (Number(a.txnId.slice(3)) || 0) - (Number(b.txnId.slice(3)) || 0)
const time = (iso?: string) => (iso ? new Date(iso).getTime() : Infinity)
const OUTWARD = new Set(["CONSUMPTION", "ISSUE", "WASTE", "LOSS", "UNACCOUNTED", "ADJUSTMENT", "EXPIRY"])

export type BatchIndex = {
  /** Batches per inventory record, in the order they arrived (exhausted ones included). */
  byRecord: Map<string, ExpiryBatch[]>
  /** Which batches each outward transaction drew from. */
  allocations: Map<string, Array<{ batchId: string; qty: number }>>
}

/**
 * Replay the ledger into batches for expiry-tracked materials.
 * `tracked(materialId)` says whether expiry applies to a material.
 */
export function replayBatches(ledger: InventoryTransaction[], tracked: (materialId: string) => boolean): BatchIndex {
  const byRecord = new Map<string, ExpiryBatch[]>()
  const byId = new Map<string, ExpiryBatch>()
  const allocations = new Map<string, Array<{ batchId: string; qty: number }>>()
  /** What each issue's outward transactions took from each batch, less what came back. */
  const issueDraws = new Map<string, Map<string, number>>()

  const newBatch = (t: InventoryTransaction, qty: number, source: ExpiryBatch["source"]) => {
    const b: ExpiryBatch = {
      batchId: t.txnId,
      inventoryId: t.inventoryId,
      materialId: t.materialId,
      gradeId: t.gradeId,
      locationId: t.locationId,
      uom: t.uom,
      source,
      receivedAt: t.at,
      receivedQty: qty,
      remaining: qty,
      expiryDate: t.expiryDate,
      poNumber: t.links.poNumber,
      grnNo: t.links.grnNo,
      gateEntryNo: t.links.gateEntryNo,
      incomingId: t.links.incomingId,
      lotId: t.lotId ?? t.links.lotId,
      expiredQty: 0,
      expiryTxnIds: [],
    }
    byRecord.set(t.inventoryId, [...(byRecord.get(t.inventoryId) ?? []), b])
    byId.set(b.batchId, b)
  }

  for (const t of [...ledger].sort(byTxnNo)) {
    if (!tracked(t.materialId)) continue
    const batches = byRecord.get(t.inventoryId) ?? []

    if (t.quantity > 0) {
      if (t.type === "RETURN" && t.links.issueId) {
        // Back to the batches this issue drew from — latest-drawn first.
        let left = t.quantity
        const draws = issueDraws.get(t.links.issueId)
        if (draws) {
          for (const [batchId, drawn] of [...draws].reverse()) {
            if (left <= 0) break
            const back = Math.min(left, drawn)
            const b = byId.get(batchId)
            if (!b || back <= 0) continue
            b.remaining += back
            draws.set(batchId, drawn - back)
            left -= back
          }
        }
        if (left > 1e-9) newBatch(t, left, "RETURN")
        continue
      }
      const source = t.type === "INCOMING" ? "INCOMING" : t.type === "ADJUSTMENT" && /opening/i.test(t.reason ?? "") ? "OPENING" : "ADJUSTMENT"
      newBatch(t, t.quantity, source)
      continue
    }

    if (t.quantity < 0 && OUTWARD.has(t.type)) {
      const at = time(t.at)
      let need = -t.quantity
      const take: Array<{ batchId: string; qty: number }> = []
      const draw = (b: ExpiryBatch) => {
        if (need <= 0 || b.remaining <= 0) return
        const q = Math.min(need, b.remaining)
        b.remaining -= q
        need -= q
        take.push({ batchId: b.batchId, qty: q })
      }
      const fefo = (list: ExpiryBatch[]) => [...list].sort((a, b) => time(a.expiryDate) - time(b.expiryDate) || byTxnNo({ txnId: a.batchId } as InventoryTransaction, { txnId: b.batchId } as InventoryTransaction))
      if (t.type === "EXPIRY") {
        // The named batch first; then anything past its date; then first-expiry-first.
        const named = t.links.batchId ? byId.get(t.links.batchId) : undefined
        if (named) draw(named)
        for (const b of fefo(batches.filter((x) => time(x.expiryDate) <= at))) draw(b)
        for (const b of fefo(batches)) draw(b)
        for (const a of take) {
          const b = byId.get(a.batchId)!
          b.expiredQty += a.qty
          b.expiryTxnIds.push(t.txnId)
        }
      } else {
        // Usable stock first, soonest expiry first; expired stock only if nothing else is left.
        for (const b of fefo(batches.filter((x) => time(x.expiryDate) > at))) draw(b)
        for (const b of fefo(batches)) draw(b)
      }
      allocations.set(t.txnId, take)
      if (t.links.issueId && t.type !== "EXPIRY") {
        const draws = issueDraws.get(t.links.issueId) ?? new Map<string, number>()
        for (const a of take) draws.set(a.batchId, (draws.get(a.batchId) ?? 0) + a.qty)
        issueDraws.set(t.links.issueId, draws)
      }
    }
  }
  return { byRecord, allocations }
}

export function daysToExpiry(expiryDate: string, now: Date): number {
  return Math.floor((new Date(expiryDate).getTime() - now.getTime()) / 86_400_000)
}

export function batchStatus(b: Pick<ExpiryBatch, "expiryDate">, now: Date): ExpiryStatus {
  if (!b.expiryDate) return "NO_EXPIRY_DATE"
  if (new Date(b.expiryDate).getTime() <= now.getTime()) return "EXPIRED"
  if (daysToExpiry(b.expiryDate, now) <= APPROACHING_EXPIRY_DAYS) return "APPROACHING"
  return "WITHIN_SHELF_LIFE"
}

export type RecordExpiry = {
  /** Batches still holding stock, soonest expiry first. */
  open: ExpiryBatch[]
  /** Earliest expiry among batches still in stock. */
  nextExpiry?: string
  /** In stock and within APPROACHING_EXPIRY_DAYS of expiry. */
  approachingQty: number
  /** In stock but already past its date — removed by the next expiry run. */
  duePendingQty: number
  /** In stock with no expiry date on the PO. */
  undatedQty: number
}

export function recordExpiry(batches: ExpiryBatch[] | undefined, now: Date): RecordExpiry {
  const open = (batches ?? []).filter((b) => b.remaining > 1e-9).sort((a, b) => time(a.expiryDate) - time(b.expiryDate))
  let approachingQty = 0
  let duePendingQty = 0
  let undatedQty = 0
  for (const b of open) {
    const s = batchStatus(b, now)
    if (s === "APPROACHING") approachingQty += b.remaining
    if (s === "EXPIRED") duePendingQty += b.remaining
    if (s === "NO_EXPIRY_DATE") undatedQty += b.remaining
  }
  const nextExpiry = open.find((b) => b.expiryDate && new Date(b.expiryDate).getTime() > now.getTime())?.expiryDate
  return { open, nextExpiry, approachingQty, duePendingQty, undatedQty }
}

/** Batches in stock whose expiry date has been reached — each must leave by an EXPIRY transaction. */
export function dueExpiries(index: BatchIndex, now: Date): ExpiryBatch[] {
  const due: ExpiryBatch[] = []
  for (const list of index.byRecord.values()) {
    for (const b of list) if (b.remaining > 1e-9 && b.expiryDate && new Date(b.expiryDate).getTime() <= now.getTime()) due.push(b)
  }
  return due.sort((a, b) => time(a.expiryDate) - time(b.expiryDate))
}

/**
 * The expiry date for a batch received now, from what the PO states: an
 * explicit expiry date wins; otherwise a shelf life counted from receipt.
 */
export function expiryFromPo(po: { expiryDate?: string; shelfLifeDays?: number } | undefined, receivedAt: Date): string | undefined {
  if (po?.expiryDate) return new Date(po.expiryDate).toISOString()
  if (po?.shelfLifeDays && po.shelfLifeDays > 0) {
    const d = new Date(receivedAt)
    d.setUTCHours(0, 0, 0, 0)
    return new Date(d.getTime() + po.shelfLifeDays * 86_400_000).toISOString()
  }
  return undefined
}

export type ExpiryBalance = {
  previous: number
  inward: number
  expired: number
  /** Gross outward (consumption / issue) − returned. */
  netConsumed: number
  /** Adjustments and other losses, signed — shown only where they occurred. */
  other: number
  current: number
}

/**
 * Previous Inventory + Material Inward − Expired − Net Consumed (± other) =
 * Current Available, for one balance over a window — straight from the ledger.
 */
export function expiryBalance(ledger: InventoryTransaction[], inventoryId: string, from: number, to: number): ExpiryBalance {
  const own = ledger.filter((t) => t.inventoryId === inventoryId).sort(byTxnNo)
  let previous = 0
  const out: ExpiryBalance = { previous: 0, inward: 0, expired: 0, netConsumed: 0, other: 0, current: 0 }
  for (const t of own) {
    const at = new Date(t.at).getTime()
    if (at < from) {
      previous = t.balanceAfter
      continue
    }
    if (at > to) break
    const q = Math.abs(t.quantity)
    if (t.type === "INCOMING") out.inward += q
    else if (t.type === "EXPIRY") out.expired += q
    else if (t.type === "CONSUMPTION" || t.type === "ISSUE") out.netConsumed += q
    else if (t.type === "RETURN") out.netConsumed -= q
    else out.other += t.quantity
  }
  out.previous = previous
  out.current = previous + out.inward - out.expired - out.netConsumed + out.other
  return out
}

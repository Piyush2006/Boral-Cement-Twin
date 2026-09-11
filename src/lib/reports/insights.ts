/**
 * Reports & Insights — pure calculations over the operational records.
 *
 * Nothing here stores a figure. Every number is derived from the inventory
 * records, the transaction ledger, the incoming deliveries and the issues, so a
 * report can never disagree with the screen that produced its inputs.
 */

import type { IncomingRecord } from "@/lib/incoming/types"
import { qualityState } from "@/lib/incoming/types"
import type { InventoryTransaction, TransactionType } from "@/lib/inventory/ledger"
import type { InventoryRecord } from "@/lib/inventory/model"
import { materialCost, netConsumedQty, returnedQty, type IssueRecord } from "@/lib/issues/types"

/* ── periods ─────────────────────────────────────────────────────────────── */

export type Period = "TODAY" | "7D" | "30D" | "CUSTOM"

export const PERIOD_LABEL: Record<Period, string> = {
  TODAY: "Today",
  "7D": "7 Days",
  "30D": "30 Days",
  CUSTOM: "Custom Date Range",
}

export type Range = { from: number; to: number }

/** The window a period covers, ending now. A custom range runs from the start of `from` to the end of `to`. */
export function periodRange(period: Period, now: Date, custom?: { from: string; to: string }): Range {
  const end = now.getTime()
  if (period === "TODAY") {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { from: start.getTime(), to: end }
  }
  if (period === "7D") return { from: end - 7 * 86_400_000, to: end }
  if (period === "30D") return { from: end - 30 * 86_400_000, to: end }
  const from = custom?.from ? new Date(`${custom.from}T00:00:00`).getTime() : end - 7 * 86_400_000
  const to = custom?.to ? new Date(`${custom.to}T23:59:59.999`).getTime() : end
  return { from: Math.min(from, to), to: Math.min(Math.max(from, to), end) }
}

export const within = (iso: string | undefined, r: Range) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= r.from && t <= r.to
}

/* ── location utilisation over time ──────────────────────────────────────── */

export type LocationStock = {
  /** Stock at the end of the window. */
  current: number
  /** Time-weighted average over the window. */
  average: number
  /** Highest stock at any moment in the window. */
  peak: number
}

/**
 * Rebuild a location's stock through a window from the ledger.
 *
 * Each balance at the location is replayed from its transactions' balance-after
 * figures, so the result is exactly what the ledger says was there — including
 * balances since archived.
 */
export function locationStock(
  locationId: string,
  ledger: InventoryTransaction[],
  range: Range,
): LocationStock {
  const txns = ledger
    .filter((t) => t.locationId === locationId)
    .map((t) => ({ at: new Date(t.at).getTime(), inventoryId: t.inventoryId, after: t.balanceAfter, n: Number(t.txnId.slice(3)) || 0 }))
    .sort((a, b) => a.at - b.at || a.n - b.n)

  const balance = new Map<string, number>()
  const total = () => [...balance.values()].reduce((s, v) => s + v, 0)

  let i = 0
  while (i < txns.length && txns[i].at <= range.from) {
    balance.set(txns[i].inventoryId, txns[i].after)
    i += 1
  }
  let level = total()
  let peak = level
  let area = 0
  let cursor = range.from
  for (; i < txns.length && txns[i].at <= range.to; i += 1) {
    area += level * (txns[i].at - cursor)
    cursor = txns[i].at
    balance.set(txns[i].inventoryId, txns[i].after)
    level = total()
    peak = Math.max(peak, level)
  }
  area += level * (range.to - cursor)
  const span = range.to - range.from
  return { current: level, average: span > 0 ? area / span : level, peak }
}

/* ── movements ───────────────────────────────────────────────────────────── */

export type MovementTotals = {
  /** INCOMING. */
  inward: number
  /** CONSUMPTION and ISSUE postings — material that left for use. */
  grossOutward: number
  /** RETURN — put back from the gross outward. */
  returned: number
  /** Gross outward − returned. */
  netConsumed: number
  /** Exception outcomes, each under its own type. */
  losses: Record<"EXPIRY" | "WASTE" | "LOSS" | "UNACCOUNTED", number>
  adjustmentsIn: number
  adjustmentsOut: number
  count: number
}

/** Movement totals in one unit of measure over a window. Mixing MT with EA would mean nothing. */
export function movementTotals(ledger: InventoryTransaction[], range: Range, uom = "MT"): MovementTotals {
  const out: MovementTotals = {
    inward: 0,
    grossOutward: 0,
    returned: 0,
    netConsumed: 0,
    losses: { EXPIRY: 0, WASTE: 0, LOSS: 0, UNACCOUNTED: 0 },
    adjustmentsIn: 0,
    adjustmentsOut: 0,
    count: 0,
  }
  for (const t of ledger) {
    if (t.uom !== uom || !within(t.at, range)) continue
    out.count += 1
    const q = Math.abs(t.quantity)
    switch (t.type as TransactionType) {
      case "INCOMING":
        out.inward += q
        break
      case "CONSUMPTION":
      case "ISSUE":
        out.grossOutward += q
        break
      case "RETURN":
        out.returned += q
        break
      case "ADJUSTMENT":
        if (t.quantity >= 0) out.adjustmentsIn += q
        else out.adjustmentsOut += q
        break
      case "EXPIRY":
      case "WASTE":
      case "LOSS":
      case "UNACCOUNTED":
        out.losses[t.type as keyof MovementTotals["losses"]] += q
        break
    }
  }
  out.netConsumed = out.grossOutward - out.returned
  return out
}

/* ── quality ─────────────────────────────────────────────────────────────── */

export type QualityKpis = {
  /** Deliveries (incoming lots / batches) identified in the window. */
  deliveries: number
  testingRequired: number
  testingCompleted: number
  testingPending: number
  passed: number
  failed: number
}

export function qualityKpis(incoming: IncomingRecord[], range: Range): QualityKpis {
  const inWindow = incoming.filter((r) => within(r.audit[0]?.at ?? r.expectedArrival, range))
  const required = inWindow.filter((r) => r.sampleRequired)
  return {
    deliveries: inWindow.length,
    testingRequired: required.length,
    testingCompleted: required.filter((r) => r.quality?.tested).length,
    testingPending: required.filter((r) => qualityState(r) === "TEST_PENDING").length,
    passed: inWindow.filter((r) => r.quality?.result === "PASS").length,
    failed: inWindow.filter((r) => r.quality?.result === "FAIL").length,
  }
}

/** Every delivery still awaiting its test, whenever it arrived — pending is a current state, not a window. */
export function pendingQuality(incoming: IncomingRecord[]): IncomingRecord[] {
  return incoming
    .filter((r) => qualityState(r) === "TEST_PENDING")
    .sort((a, b) => a.expectedArrival.localeCompare(b.expectedArrival))
}

/* ── maintenance material cost ───────────────────────────────────────────── */

export type CostLine = {
  key: string
  quantity: number
  uom: string
  cost: number
  /** Consumptions with no unit cost, which are left out of `cost` rather than guessed. */
  uncosted: number
  records: IssueRecord[]
}

/** Maintenance (SPARE) consumption in a window, costed at the unit cost captured at consumption. */
export function maintenanceConsumption(issues: IssueRecord[], range: Range): IssueRecord[] {
  return issues.filter((r) => r.consumption?.category === "SPARE" && within(r.consumption.at, range))
}

export function costBy(records: IssueRecord[], key: (r: IssueRecord) => string): CostLine[] {
  const lines = new Map<string, CostLine>()
  for (const r of records) {
    const k = key(r)
    const line = lines.get(k) ?? { key: k, quantity: 0, uom: r.uom, cost: 0, uncosted: 0, records: [] }
    line.quantity += netConsumedQty(r) ?? 0
    const cost = materialCost(r)
    if (cost === null) line.uncosted += 1
    else line.cost += cost
    line.records.push(r)
    lines.set(k, line)
  }
  return [...lines.values()].sort((a, b) => b.cost - a.cost)
}

/** Gross outward and returned for a set of issues — the net consumption identity, per record. */
export function netConsumption(records: IssueRecord[]): { gross: number; returned: number; net: number } {
  let gross = 0
  let returned = 0
  for (const r of records) {
    if (!r.consumption) continue
    gross += r.consumption.consumedQty
    returned += returnedQty(r)
  }
  return { gross, returned, net: gross - returned }
}

/* ── inventory value ─────────────────────────────────────────────────────── */

export type ValueLine = { key: string; quantity: number; uom: string; value: number; records: number; unvalued: number }

/** Live value = quantity × applicable unit cost, grouped. Records with no cost are counted, never valued at zero silently. */
export function inventoryValueBy(
  records: InventoryRecord[],
  unitCost: (r: InventoryRecord) => number | undefined,
  key: (r: InventoryRecord) => string,
): ValueLine[] {
  const lines = new Map<string, ValueLine>()
  for (const r of records) {
    const k = key(r)
    const line = lines.get(k) ?? { key: k, quantity: 0, uom: r.uom, value: 0, records: 0, unvalued: 0 }
    line.quantity += r.quantity
    if (line.uom !== r.uom) line.uom = "mixed"
    line.records += 1
    const cost = unitCost(r)
    if (cost === undefined) line.unvalued += 1
    else line.value += r.quantity * cost
    lines.set(k, line)
  }
  return [...lines.values()].sort((a, b) => b.value - a.value)
}

/* ── expiry ──────────────────────────────────────────────────────────────── */

export type ShelfLife = "EXPIRED" | "EXPIRING_SOON" | "HEALTHY_SHELF_LIFE"

export const SHELF_LIFE_LABEL: Record<ShelfLife, string> = {
  EXPIRED: "Expired",
  EXPIRING_SOON: "Expiring Soon",
  HEALTHY_SHELF_LIFE: "Healthy Shelf Life",
}

/** Days before expiry that count as "soon". Plant configuration. */
export const EXPIRING_SOON_DAYS = 30

export function daysToExpiry(expiryDate: string, now: Date): number {
  return Math.floor((new Date(expiryDate).getTime() - now.getTime()) / 86_400_000)
}

export function shelfLife(expiryDate: string, now: Date): ShelfLife {
  const d = daysToExpiry(expiryDate, now)
  if (d < 0) return "EXPIRED"
  if (d <= EXPIRING_SOON_DAYS) return "EXPIRING_SOON"
  return "HEALTHY_SHELF_LIFE"
}

/* ── balance identity ────────────────────────────────────────────────────── */

/** Total stock in one UOM at a moment, replayed from the ledger's balance-after figures. */
export function stockAt(ledger: InventoryTransaction[], at: number, uom = "MT"): number {
  const latest = new Map<string, { t: number; n: number; after: number }>()
  for (const tx of ledger) {
    if (tx.uom !== uom) continue
    const t = new Date(tx.at).getTime()
    if (t > at) continue
    const n = Number(tx.txnId.slice(3)) || 0
    const prev = latest.get(tx.inventoryId)
    if (!prev || t > prev.t || (t === prev.t && n > prev.n)) latest.set(tx.inventoryId, { t, n, after: tx.balanceAfter })
  }
  let total = 0
  for (const v of latest.values()) total += v.after
  return total
}

/**
 * Previous closing + inward + returned − gross outward − losses ± adjustments
 * = current closing. Returned alongside the ledger's own closing figure so the
 * report can show that the two agree.
 */
export function balanceIdentity(ledger: InventoryTransaction[], range: Range, uom = "MT") {
  const m = movementTotals(ledger, range, uom)
  const opening = stockAt(ledger, range.from - 1, uom)
  const losses = m.losses.EXPIRY + m.losses.WASTE + m.losses.LOSS + m.losses.UNACCOUNTED
  const computed = opening + m.inward - m.netConsumed - losses + m.adjustmentsIn - m.adjustmentsOut
  const closing = stockAt(ledger, range.to, uom)
  return { opening, movements: m, losses, computed, closing }
}

/* ── snapshots ───────────────────────────────────────────────────────────── */

export type Snapshot = Map<string, { quantity: number; materialId: string; uom: string }>

/** Every balance as it stood at a moment, replayed from the ledger. */
export function snapshotAt(ledger: InventoryTransaction[], at: number): Snapshot {
  const latest = new Map<string, { t: number; n: number; quantity: number; materialId: string; uom: string }>()
  for (const tx of ledger) {
    const t = new Date(tx.at).getTime()
    if (t > at) continue
    const n = Number(tx.txnId.slice(3)) || 0
    const prev = latest.get(tx.inventoryId)
    if (!prev || t > prev.t || (t === prev.t && n > prev.n)) {
      latest.set(tx.inventoryId, { t, n, quantity: tx.balanceAfter, materialId: tx.materialId, uom: tx.uom })
    }
  }
  const out: Snapshot = new Map()
  for (const [id, v] of latest) out.set(id, { quantity: v.quantity, materialId: v.materialId, uom: v.uom })
  return out
}

/** Total quantity in one UOM and total value at standard cost, for a snapshot. */
export function snapshotTotals(snap: Snapshot, unitCost: (materialId: string) => number | undefined, uom = "MT") {
  let quantity = 0
  let value = 0
  for (const v of snap.values()) {
    if (v.uom === uom) quantity += v.quantity
    const cost = unitCost(v.materialId)
    if (cost !== undefined) value += v.quantity * cost
  }
  return { quantity, value }
}

/** Percentage change, or null where there is no base to compare with. */
export function pctChange(now: number, before: number): number | null {
  return before > 0 ? ((now - before) / before) * 100 : null
}

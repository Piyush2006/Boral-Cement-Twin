/**
 * Lot / batch references — a traceability detail, not a master.
 *
 *   PO → Gate Entry / GRN → Incoming → Quality → LOT / BATCH → Inventory → Issue → Consumption
 *
 * A reference is recorded only for materials that are lot-tracked, and only
 * when a delivery is accepted — never forced on every material, and there is
 * no lot menu or lot master. The reference is stamped on the INCOMING
 * transaction and carried onto the issues and consumption drawn from it, so it
 * answers "which received material was consumed?" where the plant needs that.
 *
 * Kept as one module singleton so traceability reads a single register.
 */

import type { QualityReading } from "@/lib/masters/types"

export type InternalLot = {
  lotId: string
  materialId: string
  gradeId: string
  /** Quantity released into stock when the lot was created. */
  receivedQty: number
  uom: string
  /** Where the lot was received. */
  locationId: string
  inventoryId: string
  /** Upstream references. */
  poNumber?: string
  incomingId?: string
  supplier?: string
  /** Supplier's own batch reference, as delivered. */
  supplierBatch?: string
  /** Quality readings taken against the grade's parameters. */
  quality: QualityReading[]
  qualityResult: "PASS" | "FAIL"
  /** Only where expiry applies to the material. */
  expiryDate?: string
  receivedAt: string
  receivedBy: string
  provenance: "DEMO" | "LIVE"
}

/** Lot / batch reference, e.g. LOT-2026-00421. */
export const formatLotId = (n: number, year = 2026) => `LOT-${year}-${String(n).padStart(5, "0")}`

const lotNumber = (lotId: string) => Number(lotId.split("-").at(-1)) || 0

let lots: InternalLot[] = []
let counter = 0
const listeners = new Set<(l: InternalLot[]) => void>()

function publish() {
  for (const fn of listeners) fn(lots)
}

/** The reference the next lot would take — shown to the operator as a suggestion. */
export function suggestLotId(): string {
  return formatLotId(counter + 1)
}

/**
 * Record a lot / batch reference against an accepted delivery. The caller may
 * supply the reference (as printed on the plant's documents); otherwise the
 * next sequence number is used. Only lot-tracked materials call this.
 */
export function createLot(entry: Omit<InternalLot, "lotId"> & { lotId?: string }): InternalLot {
  counter += 1
  const lotId = entry.lotId?.trim().toUpperCase() || formatLotId(counter)
  counter = Math.max(counter, lotNumber(lotId))
  const lot: InternalLot = { ...entry, lotId }
  lots = [lot, ...lots]
  publish()
  return lot
}

/** Install seeded lots (oldest first). Idempotent. */
export function installLots(history: InternalLot[]): void {
  if (lots.length || counter) return
  lots = [...history].reverse()
  counter = history.reduce((max, l) => Math.max(max, lotNumber(l.lotId)), 0)
  publish()
}

/** Newest first. */
export function allLots(): InternalLot[] {
  return lots
}

export function lot(lotId: string | undefined): InternalLot | undefined {
  return lotId ? lots.find((l) => l.lotId === lotId) : undefined
}

export function lotsForMaterial(materialId: string): InternalLot[] {
  return lots.filter((l) => l.materialId === materialId)
}

export function subscribeLots(fn: (l: InternalLot[]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Whether a lot has passed its expiry date at the given moment. */
export function lotExpired(l: InternalLot, now: Date = new Date()): boolean {
  return Boolean(l.expiryDate) && new Date(l.expiryDate as string).getTime() < now.getTime()
}

/** Days until a lot expires; negative once past. Null where expiry is not tracked. */
export function daysToExpiry(l: InternalLot, now: Date = new Date()): number | null {
  if (!l.expiryDate) return null
  const ms = new Date(l.expiryDate).getTime() - now.getTime()
  return Math.floor(ms / 86_400_000)
}

/** Test seam only. */
export function resetLots(): void {
  lots = []
  counter = 0
}

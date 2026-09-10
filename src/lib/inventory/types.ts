/**
 * Inventory types (spec §19, §20, §28).
 *
 * `provenance` is the important field. Until the Integration API is connected,
 * every number is DEMO and the UI must say so. A DEMO value can never be
 * presented as Berrima stock.
 */

export type Provenance = "DEMO" | "LIVE"

/** §24: Healthy / Critical only. There is deliberately no "Low". */
export type InventoryStatus = "HEALTHY" | "CRITICAL"

export type Material = {
  materialId: string
  name: string
  uom: string
}

export type InventoryRecord = {
  inventoryLocationId: string
  materialId: string
  materialName: string
  uom: string
  /** Stock the system believes is present. */
  bookStock: number
  capacity?: number
  status: InventoryStatus
  /** ISO timestamp of the last physical verification, if ever. */
  lastVerifiedAt?: string
  lastUpdatedAt: string
  provenance: Provenance
}

export type CountSubmission = {
  inventoryLocationId: string
  assetId: string
  physicalCount: number
  countedBy: string
  countedAt: string
  note?: string
}

/**
 * An adjustment produced by a physical count. §18: never an overwrite — the
 * count is recorded as a delta for the reconciliation workflow to apply.
 */
export type Adjustment = {
  adjustmentId: string
  inventoryLocationId: string
  assetId: string
  bookStock: number
  physicalCount: number
  variance: number
  variancePercent: number
  countedBy: string
  countedAt: string
  status: "PENDING_RECONCILIATION" | "APPLIED" | "REJECTED"
  provenance: Provenance
}

export function fillPercent(record: InventoryRecord): number | null {
  if (!record.capacity || record.capacity <= 0) return null
  return Math.min(100, (record.bookStock / record.capacity) * 100)
}

export function availableCapacity(record: InventoryRecord): number | null {
  if (!record.capacity) return null
  return Math.max(0, record.capacity - record.bookStock)
}

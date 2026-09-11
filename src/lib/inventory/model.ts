/**
 * Inventory record model and stock health.
 *
 * An inventory balance is MATERIAL + GRADE + LOCATION + QUANTITY, optionally
 * carrying a lot / batch reference where the material is lot-tracked. Its
 * quantity changes ONLY through
 * ledger transactions — see ledger.ts — and starts at zero.
 *
 * Stock health has exactly two states, measured against the RECORD's minimum:
 *
 *   quantity >  minimum  →  HEALTHY
 *   quantity <= minimum  →  CRITICAL
 *
 * Maximum and target stock are planning values and produce no status.
 *
 * This module deliberately imports nothing, so it can be used from anywhere.
 */

export type StockStatus = "HEALTHY" | "CRITICAL"

export const STOCK_STATUSES: StockStatus[] = ["HEALTHY", "CRITICAL"]

export function stockStatus(quantity: number, minStock: number): StockStatus {
  return quantity <= minStock ? "CRITICAL" : "HEALTHY"
}

export const STOCK_STATUS_META: Record<StockStatus, { label: string; colour: string }> = {
  HEALTHY: { label: "HEALTHY", colour: "#22c55e" },
  CRITICAL: { label: "CRITICAL", colour: "#ef4444" },
}

/** The stock limits of an inventory record. They belong to the record, not to the grade. */
export type StockLimits = { minStock: number; maxStock: number; targetStock: number }

export type InventoryAudit = {
  at: string
  by: string
  action: string
}

export type InventoryRecord = {
  /** Unique, user-facing identity, e.g. RM-LS-001. Never reused. */
  inventoryId: string
  materialId: string
  /** The grade held here. Its quality specification comes from Materials + Grades. */
  gradeId: string
  locationId: string
  /** Moved only by ledger transactions. */
  quantity: number
  uom: string
  /**
   * Stock limits for THIS balance. The same grade can be held at several
   * locations with different limits, so they live here and not on the grade.
   */
  minStock: number
  targetStock: number
  maxStock: number
  /** Lot / batch reference, only where the material is lot-tracked. */
  lotId?: string
  /** Supplier's batch reference, as delivered. */
  batch?: string
  description?: string
  notes?: string
  /** Archived records keep their history but take no new movements. */
  active: boolean
  createdAt: string
  createdBy: string
  updatedAt: string
  audit: InventoryAudit[]
  provenance: "DEMO" | "LIVE"
}

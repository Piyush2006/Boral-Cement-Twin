/**
 * Location views of inventory, for the map, the twin and Plant Flow.
 *
 * These are READ-ONLY projections of the inventory records (pile-store derives
 * them): the balance at a pile or silo is the sum of its active inventory
 * records, and its status is the same HEALTHY / CRITICAL rule the Inventory
 * module uses. No view keeps a quantity of its own.
 */

import { STOCK_STATUS_META, type StockStatus } from "./model"

export type PileRecord = {
  pileId: string
  /** Primary inventory record at the pile, e.g. RM-LS-001. */
  id: string
  materialId: string
  materialName: string
  quantityMt: number
  capacityMt: number
  minStock: number
  maxStock: number
  status: StockStatus
  lastUpdatedAt: string
  provenance: "DEMO" | "LIVE"
}

/** Fixed seed timestamp — `new Date()` at module load would trip hydration. */
export const SEED_TIMESTAMP = "2026-09-09T00:00:00.000Z"

/** Stock health labels and colours. Only HEALTHY and CRITICAL exist. */
export const STATUS_META = STOCK_STATUS_META

/**
 * Cement silo locations, and the read-only silo view of inventory.
 * Quantities come from the inventory records held at each silo.
 */

import type { StockStatus } from "./model"

export type SiloRecord = {
  id: string
  name: string
  /** Primary inventory record at the silo. */
  inventoryId: string
  materialName: string
  quantityMt: number
  capacityMt: number
  minStock: number
  status: StockStatus
  lastUpdatedAt: string
  provenance: "DEMO" | "LIVE"
}

/** Silo locations and capacities (the demo objects Cement Silo 1–3). */
export const SILO_SEED: Array<{ id: string; name: string; cap: number }> = [
  { id: "SL-01", name: "Cement (Silo 1)", cap: 7000 },
  { id: "SL-02", name: "Cement (Silo 2)", cap: 7000 },
  { id: "SL-03", name: "Cement (Silo 3)", cap: 8000 },
]

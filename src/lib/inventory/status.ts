/**
 * Stock health and limits for a balance.
 *
 * Minimum, target and maximum belong to the inventory record: the same grade
 * held at two locations can need two different minimums.
 */

import { stockStatus, type InventoryRecord, type StockLimits, type StockStatus } from "./model"

export type { StockLimits }

export function recordLimits(record: Pick<InventoryRecord, "minStock" | "targetStock" | "maxStock">): StockLimits {
  return { minStock: record.minStock, targetStock: record.targetStock, maxStock: record.maxStock }
}

export function recordStatus(record: Pick<InventoryRecord, "minStock" | "quantity">): StockStatus {
  return stockStatus(record.quantity, record.minStock)
}

/** Utilisation of a location's capacity, where the plant configures one. Never invented. */
export function utilisation(quantity: number, capacity: number | undefined): number | null {
  if (!capacity || capacity <= 0) return null
  return (quantity / capacity) * 100
}

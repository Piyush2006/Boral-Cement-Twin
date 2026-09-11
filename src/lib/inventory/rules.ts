/**
 * Inventory validation — pure, so the rules are testable without the UI.
 *
 * An inventory record maps an EXISTING Material + Grade to an EXISTING
 * Location. It carries its own minimum, target and maximum stock; it never
 * creates or edits material or grade information.
 */

import { holdsStock } from "@/lib/masters/types"
import { gradeEntry, locationEntry, materialEntry } from "./catalog"
import type { InventoryRecord } from "./model"

export type Check = { ok: true } | { ok: false; error: string }

const normalise = (v?: string) => (v ?? "").trim().toUpperCase()

/**
 * The reference that identifies a balance apart from others of the same
 * material, grade and location: its lot, or failing that the supplier's batch.
 * A blank string is no reference at all.
 */
const lotKey = (lotId?: string, batch?: string) => normalise(lotId) || normalise(batch)

/** A typed quantity: numeric, and zero or more. */
export function parseNonNegative(raw: string): number | null {
  const t = raw.trim()
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** A typed movement: numeric, and greater than zero. */
export function parsePositive(raw: string): number | null {
  const n = parseNonNegative(raw)
  return n !== null && n > 0 ? n : null
}

/**
 * The next Inventory ID for a material: its code and a sequence, e.g. RM-LS-002.
 * Archived records keep their IDs, so the sequence counts every record ever
 * created and an ID is never reused.
 */
export function nextInventoryId(materialCode: string, existing: Pick<InventoryRecord, "inventoryId">[]): string {
  const code = normalise(materialCode)
  const pattern = new RegExp(`^${code.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}-(\\d+)$`)
  const used = existing.map((r) => pattern.exec(normalise(r.inventoryId))?.[1]).filter(Boolean).map(Number)
  const n = Math.max(0, ...used) + 1
  return `${code}-${String(n).padStart(3, "0")}`
}

export type LimitsInput = { minStock: number | null; targetStock: number | null; maxStock: number | null }

/** Min ≤ Target ≤ Max, all numbers, zero or more. */
export function validateLimits(input: LimitsInput): Check {
  if (input.minStock === null) return { ok: false, error: "Min Stock must be a number, zero or more." }
  if (input.targetStock === null) return { ok: false, error: "Target must be a number, zero or more." }
  if (input.maxStock === null) return { ok: false, error: "Max Stock must be a number, zero or more." }
  if (input.maxStock < input.minStock) return { ok: false, error: "Max Stock must be greater than or equal to Min Stock." }
  if (input.targetStock < input.minStock || input.targetStock > input.maxStock) {
    return { ok: false, error: "Target must sit between Min Stock and Max Stock." }
  }
  return { ok: true }
}

export type NewInventoryInput = {
  materialId: string
  gradeId: string
  inventoryId: string
  locationId: string
  /** Opening quantity. Zero unless an approved opening balance is loaded. */
  quantity: number | null
  /** Required when the opening quantity is above zero: the approval behind it. */
  openingReference?: string
  uom: string
  minStock: number | null
  targetStock: number | null
  maxStock: number | null
  batch?: string
  lotId?: string
  expiryDate?: string
}

export function validateNewInventory(input: NewInventoryInput, existing: InventoryRecord[]): Check {
  const material = materialEntry(input.materialId)
  if (!material) return { ok: false, error: "Select a Material + Grade." }
  if (!material.active) return { ok: false, error: `${material.name} is inactive and cannot take new stock.` }

  const grade = gradeEntry(input.gradeId)
  if (!grade) return { ok: false, error: "Select a Material + Grade." }
  if (grade.materialId !== input.materialId) {
    return { ok: false, error: `${grade.name} is not a grade of ${material.name}.` }
  }
  if (!grade.active) return { ok: false, error: `${material.name} — ${grade.name} is inactive.` }

  const id = normalise(input.inventoryId)
  if (!id) return { ok: false, error: "The Inventory ID could not be generated." }
  if (!/^[A-Z0-9][A-Z0-9-]{2,30}$/.test(id)) {
    return { ok: false, error: "Inventory ID may use letters, digits and hyphens (3–31 characters)." }
  }
  // Archived records keep their IDs: an ID is never reused.
  if (existing.some((r) => normalise(r.inventoryId) === id)) {
    return { ok: false, error: `Inventory ID ${id} already exists.` }
  }

  const location = locationEntry(input.locationId)
  if (!location) return { ok: false, error: "Select a location." }
  if (!holdsStock(location)) {
    return { ok: false, error: `${location.name} is a consumption location and cannot hold stock.` }
  }
  if (!location.active) return { ok: false, error: `${location.name} is inactive.` }

  if (input.uom !== material.uom) {
    return { ok: false, error: `${material.name} is held in ${material.uom}.` }
  }

  const limits = validateLimits(input)
  if (!limits.ok) return limits

  if (input.quantity === null) return { ok: false, error: "Opening Quantity must be a number, zero or more." }
  if (input.quantity > 0 && !input.openingReference?.trim()) {
    return { ok: false, error: "An opening balance above zero needs its approval reference." }
  }

  if (input.expiryDate && !material.expiryApplicable) {
    return { ok: false, error: `Expiry does not apply to ${material.name}.` }
  }
  if (input.lotId?.trim() && !material.lotTracking) {
    return { ok: false, error: `${material.name} is not lot-tracked, so it takes no lot reference.` }
  }

  // One active balance per material, grade, location and lot — otherwise the
  // same physical stock could be recorded twice.
  const batch = lotKey(input.lotId, input.batch)
  const clash = existing.find(
    (r) =>
      r.active &&
      r.materialId === input.materialId &&
      r.gradeId === input.gradeId &&
      r.locationId === input.locationId &&
      lotKey(r.lotId, r.batch) === batch,
  )
  if (clash) {
    return {
      ok: false,
      error: `${clash.inventoryId} already holds ${material.name} ${grade.name} at ${location.name}${batch ? ` for lot ${batch}` : ""}.`,
    }
  }
  return { ok: true }
}

/** Outward types an operator can post directly against a balance. */
export type DecreaseType = "ADJUSTMENT" | "WASTE" | "LOSS" | "UNACCOUNTED"

export const DECREASE_TYPES: DecreaseType[] = ["ADJUSTMENT", "WASTE", "LOSS", "UNACCOUNTED"]

export function validateAdjustment(
  record: InventoryRecord | undefined,
  direction: "IN" | "OUT",
  quantity: number | null,
  reason: string,
): Check {
  if (!record) return { ok: false, error: "Inventory record not found." }
  if (!record.active) return { ok: false, error: `${record.inventoryId} is archived and cannot take movements.` }
  if (quantity === null) return { ok: false, error: "Quantity must be a number greater than zero." }
  if (!reason.trim()) return { ok: false, error: "Enter a reason." }
  if (direction === "OUT" && quantity > record.quantity) {
    return {
      ok: false,
      error: `Cannot remove ${quantity.toLocaleString()} ${record.uom} — only ${Math.round(record.quantity).toLocaleString()} ${record.uom} on hand. Inventory cannot go negative.`,
    }
  }
  return { ok: true }
}

export function validateArchive(record: InventoryRecord | undefined, reason: string): Check {
  if (!record) return { ok: false, error: "Inventory record not found." }
  if (!record.active) return { ok: false, error: "This record is already archived." }
  if (record.quantity !== 0) {
    return {
      ok: false,
      error: `${record.inventoryId} still holds ${Math.round(record.quantity).toLocaleString()} ${record.uom}. Remove the stock with a recorded transaction before archiving, so the change stays traceable.`,
    }
  }
  if (!reason.trim()) return { ok: false, error: "Enter a reason for archiving." }
  return { ok: true }
}

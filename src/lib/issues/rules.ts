/**
 * Issue & Consumption — validation and stock availability.
 *
 * Pure functions, so the rules can be tested without the UI. None of them
 * calculates an inventory balance: the on-hand figure always comes from the
 * inventory record and is passed in.
 */

import type { PostingPoint } from "@/config/issue-process"
import { materialEntry } from "@/lib/inventory/catalog"
import type { InventoryRecord } from "@/lib/inventory/model"
import { consumingArea } from "./catalog"
import type { IssueRecord } from "./types"

export type Check = { ok: true } | { ok: false; error: string }

const fmt = (n: number) => Math.round(n).toLocaleString()

/** A quantity the user typed: numeric and greater than zero. */
export function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Stock already promised to open issues from an inventory record.
 *
 * Only meaningful when inventory posts at consumption: an issued record has
 * released material that has not yet left the balance, so issuing the same
 * tonnes again would double-count them. When inventory posts at issue the
 * balance has already moved, and nothing is committed.
 */
export function committedAt(inventoryId: string, records: IssueRecord[], excludeIssueId?: string): number {
  return records
    .filter(
      (r) =>
        r.sourceInventoryId === inventoryId &&
        r.issueId !== excludeIssueId &&
        r.postingPoint === "CONSUMPTION" &&
        r.status === "ISSUED" &&
        r.issue,
    )
    .reduce((sum, r) => sum + r.issue!.issuedQty, 0)
}

export type Availability = { onHand: number; committed: number; available: number }

export function availability(onHand: number, inventoryId: string, records: IssueRecord[], excludeIssueId?: string): Availability {
  const committed = committedAt(inventoryId, records, excludeIssueId)
  return { onHand, committed, available: Math.max(0, onHand - committed) }
}

export type IssueDraft = {
  materialId: string
  /** Material + Grade is selected together; the source must hold this grade. */
  gradeId?: string
  sourceInventoryId: string
  quantity: number | null
  uom: string
  consumingAreaId: string
}

/** Everything a new issue must satisfy. Production reference is optional. */
export function validateIssueDraft(draft: IssueDraft, source: InventoryRecord | undefined, stock: Availability | null): Check {
  const material = materialEntry(draft.materialId)
  if (!material) return { ok: false, error: "Select a material." }
  if (!source) return { ok: false, error: "Select the source location." }
  if (!source.active) return { ok: false, error: `${source.inventoryId} is archived.` }
  const expired = expiredOn(source)
  if (expired) return { ok: false, error: expired }
  if (source.materialId !== draft.materialId) {
    return { ok: false, error: `${source.inventoryId} does not hold ${material.name}.` }
  }
  if (draft.gradeId && source.gradeId !== draft.gradeId) {
    return { ok: false, error: `${source.inventoryId} holds a different grade of ${material.name}.` }
  }
  if (draft.uom !== material.uom) return { ok: false, error: `${material.name} is held in ${material.uom}, not ${draft.uom}.` }
  if (draft.quantity === null) return { ok: false, error: "Quantity must be a number greater than zero." }
  if (!consumingArea(draft.consumingAreaId)) return { ok: false, error: "Select the consuming area." }
  if (!stock) return { ok: false, error: "Stock for this location is unavailable." }
  if (draft.quantity > stock.available) {
    return {
      ok: false,
      error: `Insufficient stock — ${fmt(stock.available)} ${draft.uom} available, ${fmt(draft.quantity)} ${draft.uom} required.`,
    }
  }
  return { ok: true }
}

/** Releasing material against an existing request. */
export function validateIssue(record: IssueRecord, issuedQty: number | null, stock: Availability | null): Check {
  if (record.approvalRequired && record.status === "REQUESTED") {
    return { ok: false, error: "This issue must be approved before material is released." }
  }
  if (record.status !== "REQUESTED" && record.status !== "APPROVED") {
    return { ok: false, error: "This issue has already been released." }
  }
  if (issuedQty === null) return { ok: false, error: "Quantity must be a number greater than zero." }
  if (issuedQty > record.requestedQty) {
    return { ok: false, error: `Cannot issue more than the ${fmt(record.requestedQty)} ${record.uom} requested.` }
  }
  if (!stock) return { ok: false, error: "Stock for this location is unavailable." }
  if (issuedQty > stock.available) {
    return {
      ok: false,
      error: `Insufficient stock — ${fmt(stock.available)} ${record.uom} available, ${fmt(issuedQty)} ${record.uom} to issue.`,
    }
  }
  return { ok: true }
}

/** Recording what was actually consumed against an issue. */
export function validateConsumption(
  record: IssueRecord,
  consumedQty: number | null,
  options: {
    allowOverConsumption: boolean
    postingPoint: PostingPoint
    onHand: number | null
    /** When the material was consumed (ISO). */
    at: string | null
    now?: Date
  },
): Check {
  if (record.status !== "ISSUED" || !record.issue) {
    return { ok: false, error: "Consumption can only be recorded against issued material." }
  }
  if (consumedQty === null) return { ok: false, error: "Consumed quantity must be a number greater than zero." }
  if (!options.allowOverConsumption && consumedQty > record.issue.issuedQty) {
    return { ok: false, error: `Consumed quantity cannot exceed the ${fmt(record.issue.issuedQty)} ${record.uom} issued.` }
  }
  if (!options.at || Number.isNaN(new Date(options.at).getTime())) return { ok: false, error: "Enter the date and time of consumption." }
  const when = new Date(options.at).getTime()
  const now = (options.now ?? new Date()).getTime()
  if (when > now + 5 * 60000) return { ok: false, error: "Consumption date and time cannot be in the future." }
  // Compare to the minute: the form's date/time field has no seconds.
  if (Math.floor(when / 60000) < Math.floor(new Date(record.issue.at).getTime() / 60000)) {
    return { ok: false, error: "Consumption cannot be dated before the material was issued." }
  }
  if (options.postingPoint === "CONSUMPTION") {
    if (options.onHand === null) return { ok: false, error: "Stock for this location is unavailable." }
    if (consumedQty > options.onHand) {
      return {
        ok: false,
        error: `Insufficient stock to post — ${fmt(options.onHand)} ${record.uom} on hand in ${record.sourceInventoryId}. Inventory cannot go negative.`,
      }
    }
  }
  return { ok: true }
}

/**
 * Expired stock is not issued: it is written off under Inventory › Expiry.
 * Returns the reason, or null where the balance is usable.
 */
export function expiredOn(source: Pick<InventoryRecord, "inventoryId" | "expiryDate">, now: Date = new Date()): string | null {
  if (!source.expiryDate || new Date(source.expiryDate).getTime() >= now.getTime()) return null
  const day = new Date(source.expiryDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
  return `${source.inventoryId} expired on ${day}. Expired stock is not issued — write it off under Inventory › Expiry.`
}

/**
 * Issue & Consumption — record model.
 *
 * One record follows a production requirement from request, through the
 * release of material from its source location, to the quantity actually
 * consumed. Issue and consumption are separate events on that record: the
 * issued quantity is never assumed to have been consumed.
 */

import type { PostingPoint } from "@/config/issue-process"
import { isLoss, type ConsumptionCategory, type MaterialReturn } from "./consumption"

/**
 * Workflow statuses. APPROVED is only ever reached when the record was created
 * under a process that requires approval. CONSUMED means the consumption was
 * recorded AND posted — the two happen together or not at all.
 */
export type IssueStatus = "REQUESTED" | "APPROVED" | "ISSUED" | "CONSUMED"

export const ISSUE_STATUSES: IssueStatus[] = ["REQUESTED", "APPROVED", "ISSUED", "CONSUMED"]

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  ISSUED: "Issued",
  CONSUMED: "Consumed",
}

export const ISSUE_STATUS_TONE: Record<IssueStatus, string> = {
  REQUESTED: "#60a5fa",
  APPROVED: "#14b8a6",
  ISSUED: "#eab308",
  CONSUMED: "#22c55e",
}

export type IssueAudit = {
  at: string
  by: string
  action: string
  from?: IssueStatus
  to?: IssueStatus
  /** Inventory transaction written by this step, if any. */
  transactionId?: string
}

/** The incoming receipt this material was drawn from, where one was recorded. */
export type IssueOrigin = {
  incomingId: string
  poNumber: string
}

export type IssueRecord = {
  issueId: string
  materialId: string
  /** The grade drawn. Carried so the issue traces to a specification. */
  gradeId?: string
  /** The inventory record the material is drawn from. */
  sourceInventoryId: string
  sourceLocationId: string
  /** Quantity requested for issue. */
  requestedQty: number
  uom: string
  consumingAreaId: string
  /** Optional production / process reference. Empty when not given. */
  productionRef: string
  reason: string
  notes: string
  /** Batch / lot of the source balance, where one is recorded. */
  batch?: string
  /** Internal lot the material was drawn from, where the stock is lot-tracked. */
  lotId?: string
  origin?: IssueOrigin
  /**
   * The plant asset the material is consumed against. Required for spares and
   * maintenance, so the cost lands on the asset and bad actors surface.
   */
  assetId?: string
  /** Maintenance draws: the work order / maintenance reference. Optional. */
  maintenanceRef?: string

  /** Process settings in force when the record was created. */
  approvalRequired: boolean
  postingPoint: PostingPoint

  status: IssueStatus
  createdAt: string
  createdBy: string

  approval?: { at: string; by: string }
  issue?: {
    issuedQty: number
    at: string
    by: string
    /** Set only when inventory posts at issue. */
    transactionId?: string
  }
  /** Material returned unused. Each return puts stock back at the source. */
  returns?: MaterialReturn[]
  consumption?: {
    consumptionId: string
    /** Gross quantity consumed, before returns. */
    consumedQty: number
    /** How this consumption is classified. */
    category: ConsumptionCategory
    /** Standard cost per UOM at the time of consumption, where the material has one. */
    unitCost?: number
    consumingAreaId: string
    productionRef: string
    shift?: string
    comments: string
    /** When the material was consumed, as entered by the operator. */
    at: string
    /** When the consumption was posted. */
    postedAt: string
    by: string
    /** Set only when inventory posts at consumption. */
    transactionId?: string
  }

  audit: IssueAudit[]
  provenance: "DEMO" | "LIVE"
}

/** Material cost of a consumption: consumed quantity × unit cost, net of returns. Null without a cost. */
export function materialCost(r: IssueRecord): number | null {
  const unit = r.consumption?.unitCost
  const net = netConsumedQty(r)
  return unit === undefined || net === null ? null : net * unit
}

/** The inventory transaction that moved stock for this record, if it has posted. */
export function inventoryTransactionId(r: IssueRecord): string | undefined {
  return r.postingPoint === "ISSUE" ? r.issue?.transactionId : r.consumption?.transactionId
}

/** Total quantity returned from this issue's gross outward. */
export function returnedQty(r: IssueRecord): number {
  return (r.returns ?? []).reduce((sum, x) => sum + x.quantity, 0)
}

/**
 * How much can still be returned: what actually LEFT stock for this issue, less
 * what has already come back.
 *
 *   posting at consumption  →  the consumed (gross outward) quantity
 *   posting at issue        →  the issued quantity
 *
 * Issued-but-unconsumed material never left the balance when stock posts at
 * consumption, so there is nothing to return for it. An exception outcome
 * (wasted, lost, expired, unaccounted) left as a loss and is never returnable.
 * The store, the Return button and the return form all use this one rule.
 */
export function returnableQty(r: IssueRecord): number {
  if (!r.issue) return 0
  if (r.consumption && isLoss(r.consumption.category)) return 0
  const grossOutward = r.postingPoint === "ISSUE" ? r.issue.issuedQty : r.consumption?.consumedQty ?? 0
  return Math.max(0, grossOutward - returnedQty(r))
}

/** Net consumption = gross outward − returned. */
export function netConsumedQty(r: IssueRecord): number | null {
  if (!r.consumption) return null
  return r.consumption.consumedQty - returnedQty(r)
}

/**
 * Issued but never drawn into the job: issued − gross outward recorded at
 * consumption. Returns are part of the gross outward, so they do not count
 * here. Null until both events exist.
 */
export function unconsumedQty(r: IssueRecord): number | null {
  if (!r.issue || !r.consumption) return null
  return r.issue.issuedQty - r.consumption.consumedQty
}

/** The stage the record is waiting on, as the action that advances it. */
export function nextAction(r: IssueRecord): string {
  switch (r.status) {
    case "REQUESTED":
      return r.approvalRequired ? "Approve Issue" : "Issue Material"
    case "APPROVED":
      return "Issue Material"
    case "ISSUED":
      return "Record Consumption"
    case "CONSUMED":
      return "Consumption Posted"
  }
}

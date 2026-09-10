/**
 * Incoming Materials — record model.
 *
 * One incoming load is ONE record from PO identification through to receipt.
 * Weighing, quality and receipt are stages recorded on that record, never
 * separate documents, so the whole journey stays traceable under one ID.
 */

/** The only workflow statuses. There is deliberately no UNLOADED stage. */
export type IncomingStatus = "REGISTERED" | "WEIGHED" | "QUALITY_CHECKED" | "RECEIVED"

export const STATUS_ORDER: IncomingStatus[] = [
  "REGISTERED",
  "WEIGHED",
  "QUALITY_CHECKED",
  "RECEIVED",
]

export const STATUS_LABEL: Record<IncomingStatus, string> = {
  REGISTERED: "Registered",
  WEIGHED: "Weighed",
  QUALITY_CHECKED: "Quality Checked",
  RECEIVED: "Received",
}

export const STATUS_TONE: Record<IncomingStatus, string> = {
  REGISTERED: "#60a5fa",
  WEIGHED: "#eab308",
  QUALITY_CHECKED: "#a855f7",
  RECEIVED: "#22c55e",
}

/** The action that advances a record from its current stage. */
export const NEXT_ACTION: Record<IncomingStatus, string> = {
  REGISTERED: "Proceed to Weighing",
  WEIGHED: "Proceed to Quality",
  QUALITY_CHECKED: "Confirm Receipt",
  RECEIVED: "Receipt Completed",
}

export type Weighing = {
  grossMt: number
  tareMt: number
  /** Derived: gross − tare. Never entered directly. */
  netMt: number
  weighbridgeRef: string
  at: string
  by: string
}

export type QualityResult = "ACCEPTED" | "ACCEPTED_WITH_DEVIATION" | "REJECTED"

export const QUALITY_LABEL: Record<QualityResult, string> = {
  ACCEPTED: "Accepted",
  ACCEPTED_WITH_DEVIATION: "Accepted with deviation",
  REJECTED: "Rejected",
}

export type Quality = {
  readings: Array<{ parameter: string; value: string; unit?: string; spec?: string }>
  result: QualityResult
  comments: string
  at: string
  by: string
}

export type Receipt = {
  receivedMt: number
  /** Received − expected. Informational only. */
  varianceMt: number
  destinationLocationId: string
  /** The inventory transaction this receipt posted. */
  transactionId: string
  at: string
  by: string
}

export type AuditEntry = {
  at: string
  by: string
  action: string
  from?: IncomingStatus
  to?: IncomingStatus
}

export type IncomingRecord = {
  incomingId: string
  poNumber: string
  materialId: string
  supplier: string
  expectedMt: number
  expectedArrival: string
  destinationLocationId: string
  status: IncomingStatus
  weighing?: Weighing
  quality?: Quality
  receipt?: Receipt
  audit: AuditEntry[]
  /** Demo, like every other figure in this build, until a PO system is wired in. */
  provenance: "DEMO" | "LIVE"
}

/** Quantity actually established for a record, where a stage has produced one. */
export function actualMt(record: IncomingRecord): number | null {
  if (record.receipt) return record.receipt.receivedMt
  if (record.weighing) return record.weighing.netMt
  return null
}

export function canAdvance(record: IncomingRecord): boolean {
  return record.status !== "RECEIVED"
}

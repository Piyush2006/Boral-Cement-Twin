/**
 * Incoming Materials — record model.
 *
 * One incoming delivery is ONE record, from identification (QR scan or PO
 * number) through weighing and quality to receipt. The receipt posts an
 * INCOMING transaction into an inventory record; the record keeps that link.
 */

/**
 * The receiving flow. Status is the stage the record has reached:
 * IDENTIFIED → WEIGHING (weight captured) → QUALITY (result recorded) →
 * RECEIVED (inventory posted). There is no UNLOADED stage.
 */
export type IncomingStatus = "IDENTIFIED" | "WEIGHING" | "QUALITY" | "RECEIVED"

export const STATUS_ORDER: IncomingStatus[] = ["IDENTIFIED", "WEIGHING", "QUALITY", "RECEIVED"]

export const STATUS_LABEL: Record<IncomingStatus, string> = {
  IDENTIFIED: "Identified",
  WEIGHING: "Weighing",
  QUALITY: "Quality",
  RECEIVED: "Received",
}

export const STATUS_TONE: Record<IncomingStatus, string> = {
  IDENTIFIED: "#60a5fa",
  WEIGHING: "#eab308",
  QUALITY: "#a855f7",
  RECEIVED: "#22c55e",
}

export type Weighing = {
  grossMt: number
  tareMt: number
  /** Derived: gross − tare. Never entered directly. */
  netMt: number
  at: string
  by: string
}

export type QualityResult = "PASS" | "FAIL"

export type QualityReading = { parameter: string; value: string; unit?: string }

export type Quality = {
  result: QualityResult
  notes: string
  /** Whether a sample was tested. False when the grade's sampling plan skipped this delivery. */
  tested: boolean
  /** Grade-specific parameters, only where configured. */
  readings: QualityReading[]
  at: string
  by: string
}

/** A sample drawn from the delivery for testing. */
export type Sample = {
  sampleId: string
  collectedAt: string
  collectedBy: string
}

export type Receipt = {
  receivedMt: number
  /** Received − expected. Informational only. */
  varianceMt: number
  inventoryId: string
  locationId: string
  /** Lot / batch reference recorded at acceptance — only for lot-tracked materials. */
  lotId?: string
  /** Expiry date of the batch received — only for materials where expiry applies. */
  expiryDate?: string
  /** The INCOMING inventory transaction this receipt posted. */
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
  /** Gate entry number, where the gate issues one. */
  gateEntryNo?: string
  /** Goods receipt note number. */
  grnNo?: string
  /** How the delivery was identified at the gate. */
  identifiedBy: "QR" | "MANUAL"
  materialId: string
  /** The grade the delivery is bought and tested against. */
  gradeId?: string
  supplier: string
  expectedMt: number
  expectedArrival: string
  /** PO's default receiving location. */
  destinationLocationId: string
  /** Inventory record the receipt will post into. */
  receivingInventoryId: string
  vehicleRef?: string
  batch?: string
  origin?: string
  status: IncomingStatus
  /**
   * Whether this delivery must be sampled and tested before acceptance —
   * decided at identification from the grade's sampling frequency.
   */
  sampleRequired: boolean
  sample?: Sample
  weighing?: Weighing
  quality?: Quality
  receipt?: Receipt
  audit: AuditEntry[]
  /** PO number not found in the catalogue; details generated at the gate. */
  adHoc?: boolean
  provenance: "DEMO" | "LIVE"
}

/** Quantity actually established for a record, where a stage has produced one. */
export function actualMt(record: IncomingRecord): number | null {
  if (record.receipt) return record.receipt.receivedMt
  if (record.weighing) return record.weighing.netMt
  return null
}

/**
 * Quality position of a delivery, for the pending-quality view:
 *   TEST PENDING    a sample is required and no result is recorded yet
 *   NOT REQUIRED    the sampling plan skips this delivery and it is not yet accepted
 *   PASSED / FAILED the recorded result
 */
export type QualityState = "TEST_PENDING" | "NOT_REQUIRED" | "PASSED" | "FAILED"

export const QUALITY_STATE_LABEL: Record<QualityState, string> = {
  TEST_PENDING: "TEST PENDING",
  NOT_REQUIRED: "NO TEST REQUIRED",
  PASSED: "PASSED",
  FAILED: "FAILED",
}

export function qualityState(record: IncomingRecord): QualityState {
  if (record.quality) return record.quality.result === "PASS" ? "PASSED" : "FAILED"
  return record.sampleRequired ? "TEST_PENDING" : "NOT_REQUIRED"
}

/** The next action for a record, or null when there is none. */
export function nextAction(record: IncomingRecord): string | null {
  switch (record.status) {
    case "IDENTIFIED":
      return "Proceed to Weighing"
    case "WEIGHING":
      if (record.sampleRequired && !record.sample) return "Collect Sample"
      return record.sampleRequired ? "Record Test Result" : "Accept Quality"
    case "QUALITY":
      return record.quality?.result === "PASS" ? "Confirm Receipt" : null
    case "RECEIVED":
      return null
  }
}

/**
 * Bulk materials in MT are weighed on the weighbridge (gross − tare = net).
 * Anything held in another unit — drums, each — is counted instead.
 */
export function isCounted(uom: string | undefined): boolean {
  return Boolean(uom) && uom !== "MT"
}

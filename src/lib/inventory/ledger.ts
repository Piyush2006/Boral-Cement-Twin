/**
 * Inventory transaction ledger.
 *
 * Every change to a quantity is written here first, as a transaction carrying
 * the balance before and after. The inventory record then moves by the
 * transaction's DELTA — nothing overwrites a quantity directly.
 *
 *   INCOMING      (+)  delivery received after quality acceptance
 *   RETURN        (+)  material issued but not used, back to its source
 *   ADJUSTMENT    (±)  approved correction, with a reason; opening balances too
 *   CONSUMPTION   (−)  material consumed by a consuming area (RM, IM, FG, SPARE)
 *   ISSUE         (−)  only where the plant posts stock at issue instead
 *   EXPIRY        (−)  stock past its expiry date, for expiry-tracked materials
 *   WASTE         (−)  spillage, contamination or damage — a known loss
 *   LOSS          (−)  material lost — a known loss with no usable output
 *   UNACCOUNTED   (−)  a difference found with no identified cause
 *
 * The exact type is recorded on every movement, so the balance can always be
 * rebuilt as previous + inward − expired − net consumed − losses ± adjustments.
 */

export type TransactionType =
  | "INCOMING"
  | "RETURN"
  | "ADJUSTMENT"
  | "CONSUMPTION"
  | "ISSUE"
  | "EXPIRY"
  | "WASTE"
  | "LOSS"
  | "UNACCOUNTED"

export const TRANSACTION_TYPES: TransactionType[] = [
  "INCOMING",
  "RETURN",
  "ADJUSTMENT",
  "CONSUMPTION",
  "ISSUE",
  "EXPIRY",
  "WASTE",
  "LOSS",
  "UNACCOUNTED",
]

/** Outward exception outcomes: stock that left without being used productively. */
export const LOSS_TYPES: TransactionType[] = ["EXPIRY", "WASTE", "LOSS", "UNACCOUNTED"]

export type TransactionLinks = {
  poNumber?: string
  gateEntryNo?: string
  grnNo?: string
  incomingId?: string
  /** The quality record that accepted the delivery (its Incoming ID + result). */
  qualityRef?: string
  issueId?: string
  consumptionId?: string
  returnId?: string
  adjustmentId?: string
  /** Internal lot the movement drew from or created. */
  lotId?: string
  /** Production order / work order the movement was made for. */
  productionRef?: string
  /** Where the material went, for issue and consumption movements. */
  consumingAreaId?: string
  /** Maintenance draws: the asset and the maintenance reference. */
  assetId?: string
  maintenanceRef?: string
  /** EXPIRY: the received batch (its inward transaction) that reached its expiry date. */
  batchId?: string
}

export type InventoryTransaction = {
  txnId: string
  type: TransactionType
  inventoryId: string
  locationId: string
  materialId: string
  /** The grade held — stock limits and quality specification follow from it. */
  gradeId: string
  /** Internal lot, where the stock is lot-tracked. */
  lotId?: string
  /** Signed movement in the material's UOM. */
  quantity: number
  uom: string
  balanceBefore: number
  balanceAfter: number
  reason?: string
  reference?: string
  notes?: string
  batch?: string
  /**
   * Inward movements of an expiry-tracked material: the batch's expiry date,
   * as stated on (or derived from the shelf life on) the PO. Each such inward
   * transaction is one batch — see lib/inventory/expiry.ts.
   */
  expiryDate?: string
  links: TransactionLinks
  actor: string
  at: string
  provenance: "DEMO" | "LIVE"
}

const TYPE_LABEL: Record<TransactionType, string> = {
  INCOMING: "Incoming",
  RETURN: "Return",
  ADJUSTMENT: "Adjustment",
  CONSUMPTION: "Consumption",
  ISSUE: "Issue",
  EXPIRY: "Expiry",
  WASTE: "Waste",
  LOSS: "Loss",
  UNACCOUNTED: "Unaccounted",
}

/** Label for a type; an adjustment carries its direction. */
export function transactionLabel(type: TransactionType, quantity?: number): string {
  if (type === "ADJUSTMENT" && quantity !== undefined) return quantity >= 0 ? "Adjustment (+)" : "Adjustment (−)"
  return TYPE_LABEL[type]
}

/** The references on a transaction, as one readable line. */
export function transactionReference(t: InventoryTransaction): string {
  const l = t.links
  const parts = [
    l.adjustmentId,
    l.poNumber,
    l.gateEntryNo,
    l.grnNo,
    l.incomingId,
    l.issueId,
    l.consumptionId,
    l.returnId,
    l.lotId,
    l.maintenanceRef,
    t.reference,
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : "—"
}

let ledger: InventoryTransaction[] = []
const listeners = new Set<(txns: InventoryTransaction[]) => void>()
let counter = 0

export const formatTxnId = (n: number) => `TX-${String(n).padStart(5, "0")}`

/** Append a transaction. Callers apply the delta to the record afterwards. */
export function recordTransaction(
  entry: Omit<InventoryTransaction, "txnId" | "at"> & { at?: string },
): InventoryTransaction {
  counter += 1
  const txn: InventoryTransaction = {
    ...entry,
    txnId: formatTxnId(counter),
    at: entry.at ?? new Date().toISOString(),
  }
  ledger = [txn, ...ledger]
  for (const l of listeners) l(ledger)
  return txn
}

/**
 * Install the seeded history (oldest first). Idempotent: a second call from a
 * remount or React strict mode leaves the ledger as it is.
 */
export function installLedger(history: InventoryTransaction[]): void {
  if (ledger.length || counter) return
  ledger = [...history].reverse()
  counter = history.reduce((max, t) => Math.max(max, Number(t.txnId.slice(3)) || 0), 0)
  for (const l of listeners) l(ledger)
}

/** Newest first. */
export function transactions(inventoryId?: string): InventoryTransaction[] {
  return inventoryId ? ledger.filter((t) => t.inventoryId === inventoryId) : ledger
}

export function subscribeLedger(fn: (txns: InventoryTransaction[]) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Test seam only — clears the in-memory ledger. */
export function resetLedger(): void {
  ledger = []
  counter = 0
}

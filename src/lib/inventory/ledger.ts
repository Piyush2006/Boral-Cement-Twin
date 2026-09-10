/**
 * Inventory transaction ledger.
 *
 * Every change to a balance is written here first, as a transaction with the
 * balance before and after. Balances are then moved by the recorded DELTA —
 * nothing overwrites an on-hand figure directly.
 *
 *   Add Inventory → recordTransaction() → balance moves by qty
 *                                       → screens re-read → ledger shows it
 *
 * This is the same mechanism the QR physical-count workflow uses, so counts and
 * receipts land in one history rather than two.
 */

export type TransactionType = "RECEIPT" | "COUNT_ADJUSTMENT" | "ISSUE"

export type InventoryTransaction = {
  txnId: string
  type: TransactionType
  locationId: string
  materialId: string
  /** Signed movement in the material's UOM. */
  quantity: number
  uom: string
  balanceBefore: number
  balanceAfter: number
  reference: string
  actor: string
  at: string
  /** Carried from the balance the transaction moved. */
  provenance: "DEMO" | "LIVE"
}

const TYPE_LABEL: Record<TransactionType, string> = {
  RECEIPT: "Receipt",
  COUNT_ADJUSTMENT: "Count adjustment",
  ISSUE: "Issue",
}

export function transactionLabel(type: TransactionType): string {
  return TYPE_LABEL[type]
}

let ledger: InventoryTransaction[] = []
const listeners = new Set<(txns: InventoryTransaction[]) => void>()

let counter = 0
function nextId(): string {
  counter += 1
  return `TXN-${Date.now().toString(36).toUpperCase()}-${counter.toString().padStart(3, "0")}`
}

/** Append a transaction. Callers apply the delta to the balance afterwards. */
export function recordTransaction(
  entry: Omit<InventoryTransaction, "txnId" | "at"> & { at?: string },
): InventoryTransaction {
  const txn: InventoryTransaction = {
    ...entry,
    txnId: nextId(),
    at: entry.at ?? new Date().toISOString(),
  }
  ledger = [txn, ...ledger]
  for (const l of listeners) l(ledger)
  return txn
}

export function transactions(locationId?: string): InventoryTransaction[] {
  return locationId ? ledger.filter((t) => t.locationId === locationId) : ledger
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

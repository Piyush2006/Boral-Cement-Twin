/**
 * Traceability — both directions, from any identifier in the chain.
 *
 *   Supplier → PO → Gate Entry / GRN → Incoming → Quality → Lot / Batch (if tracked)
 *     → Inventory → Issue → Consumption → Production / Maintenance
 *
 * The chain is assembled only from links that exist in the records. A link
 * never recorded is shown as NOT LINKED; something the record does not carry
 * (a batch that was not entered) is NOT RECORDED. Nothing is inferred into a
 * link.
 *
 * Stockpiles blend deliveries. An issue is linked to a receipt only when one
 * was recorded; otherwise receipts into the same inventory record before the
 * draw are listed as POSSIBLE origins, and labelled as such.
 */

import type { IncomingRecord } from "@/lib/incoming/types"
import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import type { InventoryTransaction } from "@/lib/inventory/ledger"
import { lot } from "@/lib/inventory/lots"
import type { InventoryRecord } from "@/lib/inventory/model"
import { recordStatus } from "@/lib/inventory/status"
import { consumingArea } from "./catalog"
import { inventoryTransactionId, returnedQty, type IssueRecord } from "./types"

export type LinkState = "linked" | "pending" | "not-linked" | "not-recorded" | "not-applicable"

export type TraceStep = {
  key: string
  label: string
  value: string
  detail?: string
  at?: string
  state: LinkState
  /** An ID the user can follow to trace from that point. */
  followId?: string
}

export type TraceContext = {
  issues: IssueRecord[]
  incoming: IncomingRecord[]
  ledger: InventoryTransaction[]
  inventory: InventoryRecord[]
}

const qty = (n: number, uom = "MT") => `${Math.round(n).toLocaleString()} ${uom}`
const expires = (iso?: string) =>
  iso ? ` · expires ${new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}` : ""

/** Receipts into an inventory record up to a moment — candidates, never a link. */
export function receiptsInto(inventoryId: string, before: string, incoming: IncomingRecord[]): IncomingRecord[] {
  const cutoff = new Date(before).getTime()
  return incoming
    .filter((r) => r.receipt && r.receipt.inventoryId === inventoryId && new Date(r.receipt.at).getTime() <= cutoff)
    .sort((a, b) => new Date(b.receipt!.at).getTime() - new Date(a.receipt!.at).getTime())
}

/** Consumption back to origin, in the order of the material journey. */
export function traceBack(issue: IssueRecord, ctx: TraceContext): TraceStep[] {
  const material = materialEntry(issue.materialId)
  const record = ctx.inventory.find((r) => r.inventoryId === issue.sourceInventoryId)
  const receipt = issue.origin ? ctx.incoming.find((r) => r.incomingId === issue.origin!.incomingId) : undefined
  const everReceived = ctx.incoming.some((r) => r.receipt?.inventoryId === issue.sourceInventoryId)
  const candidates = issue.origin ? [] : receiptsInto(issue.sourceInventoryId, issue.createdAt, ctx.incoming).slice(0, 3)

  const steps: TraceStep[] = []

  if (issue.origin) {
    steps.push({ key: "supplier", label: "Supplier", value: receipt?.supplier ?? "Not recorded", state: receipt?.supplier ? "linked" : "not-recorded" })
    steps.push({ key: "po", label: "Purchase Order", value: issue.origin.poNumber, detail: receipt?.supplier, state: "linked", followId: issue.origin.poNumber })
    steps.push({
      key: "gate",
      label: "Gate Entry / GRN",
      value: [receipt?.gateEntryNo, receipt?.grnNo].filter(Boolean).join(" · ") || "Not recorded",
      state: receipt?.gateEntryNo || receipt?.grnNo ? "linked" : "not-recorded",
      followId: receipt?.grnNo ?? receipt?.gateEntryNo,
    })
    steps.push({
      key: "quality",
      label: "Quality",
      value: receipt?.quality ? (receipt.quality.tested ? `Tested — ${receipt.quality.result}` : "Accepted — no sample required") : "Not recorded",
      at: receipt?.quality?.at,
      state: receipt?.quality ? "linked" : "not-recorded",
    })
    steps.push({
      key: "incoming",
      label: "Incoming",
      value: issue.origin.incomingId,
      detail: receipt?.receipt
        ? `${qty(receipt.receipt.receivedMt, issue.uom)} received · ${receipt.receipt.transactionId}${expires(receipt.receipt.expiryDate)}`
        : undefined,
      at: receipt?.receipt?.at,
      state: "linked",
      followId: issue.origin.incomingId,
    })
  } else if (!everReceived) {
    steps.push({
      key: "po",
      label: "Purchase Order",
      value: "No PO",
      detail: "This stock is not received through Incoming Materials.",
      state: "not-applicable",
    })
  } else {
    steps.push({
      key: "po",
      label: "Purchase Order",
      value: "Not linked",
      detail: candidates.length ? `Possible: ${candidates.map((c) => c.poNumber).join(", ")}` : undefined,
      state: "not-linked",
    })
    steps.push({
      key: "incoming",
      label: "Incoming",
      value: "Not linked",
      detail: candidates.length ? `Possible origins (not lot-tracked): ${candidates.map((c) => c.incomingId).join(", ")}` : undefined,
      state: "not-linked",
    })
  }

  steps.push({
    key: "inventory",
    label: "Inventory",
    value: issue.sourceInventoryId,
    detail: `${material?.name ?? issue.materialId} · ${locationEntry(issue.sourceLocationId)?.name ?? issue.sourceLocationId}${expires(record?.expiryDate)}`,
    state: "linked",
    followId: issue.sourceInventoryId,
  })
  const lotRef = issue.lotId ?? issue.batch ?? record?.batch
  steps.push({
    key: "batch",
    label: "Lot / Batch",
    value: lotRef ?? (material?.lotTracking ? "Not recorded" : "Not lot-tracked"),
    state: lotRef ? "linked" : material?.lotTracking ? "not-recorded" : "not-applicable",
    followId: issue.lotId,
  })
  steps.push({
    key: "issue",
    label: "Issue",
    value: issue.issueId,
    detail: issue.issue
      ? `${qty(issue.issue.issuedQty, issue.uom)} issued to ${consumingArea(issue.consumingAreaId)?.name}`
      : `${qty(issue.requestedQty, issue.uom)} requested — not yet issued`,
    at: issue.issue?.at ?? issue.createdAt,
    state: issue.issue ? "linked" : "pending",
    followId: issue.issueId,
  })
  const ref = issue.consumption?.productionRef || issue.productionRef
  if (ref) {
    steps.push({ key: "production", label: "Production / Process Reference", value: ref, state: "linked", followId: ref })
  }
  const returned = returnedQty(issue)
  steps.push({
    key: "consumption",
    label: "Consumption",
    value: issue.consumption?.consumptionId ?? "Not yet recorded",
    detail: issue.consumption
      ? returned > 0
        ? `Gross outward ${qty(issue.consumption.consumedQty, issue.uom)} − returned ${qty(returned, issue.uom)} = net ${qty(issue.consumption.consumedQty - returned, issue.uom)}`
        : `${qty(issue.consumption.consumedQty, issue.uom)} consumed`
      : undefined,
    at: issue.consumption?.at,
    state: issue.consumption ? "linked" : "pending",
    followId: issue.consumption?.consumptionId,
  })

  const txnId = inventoryTransactionId(issue)
  const txn = txnId ? ctx.ledger.find((t) => t.txnId === txnId) : undefined
  steps.push({
    key: "transaction",
    label: "Inventory Transaction",
    value: txnId ?? "Not yet posted",
    detail: txn
      ? `${txn.type} · ${txn.quantity > 0 ? "+" : ""}${qty(txn.quantity, txn.uom)} · ${qty(txn.balanceBefore, txn.uom)} → ${qty(txn.balanceAfter, txn.uom)}`
      : issue.postingPoint === "CONSUMPTION"
        ? "Inventory posts when consumption is recorded"
        : "Inventory posts when material is issued",
    at: txn?.at,
    state: txnId ? "linked" : "pending",
    followId: txnId,
  })
  if (record) {
    steps.push({
      key: "balance",
      label: "Inventory Balance",
      value: `${qty(record.quantity, record.uom)} · ${recordStatus(record)}`,
      detail: `Current balance of ${record.inventoryId}`,
      state: "linked",
    })
  }
  return steps
}

export type ForwardReceipt = {
  incoming: IncomingRecord
  /** Issues that recorded this receipt as their origin. */
  linked: IssueRecord[]
  /** Later draws from the same inventory record with no recorded origin. */
  unlinkedSameRecord: IssueRecord[]
}

export type InventoryTrace = {
  record: InventoryRecord
  /** Where the stock came from. */
  receipts: IncomingRecord[]
  adjustmentsIn: InventoryTransaction[]
  /** Where the stock went. */
  issues: IssueRecord[]
  adjustmentsOut: InventoryTransaction[]
}

export type TraceResult =
  | { kind: "backward"; issue: IssueRecord; steps: TraceStep[] }
  | { kind: "forward"; query: string; receipts: ForwardReceipt[]; pending: IncomingRecord[] }
  | { kind: "inventory"; query: string; trace: InventoryTrace }
  | { kind: "matches"; query: string; issues: IssueRecord[] }
  | { kind: "none"; query: string; message: string }

export function traceInventory(record: InventoryRecord, ctx: TraceContext): InventoryTrace {
  const own = ctx.ledger.filter((t) => t.inventoryId === record.inventoryId)
  return {
    record,
    receipts: ctx.incoming
      .filter((r) => r.receipt?.inventoryId === record.inventoryId)
      .sort((a, b) => new Date(b.receipt!.at).getTime() - new Date(a.receipt!.at).getTime()),
    adjustmentsIn: own.filter((t) => t.type === "ADJUSTMENT" && t.quantity > 0),
    issues: ctx.issues.filter((i) => i.sourceInventoryId === record.inventoryId),
    // Outward movements not explained by an issue: negative adjustments and
    // losses posted directly against the balance.
    adjustmentsOut: own.filter(
      (t) => !t.links.issueId && ((t.type === "ADJUSTMENT" && t.quantity < 0) || ["EXPIRY", "WASTE", "LOSS", "UNACCOUNTED"].includes(t.type)),
    ),
  }
}

/**
 * Resolve any identifier: ISS-, CON-, a production reference or an issue's
 * transaction trace back; PO- and IN- trace forward; an Inventory ID shows
 * both where its stock came from and where it went.
 */
export function resolveTrace(raw: string, ctx: TraceContext): TraceResult {
  const query = raw.trim().toUpperCase()
  if (!query) return { kind: "none", query, message: "Enter an ID to trace." }

  const record = ctx.inventory.find((r) => r.inventoryId.toUpperCase() === query)
  if (record) return { kind: "inventory", query, trace: traceInventory(record, ctx) }

  // A lot / batch reference resolves to the delivery it was recorded on, which then traces
  // forward to everywhere the lot was used.
  if (query.startsWith("LOT-")) {
    const found = lot(query)
    if (!found) return { kind: "none", query, message: `No lot / batch ${query}.` }
    if (found.incomingId) return resolveTrace(found.incomingId, ctx)
    return { kind: "none", query, message: `${query} has no delivery recorded against it.` }
  }

  // A transaction resolves to whatever explains it.
  const txn = ctx.ledger.find((t) => t.txnId.toUpperCase() === query)
  if (txn) {
    if (txn.links.issueId) return resolveTrace(txn.links.issueId, ctx)
    if (txn.links.lotId && !txn.links.incomingId) return resolveTrace(txn.links.lotId, ctx)
    if (txn.links.incomingId) return resolveTrace(txn.links.incomingId, ctx)
    const owner = ctx.inventory.find((r) => r.inventoryId === txn.inventoryId)
    if (owner) return { kind: "inventory", query, trace: traceInventory(owner, ctx) }
  }

  // A return traces back through the issue it came from.
  if (query.startsWith("RET-")) {
    const owner = ctx.issues.find((i) => i.returns?.some((x) => x.returnId === query))
    if (owner) return { kind: "backward", issue: owner, steps: traceBack(owner, ctx) }
  }

  if (query.startsWith("PO-") || query.startsWith("IN-") || query.startsWith("GE-") || query.startsWith("GRN-")) {
    const matches = ctx.incoming.filter((r) =>
      query.startsWith("PO-")
        ? r.poNumber === query
        : query.startsWith("GE-")
          ? r.gateEntryNo === query
          : query.startsWith("GRN-")
            ? r.grnNo === query
            : r.incomingId === query,
    )
    if (!matches.length) return { kind: "none", query, message: `No incoming record for ${query}.` }
    const receipts: ForwardReceipt[] = matches
      .filter((r) => r.receipt)
      .map((r) => {
        const receivedAt = new Date(r.receipt!.at).getTime()
        return {
          incoming: r,
          linked: ctx.issues.filter((i) => i.origin?.incomingId === r.incomingId),
          unlinkedSameRecord: ctx.issues.filter(
            (i) => !i.origin && i.sourceInventoryId === r.receipt!.inventoryId && new Date(i.createdAt).getTime() >= receivedAt,
          ),
        }
      })
    return { kind: "forward", query, receipts, pending: matches.filter((r) => !r.receipt) }
  }

  const direct = ctx.issues.find((i) => i.issueId === query || i.consumption?.consumptionId === query)
  if (direct) return { kind: "backward", issue: direct, steps: traceBack(direct, ctx) }

  const byRef = ctx.issues.filter(
    (i) => (i.productionRef && i.productionRef.toUpperCase() === query) || i.consumption?.productionRef?.toUpperCase() === query,
  )
  if (byRef.length === 1) return { kind: "backward", issue: byRef[0], steps: traceBack(byRef[0], ctx) }
  if (byRef.length > 1) return { kind: "matches", query, issues: byRef }

  return {
    kind: "none",
    query,
    message: `Nothing in the chain matches ${query}. Trace a PO, Gate Entry, GRN, Incoming ID, lot, Inventory ID, Issue ID, Consumption ID, return, transaction ID or production reference.`,
  }
}

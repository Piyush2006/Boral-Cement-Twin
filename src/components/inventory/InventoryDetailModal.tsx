"use client"

/**
 * Inventory record detail.
 *
 * The balance and its limits, the record's details, controlled stock
 * adjustments (in and out, each a ledger transaction), edit and archive, the
 * record's full transaction history, and traceability in both directions:
 * where the stock came from (receipts → PO) and where it went (issues →
 * consumption). Nothing here changes a quantity except through the ledger.
 */

import { useState } from "react"

import { useIssues } from "@/components/issues/issue-store"
import { Actions, Err, Field, INPUT, Modal, Readonly } from "@/components/shell/Modal"
import { usePiles } from "@/components/shell/pile-store"
import { gradeEntry, locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { transactionLabel, transactionReference, type InventoryTransaction } from "@/lib/inventory/ledger"
import type { InventoryRecord } from "@/lib/inventory/model"
import { recordLimits, recordStatus } from "@/lib/inventory/status"
import { DECREASE_TYPES, parseNonNegative, parsePositive, type DecreaseType } from "@/lib/inventory/rules"
import { consumingArea } from "@/lib/issues/catalog"
import { traceInventory } from "@/lib/issues/trace"
import { ISSUE_STATUS_LABEL, inventoryTransactionId } from "@/lib/issues/types"
import { toneText } from "@/lib/theme/tone"
import { StatusBadge } from "./StatusBadge"
import { ExpiryWriteOffModal, SetExpiryModal } from "./Expiry"
import { TYPE_TONE, stampFull } from "./TransactionsView"

type Dialog = "add" | "remove" | "edit" | "archive" | "expiry" | "writeoff" | null

const DECREASE_HINT: Record<DecreaseType, string> = {
  ADJUSTMENT: "An approved correction, e.g. after a physical count.",
  WASTE: "Spillage, contamination or damage — a known loss.",
  LOSS: "Material lost in handling or transit.",
  UNACCOUNTED: "A difference found with no identified cause.",
}

const fmt = (n: number) => Math.round(n).toLocaleString()

export function InventoryDetailModal({ record, onClose }: { record: InventoryRecord; onClose: () => void }) {
  const { ledger, canWriteInventory, reactivateInventory, setMode } = usePiles()
  const { traceContext, openTrace } = useIssues()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const material = materialEntry(record.materialId)
  const expired = Boolean(material?.expiryApplicable && record.expiryDate && new Date(record.expiryDate).getTime() < Date.now())
  const grade = gradeEntry(record.gradeId)
  const location = locationEntry(record.locationId)
  const limits = recordLimits(record)
  const status = recordStatus(record)
  const history = ledger.filter((t) => t.inventoryId === record.inventoryId)
  const trace = traceInventory(record, traceContext)

  const toTraceability = () => {
    onClose()
    openTrace(record.inventoryId)
    setMode("issues")
  }

  if (dialog === "add" || dialog === "remove") {
    return <AdjustStockModal record={record} direction={dialog === "add" ? "IN" : "OUT"} onClose={() => setDialog(null)} />
  }
  if (dialog === "edit") return <EditDetailsModal record={record} onClose={() => setDialog(null)} />
  if (dialog === "archive") return <ArchiveModal record={record} onClose={() => setDialog(null)} onArchived={onClose} />
  if (dialog === "expiry") return <SetExpiryModal record={record} onClose={() => setDialog(null)} />
  if (dialog === "writeoff") return <ExpiryWriteOffModal record={record} onClose={() => setDialog(null)} />

  return (
    <Modal title={record.inventoryId} subtitle={`${material?.name ?? record.materialId}${grade ? ` · ${grade.name}` : ""} · ${location?.name ?? record.locationId}`} onClose={onClose} width={760}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink">{material?.name ?? record.materialId}</span>
        <StatusBadge status={status} size="md" />
        {!record.active && (
          <span className="rounded-full bg-panel-2 px-2 py-[2px] text-[11px] font-semibold text-ink-2 ring-1 ring-line">Archived</span>
        )}
        <span className="ml-auto rounded bg-demo px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-demo-ink">Demo / Simulated</span>
      </div>

      {/* Balance and limits */}
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-panel-2 p-3.5 sm:grid-cols-5">
        <Big label="Quantity" value={`${fmt(record.quantity)} ${record.uom}`} strong />
        <Big label="Min Stock" value={`${fmt(limits.minStock)} ${record.uom}`} />
        <Big label="Target" value={`${fmt(limits.targetStock)} ${record.uom}`} />
        <Big label="Max Stock" value={`${fmt(limits.maxStock)} ${record.uom}`} />
        <Big label="Status" value={status} tone={status === "CRITICAL" ? "#ef4444" : "#22c55e"} />
      </div>
      <p className="-mt-3 mb-5 text-[11.5px] text-ink-3">
        {status === "CRITICAL"
          ? `CRITICAL — quantity is at or below the ${fmt(limits.minStock)} ${record.uom} minimum.`
          : `HEALTHY — quantity is above the ${fmt(limits.minStock)} ${record.uom} minimum.`}
        {record.quantity > limits.maxStock && ` Above the ${fmt(limits.maxStock)} ${record.uom} maximum.`} Limits are set on this record.
      </p>

      {canWriteInventory && (
        <div className="mb-5 flex flex-wrap gap-2">
          {record.active ? (
            <>
              <ActionButton onClick={() => setDialog("add")} primary>
                + Add Stock
              </ActionButton>
              <ActionButton onClick={() => setDialog("remove")}>− Remove Stock</ActionButton>
              <ActionButton onClick={() => setDialog("edit")}>Edit Details</ActionButton>
              {/* Expiry — only where the material says it applies. */}
              {material?.expiryApplicable && (
                <ActionButton onClick={() => setDialog("expiry")}>{record.expiryDate ? "Change Expiry Date" : "Set Expiry Date"}</ActionButton>
              )}
              {expired && record.quantity > 0 && <ActionButton onClick={() => setDialog("writeoff")}>Write Off Expired</ActionButton>}
              <ActionButton onClick={() => setDialog("archive")}>Archive</ActionButton>
            </>
          ) : (
            <ActionButton
              onClick={() => {
                const res = reactivateInventory(record.inventoryId)
                setNotice(res.ok ? null : res.error)
              }}
              primary
            >
              Reactivate
            </ActionButton>
          )}
        </div>
      )}
      {notice && <Err>{notice}</Err>}

      <Section title="Details">
        <Grid>
          <Item label="Material" value={material?.name ?? record.materialId} />
          <Item label="Material Code" value={material?.code ?? "—"} mono />
          <Item label="Grade" value={grade?.name ?? "—"} />
          <Item label="Category" value={material?.group ?? "—"} />
          <Item label="Location" value={location?.name ?? record.locationId} />
          <Item label="Location ID" value={record.locationId} mono />
          <Item label="UOM" value={record.uom} />
          <Item
            label="Lot / Batch"
            value={record.lotId ?? record.batch ?? (material?.lotTracking ? "Not recorded" : "Not lot-tracked")}
          />
          {material?.expiryApplicable && (
            <Item
              label="Expiry Date"
              value={
                record.expiryDate
                  ? `${stampFull(record.expiryDate).split(",")[0]} · ${
                      expired ? "EXPIRED" : `${Math.floor((new Date(record.expiryDate).getTime() - Date.now()) / 86_400_000)} days left`
                    }`
                  : "Not recorded — set it"
              }
            />
          )}
          <Item label="Created" value={`${stampFull(record.createdAt)} · ${record.createdBy}`} />
          <Item label="Last Updated" value={stampFull(record.updatedAt)} />
          {record.description && <Item label="Description" value={record.description} span />}
          {record.notes && <Item label="Notes" value={record.notes} span />}
        </Grid>
      </Section>

      <Section
        title="Traceability"
        action={
          <button onClick={toTraceability} className="text-[11.5px] font-medium text-accent hover:underline">
            Open in Traceability
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-panel-2 p-3 ring-1 ring-line">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Where did this stock come from?</div>
            {trace.receipts.length === 0 && trace.adjustmentsIn.length === 0 && (
              <p className="text-[12px] text-ink-3">No receipts or adjustments in.</p>
            )}
            <ul className="space-y-1 text-[12px]">
              {trace.receipts.map((r) => (
                <li key={r.incomingId} className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-mono text-ink">{r.poNumber}</span>
                  <span className="text-ink-3">→</span>
                  <span className="font-mono text-ink">{r.incomingId}</span>
                  <span className="text-ink-3">→</span>
                  <span className="font-mono text-ink">+{fmt(r.receipt!.receivedMt)} {record.uom}</span>
                  <span className="text-ink-3">· {r.receipt!.transactionId}</span>
                  {r.batch && <span className="text-ink-3">· Batch {r.batch}</span>}
                </li>
              ))}
              {trace.adjustmentsIn.map((t) => (
                <li key={t.txnId} className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-mono text-ink">{t.links.adjustmentId ?? t.txnId}</span>
                  <span className="text-ink-3">→</span>
                  <span className="font-mono text-ink">+{fmt(t.quantity)} {record.uom}</span>
                  <span className="text-ink-3">· {t.reason ?? transactionLabel(t.type)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-panel-2 p-3 ring-1 ring-line">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Where was this stock used?</div>
            {trace.issues.length === 0 && trace.adjustmentsOut.length === 0 && <p className="text-[12px] text-ink-3">No issues or adjustments out.</p>}
            <ul className="space-y-1 text-[12px]">
              {trace.issues.map((i) => (
                <li key={i.issueId} className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-mono text-ink">{i.issueId}</span>
                  {i.consumption ? (
                    <>
                      <span className="text-ink-3">→</span>
                      <span className="font-mono text-ink">{i.consumption.consumptionId}</span>
                      <span className="text-ink-3">→</span>
                      <span className="font-mono text-ink">−{fmt(i.consumption.consumedQty)} {record.uom}</span>
                      <span className="text-ink-3">· {inventoryTransactionId(i) ?? "—"}</span>
                    </>
                  ) : (
                    <span className="text-ink-3">
                      · {ISSUE_STATUS_LABEL[i.status]}
                      {i.issue ? ` ${fmt(i.issue.issuedQty)} ${record.uom}` : ` ${fmt(i.requestedQty)} ${record.uom} requested`} · {consumingArea(i.consumingAreaId)?.name}
                    </span>
                  )}
                </li>
              ))}
              {trace.adjustmentsOut.map((t) => (
                <li key={t.txnId} className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-mono text-ink">{t.links.adjustmentId ?? t.txnId}</span>
                  <span className="text-ink-3">→</span>
                  <span className="font-mono text-ink">{fmt(t.quantity)} {record.uom}</span>
                  <span className="text-ink-3">· {transactionLabel(t.type, t.quantity)}{t.reason ? ` — ${t.reason}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title={`Transaction History (${history.length})`}>
        {history.length === 0 ? (
          <p className="text-[12.5px] italic text-ink-3">No transactions recorded against this record yet.</p>
        ) : (
          <div className="twin-scroll max-h-[300px] overflow-auto rounded-lg ring-1 ring-line">
            <table className="w-full min-w-[820px] border-collapse text-[12px]">
              <thead className="sticky top-0 bg-panel-2">
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-3">
                  <th className="px-2.5 py-1.5">Transaction</th>
                  <th className="px-2.5 py-1.5">Date / Time</th>
                  <th className="px-2.5 py-1.5">Type</th>
                  <th className="px-2.5 py-1.5 text-right">Previous</th>
                  <th className="px-2.5 py-1.5 text-right">Movement</th>
                  <th className="px-2.5 py-1.5 text-right">New</th>
                  <th className="px-2.5 py-1.5">Reason / Reference</th>
                  <th className="px-2.5 py-1.5">User</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <HistoryRow key={t.txnId} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Audit Trail">
        <ul className="space-y-1">
          {[...record.audit].reverse().map((a, i) => (
            <li key={i} className="text-[12px]">
              <span className="text-ink-3">{stampFull(a.at)}</span> <span className="font-mono text-[11px] text-ink-3">{a.by}</span>
              <span className="ml-2 text-ink">{a.action}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-5 flex gap-2.5">
        <button onClick={onClose} className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line">
          Close
        </button>
      </div>
    </Modal>
  )
}

function HistoryRow({ t }: { t: InventoryTransaction }) {
  const tone = TYPE_TONE[t.type]
  return (
    <tr className="border-t border-line">
      <td className="px-2.5 py-1.5 font-mono text-[11px] text-ink">{t.txnId}</td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-ink-2">{stampFull(t.at)}</td>
      <td className="px-2.5 py-1.5">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold" style={{ color: toneText(tone) }}>
          <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
          {transactionLabel(t.type, t.quantity)}
        </span>
      </td>
      <td className="px-2.5 py-1.5 text-right font-mono text-ink-2">{fmt(t.balanceBefore)}</td>
      <td className="px-2.5 py-1.5 text-right font-mono font-semibold" style={{ color: toneText(t.quantity >= 0 ? "#22c55e" : "#f87171") }}>
        {t.quantity > 0 ? "+" : ""}
        {fmt(t.quantity)}
      </td>
      <td className="px-2.5 py-1.5 text-right font-mono text-ink">{fmt(t.balanceAfter)}</td>
      <td className="px-2.5 py-1.5 text-ink-2">
        {t.reason && <span className="block whitespace-nowrap text-ink">{t.reason}</span>}
        <span className="block whitespace-nowrap font-mono text-[10.5px] text-ink-3">{transactionReference(t)}</span>
      </td>
      <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px] text-ink-3">{t.actor}</td>
    </tr>
  )
}

/* ── Add / Remove Stock ──────────────────────────────────────────────────── */

function AdjustStockModal({ record, direction, onClose }: { record: InventoryRecord; direction: "IN" | "OUT"; onClose: () => void }) {
  const { adjustInventory } = usePiles()
  const [outType, setOutType] = useState<DecreaseType>("ADJUSTMENT")
  const [qty, setQty] = useState("")
  const [reason, setReason] = useState("")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<InventoryTransaction | null>(null)

  const quantity = parsePositive(qty)
  const after = quantity !== null ? record.quantity + (direction === "IN" ? quantity : -quantity) : null
  const title = direction === "IN" ? "Add Stock" : "Remove Stock"

  const submit = () => {
    setError(null)
    const res = adjustInventory(record.inventoryId, direction, quantity, reason, reference, notes, outType)
    if (!res.ok) return setError(res.error)
    setDone(res.value)
  }

  if (done) {
    const newStatus = recordStatus({ quantity: done.balanceAfter, minStock: record.minStock })
    return (
      <Modal title={`${title} — Recorded`} subtitle={record.inventoryId} onClose={onClose} width={480}>
        <div className="rounded-lg bg-panel-2 p-3.5 ring-1 ring-line">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px] sm:grid-cols-3">
            <Item label="Transaction ID" value={done.txnId} mono />
            <Item label="Type" value={transactionLabel(done.type, done.quantity)} />
            <Item label="Adjustment ID" value={done.links.adjustmentId ?? "—"} mono />
            <Item label="Before" value={`${fmt(done.balanceBefore)} ${done.uom}`} />
            <Item label={direction === "IN" ? "Added" : "Removed"} value={`${done.quantity > 0 ? "+" : ""}${fmt(done.quantity)} ${done.uom}`} />
            <Item label="After" value={`${fmt(done.balanceAfter)} ${done.uom}`} strong />
            <Item label="Reason" value={done.reason ?? "—"} span />
            <Item label="User" value={done.actor} mono />
            <Item label="Date / Time" value={stampFull(done.at)} />
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5 text-[12px] text-ink-2">
            Stock health <StatusBadge status={newStatus} />
          </div>
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110">
          Done
        </button>
      </Modal>
    )
  }

  return (
    <Modal title={title} subtitle={record.inventoryId} onClose={onClose} width={480}>
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-panel-2 p-3 text-[12px] ring-1 ring-line">
        <Big label="Current Quantity" value={`${fmt(record.quantity)} ${record.uom}`} />
        <Big label={direction === "IN" ? "Quantity to Add" : "Quantity to Remove"} value={quantity !== null ? `${direction === "IN" ? "+" : "−"}${fmt(quantity)} ${record.uom}` : "—"} />
        <Big label="New Quantity" value={after !== null ? `${fmt(after)} ${record.uom}` : "—"} strong tone={after !== null && after < 0 ? "#ef4444" : undefined} />
      </div>
      {after !== null && after < 0 && <Err>Removing {fmt(quantity!)} {record.uom} would take the balance below zero. Inventory cannot go negative.</Err>}
      {direction === "OUT" && (
        <Field label="Transaction Type" required hint={DECREASE_HINT[outType]}>
          <select value={outType} onChange={(e) => setOutType(e.target.value as DecreaseType)} className={INPUT}>
            {DECREASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "ADJUSTMENT" ? "Adjustment (−)" : transactionLabel(t)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={`Quantity (${record.uom})`} required>
        <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
      </Field>
      <Field label="Reason" required>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Manual stock correction" className={INPUT} />
      </Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Reference">
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className={INPUT} />
        </Field>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={INPUT} />
        </Field>
      </div>
      <p className="text-[11px] text-ink-3">
        Recorded as {direction === "IN" ? "an Adjustment (+)" : outType === "ADJUSTMENT" ? "an Adjustment (−)" : `a ${transactionLabel(outType)}`} transaction with
        the user, date/time, previous and new quantity. Only users with inventory write access can post it; the quantity is never overwritten
        directly.
      </p>
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel={title} disabled={quantity === null || !reason.trim() || (after !== null && after < 0)} />
    </Modal>
  )
}

/* ── Edit Details ────────────────────────────────────────────────────────── */

function EditDetailsModal({ record, onClose }: { record: InventoryRecord; onClose: () => void }) {
  const { updateInventoryDetails } = usePiles()
  const [minStock, setMinStock] = useState(String(record.minStock))
  const [targetStock, setTargetStock] = useState(String(record.targetStock))
  const [maxStock, setMaxStock] = useState(String(record.maxStock))
  const [description, setDescription] = useState(record.description ?? "")
  const [notes, setNotes] = useState(record.notes ?? "")
  const [error, setError] = useState<string | null>(null)

  const grade = gradeEntry(record.gradeId)

  const submit = () => {
    setError(null)
    const res = updateInventoryDetails(record.inventoryId, {
      minStock: parseNonNegative(minStock),
      targetStock: parseNonNegative(targetStock),
      maxStock: parseNonNegative(maxStock),
      description,
      notes,
    })
    if (!res.ok) return setError(res.error)
    onClose()
  }

  return (
    <Modal title="Edit Inventory" subtitle={record.inventoryId} onClose={onClose} width={500}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Material + Grade">
          <Readonly value={`${materialEntry(record.materialId)?.name ?? record.materialId}${grade ? ` — ${grade.name}` : ""}`} />
        </Field>
        <Field label="Location">
          <Readonly value={locationEntry(record.locationId)?.name} />
        </Field>
        <Field label="Quantity">
          <Readonly value={`${fmt(record.quantity)} ${record.uom}`} mono />
        </Field>
        <Field label="Lot / Batch">
          <Readonly value={record.lotId ?? record.batch ?? "—"} mono />
        </Field>
      </div>
      <p className="-mt-1 mb-3 text-[11px] text-ink-3">
        Material + Grade and Location come from Master and are not edited here. Quantity changes only through transactions.
      </p>
      <div className="grid grid-cols-3 gap-x-3">
        <Field label={`Min Stock (${record.uom})`} required>
          <input inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Target" required>
          <input inputMode="decimal" value={targetStock} onChange={(e) => setTargetStock(e.target.value)} className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Max Stock" required>
          <input inputMode="decimal" value={maxStock} onChange={(e) => setMaxStock(e.target.value)} className={`${INPUT} font-mono`} />
        </Field>
      </div>
      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className={INPUT} />
      </Field>
      <Field label="Notes">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={INPUT} />
      </Field>
      <p className="text-[11px] text-ink-3">Every change is written to the audit trail with the old and new figures.</p>
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Save Changes" />
    </Modal>
  )
}

/* ── Archive ─────────────────────────────────────────────────────────────── */

function ArchiveModal({ record, onClose, onArchived }: { record: InventoryRecord; onClose: () => void; onArchived: () => void }) {
  const { archiveInventory } = usePiles()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const hasStock = record.quantity !== 0

  const submit = () => {
    setError(null)
    const res = archiveInventory(record.inventoryId, reason)
    if (!res.ok) return setError(res.error)
    onArchived()
  }

  return (
    <Modal title="Archive Inventory Record" subtitle={record.inventoryId} onClose={onClose} width={480}>
      <p className="mb-3 text-[12.5px] text-ink-2">
        Archiving removes <span className="font-mono text-ink">{record.inventoryId}</span> from active use. Its transaction history and audit trail are kept, and the
        Inventory ID is never reused. Records are not deleted.
      </p>
      {hasStock && (
        <Err>
          This record still holds {fmt(record.quantity)} {record.uom}. Remove the stock with a recorded adjustment first, so the change stays traceable.
        </Err>
      )}
      <Field label="Reason" required>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Created in error — duplicate of RM-LS-001" className={INPUT} />
      </Field>
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Archive" disabled={hasStock || !reason.trim()} />
    </Modal>
  )
}

/* ── layout bits ─────────────────────────────────────────────────────────── */

function ActionButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3.5 py-2 text-[12.5px] font-semibold ${
        primary ? "bg-accent text-accent-ink hover:brightness-110" : "bg-panel text-ink ring-1 ring-line-2 hover:bg-panel-2"
      }`}
    >
      {children}
    </button>
  )
}

function Big({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`font-mono text-[14px] ${strong ? "font-bold" : ""} text-ink`} style={tone ? { color: toneText(tone) } : undefined}>
        {value}
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">{children}</div>
}

function Item({ label, value, mono, strong, span }: { label: string; value: string; mono?: boolean; strong?: boolean; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 sm:col-span-3" : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`text-[13px] ${mono ? "font-mono" : ""} ${strong ? "font-bold" : ""} text-ink`}>{value}</div>
    </div>
  )
}

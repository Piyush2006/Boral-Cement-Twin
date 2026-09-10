"use client"

/**
 * Stage modals for the Incoming Materials workflow.
 *
 * Identification (QR or PO number), weighing, quality and receipt. Each records
 * against the SAME incoming record; none of them creates a second document.
 */

import { useMemo, useState } from "react"

import {
  PO_QR_PREFIX,
  PURCHASE_ORDERS,
  parsePoQr,
  resolvePurchaseOrder,
  qualitySpecs,
} from "@/lib/incoming/catalog"
import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { QUALITY_LABEL, type IncomingRecord, type QualityResult } from "@/lib/incoming/types"
import { useIncoming } from "./incoming-store"

/* ── shared chrome ───────────────────────────────────────────────────────── */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = 520,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  return (
    <div className="fixed inset-0 z-[3200] grid place-items-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="twin-scroll max-h-[88vh] w-full overflow-y-auto rounded-xl bg-panel ring-1 ring-line-2"
        style={{ maxWidth: width }}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-panel px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{title}</h2>
            {subtitle && <div className="font-mono text-[11.5px] text-ink-3">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[20px] leading-none text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}

const INPUT =
  "w-full rounded-lg bg-panel-2 px-3 py-2.5 text-[13px] text-ink outline-none ring-1 ring-line focus:ring-accent disabled:opacity-50"

export function Readonly({ value }: { value?: string }) {
  return (
    <div className="rounded-lg bg-panel-2/60 px-3 py-2.5 text-[13px] text-ink-2 ring-1 ring-line">
      {value ?? <span className="text-ink-3">—</span>}
    </div>
  )
}

function Err({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 rounded-md border border-crit/40 bg-crit/10 p-2 text-[12px] text-crit">
      {children}
    </p>
  )
}

function Actions({
  onCancel,
  onSubmit,
  submitLabel,
  disabled,
}: {
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="mt-5 flex gap-2.5">
      <button
        onClick={onCancel}
        className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="flex-1 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  )
}

/* ── 1. Identification ───────────────────────────────────────────────────── */

/**
 * QR scanning and manual entry are two ways of identifying the same record and
 * lead to identical PO details — not two workflows.
 */
export function NewIncomingModal({ onClose }: { onClose: () => void }) {
  const { register, setOpenId } = useIncoming()
  const [entry, setEntry] = useState("")
  const [found, setFound] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const po = useMemo(() => (found ? resolvePurchaseOrder(found) : undefined), [found])
  const material = po ? materialEntry(po.materialId) : undefined

  const identify = (raw: string) => {
    setError(null)
    const poNumber = parsePoQr(raw)
    if (!poNumber) return setError("Enter a PO number in the form PO-10245.")
    // Any well-formed PO is accepted: there is no PO system to validate against.
    setFound(poNumber)
  }

  const confirm = () => {
    if (!po) return
    const result = register(po.poNumber)
    if (!result.ok) return setError(result.error)
    setOpenId(result.value.incomingId)
    onClose()
  }

  return (
    <Modal title="New Incoming Material" onClose={onClose}>
      {!po ? (
        <>
          <Field label="Scan QR / Barcode">
            <div className="rounded-lg border border-dashed border-line-2 bg-panel-2/50 p-4 text-center">
              <p className="mb-2.5 text-[12px] text-ink-3">
                Scan the PO tag on the delivery docket.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {PURCHASE_ORDERS.slice(0, 6).map((p) => (
                  <button
                    key={p.poNumber}
                    onClick={() => identify(`${PO_QR_PREFIX}${p.poNumber}`)}
                    className="rounded border border-line-2 px-2 py-1 font-mono text-[10.5px] text-ink-3 hover:text-ink"
                  >
                    {p.poNumber}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] text-ink-3">
                No camera here — these stand in for scanning a tag.
              </p>
            </div>
          </Field>

          <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink-3">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <Field label="Enter PO Number">
            <div className="flex gap-2">
              <input
                autoFocus
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && identify(entry)}
                placeholder="PO-10245"
                className={`${INPUT} font-mono`}
              />
              <button
                onClick={() => identify(entry)}
                className="rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-ink"
              >
                Search
              </button>
            </div>
          </Field>
          {error && <Err>{error}</Err>}
        </>
      ) : (
        <>
          <div className="mb-4 rounded-lg bg-panel-2 p-3.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-bold text-ink">{po.poNumber}</span>
              {po.adHoc && (
                <span className="rounded bg-warn/20 px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-warn">
                  Not in catalogue
                </span>
              )}
            </div>
            {po.adHoc && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                This PO is not in the purchase-order list. Details below are provisional — confirm
                them against the delivery docket before registering.
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
              <Detail label="Material" value={material?.name ?? po.materialId} />
              <Detail label="Material Group" value={material?.group ?? "—"} />
              <Detail label="Material Description" value={material?.description ?? "—"} span />
              <Detail label="Supplier" value={po.supplier} />
              <Detail label="Expected Quantity" value={`${po.expectedMt.toLocaleString()} MT`} />
              <Detail
                label="Expected Arrival"
                value={new Date(po.expectedArrival).toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              />
              <Detail
                label="Destination"
                value={locationEntry(po.destinationLocationId)?.name ?? po.destinationLocationId}
              />
            </div>
          </div>
          {error && <Err>{error}</Err>}
          <Actions
            onCancel={() => {
              setFound(null)
              setError(null)
            }}
            onSubmit={confirm}
            submitLabel="Confirm & Register"
          />
        </>
      )}
    </Modal>
  )
}

function Detail({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  )
}

/* ── 2. Weighing ─────────────────────────────────────────────────────────── */

export function WeighingModal({
  record,
  onClose,
}: {
  record: IncomingRecord
  onClose: () => void
}) {
  const { recordWeighing } = useIncoming()
  const [gross, setGross] = useState("")
  const [tare, setTare] = useState("")
  const [ref, setRef] = useState("")
  const [error, setError] = useState<string | null>(null)

  const grossN = Number(gross)
  const tareN = Number(tare)
  // Net is always derived, never typed.
  const net = Number.isFinite(grossN) && Number.isFinite(tareN) ? grossN - tareN : null

  const submit = () => {
    setError(null)
    const result = recordWeighing(record.incomingId, {
      grossMt: grossN,
      tareMt: tareN,
      weighbridgeRef: ref,
    })
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <Modal title="Weighing" subtitle={`${record.poNumber} · ${record.incomingId}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Material">
          <Readonly value={materialEntry(record.materialId)?.name} />
        </Field>
        <Field label="Expected Quantity">
          <Readonly value={`${record.expectedMt.toLocaleString()} MT`} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Gross Weight (MT)">
          <input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Tare Weight (MT)">
          <input inputMode="decimal" value={tare} onChange={(e) => setTare(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Net Weight (MT)">
          <Readonly value={net !== null && net > 0 ? net.toLocaleString() : undefined} />
        </Field>
      </div>

      <Field label="Weighbridge Reference">
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="WB-00042" className={`${INPUT} font-mono`} />
      </Field>

      <p className="text-[10.5px] text-ink-3">
        No weighbridge integration exists in this application, so values are entered manually.
      </p>

      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Save Weight" />
    </Modal>
  )
}

/* ── 3. Quality ──────────────────────────────────────────────────────────── */

export function QualityModal({
  record,
  onClose,
}: {
  record: IncomingRecord
  onClose: () => void
}) {
  const { recordQuality } = useIncoming()
  const specs = useMemo(() => qualitySpecs(record.materialId), [record.materialId])
  const [values, setValues] = useState<string[]>(() => specs.map(() => ""))
  const [result, setResult] = useState<QualityResult>("ACCEPTED")
  const [comments, setComments] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    const outcome = recordQuality(record.incomingId, {
      readings: specs.map((s, i) => ({
        parameter: s.parameter,
        value: values[i],
        unit: s.unit,
        spec: s.spec,
      })),
      result,
      comments: comments.trim(),
    })
    if (!outcome.ok) return setError(outcome.error)
    onClose()
  }

  return (
    <Modal
      title="Quality Check"
      subtitle={`${record.poNumber} · ${record.incomingId}`}
      onClose={onClose}
    >
      <Field label="Material">
        <Readonly value={materialEntry(record.materialId)?.name} />
      </Field>

      {/* Parameters come from the material's configuration, not a fixed list. */}
      <div className="mb-3">
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
          Test Parameters
        </div>
        <div className="space-y-1.5">
          {specs.map((s, i) => (
            <div key={s.parameter} className="flex items-center gap-2.5">
              <span className="w-[150px] shrink-0 text-[12.5px] text-ink">
                {s.parameter}
                {s.unit && <span className="text-ink-3"> ({s.unit})</span>}
              </span>
              <input
                value={values[i]}
                onChange={(e) =>
                  setValues((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                placeholder="Result"
                className={`${INPUT} font-mono`}
              />
              <span className="w-[90px] shrink-0 text-right text-[11px] text-ink-3">
                {s.spec ?? ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Field label="Quality Result">
        <select
          value={result}
          onChange={(e) => setResult(e.target.value as QualityResult)}
          className={INPUT}
        >
          {(Object.keys(QUALITY_LABEL) as QualityResult[]).map((r) => (
            <option key={r} value={r}>
              {QUALITY_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Comments">
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          placeholder="Optional"
          className={`${INPUT} resize-none`}
        />
      </Field>

      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Submit Quality" />
    </Modal>
  )
}

/* ── 4. Receipt ──────────────────────────────────────────────────────────── */

export function ReceiptModal({
  record,
  onClose,
}: {
  record: IncomingRecord
  onClose: () => void
}) {
  const { confirmReceipt, canWriteInventory } = useIncoming()
  const weighedNet = record.weighing?.netMt ?? null
  const [qty, setQty] = useState(weighedNet ? String(weighedNet) : "")
  const [destination, setDestination] = useState(record.destinationLocationId)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const qtyN = Number(qty)
  const variance = Number.isFinite(qtyN) ? qtyN - record.expectedMt : null

  const submit = () => {
    setError(null)
    const outcome = confirmReceipt(record.incomingId, {
      receivedMt: qtyN,
      destinationLocationId: destination,
    })
    // A failed posting must leave the record where it was, with no inventory move.
    if (!outcome.ok) return setError(outcome.error)
    setDone(outcome.value.transactionId)
  }

  return (
    <Modal title="Receipt" subtitle={`${record.poNumber} · ${record.incomingId}`} onClose={onClose}>
      {done ? (
        <>
          <div className="rounded-lg bg-ok/10 p-3.5 ring-1 ring-ok/40">
            <div className="text-[13.5px] font-semibold text-ok">Receipt confirmed</div>
            <div className="mt-1 text-[12.5px] text-ink-2">
              Posted to inventory as transaction{" "}
              <span className="font-mono text-ink">{done}</span>. The Inventory module now shows the
              updated balance.
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink"
          >
            Done
          </button>
        </>
      ) : (
        <>
          {!canWriteInventory && (
            <p className="mb-4 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-[12px] text-ink-2">
              You do not have permission to post inventory receipts.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="PO Quantity">
              <Readonly value={`${record.expectedMt.toLocaleString()} MT`} />
            </Field>
            <Field label="Actual Weighed Quantity">
              <Readonly value={weighedNet ? `${weighedNet.toLocaleString()} MT` : undefined} />
            </Field>
          </div>

          <Field label="Received Quantity (MT)">
            <input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              disabled={!canWriteInventory}
              className={`${INPUT} font-mono text-[15px]`}
            />
          </Field>

          {variance !== null && qty !== "" && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-panel-2 px-3 py-2.5">
              <span className="text-[12px] text-ink-3">Variance against PO</span>
              <span
                className="font-mono text-[14px] font-bold"
                style={{ color: variance === 0 ? "#22c55e" : variance < 0 ? "#f87171" : "#eab308" }}
              >
                {variance > 0 ? "+" : ""}
                {variance.toLocaleString()} MT
              </span>
            </div>
          )}

          <Field label="Destination">
            <Readonly value={locationEntry(destination)?.name ?? destination} />
          </Field>

          <p className="text-[10.5px] leading-relaxed text-ink-3">
            Confirming posts the received quantity through the existing inventory transaction
            mechanism. Variance is informational — no variance rules exist in this application.
          </p>

          {error && <Err>{error}</Err>}
          <Actions
            onCancel={onClose}
            onSubmit={submit}
            submitLabel="Confirm Receipt"
            disabled={!canWriteInventory}
          />
        </>
      )}
    </Modal>
  )
}

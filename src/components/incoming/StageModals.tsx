"use client"

/**
 * Incoming Materials modals: identification (QR scan or PO entry), weighing,
 * quality and receipt. Each records against the SAME incoming record.
 *
 * Required fields carry *; optional fields do not. Anything the PO already
 * knows is shown, not asked for.
 */

import { useMemo, useState } from "react"

import { usePiles } from "@/components/shell/pile-store"
import {
  PURCHASE_ORDERS,
  formatGateEntry,
  formatGrn,
  nextDocNumber,
  parsePoQr,
  poQrPayload,
  qualityParameters,
  resolvePurchaseOrder,
} from "@/lib/incoming/catalog"
import { isCounted, type IncomingRecord, type QualityResult } from "@/lib/incoming/types"
import { gradeEntry, locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { seedGradeAt } from "@/lib/inventory/seed-records"
import { readingPasses, samplingLabel } from "@/lib/masters/types"
import { suggestLotId } from "@/lib/inventory/lots"
import type { InventoryRecord } from "@/lib/inventory/model"
import { parseNonNegative, parsePositive } from "@/lib/inventory/rules"
import { toneText } from "@/lib/theme/tone"
import { useIncoming } from "./incoming-store"
import { PoQrCode, QrScanner } from "./QrScanner"

/* Shared modal chrome — re-exported so existing imports keep working. */
export { Actions, Err, Field, INPUT, Modal, Readonly } from "@/components/shell/Modal"
import { Actions, Err, Field, INPUT, Modal, Readonly } from "@/components/shell/Modal"

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })

/** Active inventory records that can receive a material, as select options. */
export function useReceivingOptions(materialId: string | undefined, gradeId?: string): InventoryRecord[] {
  const { inventory } = usePiles()
  return useMemo(
    () => (materialId ? inventory.filter((r) => r.active && r.materialId === materialId && (!gradeId || r.gradeId === gradeId)) : []),
    [inventory, materialId, gradeId],
  )
}

export function inventoryOptionLabel(r: InventoryRecord): string {
  const expiry = r.expiryDate
    ? ` · ${new Date(r.expiryDate).getTime() < Date.now() ? "EXPIRED" : "expires"} ${new Date(r.expiryDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : ""
  return `${locationEntry(r.locationId)?.name ?? r.locationId} · ${r.inventoryId}${r.batch ? ` · Batch ${r.batch}` : ""}${expiry}`
}

/* ── 1. Identification: Scan QR or enter PO ──────────────────────────────── */

export function IdentifyModal({
  initialMethod,
  onClose,
  onRegistered,
}: {
  initialMethod: "QR" | "MANUAL"
  onClose: () => void
  /** The delivery is on the worklist; the modal closes and the list shows it. */
  onRegistered?: (record: IncomingRecord) => void
}) {
  const { register, setOpenId, records } = useIncoming()
  const [method, setMethod] = useState<"QR" | "MANUAL">(initialMethod)
  const [entry, setEntry] = useState("")
  const [found, setFound] = useState<{ poNumber: string; via: "QR" | "MANUAL" } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTags, setShowTags] = useState(false)

  const po = useMemo(() => (found ? resolvePurchaseOrder(found.poNumber) : undefined), [found])
  const material = po ? materialEntry(po.materialId) : undefined
  const options = useReceivingOptions(po?.materialId, po?.gradeId)

  const [receiving, setReceiving] = useState("")
  // Gate Entry and GRN are proposed from the next free numbers; the operator
  // keeps them, types the numbers on the documents, or clears them.
  const [gateEntryNo, setGateEntryNo] = useState(() => formatGateEntry(nextDocNumber(records.map((r) => r.gateEntryNo), "GE", 499)))
  const [grnNo, setGrnNo] = useState(() => formatGrn(nextDocNumber(records.map((r) => r.grnNo), "GRN", 399)))
  const [vehicleRef, setVehicleRef] = useState("")
  const [batch, setBatch] = useState("")
  const [origin, setOrigin] = useState("")

  // For the PO dropdown: open POs to pick, and POs whose delivery is already in
  // progress (shown, not selectable — a PO takes one delivery at a time).
  const poChoices = useMemo(() => {
    const inProgress = new Map(records.filter((r) => r.status !== "RECEIVED").map((r) => [r.poNumber, r.incomingId]))
    const received = new Set(records.filter((r) => r.status === "RECEIVED").map((r) => r.poNumber))
    const byArrival = (a: { expectedArrival: string }, b: { expectedArrival: string }) => a.expectedArrival.localeCompare(b.expectedArrival)
    return {
      open: PURCHASE_ORDERS.filter((p) => !inProgress.has(p.poNumber) && !received.has(p.poNumber)).sort(byArrival),
      busy: PURCHASE_ORDERS.filter((p) => inProgress.has(p.poNumber)).sort(byArrival).map((p) => ({ po: p, incomingId: inProgress.get(p.poNumber)! })),
    }
  }, [records])
  const poLabel = (p: (typeof PURCHASE_ORDERS)[number]) => {
    const m = materialEntry(p.materialId)
    const g = gradeEntry(p.gradeId)
    const due = new Date(p.expectedArrival).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    return `${p.poNumber} · ${m?.name ?? p.materialId}${g ? ` — ${g.name}` : ""} · ${p.supplier} · ${p.expectedMt.toLocaleString()} ${m?.uom ?? "MT"} · due ${due}`
  }

  // POs with no delivery on the worklist yet — the demo tags worth scanning.
  const openPos = useMemo(
    () => PURCHASE_ORDERS.filter((p) => !records.some((r) => r.poNumber === p.poNumber)).slice(0, 4),
    [records],
  )

  const identify = (raw: string, via: "QR" | "MANUAL") => {
    setError(null)
    const poNumber = parsePoQr(raw)
    if (!poNumber) {
      return setError(via === "QR" ? "That QR code is not a PO tag." : "Enter a PO number in the form PO-10250.")
    }
    const resolved = resolvePurchaseOrder(poNumber)!
    setFound({ poNumber, via })
    setReceiving("")
    setOrigin(resolved.materialId === "MAT-LIMESTONE" ? "Marulan South Limestone Mine" : "")
  }

  // Default the receiving balance to the PO's destination once options load.
  const defaultReceiving = options.find((o) => o.locationId === po?.destinationLocationId)?.inventoryId ?? options[0]?.inventoryId ?? ""
  const receivingId = receiving || defaultReceiving

  const confirm = () => {
    if (!po || !found) return
    setError(null)
    const result = register({
      poNumber: po.poNumber,
      identifiedBy: found.via,
      receivingInventoryId: receivingId,
      gateEntryNo,
      grnNo,
      vehicleRef,
      batch,
      origin,
    })
    if (!result.ok) return setError(result.error)
    if (onRegistered) onRegistered(result.value)
    else setOpenId(result.value.incomingId)
    onClose()
  }

  return (
    <Modal title="Incoming Material" subtitle={po ? po.poNumber : "Identify the delivery"} onClose={onClose} width={600}>
      {!po ? (
        <>
          <div role="tablist" aria-label="Identification method" className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-panel-2 p-1">
            {(
              [
                ["QR", "Scan QR"],
                ["MANUAL", "Enter PO Manually"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={method === id}
                onClick={() => {
                  setMethod(id)
                  setError(null)
                }}
                className={`rounded-md py-2 text-[13px] font-semibold ${
                  method === id ? "bg-panel text-ink shadow ring-1 ring-line" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {method === "QR" ? (
            <>
              <QrScanner onResult={(text) => identify(text, "QR")} />
              <button
                onClick={() => setShowTags((v) => !v)}
                aria-expanded={showTags}
                className="mt-3 text-[12px] font-medium text-accent hover:underline"
              >
                {showTags ? "Hide" : "Show"} demo PO tags to scan
              </button>
              {showTags && (
                <div className="mt-2 rounded-lg bg-panel-2 p-3 ring-1 ring-line">
                  <p className="mb-2 text-[11.5px] text-ink-3">
                    Open on another screen or print, then scan with this device&apos;s camera.
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {openPos.map((p) => (
                      <div key={p.poNumber} className="flex flex-col items-center gap-1">
                        <PoQrCode payload={poQrPayload(p.poNumber)} size={112} />
                        <span className="font-mono text-[11px] text-ink-2">{p.poNumber}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <Field
                label="Purchase Order"
                required
                hint={`${poChoices.open.length} open ${poChoices.open.length === 1 ? "PO" : "POs"} awaiting delivery. Selecting one loads its details.`}
              >
                <select
                  autoFocus
                  value=""
                  aria-label="Select PO"
                  onChange={(e) => e.target.value && identify(e.target.value, "MANUAL")}
                  className={`${INPUT} font-mono`}
                >
                  <option value="">Select PO…</option>
                  <optgroup label="Open — awaiting delivery">
                    {poChoices.open.map((p) => (
                      <option key={p.poNumber} value={p.poNumber}>
                        {poLabel(p)}
                      </option>
                    ))}
                  </optgroup>
                  {poChoices.busy.length > 0 && (
                    <optgroup label="Delivery in progress — continue it from the worklist">
                      {poChoices.busy.map(({ po: p, incomingId }) => (
                        <option key={p.poNumber} value={p.poNumber} disabled>
                          {p.poNumber} · {materialEntry(p.materialId)?.name} · {incomingId} in progress
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>
              <Field label="Or type the PO number" hint="For a PO that is not in the list.">
                <div className="flex gap-2">
                  <input
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && identify(entry, "MANUAL")}
                    placeholder="PO-10250"
                    aria-label="PO Number"
                    className={`${INPUT} font-mono`}
                  />
                  <button onClick={() => identify(entry, "MANUAL")} className="rounded-lg bg-accent px-4 text-[13px] font-semibold text-accent-ink">
                    Search
                  </button>
                </div>
              </Field>
            </>
          )}
          {error && <Err>{error}</Err>}
        </>
      ) : (
        <>
          <div className="mb-4 rounded-lg bg-panel-2 p-3.5 ring-1 ring-line">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
                {found?.via === "QR" ? "QR scanned — PO found" : "PO found"}
              </span>
              {po.adHoc && (
                <span className="rounded bg-demo px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-demo-ink">Not in PO list</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
              <Detail label="PO Number" value={po.poNumber} mono />
              <Detail label="Supplier" value={po.supplier} />
              <Detail label="Material" value={material?.name ?? po.materialId} />
              <Detail label="Grade" value={gradeEntry(po.gradeId)?.name ?? "—"} />
              <Detail label="Material Code" value={material?.code ?? "—"} mono />
              <Detail label="Expected Quantity" value={po.expectedMt.toLocaleString()} />
              <Detail label="UOM" value={material?.uom ?? "MT"} />
              <Detail label="Expected Arrival" value={stamp(po.expectedArrival)} />
              <Detail label="Sampling" value={samplingLabel(gradeEntry(po.gradeId)?.sampleEvery ?? 0)} />
            </div>
            {po.adHoc && (
              <p className="mt-2 text-[11px] text-ink-3">
                This PO is not in the purchase-order list; its details were generated at the gate. Confirm them against the docket.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Gate Entry No.">
              <input value={gateEntryNo} onChange={(e) => setGateEntryNo(e.target.value.toUpperCase())} placeholder="Optional" className={`${INPUT} font-mono`} />
            </Field>
            <Field label="GRN No.">
              <input value={grnNo} onChange={(e) => setGrnNo(e.target.value.toUpperCase())} placeholder="Optional" className={`${INPUT} font-mono`} />
            </Field>
          </div>
          <Field label="Receiving Location" required>
            <select value={receivingId} onChange={(e) => setReceiving(e.target.value)} className={INPUT}>
              {options.length === 0 && <option value="">No active inventory record holds this Material + Grade</option>}
              {options.map((o) => (
                <option key={o.inventoryId} value={o.inventoryId}>
                  {inventoryOptionLabel(o)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Vehicle / Delivery Reference">
              <input value={vehicleRef} onChange={(e) => setVehicleRef(e.target.value)} placeholder="e.g. TRK-0231" className={INPUT} />
            </Field>
            <Field label="Supplier Batch">
              <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Optional" className={INPUT} />
            </Field>
          </div>
          <Field label="Source / Origin">
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. quarry, mine or supplier site" className={INPUT} />
          </Field>
          <p className="text-[11px] text-ink-3">
            Everything the PO already knows is filled in. The received quantity comes from weighing and is confirmed at receipt.
          </p>

          {error && <Err>{error}</Err>}
          <Actions
            cancelLabel="Back"
            onCancel={() => {
              setFound(null)
              setError(null)
            }}
            onSubmit={confirm}
            submitLabel="Confirm Delivery"
            disabled={!receivingId}
          />
        </>
      )}
    </Modal>
  )
}

function Detail({ label, value, span, mono }: { label: string; value: string; span?: boolean; mono?: boolean }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`text-ink ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  )
}

/* ── 2. Weighing ─────────────────────────────────────────────────────────── */

export function WeighingModal({ record, onClose }: { record: IncomingRecord; onClose: () => void }) {
  const { recordWeighing } = useIncoming()
  const material = materialEntry(record.materialId)
  const uom = material?.uom ?? "MT"
  // Bulk is weighed on the weighbridge; drums and each are counted.
  const counted = isCounted(uom)
  const [gross, setGross] = useState("")
  const [tare, setTare] = useState("")
  const [error, setError] = useState<string | null>(null)

  const grossN = parsePositive(gross)
  const tareN = counted ? 0 : parseNonNegative(tare)
  // Net is derived, never typed.
  const net = grossN !== null && tareN !== null ? grossN - tareN : null

  const submit = () => {
    setError(null)
    const result = recordWeighing(record.incomingId, { grossMt: grossN, tareMt: tareN })
    if (!result.ok) return setError(counted ? result.error.replace(/Gross weight/, "Counted quantity") : result.error)
    onClose()
  }

  return (
    <Modal title={counted ? "Count" : "Weighing"} subtitle={`${record.poNumber} · ${record.incomingId}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Material">
          <Readonly value={material?.name} />
        </Field>
        <Field label="Expected Quantity">
          <Readonly value={`${record.expectedMt.toLocaleString()} ${uom}`} />
        </Field>
      </div>
      {counted ? (
        <>
          <Field label={`Counted Quantity (${uom})`} required hint={`${material?.name} is held in ${uom}, so the delivery is counted, not weighed.`}>
            <input autoFocus inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
          </Field>
          {error && <Err>{error}</Err>}
          <Actions onCancel={onClose} onSubmit={submit} submitLabel="Save Count" />
        </>
      ) : (
      <>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Gross Weight (MT)" required>
          <input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Tare Weight (MT)" required>
          <input inputMode="decimal" value={tare} onChange={(e) => setTare(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Net Weight (MT)">
          <Readonly value={net !== null && net > 0 ? net.toLocaleString() : undefined} mono />
        </Field>
      </div>
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Save Weight" />
      </>
      )}
    </Modal>
  )
}

/* ── 3. Quality ──────────────────────────────────────────────────────────── */

export function QualityModal({ record, onClose }: { record: IncomingRecord; onClose: () => void }) {
  const { recordQuality, collectSample } = useIncoming()
  const { recordOf } = usePiles()
  // The grade tested is the one the delivery was bought to, or failing that the
  // grade already held in the balance it will join.
  const gradeId = record.gradeId ?? recordOf(record.receivingInventoryId)?.gradeId ?? seedGradeAt(record.destinationLocationId)
  const grade = gradeEntry(gradeId)
  const params = useMemo(() => qualityParameters(gradeId), [gradeId])
  const [values, setValues] = useState<string[]>(() => params.map(() => ""))
  const [result, setResult] = useState<QualityResult | "">("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  // A delivery the plan skips can still be tested at the inspector's discretion.
  const [testAnyway, setTestAnyway] = useState(false)
  const testing = record.sampleRequired || testAnyway
  const awaitingSample = record.sampleRequired && !record.sample

  /** A reading against its parameter's limits — the spec decides, not the eye. */
  const verdict = (i: number) => {
    const raw = values[i].trim()
    if (raw === "") return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return readingPasses(n, params[i].min, params[i].max)
  }
  const outOfSpec = params.map((_, i) => verdict(i)).filter((v) => v === false).length

  const submit = () => {
    setError(null)
    const outcome = recordQuality(record.incomingId, {
      result,
      notes,
      readings: testing ? params.map((p, i) => ({ parameter: p.parameter, unit: p.unit, value: values[i] })) : [],
    })
    if (!outcome.ok) return setError(outcome.error)
    onClose()
  }

  return (
    <Modal title="Quality" subtitle={`${record.poNumber} · ${record.incomingId}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Material">
          <Readonly value={materialEntry(record.materialId)?.name} />
        </Field>
        <Field label="Grade">
          <Readonly value={grade?.name ?? "Not set"} />
        </Field>
      </div>

      {/* Sampling: required by the grade's plan, collected, tested. */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-panel-2 p-3 text-[12px] ring-1 ring-line">
        <SampleStep
          label="Sample Required"
          value={record.sampleRequired ? "Yes" : "No"}
          note={samplingLabel(grade?.sampleEvery ?? 0)}
          done={record.sampleRequired}
        />
        <SampleStep
          label="Sample Collected"
          value={record.sample ? record.sample.sampleId : record.sampleRequired ? "Not yet" : "—"}
          note={record.sample ? stamp(record.sample.collectedAt) : undefined}
          done={Boolean(record.sample)}
        />
        <SampleStep label="Sample Tested" value={testing && !awaitingSample ? "On saving the result" : record.sampleRequired ? "Pending" : "—"} done={false} />
      </div>

      {awaitingSample ? (
        <>
          <p className="mb-3 rounded-lg bg-demo/40 px-3 py-2.5 text-[12px] text-ink ring-1 ring-line">
            TEST PENDING — this delivery must be sampled before a result can be recorded. The material is not accepted into inventory
            until it passes.
          </p>
          {error && <Err>{error}</Err>}
          <Actions
            onCancel={onClose}
            onSubmit={() => {
              const res = collectSample(record.incomingId)
              if (!res.ok) setError(res.error)
            }}
            submitLabel="Record Sample Collected"
          />
        </>
      ) : (
        <>
      {!record.sampleRequired && (
        <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-panel-2 p-3 text-[12px] text-ink-2 ring-1 ring-line">
          <input type="checkbox" checked={testAnyway} onChange={(e) => setTestAnyway(e.target.checked)} className="mt-[2px] accent-[var(--color-accent)]" />
          <span>
            No sample is required for this delivery under the grade&rsquo;s sampling plan, so it is accepted or held on inspection.
            <span className="block text-ink-3">Tick to record test readings anyway.</span>
          </span>
        </label>
      )}

      {!testing ? null : params.length === 0 ? (
        <p className="mb-3 rounded-lg bg-panel-2 px-3 py-2.5 text-[11.5px] text-ink-2 ring-1 ring-line">
          {grade
            ? `Grade ${grade.name} has no grade-specific parameters registered, so the result is the inspector's alone. Register parameters under Master → Materials + Grades and they appear here.`
            : "No grade is set for this delivery, so there is no specification to test against."}
        </p>
      ) : (
        <fieldset className="mb-3 rounded-lg border border-line p-3.5">
          <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">
            Quality Parameters — Grade {grade?.name}
          </legend>
          {params.map((p, i) => {
            const ok = verdict(i)
            return (
              <Field
                key={p.parameterId}
                label={`${p.parameter}${p.unit ? ` (${p.unit})` : ""}`}
                required
                hint={`Spec: ${p.min ?? "—"} to ${p.max ?? "—"}${p.target !== null ? ` · target ${p.target}` : ""}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={values[i]}
                    onChange={(e) => setValues((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    className={`${INPUT} font-mono`}
                  />
                  <span className={`w-[86px] shrink-0 text-[11.5px] ${ok === false ? "font-semibold text-crit" : "text-ink-3"}`}>
                    {ok === null ? "—" : ok ? "In spec" : "Out of spec"}
                  </span>
                </span>
              </Field>
            )
          })}
          {outOfSpec > 0 && (
            <p className="text-[11.5px] font-semibold text-crit">
              {outOfSpec} {outOfSpec === 1 ? "reading is" : "readings are"} outside the grade specification. The result is still the
              inspector&rsquo;s to record.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="mb-3">
        <legend className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
          Quality Result<span className="ml-0.5 text-crit" aria-hidden>*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(["PASS", "FAIL"] as const).map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-bold ring-1 ${
                result === r ? (r === "PASS" ? "bg-ok/15 text-ink ring-ok" : "bg-crit/15 text-ink ring-crit") : "bg-panel-2 text-ink-2 ring-line"
              }`}
            >
              <input type="radio" name="quality" value={r} checked={result === r} onChange={() => setResult(r)} className="sr-only" />
              <span aria-hidden className={r === "PASS" ? "text-ok" : "text-crit"}>
                {r === "PASS" ? "✓" : "✕"}
              </span>
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Quality Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${INPUT} resize-none`} />
      </Field>
      {result === "FAIL" && (
        <p className="mb-2 text-[12px] text-ink-2">A failed delivery stays at Quality and is not received into inventory.</p>
      )}

      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel={testing ? "Save Test Result" : "Save Quality"} disabled={!result} />
        </>
      )}
    </Modal>
  )
}

function SampleStep({ label, value, note, done }: { label: string; value: string; note?: string; done: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`font-semibold ${done ? "text-ink" : "text-ink-2"}`}>{value}</div>
      {note && <div className="text-[10.5px] text-ink-3">{note}</div>}
    </div>
  )
}

/* ── 4. Receipt ──────────────────────────────────────────────────────────── */

export function ReceiptModal({ record, onClose }: { record: IncomingRecord; onClose: () => void }) {
  const { confirmReceipt, canWriteInventory } = useIncoming()
  const { recordOf } = usePiles()
  const options = useReceivingOptions(record.materialId, record.gradeId)
  const material = materialEntry(record.materialId)
  // A lot / batch reference only where the material is lot-tracked.
  const [lotId, setLotId] = useState(() => (material?.lotTracking ? suggestLotId() : ""))
  const uom = material?.uom ?? "MT"
  const counted = isCounted(uom)
  const weighedNet = record.weighing?.netMt ?? null
  const [qty, setQty] = useState(weighedNet ? String(weighedNet) : "")
  // Expiry — only for materials where it applies; the date on the batch received.
  const [expiry, setExpiry] = useState("")
  const [receiving, setReceiving] = useState(record.receivingInventoryId)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const qtyN = parsePositive(qty)
  const variance = qtyN !== null ? qtyN - record.expectedMt : null
  const target = recordOf(receiving)

  const submit = () => {
    setError(null)
    const outcome = confirmReceipt(record.incomingId, {
      receivedMt: qtyN,
      receivingInventoryId: receiving,
      lotId: material?.lotTracking ? lotId : undefined,
      expiryDate: material?.expiryApplicable && expiry ? new Date(`${expiry}T00:00:00`).toISOString() : undefined,
    })
    // A refused posting leaves the record where it was, with no inventory move.
    if (!outcome.ok) return setError(outcome.error)
    setDone(outcome.value.transactionId)
  }

  return (
    <Modal title="Confirm Receipt" subtitle={`${record.poNumber} · ${record.incomingId}`} onClose={onClose}>
      {done ? (
        <>
          <div className="rounded-lg bg-ok/10 p-3.5 ring-1 ring-ok/50">
            <div className="text-[13.5px] font-semibold text-ink">
              <span aria-hidden className="mr-1.5 text-ok">
                ✓
              </span>
              RECEIVED
            </div>
            <div className="mt-1 text-[12.5px] text-ink-2">
              Inventory transaction <span className="font-mono text-ink">{done}</span> added {qtyN?.toLocaleString()} {uom} to{" "}
              <span className="font-mono text-ink">{receiving}</span>
              {material?.lotTracking && lotId ? (
                <>
                  {" "}
                  under lot <span className="font-mono text-ink">{lotId}</span>
                </>
              ) : null}
              {material?.expiryApplicable && expiry ? (
                <>
                  , expiring <span className="font-mono text-ink">{new Date(`${expiry}T00:00:00`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </>
              ) : null}
              .
            </div>
          </div>
          <button onClick={onClose} className="mt-4 w-full rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink">
            Done
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expected Quantity">
              <Readonly value={`${record.expectedMt.toLocaleString()} ${uom}`} />
            </Field>
            <Field label={counted ? "Counted Quantity" : "Net Weight"}>
              <Readonly value={weighedNet ? `${weighedNet.toLocaleString()} ${uom}` : undefined} />
            </Field>
          </div>
          <Field
            label={`Received Quantity (${uom})`}
            required
            hint={counted ? "Taken from the count — change it only if the docket differs." : "Taken from the net weight — change it only if the docket differs."}
          >
            <input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              disabled={!canWriteInventory}
              className={`${INPUT} font-mono text-[15px]`}
            />
          </Field>
          {variance !== null && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-panel-2 px-3 py-2">
              <span className="text-[12px] text-ink-3">Variance against PO</span>
              <span
                className="font-mono text-[13px] font-bold"
                style={{ color: toneText(variance === 0 ? "#22c55e" : variance < 0 ? "#f87171" : "#eab308") }}
              >
                {variance > 0 ? "+" : ""}
                {variance.toLocaleString()} {uom}
              </span>
            </div>
          )}
          <Field label="Receiving Location" required>
            <select value={receiving} onChange={(e) => setReceiving(e.target.value)} className={INPUT}>
              {options.map((o) => (
                <option key={o.inventoryId} value={o.inventoryId}>
                  {inventoryOptionLabel(o)}
                </option>
              ))}
            </select>
          </Field>
          {material?.expiryApplicable && (
            <Field label="Expiry Date" required hint={`Expiry applies to ${material.name}. Enter the date on the batch received.`}>
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={!canWriteInventory} className={INPUT} />
            </Field>
          )}
          {material?.lotTracking && (
            <Field label="Internal Lot / Batch Reference" hint={`${material.name} is lot-tracked. Keep the proposed reference or enter the one on the documents.`}>
              <input value={lotId} onChange={(e) => setLotId(e.target.value.toUpperCase())} className={`${INPUT} font-mono`} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gate Entry / GRN">
              <Readonly value={[record.gateEntryNo, record.grnNo].filter(Boolean).join(" · ") || "Not recorded"} mono />
            </Field>
            <Field label="Inventory Impact">
              <Readonly
                mono
                value={
                  target && qtyN !== null
                    ? `${Math.round(target.quantity).toLocaleString()} → ${Math.round(target.quantity + qtyN).toLocaleString()}`
                    : undefined
                }
              />
            </Field>
          </div>
          {!canWriteInventory && <Err>You do not have permission to post inventory receipts.</Err>}
          {error && <Err>{error}</Err>}
          <Actions
            onCancel={onClose}
            onSubmit={submit}
            submitLabel="Confirm Receipt"
            disabled={!canWriteInventory || qtyN === null || (Boolean(material?.expiryApplicable) && !expiry)}
          />
        </>
      )}
    </Modal>
  )
}

"use client"

/**
 * Operational modals: Create Issue, Issue Material, Record Consumption.
 *
 * Required fields carry *; optional ones do not. Each modal shows the
 * inventory impact before the user commits, and keeps their entries on a
 * refused posting so they can correct and retry.
 */

import { useMemo, useState } from "react"

import { ISSUE_PROCESS, POSTING_POINT_LABEL } from "@/config/issue-process"
import { PLANT_ASSETS } from "@/lib/assets/plant-assets"
import { Err, Field, INPUT, Modal, Readonly, inventoryOptionLabel } from "@/components/incoming/StageModals"
import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { consumingArea, consumingAreas, materialRoute } from "@/lib/issues/catalog"
import {
  CONSUMPTION_CATEGORIES,
  CONSUMPTION_CATEGORY_META,
  consumptionTransactionType,
  defaultCategory,
  type ConsumptionCategory,
} from "@/lib/issues/consumption"
import { gradeEntry } from "@/lib/inventory/catalog"
import { transactionLabel } from "@/lib/inventory/ledger"
import { parseQuantity, type Availability } from "@/lib/issues/rules"
import { receiptsInto } from "@/lib/issues/trace"
import { returnableQty, returnedQty, type IssueRecord } from "@/lib/issues/types"
import { useIssues } from "./issue-store"
import { usePiles } from "@/components/shell/pile-store"
import { expiryDay } from "@/components/inventory/Expiry"

const fmt = (n: number) => Math.round(n).toLocaleString()

/** A <input type="datetime-local"> value for a moment, in local time. */
function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function Buttons({
  onCancel,
  actions,
}: {
  onCancel: () => void
  actions: Array<{ label: string; onClick: () => void; disabled?: boolean; primary?: boolean }>
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      <button
        onClick={onCancel}
        className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line"
      >
        Cancel
      </button>
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          disabled={a.disabled}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold disabled:opacity-40 ${
            a.primary ? "bg-accent text-accent-ink hover:brightness-110" : "bg-panel text-accent ring-1 ring-accent/60 hover:bg-panel-2"
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}

/** On hand, committed, available — and whether the quantity fits. */
function StockCheck({ stock, required, uom }: { stock: Availability | null; required: number | null; uom: string }) {
  if (!stock) return null
  const short = required !== null && required > stock.available
  return (
    <div className="mb-3 rounded-lg bg-panel-2 p-3 ring-1 ring-line">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Inventory check</div>
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <Figure label="On hand" value={`${fmt(stock.onHand)} ${uom}`} />
        <Figure label="Committed to open issues" value={`${fmt(stock.committed)} ${uom}`} />
        <Figure label="Available to issue" value={`${fmt(stock.available)} ${uom}`} strong />
      </div>
      {required !== null && (
        <div
          role={short ? "alert" : undefined}
          className={`mt-2.5 flex gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-ink ring-1 ${
            short ? "bg-crit/10 ring-crit/50" : "bg-ok/10 ring-ok/50"
          }`}
        >
          <span aria-hidden className={short ? "text-crit" : "text-ok"}>
            {short ? "✕" : "✓"}
          </span>
          {short ? `Insufficient stock — short by ${fmt(required - stock.available)} ${uom}.` : `Stock available for ${fmt(required)} ${uom}`}
        </div>
      )}
    </div>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`font-mono ${strong ? "font-bold text-ink" : "text-ink"}`}>{value}</div>
    </div>
  )
}

function Route({ sourceLocationId, areaId }: { sourceLocationId: string; areaId: string }) {
  if (!sourceLocationId || !areaId) return null
  const route = materialRoute(sourceLocationId, areaId)
  return (
    <div className="mb-3 text-[12px]">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Material movement</span>
      <div className="mt-0.5 text-ink-2">
        {route ? (
          route.map((s, i) => (
            <span key={s.nodeId}>
              {i > 0 && <span className="px-1.5 text-ink-3">→</span>}
              <span className={i === route.length - 1 ? "font-semibold text-ink" : undefined}>{i === 0 ? s.nodeId : s.name}</span>
            </span>
          ))
        ) : (
          <span className="text-ink-3">No route from {sourceLocationId} to {consumingArea(areaId)?.name} in the plant model.</span>
        )}
      </div>
    </div>
  )
}

/**
 * Assets a maintenance draw can be costed to — the plant equipment the twin
 * already models. Piles and conveyors are not maintained through this workflow.
 */
const COSTABLE_ASSETS = PLANT_ASSETS.filter(
  (a) => a.type !== "pile" && a.type !== "conveyor",
).sort((a, b) => a.name.localeCompare(b.name))

/* ── Create Issue ────────────────────────────────────────────────────────── */

export function CreateIssueModal({ onClose, onCreated }: { onClose: () => void; onCreated: (record: IssueRecord) => void }) {
  const { createIssue, stockAt, incoming, inventory } = useIssues()
  const { expiryOf } = usePiles()
  const [pair, setPair] = useState("")
  const [materialId, gradeId] = pair ? pair.split("|") : ["", ""]
  const [maintenanceRef, setMaintenanceRef] = useState("")
  const [sourceId, setSourceId] = useState("")
  const [qty, setQty] = useState("")
  const [consumingAreaId, setConsumingAreaId] = useState("")
  const [productionRef, setProductionRef] = useState("")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [originIncomingId, setOriginIncomingId] = useState("")
  const [assetId, setAssetId] = useState("")
  const [error, setError] = useState<string | null>(null)

  const material = materialEntry(materialId)
  // Expiry-tracked stock: the balance whose next batch expires soonest is listed
  // first. Within a balance, consumption draws first-expiry-first-out on its own,
  // and expired quantity has already left through an EXPIRY transaction.
  const nextExpiry = (id: string) => (material?.expiryApplicable ? expiryOf(id).nextExpiry : undefined)
  const sources = useMemo(
    () =>
      inventory
        .filter((r) => r.active && r.materialId === materialId && r.gradeId === gradeId)
        .sort((a, b) => {
          const ea = nextExpiry(a.inventoryId)
          const eb = nextExpiry(b.inventoryId)
          return (ea ? new Date(ea).getTime() : Infinity) - (eb ? new Date(eb).getTime() : Infinity)
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inventory, materialId, gradeId, expiryOf],
  )
  const source = sources.find((s) => s.inventoryId === sourceId)
  const stock = source ? stockAt(source.inventoryId) : null
  const quantity = parseQuantity(qty)
  const receipts = useMemo(
    () => (sourceId ? receiptsInto(sourceId, new Date().toISOString(), incoming) : []),
    [sourceId, incoming],
  )
  // Material + Grade pairs that actually have stock to issue from.
  const pairs = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of inventory) {
      if (!r.active) continue
      const m = materialEntry(r.materialId)
      if (!m?.active) continue
      seen.set(`${r.materialId}|${r.gradeId}`, `${m.name} — ${gradeEntry(r.gradeId)?.name ?? "—"}`)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [inventory])
  const areas = consumingAreas()

  const submit = (issueNow: boolean) => {
    setError(null)
    const res = createIssue(
      {
        materialId,
        gradeId,
        sourceInventoryId: sourceId,
        quantity,
        consumingAreaId,
        productionRef,
        reason,
        notes,
        originIncomingId: originIncomingId || undefined,
        assetId: assetId || undefined,
        maintenanceRef: maintenanceRef || undefined,
      },
      issueNow,
    )
    if (!res.ok) return setError(res.error)
    onCreated(res.value)
  }

  // A spare is consumed ON something. Without the asset the cost has nowhere to
  // land, so the form asks for it rather than letting the store refuse later.
  const isSpare = material?.group === "Spare"
  const ready = Boolean(materialId && sourceId && quantity && consumingAreaId && (!isSpare || assetId))
  const short = quantity !== null && stock !== null && quantity > stock.available

  return (
    <Modal title="Create Issue" onClose={onClose} width={600}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Material + Grade" required>
          <select
            value={pair}
            onChange={(e) => {
              setPair(e.target.value)
              const [m, g] = e.target.value.split("|")
              const only = inventory.filter((r) => r.active && r.materialId === m && r.gradeId === g)
              setSourceId(only.length === 1 ? only[0].inventoryId : "")
              setOriginIncomingId("")
            }}
            className={INPUT}
          >
            <option value="">Select Material + Grade…</option>
            {pairs.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Source Inventory"
          required
          hint={
            material?.expiryApplicable
              ? "Soonest expiry is listed first. The issue draws the earliest-expiring batch first; expired stock has already been removed."
              : undefined
          }
        >
          <select
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value)
              setOriginIncomingId("")
            }}
            disabled={!materialId}
            className={INPUT}
          >
            <option value="">Select location…</option>
            {sources.map((s) => (
              <option key={s.inventoryId} value={s.inventoryId}>
                {inventoryOptionLabel(s)}
                {nextExpiry(s.inventoryId)
                  ? ` · next expiry ${expiryDay(nextExpiry(s.inventoryId)!)}`
                  : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <StockCheck stock={stock} required={quantity} uom={material?.uom ?? "MT"} />

      <div className="grid grid-cols-[1fr_90px] gap-x-3">
        <Field label="Quantity" required>
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="UOM" required>
          <Readonly value={material?.uom} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Consuming Area" required>
          <select value={consumingAreaId} onChange={(e) => setConsumingAreaId(e.target.value)} className={INPUT}>
            <option value="">Select area…</option>
            {areas.map((a) => (
              <option key={a.areaId} value={a.areaId}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Production / Process Reference">
          <input value={productionRef} onChange={(e) => setProductionRef(e.target.value)} placeholder="Optional" className={`${INPUT} font-mono`} />
        </Field>
      </div>

      <Field
        label="Plant Asset"
        required={isSpare}
        hint={
          isSpare
            ? "Maintenance and spare draws are costed to the asset, so repeat consumers show up."
            : "Optional. Set it where the draw is against one machine."
        }
      >
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className={INPUT}>
          <option value="">{isSpare ? "Select the asset…" : "Not applicable"}</option>
          {COSTABLE_ASSETS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.id})
            </option>
          ))}
        </select>
      </Field>
      {isSpare && (
        <Field label="Maintenance Reference" hint="Work order or job the spare is drawn for. Optional.">
          <input value={maintenanceRef} onChange={(e) => setMaintenanceRef(e.target.value)} placeholder="e.g. WO-2026-0860" className={`${INPUT} font-mono`} />
        </Field>
      )}

      <Route sourceLocationId={source?.locationId ?? ""} areaId={consumingAreaId} />

      <Field label="Origin (PO / Incoming)" hint="Piles blend deliveries. Link a receipt only if this stock is known to come from it.">
        <select
          value={originIncomingId}
          onChange={(e) => setOriginIncomingId(e.target.value)}
          disabled={!sourceId || receipts.length === 0}
          className={INPUT}
        >
          <option value="">{sourceId && receipts.length === 0 ? "No receipts into this inventory record" : "Not linked"}</option>
          {receipts.map((r) => (
            <option key={r.incomingId} value={r.incomingId}>
              {r.poNumber} · {r.incomingId} · {r.receipt!.receivedMt.toLocaleString()} MT{r.batch ? ` · Batch ${r.batch}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className={INPUT} />
        </Field>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={INPUT} />
        </Field>
      </div>

      <p className="text-[11px] text-ink-3">
        Inventory posts {POSTING_POINT_LABEL[ISSUE_PROCESS.inventoryPostingPoint]}.{" "}
        {ISSUE_PROCESS.approvalRequired ? "Issues require approval before material is released." : "Approval is not required."}
      </p>

      {error && <Err>{error}</Err>}
      <Buttons
        onCancel={onClose}
        actions={[
          { label: "Create Request", onClick: () => submit(false), disabled: !ready || short },
          ...(ISSUE_PROCESS.approvalRequired
            ? []
            : [{ label: "Create & Issue", onClick: () => submit(true), disabled: !ready || short, primary: true }]),
        ]}
      />
    </Modal>
  )
}

/* ── Issue Material ──────────────────────────────────────────────────────── */

export function IssueMaterialModal({ record, onClose }: { record: IssueRecord; onClose: () => void }) {
  const { issueMaterial, stockAt } = useIssues()
  const [qty, setQty] = useState(String(record.requestedQty))
  const [error, setError] = useState<string | null>(null)
  const material = materialEntry(record.materialId)
  const stock = stockAt(record.sourceInventoryId, record.issueId)
  const quantity = parseQuantity(qty)
  const postsAtIssue = record.postingPoint === "ISSUE"

  const submit = () => {
    setError(null)
    const res = issueMaterial(record.issueId, quantity)
    if (!res.ok) return setError(res.error)
    onClose()
  }

  return (
    <Modal title="Issue Material" subtitle={record.issueId} onClose={onClose} width={540}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Material">
          <Readonly value={`${material?.name ?? record.materialId} (${material?.code ?? ""})`} />
        </Field>
        <Field label="Source Location">
          <Readonly value={`${locationEntry(record.sourceLocationId)?.name ?? record.sourceLocationId} · ${record.sourceInventoryId}`} />
        </Field>
        <Field label="Consuming Area">
          <Readonly value={consumingArea(record.consumingAreaId)?.name} />
        </Field>
        <Field label="Production / Process Reference">
          <Readonly value={record.productionRef || "—"} />
        </Field>
      </div>

      <StockCheck stock={stock} required={quantity} uom={record.uom} />

      <div className="grid grid-cols-[1fr_90px] gap-x-3">
        <Field label={`Quantity to Issue (requested ${fmt(record.requestedQty)})`} required>
          <input
            autoFocus
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="UOM">
          <Readonly value={record.uom} />
        </Field>
      </div>

      <Route sourceLocationId={record.sourceLocationId} areaId={record.consumingAreaId} />

      <div className="rounded-lg bg-panel-2 p-3 text-[12px] ring-1 ring-line">
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Inventory impact</div>
        {postsAtIssue && stock && quantity ? (
          <span className="font-mono text-ink">
            {record.sourceInventoryId}: {fmt(stock.onHand)} → {fmt(stock.onHand - quantity)} {record.uom}{" "}
            <span className="font-sans text-ink-3">(ISSUE transaction)</span>
          </span>
        ) : postsAtIssue ? (
          <span className="text-ink-3">Stock leaves inventory when issued.</span>
        ) : (
          <span className="text-ink-2">No stock movement at issue. The quantity is committed and posts when consumption is recorded.</span>
        )}
      </div>

      {error && <Err>{error}</Err>}
      <Buttons onCancel={onClose} actions={[{ label: "Issue Material", onClick: submit, disabled: !quantity, primary: true }]} />
    </Modal>
  )
}

/* ── Record Consumption ──────────────────────────────────────────────────── */

export function ConsumptionModal({
  initialIssueId,
  onClose,
  onPosted,
}: {
  initialIssueId?: string
  onClose: () => void
  onPosted: (record: IssueRecord) => void
}) {
  const { records, recordConsumption, balanceOf } = useIssues()
  const issued = records.filter((r) => r.status === "ISSUED")
  const [issueId, setIssueId] = useState(initialIssueId ?? "")
  const record = records.find((r) => r.issueId === issueId && r.status === "ISSUED")

  const [qty, setQty] = useState("")
  const [when, setWhen] = useState(() => localInputValue(new Date()))
  const [productionRef, setProductionRef] = useState(record?.productionRef ?? "")
  const [comments, setComments] = useState("")
  const [category, setCategory] = useState<ConsumptionCategory>(() =>
    defaultCategory(materialEntry(record?.materialId)?.group),
  )
  const [error, setError] = useState<string | null>(null)

  const pick = (id: string) => {
    const next = records.find((x) => x.issueId === id)
    setIssueId(id)
    setProductionRef(next?.productionRef ?? "")
    setCategory(defaultCategory(materialEntry(next?.materialId)?.group))
    setQty("")
    setError(null)
  }

  const quantity = parseQuantity(qty)
  const onHand = record ? balanceOf(record.sourceInventoryId) : null
  const material = record ? materialEntry(record.materialId) : undefined
  const notYet = record?.issue && quantity !== null ? record.issue.issuedQty - quantity : null

  const submit = () => {
    setError(null)
    if (!record) return setError("Select the Issue ID.")
    const at = when ? new Date(when).toISOString() : null
    const res = recordConsumption(record.issueId, { consumedQty: quantity, at, productionRef, comments, category })
    if (!res.ok) return setError(res.error)
    onPosted(res.value)
  }

  return (
    <Modal title="Record Consumption" subtitle={record?.issueId} onClose={onClose} width={580}>
      {issued.length === 0 ? (
        <p className="text-[13px] text-ink-2">There is no issued material awaiting consumption. Issue material first.</p>
      ) : (
        <>
          <Field label="Issue ID" required>
            <select value={issueId} onChange={(e) => pick(e.target.value)} className={`${INPUT} font-mono`}>
              <option value="">Select issue…</option>
              {issued.map((r) => (
                <option key={r.issueId} value={r.issueId}>
                  {r.issueId} · {materialEntry(r.materialId)?.name} · {r.issue!.issuedQty.toLocaleString()} {r.uom}
                </option>
              ))}
            </select>
          </Field>

          {record && record.issue && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-panel-2 p-3 text-[12.5px] ring-1 ring-line sm:grid-cols-3">
                <Auto label="Material" value={material?.name ?? record.materialId} />
                <Auto label="Grade" value={gradeEntry(record.gradeId)?.name ?? "—"} />
                <Auto label="Source Inventory" value={`${record.sourceInventoryId} · ${record.sourceLocationId}`} />
                <Auto label="Issued Quantity" value={`${record.issue.issuedQty.toLocaleString()} ${record.uom}`} />
                <Auto label="UOM" value={record.uom} />
                <Auto label="Consuming Area" value={consumingArea(record.consumingAreaId)?.name ?? "—"} />
                <Auto label="PO" value={record.origin?.poNumber ?? "Not linked"} />
                <Auto label="Incoming ID" value={record.origin?.incomingId ?? "Not linked"} />
                <Auto label="Lot / Batch" value={record.lotId ?? record.batch ?? (material?.lotTracking ? "Not recorded" : "Not lot-tracked")} />
                <Auto label="Plant Asset" value={record.assetId ?? "Not applicable"} />
                {record.maintenanceRef && <Auto label="Maintenance Ref" value={record.maintenanceRef} />}
              </div>

              <div className="grid grid-cols-2 gap-x-3">
                <Field label={`Consumed Quantity (${record.uom})`} required>
                  <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
                </Field>
                <Field label="Date / Time" required>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={INPUT} />
                </Field>
                <Field label="Consumption Category" required>
                  <select value={category} onChange={(e) => setCategory(e.target.value as ConsumptionCategory)} className={INPUT}>
                    {CONSUMPTION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CONSUMPTION_CATEGORY_META[c].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Production / Process Reference">
                  <input value={productionRef} onChange={(e) => setProductionRef(e.target.value)} placeholder="Optional" className={`${INPUT} font-mono`} />
                </Field>
                <Field label="Comments">
                  <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Optional" className={INPUT} />
                </Field>
              </div>

              <p className="-mt-1 mb-3 text-[11px] text-ink-3">
                {CONSUMPTION_CATEGORY_META[category].description}.
                {CONSUMPTION_CATEGORY_META[category].productive
                  ? " Counted as consumption on the Dashboard."
                  : ` An exception outcome — posts as a ${transactionLabel(consumptionTransactionType(category))} transaction and counts as a loss, not as production.`}
              </p>
              {category === "SPARE" && material?.unitCost !== undefined && quantity !== null && (
                <p className="-mt-1 mb-3 text-[11.5px] text-ink-2">
                  Material cost: {fmt(quantity)} {record.uom} × ${material.unitCost.toLocaleString()} ={" "}
                  <span className="font-mono font-semibold text-ink">${(quantity * material.unitCost).toLocaleString()}</span>
                  {record.assetId ? ` — costed to ${record.assetId}` : ""}.
                </p>
              )}

              <div className="rounded-lg bg-panel-2 p-3 text-[12px] ring-1 ring-line">
                <div className="grid grid-cols-3 gap-2">
                  <Figure label="Issued" value={`${fmt(record.issue.issuedQty)} ${record.uom}`} />
                  <Figure label="Consumed" value={quantity !== null ? `${fmt(quantity)} ${record.uom}` : "—"} />
                  <Figure label="Not yet consumed" value={notYet !== null ? `${fmt(notYet)} ${record.uom}` : "—"} strong />
                </div>
                <div className="mt-2.5 border-t border-line pt-2 text-ink-2">
                  {record.postingPoint === "CONSUMPTION" ? (
                    onHand !== null && quantity !== null ? (
                      <span className="font-mono text-ink">
                        {record.sourceInventoryId}: {fmt(onHand)} → {fmt(onHand - quantity)} {record.uom}{" "}
                        <span className="font-sans text-ink-3">({transactionLabel(consumptionTransactionType(category)).toUpperCase()} transaction)</span>
                      </span>
                    ) : (
                      "Posting moves the source balance by the consumed quantity."
                    )
                  ) : (
                    <>Inventory already moved at issue ({record.issue.transactionId ?? "—"}). Posting records what was consumed.</>
                  )}
                  {notYet !== null && notYet > 0 && (
                    <div className="mt-1 text-ink-3">
                      The {fmt(notYet)} {record.uom} not yet consumed stays on the record — it is not treated as consumed.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && <Err>{error}</Err>}
        </>
      )}

      <Buttons
        onCancel={onClose}
        actions={issued.length ? [{ label: "Record Consumption", onClick: submit, disabled: !record || !quantity || !when, primary: true }] : []}
      />
    </Modal>
  )
}

function Auto({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  )
}

/* ── Return Material ─────────────────────────────────────────────────────── */

/**
 * Return material to its source balance.
 *
 * Opened from an issue (record given) or from Returns › Record Return (the
 * operator picks the issue). A return is its own inventory movement, never a
 * silent netting-off: stock goes back up by a RETURN transaction and net
 * consumption falls by the same amount. Only what actually left stock can come
 * back — the same rule the store enforces (`returnableQty`).
 */
export function ReturnMaterialModal({
  record: given,
  onClose,
  onReturned,
}: {
  record?: IssueRecord
  onClose: () => void
  onReturned: (r: IssueRecord) => void
}) {
  const { records, returnMaterial, balanceOf } = useIssues()
  const [issueId, setIssueId] = useState(given?.issueId ?? "")
  const [qty, setQty] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Issues something can still come back from, most recent first.
  const returnable = useMemo(() => records.filter((r) => returnableQty(r) > 0), [records])
  const record = records.find((r) => r.issueId === issueId) ?? given

  const quantity = parseQuantity(qty)
  const onHand = record ? balanceOf(record.sourceInventoryId) : null
  const alreadyReturned = record ? returnedQty(record) : 0
  const outstanding = record ? returnableQty(record) : 0
  const grossOutward = record ? (record.postingPoint === "ISSUE" ? record.issue?.issuedQty ?? 0 : record.consumption?.consumedQty ?? 0) : 0
  // Posting at consumption, issued-but-unconsumed material never left the balance.
  const neverLeft =
    record && record.postingPoint === "CONSUMPTION" && record.issue && record.consumption
      ? Math.max(0, record.issue.issuedQty - record.consumption.consumedQty)
      : 0
  const material = record ? materialEntry(record.materialId) : undefined

  const submit = () => {
    if (!record) return
    setError(null)
    const res = returnMaterial(record.issueId, quantity, reason)
    if (!res.ok) return setError(res.error)
    onReturned(res.value)
  }

  return (
    <Modal title="Return Material" subtitle={record?.issueId} onClose={onClose} width={560}>
      {!given && (
        <Field label="Issue ID" required hint={returnable.length === 0 ? "No issue has consumed material that could come back." : undefined}>
          <select
            autoFocus
            value={issueId}
            onChange={(e) => {
              setIssueId(e.target.value)
              setQty("")
              setError(null)
            }}
            className={`${INPUT} font-mono`}
          >
            <option value="">Select issue…</option>
            {returnable.map((r) => (
              <option key={r.issueId} value={r.issueId}>
                {r.issueId} · {materialEntry(r.materialId)?.name} · {fmt(returnableQty(r))} {r.uom} returnable
              </option>
            ))}
          </select>
        </Field>
      )}

      {record && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-panel-2 p-3 text-[12.5px] ring-1 ring-line sm:grid-cols-3">
            <Auto label="Material" value={material?.name ?? record.materialId} />
            <Auto label="Grade" value={gradeEntry(record.gradeId)?.name ?? "—"} />
            <Auto label="Returns To" value={`${record.sourceLocationId} · ${record.sourceInventoryId}`} />
            <Auto label="Lot / Batch" value={record.lotId ?? record.batch ?? (material?.lotTracking ? "Not recorded" : "Not lot-tracked")} />
            <Auto label="Issued" value={`${fmt(record.issue?.issuedQty ?? 0)} ${record.uom}`} />
            <Auto label="Gross Outward" value={grossOutward ? `${fmt(grossOutward)} ${record.uom}` : "Not yet"} />
            <Auto label="Already Returned" value={`${fmt(alreadyReturned)} ${record.uom}`} />
            <Auto label="Available to Return" value={`${fmt(Math.max(0, outstanding))} ${record.uom}`} />
          </div>
          {neverLeft > 0 && (
            <p className="mb-3 text-[11.5px] text-ink-3">
              {fmt(neverLeft)} {record.uom} was issued but not consumed. It never left {record.sourceInventoryId}, so there is nothing to return for it.
            </p>
          )}

          <div className="grid grid-cols-2 gap-x-3">
            <Field label={`Return Quantity (${record.uom})`} required>
              <input autoFocus={Boolean(given)} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className={`${INPUT} font-mono`} />
            </Field>
            <Field label="Reason" required>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Not required on the shift" className={INPUT} />
            </Field>
          </div>

          <div className="rounded-lg bg-panel-2 p-3 text-[12px] ring-1 ring-line">
            {onHand !== null && quantity !== null ? (
              <span className="font-mono text-ink">
                {record.sourceInventoryId}: {fmt(onHand)} → {fmt(onHand + quantity)} {record.uom}{" "}
                <span className="font-sans text-ink-3">(RETURN transaction)</span>
              </span>
            ) : (
              <span className="text-ink-2">The return posts back into the source balance as its own transaction.</span>
            )}
            <div className="mt-2 border-t border-line pt-2 text-ink-3">
              Net consumption is gross outward minus returns: {fmt(grossOutward)} − {fmt(alreadyReturned + (quantity ?? 0))} ={" "}
              {fmt(grossOutward - alreadyReturned - (quantity ?? 0))} {record.uom}.
            </div>
          </div>
        </>
      )}

      {error && <Err>{error}</Err>}
      <Buttons
        onCancel={onClose}
        actions={[
          {
            label: "Post Return",
            onClick: submit,
            disabled: !record || !quantity || !reason.trim() || quantity > outstanding,
            primary: true,
          },
        ]}
      />
    </Modal>
  )
}

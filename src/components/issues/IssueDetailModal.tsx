"use client"

/**
 * Issue record detail: one record, the whole chain.
 *
 * Stage tracker, the requirement, what was issued, what was actually consumed,
 * the inventory transaction that moved stock, traceability back to origin and
 * the transaction history. The next action is the only action offered.
 */

import { POSTING_POINT_LABEL } from "@/config/issue-process"
import { Modal } from "@/components/incoming/StageModals"
import { plantAsset } from "@/lib/assets/plant-assets"
import { gradeEntry, locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { consumingArea, materialRoute } from "@/lib/issues/catalog"
import { CONSUMPTION_CATEGORY_META } from "@/lib/issues/consumption"
import { traceBack } from "@/lib/issues/trace"
import {
  ISSUE_STATUS_LABEL,
  ISSUE_STATUS_TONE,
  inventoryTransactionId,
  nextAction,
  netConsumedQty,
  returnableQty,
  returnedQty,
  unconsumedQty,
  type IssueRecord,
  materialCost,
} from "@/lib/issues/types"
import { toneText } from "@/lib/theme/tone"
import { useIssues } from "./issue-store"
import { TraceChain, stamp } from "./TraceabilityView"

export function IssueDetailModal({
  record,
  onClose,
  onAdvance,
  onReturn,
  onTrace,
}: {
  record: IssueRecord
  onClose: () => void
  onAdvance: () => void
  onReturn: () => void
  onTrace: (id: string) => void
}) {
  const { ledger, canWriteInventory, stockAt, traceContext } = useIssues()
  const material = materialEntry(record.materialId)
  const tone = ISSUE_STATUS_TONE[record.status]
  const txnId = inventoryTransactionId(record)
  const txn = txnId ? ledger.find((t) => t.txnId === txnId) : undefined
  const route = materialRoute(record.sourceLocationId, record.consumingAreaId)
  const unconsumed = unconsumedQty(record)
  const returned = returnedQty(record)
  const netConsumed = netConsumedQty(record)
  // Material can come back only from what actually left stock — the same rule the store enforces.
  const canReturn = returnableQty(record) > 0
  const done = record.status === "CONSUMED"
  const stock = stockAt(record.sourceInventoryId, record.issueId)
  const shortage =
    (record.status === "REQUESTED" || record.status === "APPROVED") &&
    stock !== null &&
    record.requestedQty > stock.available

  const stages: Array<{ label: string; done: boolean; at?: string; note?: string }> = [
    { label: "Requested", done: true, at: record.createdAt },
    ...(record.approvalRequired
      ? [{ label: "Approved", done: Boolean(record.approval), at: record.approval?.at }]
      : []),
    { label: "Issued", done: Boolean(record.issue), at: record.issue?.at },
    { label: "Consumed", done: Boolean(record.consumption), at: record.consumption?.at },
    {
      label: "Posted",
      done: Boolean(record.consumption),
      at: record.consumption?.at,
      note: txnId,
    },
  ]
  const currentIndex = stages.findIndex((s) => !s.done)

  const steps = traceBack(record, traceContext)
  const ref = record.consumption?.productionRef || record.productionRef

  return (
    <Modal
      title={record.issueId}
      subtitle={[record.consumption?.consumptionId, ref].filter(Boolean).join(" · ") || undefined}
      onClose={onClose}
      width={760}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink">{material?.name ?? record.materialId}</span>
        <span className="text-[13px] text-ink-2">
          {record.sourceLocationId} → {consumingArea(record.consumingAreaId)?.name}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-semibold"
          style={{ color: toneText(tone), background: `${tone}1f` }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
          {ISSUE_STATUS_LABEL[record.status]}
        </span>
        {shortage && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-crit/10 px-2 py-[2px] text-[11px] font-semibold text-ink ring-1 ring-crit/50">
            <span aria-hidden className="h-2 w-2 rounded-full bg-crit" />
            Shortage — hold
          </span>
        )}
        <span className="ml-auto rounded bg-demo px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-demo-ink">
          Demo
        </span>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-[210px_minmax(0,1fr)]">
        {/* Stage tracker */}
        <ol className="rounded-lg bg-panel-2 p-3.5">
          {stages.map((s, i) => (
            <li key={s.label} className="flex items-start gap-2.5 py-1">
              <span
                aria-hidden
                className="mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                style={{
                  background: s.done ? "var(--color-ok)" : "transparent",
                  border: `1.5px solid ${s.done ? "var(--color-ok)" : "var(--color-line-2)"}`,
                  color: s.done ? "var(--color-panel)" : "var(--color-ink-3)",
                }}
              >
                {s.done ? "✓" : "○"}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-[13px] ${i === currentIndex ? "font-bold text-ink" : s.done ? "text-ink" : "text-ink-3"}`}
                >
                  {s.label}
                  {i === currentIndex && <span className="ml-1.5 text-[11px] font-normal text-ink-3">next</span>}
                </span>
                {s.at && s.done && <span className="block text-[10.5px] text-ink-3">{stamp(s.at)}</span>}
                {s.note && s.done && <span className="block font-mono text-[10.5px] text-ink-3">{s.note}</span>}
              </span>
            </li>
          ))}
        </ol>

        {/* Issue vs consumption */}
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-panel-2 p-3 sm:grid-cols-3">
            <Big label="Requested" value={`${record.requestedQty.toLocaleString()} ${record.uom}`} />
            <Big label="Issued" value={record.issue ? `${record.issue.issuedQty.toLocaleString()} ${record.uom}` : "—"} />
            <Big
              label="Gross Consumed"
              value={record.consumption ? `${record.consumption.consumedQty.toLocaleString()} ${record.uom}` : "—"}
            />
            <Big label="Returned" value={returned ? `${returned.toLocaleString()} ${record.uom}` : "—"} />
            <Big
              label="Net Consumed"
              value={netConsumed === null ? "—" : `${netConsumed.toLocaleString()} ${record.uom}`}
              strong
            />
            <Big
              label="Category"
              value={record.consumption ? CONSUMPTION_CATEGORY_META[record.consumption.category].label : "—"}
            />
          </div>
          {returned > 0 && (
            <p className="text-[12px] text-ink-2">
              Net consumption is gross outward minus returns: {record.consumption?.consumedQty.toLocaleString() ?? 0} −{" "}
              {returned.toLocaleString()} = {(netConsumed ?? 0).toLocaleString()} {record.uom}. Each return posted back into{" "}
              {record.sourceInventoryId} as its own transaction.
            </p>
          )}
          {unconsumed !== null && unconsumed !== 0 && (
            <p className="text-[12px] text-ink-2">
              <span className="font-semibold text-ink">
                {unconsumed.toLocaleString()} {record.uom} not yet consumed.
              </span>{" "}
              {record.postingPoint === "ISSUE"
                ? "It left inventory at issue and is not counted as consumed."
                : "It was never posted out of inventory, so it remains in the source balance."}
            </p>
          )}
          <div className="text-[12px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Material movement</div>
            <div className="text-ink-2">
              {route ? (
                route.map((s, i) => (
                  <span key={s.nodeId}>
                    {i > 0 && <span className="px-1.5 text-ink-3">→</span>}
                    {i === 0 ? s.nodeId : s.name}
                  </span>
                ))
              ) : (
                <span className="text-ink-3">No route for this source and area in the plant model.</span>
              )}
            </div>
          </div>
          <div className="text-[12px]">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Inventory impact</div>
            {txn ? (
              <div className="font-mono text-ink">
                {txn.txnId} · {txn.quantity.toLocaleString()} {txn.uom} · {txn.locationId}{" "}
                {Math.round(txn.balanceBefore).toLocaleString()} → {Math.round(txn.balanceAfter).toLocaleString()}
              </div>
            ) : txnId ? (
              <div className="text-ink-2">
                <span className="font-mono text-ink">{txnId}</span> — historical transaction, predates this
                session&apos;s ledger
              </div>
            ) : (
              <div className="text-ink-2">
                Not yet posted. Inventory posts {POSTING_POINT_LABEL[record.postingPoint]}.
              </div>
            )}
          </div>
        </div>
      </div>

      <Section title="Record">
        <Grid>
          <Item label="Issue ID" value={record.issueId} mono />
          <Item label="Consumption ID" value={record.consumption?.consumptionId ?? "—"} mono />
          <Item label="Inventory Transaction" value={txnId ?? "—"} mono />
          <Item label="Material" value={`${material?.name ?? record.materialId} · ${material?.code ?? ""}`} />
          <Item label="Category" value={material?.group ?? "—"} />
          <Item label="Grade" value={gradeEntry(record.gradeId)?.name ?? "Not set"} />
          <Item label="Lot / Batch" value={record.lotId ?? record.batch ?? (material?.lotTracking ? "Not recorded" : "Not lot-tracked")} mono />
          <Item
            label="Plant Asset"
            value={record.assetId ? `${plantAsset(record.assetId)?.name ?? record.assetId} · ${record.assetId}` : "Not applicable"}
          />
          {record.maintenanceRef && <Item label="Maintenance Reference" value={record.maintenanceRef} mono />}
          {record.consumption?.unitCost !== undefined && record.consumption.category === "SPARE" && (
            <Item
              label="Material Cost"
              value={`$${(materialCost(record) ?? 0).toLocaleString()} (${(netConsumedQty(record) ?? 0).toLocaleString()} ${record.uom} × $${record.consumption.unitCost.toLocaleString()})`}
            />
          )}
          <Item
            label="Consumption Category"
            value={record.consumption ? CONSUMPTION_CATEGORY_META[record.consumption.category].label : "Not yet consumed"}
          />
          <Item label="Description" value={material?.description ?? "—"} span />
          <Item
            label="Source Location"
            value={locationEntry(record.sourceLocationId)?.name ?? record.sourceLocationId}
          />
          <Item label="Inventory ID" value={record.sourceInventoryId} mono />
          <Item
            label="Consuming Area"
            value={consumingArea(record.consumption?.consumingAreaId ?? record.consumingAreaId)?.name ?? "—"}
          />
          <Item label="Production Reference" value={ref || "—"} mono />
          <Item label="PO" value={record.origin?.poNumber ?? "Not linked"} mono />
          <Item label="Incoming ID" value={record.origin?.incomingId ?? "Not linked"} mono />
          <Item label="Reason" value={record.reason || "—"} />
          <Item label="Approval" value={record.approvalRequired ? (record.approval ? `${record.approval.by}` : "Pending") : "Not required"} />
          {record.consumption && <Item label="Consumed At" value={stamp(record.consumption.at)} />}
          {record.notes && <Item label="Notes" value={record.notes} span />}
          {record.consumption?.comments && <Item label="Comments" value={record.consumption.comments} span />}
        </Grid>
      </Section>

      <Section
        title="Traceability"
        action={
          <button onClick={() => onTrace(record.issueId)} className="text-[11.5px] font-medium text-accent hover:underline">
            Open in Traceability
          </button>
        }
      >
        <div className="rounded-lg bg-panel-2 p-3.5">
          <TraceChain steps={steps} onFollow={onTrace} />
        </div>
      </Section>

      <Section title="Transaction History">
        <ul className="space-y-1.5">
          {[...record.audit].reverse().map((a, i) => (
            <li key={i} className="text-[12px] leading-relaxed">
              <span className="text-ink-3">{stamp(a.at)}</span>{" "}
              <span className="font-mono text-[11px] text-ink-3">{a.by}</span>
              <div className="text-ink">
                {a.action}
                {a.from && a.to && (
                  <span className="text-ink-3">
                    {" "}
                    · {ISSUE_STATUS_LABEL[a.from]} → {ISSUE_STATUS_LABEL[a.to]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line"
        >
          Close
        </button>
        {canWriteInventory && canReturn && (
          <button
            onClick={onReturn}
            className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line"
          >
            Return Material
          </button>
        )}
        {canWriteInventory && (
          <button
            onClick={onAdvance}
            disabled={done}
            className="flex-1 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
          >
            {nextAction(record)}
          </button>
        )}
      </div>
    </Modal>
  )
}

function Big({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`font-mono text-[15px] ${strong ? "font-bold text-ink" : "text-ink"}`}>{value}</div>
    </div>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-5">
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

function Item({ label, value, mono, span }: { label: string; value: string; mono?: boolean; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 sm:col-span-3" : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`text-[13px] text-ink ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  )
}

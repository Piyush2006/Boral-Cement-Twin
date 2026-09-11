"use client"

/**
 * Traceability — any ID in the chain, traced in whichever direction it leads.
 *
 * Backward from an issue, consumption or transaction through inventory to the
 * receipt and PO; forward from a PO or incoming receipt to every issue and
 * consumption that drew on it; both ways from an Inventory ID.
 */

import { useEffect, useState } from "react"

import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { consumingArea } from "@/lib/issues/catalog"
import { recordLimits, recordStatus } from "@/lib/inventory/status"
import { StatusBadge } from "@/components/inventory/StatusBadge"
import type { InventoryTrace, LinkState, TraceResult, TraceStep } from "@/lib/issues/trace"
import { ISSUE_STATUS_LABEL, ISSUE_STATUS_TONE, inventoryTransactionId, type IssueRecord } from "@/lib/issues/types"
import { toneText } from "@/lib/theme/tone"
import { useIssues } from "./issue-store"

const STATE_LABEL: Record<LinkState, string | null> = {
  linked: null,
  pending: "Pending",
  "not-linked": "Not linked",
  "not-recorded": "Not recorded",
  "not-applicable": "Not applicable",
}

export function TraceChain({
  steps,
  onFollow,
}: {
  steps: TraceStep[]
  onFollow?: (id: string) => void
}) {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const linked = step.state === "linked"
        const last = i === steps.length - 1
        return (
          <li key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
            {/* Connector */}
            {!last && (
              <span
                aria-hidden
                className="absolute left-[7px] top-[18px] bottom-0 w-px"
                style={{ background: linked ? "var(--color-line-2)" : "var(--color-line)" }}
              />
            )}
            <span
              aria-hidden
              className="relative mt-[3px] h-[15px] w-[15px] shrink-0 rounded-full"
              style={{
                background: linked ? "var(--color-accent)" : "transparent",
                border: `2px solid ${linked ? "var(--color-accent)" : "var(--color-line-2)"}`,
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                  {step.label}
                </span>
                {STATE_LABEL[step.state] && (
                  <span className="rounded bg-panel-2 px-1.5 py-[1px] text-[10px] font-semibold text-ink-2 ring-1 ring-line">
                    {STATE_LABEL[step.state]}
                  </span>
                )}
                {step.at && <span className="ml-auto text-[11px] text-ink-3">{stamp(step.at)}</span>}
              </div>
              <div className="text-[13px]">
                {step.followId && onFollow ? (
                  <button
                    onClick={() => onFollow(step.followId!)}
                    className="font-mono font-semibold text-accent hover:underline"
                    title={`Trace ${step.followId}`}
                  >
                    {step.value}
                  </button>
                ) : (
                  <span className={linked ? "font-semibold text-ink" : "text-ink-2"}>{step.value}</span>
                )}
              </div>
              {step.detail && <div className="text-[11.5px] text-ink-3">{step.detail}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function TraceabilityView({
  initialQuery,
  onOpenIssue,
}: {
  initialQuery: string
  onOpenIssue: (issueId: string) => void
}) {
  const { trace } = useIssues()
  const [entry, setEntry] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)

  useEffect(() => {
    setEntry(initialQuery)
    setQuery(initialQuery)
  }, [initialQuery])

  const follow = (id: string) => {
    setEntry(id)
    setQuery(id)
  }
  const result: TraceResult | null = query ? trace(query) : null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(entry)
          }}
          className="mb-3 flex gap-2"
        >
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            aria-label="Trace an ID"
            placeholder="PO, GE, GRN, IN, LOT, Inventory ID, ISS, CON, RET or TX…"
            className="min-w-0 flex-1 rounded-lg bg-panel px-3 py-2 font-mono text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:font-sans placeholder:text-ink-3 focus:ring-accent"
          />
          <button className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-ink hover:brightness-110">
            Trace
          </button>
        </form>
        <div className="rounded-xl bg-panel p-4 text-[12px] leading-relaxed text-ink-2 ring-1 ring-line">
          <p className="mb-2 font-semibold text-ink">Two questions, both directions</p>
          <p className="mb-2">
            <span className="text-ink">Where did this stock come from?</span> Trace an Issue ID,
            Consumption ID or transaction back through inventory to the incoming receipt and the PO.
          </p>
          <p className="mb-2">
            <span className="text-ink">Where was this stock used?</span> Trace a PO, Gate Entry, GRN or Incoming ID
            forward to the issues and consumption that drew on it.
          </p>
          <p className="mb-2">
            <span className="text-ink">Both at once:</span> trace an Inventory ID (e.g. RM-AF-006).
          </p>
          <p className="text-ink-3">
            Stockpiles blend deliveries. A draw is linked to a receipt only where one was recorded at
            issue; otherwise receipts into that inventory record are shown as possible origins, never
            as a link.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-panel p-4 ring-1 ring-line">
        {!result && <p className="text-[12.5px] text-ink-3">Enter an ID to see its chain.</p>}

        {result?.kind === "none" && <p className="text-[12.5px] text-ink-2">{result.message}</p>}

        {result?.kind === "backward" && (
          <>
            <ResultHeader
              title={`Traced from ${result.issue.issueId}`}
              issue={result.issue}
              onOpenIssue={onOpenIssue}
            />
            <TraceChain steps={result.steps} onFollow={follow} />
          </>
        )}

        {result?.kind === "matches" && (
          <>
            <h3 className="mb-2 text-[13px] font-bold text-ink">
              {result.issues.length} issues under {result.query}
            </h3>
            <IssueList issues={result.issues} onPick={follow} />
          </>
        )}

        {result?.kind === "forward" && (
          <>
            <h3 className="mb-3 text-[13px] font-bold text-ink">Traced forward from {result.query}</h3>
            {result.pending.map((r) => (
              <p key={r.incomingId} className="mb-3 text-[12px] text-ink-2">
                <span className="font-mono text-ink">{r.incomingId}</span> is not yet received — no
                stock has entered inventory from it.
              </p>
            ))}
            {result.receipts.map(({ incoming, linked, unlinkedSameRecord }) => (
              <div key={incoming.incomingId} className="mb-4 last:mb-0">
                <div className="mb-2 rounded-lg bg-panel-2 p-3 text-[12px] ring-1 ring-line">
                  <div className="flex flex-wrap gap-x-3">
                    <span className="font-mono font-semibold text-ink">{incoming.poNumber}</span>
                    <span className="font-mono text-ink-2">{incoming.incomingId}</span>
                    <span className="text-ink-2">
                      {materialEntry(incoming.materialId)?.name ?? incoming.materialId}
                    </span>
                    <span className="ml-auto text-ink-3">{stamp(incoming.receipt!.at)}</span>
                  </div>
                  <div className="mt-1 text-ink-3">
                    {incoming.receipt!.receivedMt.toLocaleString()} MT received into{" "}
                    <button onClick={() => follow(incoming.receipt!.inventoryId)} className="font-mono text-accent hover:underline">
                      {incoming.receipt!.inventoryId}
                    </button>{" "}
                    ({locationEntry(incoming.receipt!.locationId)?.name ?? incoming.receipt!.locationId}) ·{" "}
                    {incoming.receipt!.transactionId}
                    {incoming.batch && ` · Batch ${incoming.batch}`}
                  </div>
                </div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
                  Issues linked to this receipt
                </div>
                {linked.length ? (
                  <IssueList issues={linked} onPick={follow} />
                ) : (
                  <p className="mb-2 text-[12px] text-ink-3">None recorded.</p>
                )}
                {unlinkedSameRecord.length > 0 && (
                  <>
                    <div className="mb-1 mt-3 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
                      Later draws from the same inventory, origin not recorded
                    </div>
                    <IssueList issues={unlinkedSameRecord} onPick={follow} />
                  </>
                )}
              </div>
            ))}
          </>
        )}

        {result?.kind === "inventory" && <InventoryTraceView trace={result.trace} onFollow={follow} />}
      </div>
    </div>
  )
}

function ResultHeader({
  title,
  issue,
  onOpenIssue,
}: {
  title: string
  issue: IssueRecord
  onOpenIssue: (issueId: string) => void
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[13px] font-bold text-ink">{title}</h3>
      <button
        onClick={() => onOpenIssue(issue.issueId)}
        className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-ink-2 ring-1 ring-line hover:text-ink"
      >
        Open record
      </button>
    </div>
  )
}

function IssueList({ issues, onPick }: { issues: IssueRecord[]; onPick: (id: string) => void }) {
  return (
    <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
      {issues.map((i) => {
        const tone = ISSUE_STATUS_TONE[i.status]
        return (
          <li key={i.issueId}>
            <button
              onClick={() => onPick(i.issueId)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left text-[12px] hover:bg-panel-2"
            >
              <span className="font-mono font-semibold text-ink">{i.issueId}</span>
              {i.consumption && <span className="font-mono text-ink-2">{i.consumption.consumptionId}</span>}
              <span className="text-ink-2">{consumingArea(i.consumingAreaId)?.name}</span>
              {i.productionRef && <span className="text-ink-3">{i.productionRef}</span>}
              {inventoryTransactionId(i) && <span className="font-mono text-[11px] text-ink-3">{inventoryTransactionId(i)}</span>}
              <span className="ml-auto font-mono text-ink">
                {i.consumption
                  ? `${i.consumption.consumedQty.toLocaleString()} ${i.uom} consumed`
                  : i.issue
                    ? `${i.issue.issuedQty.toLocaleString()} ${i.uom} issued`
                    : `${i.requestedQty.toLocaleString()} ${i.uom} requested`}
              </span>
              <span className="font-semibold" style={{ color: toneText(tone) }}>
                {ISSUE_STATUS_LABEL[i.status]}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function InventoryTraceView({ trace, onFollow }: { trace: InventoryTrace; onFollow: (id: string) => void }) {
  const { record, receipts, adjustmentsIn, issues, adjustmentsOut } = trace
  const material = materialEntry(record.materialId)
  const fmt = (n: number) => Math.round(n).toLocaleString()
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold text-ink">Inventory {record.inventoryId}</h3>
        <span className="text-[12px] text-ink-2">
          {material?.name ?? record.materialId} · {locationEntry(record.locationId)?.name ?? record.locationId}
        </span>
        <span className="ml-auto font-mono text-[12.5px] font-semibold text-ink">
          {fmt(record.quantity)} {record.uom}
        </span>
        <StatusBadge status={recordStatus(record)} />
      </div>
      <div className="mb-3 text-[11.5px] text-ink-3">
        Min {fmt(recordLimits(record).minStock)} · Max {fmt(recordLimits(record).maxStock)} {record.uom}
        {record.batch ? ` · Batch ${record.batch}` : ""}
        {record.expiryDate
          ? ` · ${new Date(record.expiryDate).getTime() < Date.now() ? "Expired" : "Expires"} ${new Date(record.expiryDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}`
          : ""}
        {!record.active ? " · Archived" : ""}
      </div>

      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Where did this stock come from?</div>
      {receipts.length === 0 && adjustmentsIn.length === 0 && <p className="mb-3 text-[12px] text-ink-3">No receipts or adjustments in.</p>}
      <ul className="mb-4 divide-y divide-line rounded-lg ring-1 ring-line">
        {receipts.map((r) => (
          <li key={r.incomingId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[12px]">
            <button onClick={() => onFollow(r.poNumber)} className="font-mono font-semibold text-accent hover:underline">
              {r.poNumber}
            </button>
            <span className="text-ink-3">→</span>
            <button onClick={() => onFollow(r.incomingId)} className="font-mono text-accent hover:underline">
              {r.incomingId}
            </button>
            <span className="text-ink-2">{r.supplier}</span>
            {r.receipt!.expiryDate && (
              <span className="text-[11px] text-ink-3">
                expires {new Date(r.receipt!.expiryDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
            <span className="ml-auto font-mono text-ink">
              +{fmt(r.receipt!.receivedMt)} {record.uom}
            </span>
            <span className="font-mono text-[11px] text-ink-3">{r.receipt!.transactionId}</span>
            <span className="text-[11px] text-ink-3">{stamp(r.receipt!.at)}</span>
          </li>
        ))}
        {adjustmentsIn.map((t) => (
          <li key={t.txnId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[12px]">
            <span className="font-mono font-semibold text-ink">{t.links.adjustmentId ?? t.txnId}</span>
            <span className="text-ink-2">{t.reason ?? "Manual adjustment in"}</span>
            <span className="ml-auto font-mono text-ink">+{fmt(t.quantity)} {t.uom}</span>
            <span className="font-mono text-[11px] text-ink-3">{t.txnId}</span>
            <span className="text-[11px] text-ink-3">{stamp(t.at)}</span>
          </li>
        ))}
      </ul>

      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Where was this stock used?</div>
      {issues.length === 0 && adjustmentsOut.length === 0 && <p className="text-[12px] text-ink-3">No issues or adjustments out.</p>}
      {issues.length > 0 && <IssueList issues={issues} onPick={onFollow} />}
      {adjustmentsOut.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
          {adjustmentsOut.map((t) => (
            <li key={t.txnId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[12px]">
              <span className="font-mono font-semibold text-ink">{t.links.adjustmentId ?? t.txnId}</span>
              <span className="text-ink-2">{t.reason ?? "Manual adjustment out"}</span>
              <span className="ml-auto font-mono text-ink">{fmt(t.quantity)} {t.uom}</span>
              <span className="font-mono text-[11px] text-ink-3">{t.txnId}</span>
              <span className="text-[11px] text-ink-3">{stamp(t.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

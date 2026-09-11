"use client"

/**
 * Issue & Consumption — the module's main screen.
 *
 * An operational worklist, not a dashboard: one row per issue, from production
 * requirement to posted consumption, plus a traceability view. Nothing here
 * calculates inventory; stock moves through the existing ledger.
 */

import { useEffect, useMemo, useState } from "react"

import { ISSUE_PROCESS, POSTING_POINT_LABEL } from "@/config/issue-process"
import { locationEntry, materialEntry, storageLocations } from "@/lib/inventory/catalog"
import { useMasters } from "@/lib/masters/useMasters"
import { consumingArea, consumingAreas } from "@/lib/issues/catalog"
import {
  ISSUE_STATUSES,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUS_TONE,
  type IssueRecord,
  type IssueStatus,
} from "@/lib/issues/types"
import { toneText } from "@/lib/theme/tone"
import { IssueDetailModal } from "./IssueDetailModal"
import { ConsumptionModal, CreateIssueModal, IssueMaterialModal, ReturnMaterialModal } from "./IssueModals"
import { useIssues } from "./issue-store"
import { TraceabilityView } from "./TraceabilityView"
import { ReturnsView } from "./ReturnsView"
import { AddedBanner, useJustAdded } from "@/components/shell/just-added"

type Tab = "worklist" | "returns" | "trace"
type Dialog = "create" | "issue" | "consume" | "return" | null

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })

export function IssueScreen() {
  const { records, open, setOpenId, approveIssue, countByStatus, canWriteInventory, stockAt, traceRequest } = useIssues()
  const masters = useMasters()
  const sourceLocations = useMemo(() => storageLocations(), [masters.locations])

  const [tab, setTab] = useState<Tab>("worklist")
  const [traceQuery, setTraceQuery] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"" | IssueStatus>("")
  const [materialId, setMaterialId] = useState("")
  const [source, setSource] = useState("")
  const [area, setArea] = useState("")
  const [day, setDay] = useState("")
  const added = useJustAdded()
  /** After a save: close the form and show the result in the list, not a detail screen. */
  const clearFilters = () => {
    setQuery("")
    setStatus("")
    setMaterialId("")
    setSource("")
    setArea("")
    setDay("")
  }
  const showInWorklist = (r: IssueRecord, message: string) => {
    setDialog(null)
    setOpenId(null)
    setTab("worklist")
    clearFilters()
    added.mark(r.issueId, message)
  }
  const showReturn = (r: IssueRecord) => {
    const ret = r.returns?.at(-1)
    const m = materialEntry(r.materialId)
    const message = `Return ${ret?.returnId ?? ""} posted — ${ret ? ret.quantity.toLocaleString() : ""} ${r.uom} of ${m?.name ?? r.materialId} back to ${r.sourceInventoryId} against ${r.issueId}${ret?.transactionId ? ` (${ret.transactionId})` : ""}.`
    setDialog(null)
    setOpenId(null)
    if (tab === "returns" && ret) added.mark(ret.returnId, message)
    else showInWorklist(r, message)
  }
  const [dialog, setDialog] = useState<Dialog>(null)
  const [consumeFor, setConsumeFor] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)

  const statuses = ISSUE_PROCESS.approvalRequired
    ? ISSUE_STATUSES
    : ISSUE_STATUSES.filter((s) => s !== "APPROVED" || countByStatus.APPROVED > 0)

  const materials = useMemo(
    () => Array.from(new Set(records.map((r) => r.materialId))).map((id) => materialEntry(id)!).filter(Boolean),
    [records],
  )
  const days = useMemo(() => Array.from(new Set(records.map((r) => dayKey(r.createdAt)))), [records])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter((r) => {
      if (status && r.status !== status) return false
      if (materialId && r.materialId !== materialId) return false
      if (source && r.sourceLocationId !== source) return false
      if (area && (r.consumption?.consumingAreaId ?? r.consumingAreaId) !== area) return false
      if (day && dayKey(r.createdAt) !== day) return false
      if (!q) return true
      const m = materialEntry(r.materialId)
      return [
        r.issueId,
        r.consumption?.consumptionId,
        r.origin?.poNumber,
        r.origin?.incomingId,
        r.sourceInventoryId,
        r.batch,
        r.productionRef,
        r.issue?.transactionId,
        r.consumption?.transactionId,
        m?.name,
        m?.code,
      ].some((v) => v?.toLowerCase().includes(q))
    })
  }, [records, query, status, materialId, source, area, day])

  const filtersOn = query || status || materialId || source || area || day

  const showTrace = (id: string) => {
    setOpenId(null)
    setTraceQuery(id)
    setTab("trace")
  }

  // Another module (Inventory, Incoming) asked for a trace: show it.
  useEffect(() => {
    if (traceRequest) showTrace(traceRequest.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceRequest])

  /** Advance the open record by the one action it is waiting on. */
  const advance = () => {
    if (!open) return
    setNotice(null)
    if (open.status === "REQUESTED" && open.approvalRequired) {
      const res = approveIssue(open.issueId)
      if (!res.ok) setNotice(res.error)
    } else if (open.status === "REQUESTED" || open.status === "APPROVED") {
      setDialog("issue")
    } else if (open.status === "ISSUED") {
      setConsumeFor(open.issueId)
      setDialog("consume")
    }
  }

  const isShort = (r: IssueRecord) => {
    if (r.status !== "REQUESTED" && r.status !== "APPROVED") return false
    const stock = stockAt(r.sourceInventoryId, r.issueId)
    return stock !== null && r.requestedQty > stock.available
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-bg pt-[86px]">
      <div className="mx-auto max-w-[1400px] px-6 pb-10">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-ink">Issue &amp; Consumption</h1>
            <p className="text-[12px] text-ink-3">
              {rows.length} of {records.length} issues ·{" "}
              {statuses.map((s) => `${countByStatus[s]} ${ISSUE_STATUS_LABEL[s].toLowerCase()}`).join(" · ")} ·
              inventory posts {POSTING_POINT_LABEL[ISSUE_PROCESS.inventoryPostingPoint]} · approval{" "}
              {ISSUE_PROCESS.approvalRequired ? "required" : "not required"}
            </p>
          </div>
          {canWriteInventory ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConsumeFor(undefined)
                  setDialog("consume")
                }}
                className="rounded-lg bg-panel px-4 py-2.5 text-[13px] font-semibold text-accent ring-1 ring-accent/60 hover:bg-panel-2"
              >
                + Record Consumption
              </button>
              <button
                onClick={() => setDialog("create")}
                className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110"
              >
                + Create Issue
              </button>
            </div>
          ) : (
            <span className="rounded-lg bg-panel-2 px-3.5 py-2 text-[12px] text-ink-3 ring-1 ring-line">
              Read-only access
            </span>
          )}
        </header>

        <div role="tablist" aria-label="Issue sections" className="mb-4 flex gap-6 border-b border-line">
          {(
            [
              { id: "worklist", label: "Issues & Consumption" },
              { id: "returns", label: "Returns" },
              { id: "trace", label: "Traceability" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-1 pb-2.5 text-[13px] font-semibold transition-colors ${
                tab === t.id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AddedBanner added={added} />

        {notice && (
          <p role="alert" className="mb-3 rounded-md border border-crit/50 bg-crit/10 p-2.5 text-[12px] text-ink">
            {notice}
          </p>
        )}

        {tab === "trace" ? (
          <TraceabilityView initialQuery={traceQuery} onOpenIssue={(id) => setOpenId(id)} />
        ) : tab === "returns" ? (
          <ReturnsView
            added={added}
            onRecordReturn={() => {
              setOpenId(null)
              setDialog("return")
            }}
            onReturnFor={(id) => {
              setOpenId(id)
              setDialog("return")
            }}
            onOpenIssue={(id) => setOpenId(id)}
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-3"
                >
                  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="m16 16 4 4" />
                  </g>
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search issues"
                  placeholder="Search Material, Inventory ID, Issue ID, Consumption ID, PO or Production Ref…"
                  className="w-full rounded-lg bg-panel px-3 py-2 pl-9 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
                />
              </div>
              <Select value={status} onChange={(v) => setStatus(v as IssueStatus | "")} label="Status">
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {ISSUE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
              <Select value={materialId} onChange={setMaterialId} label="Material">
                {materials.map((m) => (
                  <option key={m.materialId} value={m.materialId}>
                    {m.name}
                  </option>
                ))}
              </Select>
              <Select value={source} onChange={setSource} label="Source Location">
                {sourceLocations.map((l) => (
                  <option key={l.locationId} value={l.locationId}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Select value={area} onChange={setArea} label="Consuming Area">
                {consumingAreas().map((a) => (
                  <option key={a.areaId} value={a.areaId}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select value={day} onChange={setDay} label="Date">
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              {filtersOn && (
                <button
                  onClick={() => {
                    setQuery("")
                    setStatus("")
                    setMaterialId("")
                    setSource("")
                    setArea("")
                    setDay("")
                  }}
                  className="rounded-lg px-3 py-2 text-[12px] text-ink-2 ring-1 ring-line hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
              <table className="w-full min-w-[1180px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-panel-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                    <Th>Issue ID</Th>
                    <Th>Material</Th>
                    <Th>Source</Th>
                    <Th className="text-right">Issued Qty</Th>
                    <Th className="text-right">Consumed Qty</Th>
                    <Th>Consuming Area</Th>
                    <Th>Production Ref</Th>
                    <Th>PO No.</Th>
                    <Th>Status</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const m = materialEntry(r.materialId)
                    const tone = ISSUE_STATUS_TONE[r.status]
                    const short = isShort(r)
                    const diff = r.issue && r.consumption ? r.issue.issuedQty - r.consumption.consumedQty : null
                    return (
                      <tr
                        key={r.issueId}
                        data-added-key={r.issueId}
                        className={`cursor-pointer border-t border-line bg-panel/60 hover:bg-panel-2 ${added.rowClass(r.issueId)}`}
                        onClick={() => setOpenId(r.issueId)}
                      >
                        <Td>
                          <span className="block font-mono text-ink">{r.issueId}</span>
                          {r.consumption && (
                            <span className="block font-mono text-[11px] text-ink-3">{r.consumption.consumptionId}</span>
                          )}
                        </Td>
                        <Td>
                          <span className="block text-ink">{m?.name ?? r.materialId}</span>
                          <span className="block text-[11px] text-ink-3">{m?.code}</span>
                        </Td>
                        <Td className="text-ink-2">
                          <span className="block font-mono text-[12px] text-ink">{r.sourceInventoryId}</span>
                          <span className="block text-[11px] text-ink-3">{locationEntry(r.sourceLocationId)?.name ?? r.sourceLocationId}</span>
                        </Td>
                        <Td className="text-right font-mono text-ink">
                          {r.issue ? (
                            `${r.issue.issuedQty.toLocaleString()} ${r.uom}`
                          ) : (
                            <span className="text-[11.5px] text-ink-3">
                              {r.requestedQty.toLocaleString()} {r.uom} req.
                            </span>
                          )}
                        </Td>
                        <Td className="text-right font-mono text-ink">
                          {r.consumption ? (
                            <>
                              <span className="block">
                                {r.consumption.consumedQty.toLocaleString()} {r.uom}
                              </span>
                              {diff !== null && diff !== 0 && (
                                <span className="block text-[11px] text-ink-3">
                                  {diff.toLocaleString()} not consumed
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </Td>
                        <Td className="text-ink-2">
                          {consumingArea(r.consumption?.consumingAreaId ?? r.consumingAreaId)?.name}
                        </Td>
                        <Td className="font-mono text-ink-2">
                          {r.consumption?.productionRef || r.productionRef || <span className="font-sans text-ink-3">—</span>}
                        </Td>
                        <Td className="font-mono text-ink-2">
                          {r.origin?.poNumber ?? <span className="font-sans text-ink-3">—</span>}
                        </Td>
                        <Td>
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-semibold"
                            style={{ color: toneText(tone), background: `${tone}1f` }}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
                            {ISSUE_STATUS_LABEL[r.status]}
                          </span>
                          {short && (
                            <span className="mt-1 block text-[11px] font-semibold text-crit">Shortage — hold</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-ink-3">
                          {new Date(r.consumption?.at ?? r.issue?.at ?? r.createdAt).toLocaleString("en-AU", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </Td>
                        <Td className="text-right">
                          <span className="text-[12px] font-medium text-accent">Open</span>
                        </Td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="border-t border-line py-8 text-center text-ink-3">
                        No issues match those filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-ink-3">
              Issues and origin links are demo data. Stock moves only through the inventory transaction
              ledger; every issued or consumed quantity has its transaction in Inventory › Transactions.
              Production / process reference is optional.
            </p>
          </>
        )}
      </div>

      {dialog === "create" && (
        <CreateIssueModal
          onClose={() => setDialog(null)}
          onCreated={(r) => {
            const m = materialEntry(r.materialId)
            showInWorklist(
              r,
              `Issue ${r.issueId} created — ${r.requestedQty.toLocaleString()} ${r.uom} ${m?.name ?? r.materialId} from ${r.sourceInventoryId}, ${
                r.status === "ISSUED" ? "issued. Next: record consumption." : "requested. Next: issue the material."
              }`,
            )
          }}
        />
      )}

      {open && !dialog && (
        <IssueDetailModal
          record={open}
          onClose={() => {
            setOpenId(null)
            setNotice(null)
          }}
          onAdvance={advance}
          onTrace={showTrace}
          onReturn={() => setDialog("return")}
        />
      )}

      {/* Record Return from the Returns tab: the operator picks the issue. */}
      {!open && dialog === "return" && <ReturnMaterialModal onClose={() => setDialog(null)} onReturned={showReturn} />}

      {open && dialog === "return" && <ReturnMaterialModal record={open} onClose={() => setDialog(null)} onReturned={showReturn} />}

      {open && dialog === "issue" && <IssueMaterialModal record={open} onClose={() => setDialog(null)} />}

      {dialog === "consume" && (
        <ConsumptionModal
          initialIssueId={consumeFor}
          onClose={() => setDialog(null)}
          onPosted={(r) => {
            const c = r.consumption
            showInWorklist(
              r,
              `Consumption ${c?.consumptionId ?? ""} recorded — ${c ? c.consumedQty.toLocaleString() : ""} ${r.uom} against ${r.issueId}${
                c?.transactionId ? `, inventory transaction ${c.transactionId}` : ""
              }.`,
            )
          }}
        />
      )}
    </div>
  )
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="max-w-[220px] rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line focus:ring-accent"
    >
      <option value="">{label}: All</option>
      {children}
    </select>
  )
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 ${className}`}>{children}</th>
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>
}

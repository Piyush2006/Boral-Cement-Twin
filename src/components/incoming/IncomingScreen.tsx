"use client"

/**
 * Incoming Materials — the module's main screen.
 *
 * A worklist of incoming loads, each one record from PO identification through
 * to receipt. Nothing here calculates inventory; receipt posts through the
 * existing inventory transaction mechanism.
 */

import { useMemo, useState } from "react"

import { MATERIAL_GROUP_OPTIONS, SUPPLIERS } from "@/lib/incoming/catalog"
import { gradeEntry, materialEntry } from "@/lib/inventory/catalog"
import {
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  actualMt,
  type IncomingStatus,
  qualityState,
} from "@/lib/incoming/types"
import { IncomingDetailModal } from "./IncomingDetailModal"
import { IdentifyModal, QualityModal, ReceiptModal, WeighingModal } from "./StageModals"
import { AddedBanner, useJustAdded } from "@/components/shell/just-added"
import { useIncoming } from "./incoming-store"
import { toneText } from "@/lib/theme/tone"

/** Records are held by the shell's IncomingProvider, so they persist across modules. */
export function IncomingScreen() {
  return <Screen />
}

/** Which stage modal is open, if any. */
type Stage = "weighing" | "quality" | "receipt" | null

function Screen() {
  const { records, open, setOpenId, countByStatus, canWriteInventory } = useIncoming()

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"" | IncomingStatus>("")
  const [group, setGroup] = useState("")
  const [supplier, setSupplier] = useState("")
  const [identify, setIdentify] = useState<"QR" | "MANUAL" | null>(null)
  const [stage, setStage] = useState<Stage>(null)
  const added = useJustAdded()

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter((r) => {
      const material = materialEntry(r.materialId)
      if (status && r.status !== status) return false
      if (group && material?.group !== group) return false
      if (supplier && r.supplier !== supplier) return false
      if (!q) return true
      return (
        r.poNumber.toLowerCase().includes(q) ||
        r.incomingId.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        (material?.name ?? "").toLowerCase().includes(q) ||
        (material?.description ?? "").toLowerCase().includes(q)
      )
    })
  }, [records, query, status, group, supplier])

  /** Open the stage the record is actually waiting on. */
  const advance = () => {
    if (!open) return
    if (open.status === "IDENTIFIED") setStage("weighing")
    else if (open.status === "WEIGHING") setStage("quality")
    else if (open.status === "QUALITY" && open.quality?.result === "PASS") setStage("receipt")
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-bg pt-[86px]">
      <div className="mx-auto max-w-[1400px] px-6 pb-10">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-ink">Incoming Materials</h1>
            <p className="text-[12px] text-ink-3">
              {rows.length} of {records.length} loads ·{" "}
              {STATUS_ORDER.map((s) => `${countByStatus[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(
                " · ",
              )}
            </p>
          </div>
          {canWriteInventory ? (
            <div className="flex gap-2">
              <button
                onClick={() => setIdentify("MANUAL")}
                className="rounded-lg bg-panel px-4 py-2.5 text-[13px] font-semibold text-accent ring-1 ring-accent/60 hover:bg-panel-2"
              >
                Enter PO Manually
              </button>
              <button
                onClick={() => setIdentify("QR")}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
                    <path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 16h3" />
                  </g>
                </svg>
                Scan QR
              </button>
            </div>
          ) : (
            <span className="rounded-lg bg-panel-2 px-3.5 py-2 text-[12px] text-ink-3 ring-1 ring-line">
              Read-only access
            </span>
          )}
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            >
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </g>
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search incoming materials"
              placeholder="Search PO, Incoming ID, Material or Supplier…"
              className="w-full rounded-lg bg-panel px-3 py-2 pl-9 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
            />
          </div>
          <Select value={status} onChange={(v) => setStatus(v as IncomingStatus | "")} label="Status">
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={group} onChange={setGroup} label="Material Group">
            {MATERIAL_GROUP_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Select value={supplier} onChange={setSupplier} label="Supplier">
            {SUPPLIERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          {(query || status || group || supplier) && (
            <button
              onClick={() => {
                setQuery("")
                setStatus("")
                setGroup("")
                setSupplier("")
              }}
              className="rounded-lg px-3 py-2 text-[12px] text-ink-2 ring-1 ring-line hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        <AddedBanner added={added} />
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[1040px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-panel-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                <Th>PO No.</Th>
                <Th>Gate Entry / GRN</Th>
                <Th>Incoming ID</Th>
                <Th>Material</Th>
                <Th>Supplier</Th>
                <Th className="text-right">Expected Qty</Th>
                <Th className="text-right">Actual Qty</Th>
                <Th>Status</Th>
                <Th>Expected Date</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const material = materialEntry(r.materialId)
                const actual = actualMt(r)
                const tone = STATUS_TONE[r.status]
                return (
                  <tr
                    key={r.incomingId}
                    data-added-key={r.incomingId}
                    className={`cursor-pointer border-t border-line bg-panel/60 hover:bg-panel-2 ${added.rowClass(r.incomingId)}`}
                    onClick={() => setOpenId(r.incomingId)}
                  >
                    <Td className="font-mono text-ink">{r.poNumber}</Td>
                    <Td className="font-mono text-[11.5px] text-ink-2">
                      <span className="block">{r.gateEntryNo ?? "—"}</span>
                      <span className="block text-ink-3">{r.grnNo ?? "—"}</span>
                    </Td>
                    <Td className="font-mono text-ink-2">{r.incomingId}</Td>
                    <Td>
                      <span className="block text-ink">{material?.name ?? r.materialId}</span>
                      <span className="block text-[11px] text-ink-3">{gradeEntry(r.gradeId)?.name ?? material?.group}</span>
                    </Td>
                    <Td className="text-ink-2">{r.supplier}</Td>
                    <Td className="text-right font-mono text-ink">
                      {r.expectedMt.toLocaleString()} {material?.uom ?? "MT"}
                    </Td>
                    <Td className="text-right font-mono text-ink">
                      {actual !== null ? `${actual.toLocaleString()} ${material?.uom ?? "MT"}` : <span className="text-ink-3">—</span>}
                    </Td>
                    <Td>
                      {/* Text label always present; colour is secondary. */}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-semibold"
                        style={{ color: toneText(tone), background: `${tone}1f` }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
                        {STATUS_LABEL[r.status].toUpperCase()}
                      </span>
                      {r.quality?.result === "FAIL" && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-ink">
                          <span aria-hidden className="text-crit">✕</span> Quality FAIL
                        </span>
                      )}
                      {qualityState(r) === "TEST_PENDING" && r.status !== "IDENTIFIED" && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-ink">
                          <span aria-hidden className="text-warn">◷</span> {r.sample ? "TEST PENDING" : "SAMPLE PENDING"}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-3">
                      {new Date(r.expectedArrival).toLocaleString("en-AU", {
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
                  <td colSpan={10} className="border-t border-line py-8 text-center text-ink-3">
                    No incoming materials match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-ink-3">
          Purchase orders and suppliers are configured demo data — this application has no PO system
          to read from. Receipts post an INCOMING transaction into the selected inventory record.
        </p>
      </div>

      {identify && (
        <IdentifyModal
          initialMethod={identify}
          onClose={() => setIdentify(null)}
          onRegistered={(r) => {
            // Back to the worklist, with nothing filtering the new delivery out.
            setQuery("")
            setStatus("")
            setGroup("")
            setSupplier("")
            added.mark(
              r.incomingId,
              `Delivery ${r.incomingId} identified — ${r.poNumber}, ${materialEntry(r.materialId)?.name ?? r.materialId}, ${r.supplier}. Next: weighing${r.sampleRequired ? "; a sample is required for this delivery" : ""}.`,
            )
          }}
        />
      )}

      {open && !stage && (
        <IncomingDetailModal
          record={open}
          onClose={() => setOpenId(null)}
          onAdvance={advance}
        />
      )}

      {open && stage === "weighing" && (
        <WeighingModal record={open} onClose={() => setStage(null)} />
      )}
      {open && stage === "quality" && (
        <QualityModal record={open} onClose={() => setStage(null)} />
      )}
      {open && stage === "receipt" && (
        <ReceiptModal record={open} onClose={() => setStage(null)} />
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
      className="rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line focus:ring-accent"
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

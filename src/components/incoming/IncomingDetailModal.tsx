"use client"

/**
 * Incoming record detail.
 *
 * One record, the whole journey: PO information, then whatever each completed
 * stage produced, plus the audit trail. The next action is always the only
 * action offered — completed stages are not re-openable.
 */

import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import {
  NEXT_ACTION,
  QUALITY_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  type IncomingRecord,
} from "@/lib/incoming/types"
import { Modal } from "./StageModals"

export function IncomingDetailModal({
  record,
  onClose,
  onAdvance,
}: {
  record: IncomingRecord
  onClose: () => void
  onAdvance: () => void
}) {
  const material = materialEntry(record.materialId)
  const reached = STATUS_ORDER.indexOf(record.status)
  const isComplete = record.status === "RECEIVED"

  return (
    <Modal
      title={record.incomingId}
      subtitle={record.poNumber}
      onClose={onClose}
      width={680}
    >
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink">{material?.name ?? record.materialId}</span>
        <span className="text-[13px] text-ink-2">{record.supplier}</span>
        <span className="text-[13px] text-ink-3">
          {record.expectedMt.toLocaleString()} MT expected
        </span>
        <span className="ml-auto rounded bg-demo px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-[#1a1204]">
          Demo
        </span>
      </div>

      {/* Stage tracker */}
      <ol className="mb-5 rounded-lg bg-panel-2 p-3.5">
        {STATUS_ORDER.map((s, i) => {
          const done = i <= reached
          const current = i === reached
          const tone = STATUS_TONE[s]
          return (
            <li key={s} className="flex items-center gap-3 py-1">
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                style={{
                  background: done ? tone : "transparent",
                  border: `1.5px solid ${done ? tone : "#33404f"}`,
                  color: done ? "#08131f" : "#6c7887",
                }}
                aria-hidden
              >
                {done ? "✓" : "○"}
              </span>
              <span
                className={`text-[13px] ${current ? "font-bold text-ink" : done ? "text-ink" : "text-ink-3"}`}
              >
                {STATUS_LABEL[s]}
              </span>
              {current && (
                <span className="text-[11px] text-ink-3">
                  {isComplete ? "complete" : "current stage"}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <Section title="PO Information">
        <Grid>
          <Item label="PO Number" value={record.poNumber} mono />
          <Item label="Material" value={material?.name ?? record.materialId} />
          <Item label="Material Group" value={material?.group ?? "—"} />
          <Item label="Description" value={material?.description ?? "—"} span />
          <Item label="Supplier" value={record.supplier} />
          <Item label="Expected Quantity" value={`${record.expectedMt.toLocaleString()} MT`} />
          <Item label="Expected Arrival" value={stamp(record.expectedArrival)} />
        </Grid>
      </Section>

      {record.weighing && (
        <Section title="Weighing Information">
          <Grid>
            <Item label="Gross Weight" value={`${record.weighing.grossMt.toLocaleString()} MT`} />
            <Item label="Tare Weight" value={`${record.weighing.tareMt.toLocaleString()} MT`} />
            <Item label="Net Weight" value={`${record.weighing.netMt.toLocaleString()} MT`} strong />
            <Item label="Weighbridge Reference" value={record.weighing.weighbridgeRef} mono />
            <Item label="Recorded" value={stamp(record.weighing.at)} />
            <Item label="By" value={record.weighing.by} mono />
          </Grid>
        </Section>
      )}

      {record.quality && (
        <Section title="Quality Information">
          <table className="mb-3 w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-3">
                <th className="border-b border-line py-1.5">Parameter</th>
                <th className="border-b border-line py-1.5">Result</th>
                <th className="border-b border-line py-1.5 text-right">Specification</th>
              </tr>
            </thead>
            <tbody>
              {record.quality.readings.map((r) => (
                <tr key={r.parameter}>
                  <td className="border-b border-line py-1.5 text-ink">
                    {r.parameter}
                    {r.unit && <span className="text-ink-3"> ({r.unit})</span>}
                  </td>
                  <td className="border-b border-line py-1.5 font-mono text-ink">{r.value}</td>
                  <td className="border-b border-line py-1.5 text-right text-ink-3">
                    {r.spec ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Grid>
            <Item label="Quality Decision" value={QUALITY_LABEL[record.quality.result]} strong />
            <Item label="Recorded" value={stamp(record.quality.at)} />
            <Item label="By" value={record.quality.by} mono />
            {record.quality.comments && (
              <Item label="Comments" value={record.quality.comments} span />
            )}
          </Grid>
        </Section>
      )}

      {record.receipt && (
        <Section title="Receipt Information">
          <Grid>
            <Item
              label="Received Quantity"
              value={`${record.receipt.receivedMt.toLocaleString()} MT`}
              strong
            />
            <Item
              label="Variance"
              value={`${record.receipt.varianceMt > 0 ? "+" : ""}${record.receipt.varianceMt.toLocaleString()} MT`}
            />
            <Item
              label="Destination"
              value={
                locationEntry(record.receipt.destinationLocationId)?.name ??
                record.receipt.destinationLocationId
              }
              span
            />
            <Item label="Inventory Transaction" value={record.receipt.transactionId} mono />
            <Item label="Receipt Timestamp" value={stamp(record.receipt.at)} />
            <Item label="By" value={record.receipt.by} mono />
          </Grid>
        </Section>
      )}

      <Section title="Audit Trail">
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
                    · {STATUS_LABEL[a.from]} → {STATUS_LABEL[a.to]}
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
        <button
          onClick={onAdvance}
          disabled={isComplete}
          className="flex-1 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
        >
          {NEXT_ACTION[record.status]}
        </button>
      </div>
    </Modal>
  )
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{title}</h3>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">{children}</div>
}

function Item({
  label,
  value,
  mono,
  strong,
  span,
}: {
  label: string
  value: string
  mono?: boolean
  strong?: boolean
  span?: boolean
}) {
  return (
    <div className={span ? "col-span-2 sm:col-span-3" : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div
        className={`text-[13px] ${mono ? "font-mono" : ""} ${strong ? "font-bold text-ink" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  )
}

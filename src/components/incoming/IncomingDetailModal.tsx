"use client"

/**
 * Incoming record detail — one delivery, the whole journey: PO, receiving
 * data, weighing, quality, receipt, and the inventory transaction it posted.
 * The next action is the only action offered.
 */

import { useIssues } from "@/components/issues/issue-store"
import { usePiles } from "@/components/shell/pile-store"
import { poQrPayload } from "@/lib/incoming/catalog"
import { isCounted, STATUS_LABEL, STATUS_ORDER, STATUS_TONE, nextAction, type IncomingRecord } from "@/lib/incoming/types"
import { samplingLabel } from "@/lib/masters/types"
import { gradeEntry } from "@/lib/inventory/catalog"
import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { Modal } from "./StageModals"
import { PoQrCode } from "./QrScanner"

export function IncomingDetailModal({
  record,
  onClose,
  onAdvance,
}: {
  record: IncomingRecord
  onClose: () => void
  onAdvance: () => void
}) {
  const { canWriteInventory, setMode } = usePiles()
  const { openTrace } = useIssues()
  const material = materialEntry(record.materialId)
  const uom = material?.uom ?? "MT"
  const counted = isCounted(uom)
  const reached = STATUS_ORDER.indexOf(record.status)
  // Spares are counted, not weighed — say so on the button.
  const next = nextAction(record)
  const action = next === "Proceed to Weighing" && counted ? "Proceed to Count" : next
  const failed = record.quality?.result === "FAIL"

  return (
    <Modal title={record.incomingId} subtitle={record.poNumber} onClose={onClose} width={700}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink">{material?.name ?? record.materialId}</span>
        <span className="text-[13px] text-ink-2">{record.supplier}</span>
        <span className="text-[13px] text-ink-3">{record.expectedMt.toLocaleString()} {uom} expected</span>
        <span className="ml-auto rounded bg-demo px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-demo-ink">Demo</span>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_auto]">
        {/* Progress */}
        <ol className="flex flex-wrap items-center gap-2 rounded-lg bg-panel-2 p-3.5">
          {STATUS_ORDER.map((s, i) => {
            const done = i <= reached && !(s === "QUALITY" && failed)
            const isFail = s === "QUALITY" && failed
            const tone = STATUS_TONE[s]
            return (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="text-ink-3">→</span>}
                <span
                  aria-hidden
                  className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold"
                  style={{
                    background: isFail ? "var(--color-crit)" : done ? tone : "transparent",
                    border: `1.5px solid ${isFail ? "var(--color-crit)" : done ? tone : "var(--color-line-2)"}`,
                    color: isFail || done ? "#08131f" : "var(--color-ink-3)",
                  }}
                >
                  {isFail ? "✕" : done ? "✓" : "○"}
                </span>
                <span className={`text-[12.5px] ${i === reached ? "font-bold text-ink" : done ? "text-ink" : "text-ink-3"}`}>
                  {STATUS_LABEL[s].toUpperCase()}
                  {isFail && " — FAIL"}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="flex items-center gap-2.5">
          <PoQrCode payload={poQrPayload(record.poNumber)} size={76} />
          <span className="text-[10.5px] leading-tight text-ink-3">
            PO tag
            <br />
            {record.identifiedBy === "QR" ? "Identified by QR" : "Entered manually"}
          </span>
        </div>
      </div>

      <Section title="PO Details">
        <Grid>
          <Item label="PO Number" value={record.poNumber} mono />
          <Item label="Gate Entry No." value={record.gateEntryNo ?? "Not recorded"} mono />
          <Item label="GRN No." value={record.grnNo ?? "Not recorded"} mono />
          <Item label="Supplier" value={record.supplier} />
          <Item label="Material" value={material?.name ?? record.materialId} />
          <Item label="Grade" value={gradeEntry(record.gradeId)?.name ?? "—"} />
          <Item label="Material Code" value={material?.code ?? "—"} mono />
          <Item label="Expected Quantity" value={`${record.expectedMt.toLocaleString()} ${material?.uom ?? "MT"}`} />
          <Item label="Expected Arrival" value={stamp(record.expectedArrival)} />
        </Grid>
      </Section>

      <Section title="Receiving">
        <Grid>
          <Item label="Receiving Location" value={locationEntry(record.receipt?.locationId ?? record.destinationLocationId)?.name ?? "—"} />
          <Item label="Inventory ID" value={record.receipt?.inventoryId ?? record.receivingInventoryId} mono />
          <Item label="Vehicle / Delivery Ref" value={record.vehicleRef ?? "—"} />
          <Item label="Supplier Batch" value={record.batch ?? "Not recorded"} />
          <Item label="Source / Origin" value={record.origin ?? "—"} span />
        </Grid>
      </Section>

      {record.weighing && (
        <Section title={counted ? "Count" : "Weighing"}>
          <Grid>
            {counted ? (
              <Item label="Counted Quantity" value={`${record.weighing.netMt.toLocaleString()} ${uom}`} strong />
            ) : (
              <>
                <Item label="Gross Weight" value={`${record.weighing.grossMt.toLocaleString()} MT`} />
                <Item label="Tare Weight" value={`${record.weighing.tareMt.toLocaleString()} MT`} />
                <Item label="Net Weight" value={`${record.weighing.netMt.toLocaleString()} MT`} strong />
              </>
            )}
          </Grid>
        </Section>
      )}

      <Section title="Quality">
        <Grid>
          <Item label="Sample Required" value={record.sampleRequired ? `Yes — ${samplingLabel(gradeEntry(record.gradeId)?.sampleEvery ?? 0)}` : "No"} />
          <Item label="Sample Collected" value={record.sample ? `${record.sample.sampleId} · ${stamp(record.sample.collectedAt)}` : record.sampleRequired ? "Not yet" : "—"} />
          <Item
            label="Sample Tested"
            value={record.quality ? (record.quality.tested ? `Yes · ${stamp(record.quality.at)}` : "No — not required") : record.sampleRequired ? "TEST PENDING" : "—"}
          />
        </Grid>
      </Section>

      {record.quality && (
        <Section title="Quality Result">
          <Grid>
            <Item label="Quality Result" value={record.quality.result} strong />
            {record.quality.readings.map((r) => (
              <Item key={r.parameter} label={`${r.parameter}${r.unit ? ` (${r.unit})` : ""}`} value={r.value} mono />
            ))}
            <Item label="Quality Notes" value={record.quality.notes || "—"} span />
          </Grid>
          {failed && <p className="mt-2 text-[12px] text-ink-2">Failed quality — this delivery is not received into inventory.</p>}
        </Section>
      )}

      {record.receipt && (
        <Section title="Receipt">
          <Grid>
            <Item label="Received Quantity" value={`${record.receipt.receivedMt.toLocaleString()} ${uom}`} strong />
            <Item
              label="Variance vs PO"
              value={`${record.receipt.varianceMt > 0 ? "+" : ""}${record.receipt.varianceMt.toLocaleString()} ${uom}`}
            />
            {record.receipt.expiryDate && (
              <Item
                label="Expiry Date"
                value={new Date(record.receipt.expiryDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
              />
            )}
            <Item label="Inventory Transaction" value={record.receipt.transactionId} mono />
          </Grid>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-panel-2 px-3 py-2 font-mono text-[12px] text-ink ring-1 ring-line">
            <span>{record.poNumber}</span>
            <span className="text-ink-3">→</span>
            <span>{record.incomingId}</span>
            <span className="text-ink-3">→</span>
            <span>
              {record.receipt.inventoryId} +{record.receipt.receivedMt.toLocaleString()} {uom}
            </span>
            <span className="text-ink-3">→</span>
            <span>{record.receipt.transactionId}</span>
            <button
              onClick={() => {
                onClose()
                openTrace(record.poNumber)
                setMode("issues")
              }}
              className="ml-auto font-sans text-[12px] font-medium text-accent hover:underline"
            >
              Trace where it was used
            </button>
          </div>
        </Section>
      )}

      <Section title="Audit Trail">
        <ul className="space-y-1.5">
          {[...record.audit].reverse().map((a, i) => (
            <li key={i} className="text-[12px] leading-relaxed">
              <span className="text-ink-3">{stamp(a.at)}</span> <span className="font-mono text-[11px] text-ink-3">{a.by}</span>
              <div className="text-ink">{a.action}</div>
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
        {canWriteInventory && (
          <button
            onClick={onAdvance}
            disabled={!action}
            className="flex-1 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
          >
            {action ?? (record.status === "RECEIVED" ? "Received" : "Held — quality failed")}
          </button>
        )}
      </div>
    </Modal>
  )
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
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

function Item({ label, value, mono, strong, span }: { label: string; value: string; mono?: boolean; strong?: boolean; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 sm:col-span-3" : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`text-[13px] ${mono ? "font-mono" : ""} ${strong ? "font-bold text-ink" : "text-ink"}`}>{value}</div>
    </div>
  )
}

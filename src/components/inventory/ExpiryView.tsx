"use client"

/**
 * Inventory › Expiry Monitoring — only for materials where expiry applies.
 *
 *   PO (expiry date / shelf life) → Incoming → GRN → Inventory → Monitoring
 *
 * Every figure is replayed from the ledger (lib/inventory/expiry.ts): each dated
 * batch in stock, what reached its date and left by an EXPIRY transaction, and
 * the balance identity Previous + Inward − Expired − Net Consumed = Current
 * Available. There is no manual expiry entry here, and no write-off button —
 * the expiry run posts the EXPIRY transaction when a batch's date is reached.
 */

import { useMemo, useState } from "react"

import { usePiles } from "@/components/shell/pile-store"
import { gradeEntry, locationName, materialEntry } from "@/lib/inventory/catalog"
import {
  APPROACHING_EXPIRY_DAYS,
  batchStatus,
  daysToExpiry,
  expiryBalance,
  type ExpiryBatch,
  type ExpiryStatus,
} from "@/lib/inventory/expiry"
import { useMasters } from "@/lib/masters/useMasters"
import { ExpiryPill, expiryDay } from "./Expiry"
import { Empty, Row, Table, Td, Th } from "./Table"

type Filter = "" | Exclude<ExpiryStatus, "EXPIRED">

const fmt = (n: number) => Math.round(n).toLocaleString()
const batches = (n: number) => `${n} ${n === 1 ? "batch" : "batches"}`
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
const WINDOW_DAYS = 30

/** Quantities per unit of measure — never summed across units. */
function perUom(rows: Array<{ qty: number; uom: string }>): string {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.uom, (totals.get(r.uom) ?? 0) + r.qty)
  return totals.size ? [...totals].map(([u, q]) => `${fmt(q)} ${u}`).join(" · ") : "None"
}

export function ExpiryView({ onOpenInventory, onTrace }: { onOpenInventory: (inventoryId: string) => void; onTrace?: (id: string) => void }) {
  const { inventory, ledger, batchIndex, expiryNow } = usePiles()
  const masters = useMasters()
  // "Now" moves with the data and the expiry clock.
  const now = useMemo(() => new Date(), [ledger, expiryNow])
  const [filter, setFilter] = useState<Filter>("")
  const [query, setQuery] = useState("")

  const tracked = useMemo(() => masters.materials.filter((m) => m.expiryApplicable), [masters.materials])
  const trackedIds = useMemo(() => new Set(tracked.map((m) => m.materialId)), [tracked])
  const records = useMemo(() => inventory.filter((r) => r.active && trackedIds.has(r.materialId)), [inventory, trackedIds])

  const all: ExpiryBatch[] = useMemo(() => records.flatMap((r) => batchIndex.byRecord.get(r.inventoryId) ?? []), [records, batchIndex])
  const inStock = useMemo(
    () =>
      all
        .filter((b) => b.remaining > 1e-9)
        .sort((a, b) => (a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity) - (b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity)),
    [all],
  )
  const expired = useMemo(() => all.filter((b) => b.expiredQty > 0).sort((a, b) => (b.expiryDate ?? "").localeCompare(a.expiryDate ?? "")), [all])
  const txnAt = useMemo(() => new Map(ledger.map((t) => [t.txnId, t.at])), [ledger])

  const of = (s: ExpiryStatus) => inStock.filter((b) => batchStatus(b, now) === s)
  const shown = inStock.filter((b) => {
    if (filter && batchStatus(b, now) !== filter) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    const m = materialEntry(b.materialId)
    return [b.inventoryId, b.poNumber, b.grnNo, b.lotId, b.incomingId, m?.name, m?.code, locationName(b.locationId)].some((v) => v?.toLowerCase().includes(q))
  })

  const span = useMemo(() => ({ from: now.getTime() - WINDOW_DAYS * 86_400_000, to: now.getTime() }), [now])
  const balances = useMemo(
    () => records.map((r) => ({ record: r, bal: expiryBalance(ledger, r.inventoryId, span.from, span.to) })),
    [records, ledger, span],
  )

  if (tracked.length === 0) {
    return (
      <p className="rounded-lg bg-panel-2 px-4 py-6 text-center text-[12.5px] text-ink-2 ring-1 ring-line">
        No material is set up with expiry. Tick &ldquo;Expiry applies&rdquo; on a material under Master › Materials + Grades; its stock is
        then monitored here from the expiry stated on each PO.
      </p>
    )
  }

  const tiles: Array<{ key: Filter | "EXPIRED"; label: string; value: string; note: string; action?: boolean }> = [
    {
      key: "APPROACHING",
      label: "Approaching Expiry",
      value: perUom(of("APPROACHING").map((b) => ({ qty: b.remaining, uom: b.uom }))),
      note: `${batches(of("APPROACHING").length)} within ${APPROACHING_EXPIRY_DAYS} days — use first`,
      action: of("APPROACHING").length > 0,
    },
    {
      key: "EXPIRED",
      label: "Expired",
      value: perUom(expired.map((b) => ({ qty: b.expiredQty, uom: b.uom }))),
      note: expired.length ? `${batches(expired.length)} removed by EXPIRY transactions` : "Nothing has expired",
    },
    {
      key: "WITHIN_SHELF_LIFE",
      label: "Within Shelf Life",
      value: perUom(of("WITHIN_SHELF_LIFE").map((b) => ({ qty: b.remaining, uom: b.uom }))),
      note: batches(of("WITHIN_SHELF_LIFE").length),
    },
    {
      key: "NO_EXPIRY_DATE",
      label: "No Expiry Date",
      value: perUom(of("NO_EXPIRY_DATE").map((b) => ({ qty: b.remaining, uom: b.uom }))),
      note: of("NO_EXPIRY_DATE").length ? "The PO stated no expiry or shelf life" : "Every batch has its date",
      action: of("NO_EXPIRY_DATE").length > 0,
    },
  ]

  return (
    <section className="grid gap-6">
      <p className="max-w-[900px] text-[12px] text-ink-3">
        Expiry is monitored for {tracked.map((m) => m.name).join(", ")} only. Each delivery&rsquo;s expiry comes from its PO — a stated
        date, or a shelf life counted from receipt — and travels through Incoming and the GRN into inventory as a dated batch. Stock is
        drawn first-expiry-first-out; when a batch reaches its date, its remaining quantity is Expired and leaves available inventory by
        an EXPIRY transaction, traced to its PO and GRN.
      </p>

      {/* Tiles — the in-stock ones double as filters. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => {
          const filterable = t.key !== "EXPIRED"
          const on = filterable && filter === t.key
          const body = (
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{t.label}</span>
                {t.action && (
                  <span className="flex items-center gap-1 rounded-full bg-warn/15 px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wide text-ink ring-1 ring-warn/40">
                    <span aria-hidden>!</span> Attention
                  </span>
                )}
              </span>
              <span className="mt-1 block font-mono text-[19px] font-bold leading-tight text-ink">{t.value}</span>
              <span className="mt-1 block text-[11px] text-ink-3">{t.note}</span>
            </>
          )
          return filterable ? (
            <button
              key={t.key}
              onClick={() => setFilter(on ? "" : (t.key as Filter))}
              aria-pressed={on}
              className={`rounded-xl bg-panel p-3.5 text-left ring-1 transition-colors hover:bg-panel-2 ${on ? "ring-2 ring-accent" : "ring-line"}`}
            >
              {body}
            </button>
          ) : (
            <div key={t.key} className="rounded-xl bg-panel p-3.5 ring-1 ring-line">
              {body}
            </div>
          )
        })}
      </div>

      <div>
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-bold text-ink">Dated Batches in Stock</h2>
            <p className="text-[11.5px] text-ink-3">
              {shown.length} of {inStock.length} batches{filter ? ` · ${tiles.find((t) => t.key === filter)?.label}` : ""} · soonest expiry first
            </p>
          </div>
          <span className="flex items-center gap-2">
            {filter && (
              <button onClick={() => setFilter("")} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-2 ring-1 ring-line hover:text-ink">
                Show all
              </button>
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search expiry"
              placeholder="Search Inventory ID, PO, GRN, lot…"
              className="w-[280px] max-w-full rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
            />
          </span>
        </div>
        <Table
          head={
            <>
              <Th>Material</Th>
              <Th>Inventory ID</Th>
              <Th>PO / GRN</Th>
              <Th>Lot / Batch</Th>
              <Th>Received</Th>
              <Th className="text-right">Quantity</Th>
              <Th>Expiry Date</Th>
              <Th className="text-right">Days to Expiry</Th>
              <Th>Status</Th>
            </>
          }
          empty={shown.length === 0 ? <Empty>{inStock.length ? "No batch matches." : "No expiry-tracked stock is held."}</Empty> : undefined}
        >
          {shown.map((b) => (
            <Row key={b.batchId}>
              <Td>
                <span className="block text-ink">{materialEntry(b.materialId)?.name}</span>
                <span className="block text-[11px] text-ink-3">{gradeEntry(b.gradeId)?.name} · {locationName(b.locationId)}</span>
              </Td>
              <Td>
                <button onClick={() => onOpenInventory(b.inventoryId)} className="font-mono text-ink hover:text-accent hover:underline">
                  {b.inventoryId}
                </button>
              </Td>
              <Td>
                {b.poNumber ? (
                  <>
                    <button onClick={() => onTrace?.(b.poNumber!)} className="block font-mono text-accent hover:underline">
                      {b.poNumber}
                    </button>
                    <span className="block font-mono text-[11px] text-ink-3">{b.grnNo ?? "No GRN"}</span>
                  </>
                ) : (
                  <span className="text-ink-3">{b.source === "OPENING" ? "Opening balance" : b.source === "RETURN" ? "Return" : "Adjustment"}</span>
                )}
              </Td>
              <Td className="font-mono text-ink-2">{b.lotId ?? "—"}</Td>
              <Td className="whitespace-nowrap text-ink-2">{expiryDay(b.receivedAt)}</Td>
              <Td className="text-right font-mono text-ink">
                {fmt(b.remaining)} {b.uom}
                {b.remaining < b.receivedQty && <span className="block text-[11px] text-ink-3">of {fmt(b.receivedQty)}</span>}
              </Td>
              <Td className="whitespace-nowrap text-ink-2">{b.expiryDate ? expiryDay(b.expiryDate) : <span className="text-ink-3">Not on PO</span>}</Td>
              <Td className="text-right font-mono text-ink-2">{b.expiryDate ? daysToExpiry(b.expiryDate, now) : "—"}</Td>
              <Td>
                <ExpiryPill status={batchStatus(b, now)} />
              </Td>
            </Row>
          ))}
        </Table>
      </div>

      <div>
        <h2 className="text-[14px] font-bold text-ink">Expired</h2>
        <p className="mb-2.5 text-[11.5px] text-ink-3">
          Batches that reached their expiry date. Their remaining quantity left available inventory by an EXPIRY transaction — never an
          overwrite — and each keeps its PO and GRN.
        </p>
        <Table
          head={
            <>
              <Th>Material</Th>
              <Th>Inventory ID</Th>
              <Th>PO / GRN</Th>
              <Th>Lot / Batch</Th>
              <Th>Expiry Date</Th>
              <Th className="text-right">Expired Quantity</Th>
              <Th>Transaction</Th>
              <Th>Posted</Th>
            </>
          }
          empty={expired.length === 0 ? <Empty>No batch has expired.</Empty> : undefined}
        >
          {expired.map((b) => (
            <Row key={b.batchId}>
              <Td className="text-ink">{materialEntry(b.materialId)?.name}</Td>
              <Td className="font-mono text-ink-2">{b.inventoryId}</Td>
              <Td className="font-mono text-ink-2">
                {b.poNumber ?? (b.source === "OPENING" ? "Opening balance" : "—")}
                {b.grnNo && <span className="block text-[11px] text-ink-3">{b.grnNo}</span>}
              </Td>
              <Td className="font-mono text-ink-2">{b.lotId ?? "—"}</Td>
              <Td className="whitespace-nowrap text-ink-2">{b.expiryDate ? expiryDay(b.expiryDate) : "—"}</Td>
              <Td className="text-right font-mono text-ink">
                {fmt(b.expiredQty)} {b.uom}
              </Td>
              <Td className="font-mono text-ink-2">{b.expiryTxnIds.join(", ")}</Td>
              <Td className="whitespace-nowrap text-ink-3">{b.expiryTxnIds[0] ? stamp(txnAt.get(b.expiryTxnIds[0]) ?? b.receivedAt) : "—"}</Td>
            </Row>
          ))}
        </Table>
      </div>

      <div>
        <h2 className="text-[14px] font-bold text-ink">Inventory Calculation — last {WINDOW_DAYS} days</h2>
        <p className="mb-2.5 text-[11.5px] text-ink-3">
          Previous Inventory + Material Inward − Expired Quantity − Net Consumed = Current Available Inventory, for each expiry-tracked
          balance, straight from the ledger. Net consumed is gross outward less returns; any adjustment or loss is shown on its own.
        </p>
        <Table
          head={
            <>
              <Th>Inventory ID</Th>
              <Th>Material</Th>
              <Th className="text-right">Previous Inventory</Th>
              <Th className="text-right">+ Material Inward</Th>
              <Th className="text-right">− Expired</Th>
              <Th className="text-right">− Net Consumed</Th>
              <Th className="text-right">± Other</Th>
              <Th className="text-right">= Current Available</Th>
            </>
          }
        >
          {balances.map(({ record: r, bal }) => (
            <Row key={r.inventoryId}>
              <Td className="font-mono text-ink">{r.inventoryId}</Td>
              <Td className="text-ink-2">{materialEntry(r.materialId)?.name}</Td>
              <Td className="text-right font-mono text-ink-2">{fmt(bal.previous)}</Td>
              <Td className="text-right font-mono text-ink-2">{fmt(bal.inward)}</Td>
              <Td className="text-right font-mono text-ink-2">{fmt(bal.expired)}</Td>
              <Td className="text-right font-mono text-ink-2">{fmt(bal.netConsumed)}</Td>
              <Td className="text-right font-mono text-ink-3">{bal.other ? `${bal.other > 0 ? "+" : "−"}${fmt(Math.abs(bal.other))}` : "—"}</Td>
              <Td className="text-right font-mono font-semibold text-ink">
                {fmt(bal.current)} {r.uom}
                <span className="block text-[10.5px] font-normal text-ink-3">
                  {Math.abs(bal.current - r.quantity) < 0.5 ? "✓ matches the balance" : `✕ balance is ${fmt(r.quantity)}`}
                </span>
              </Td>
            </Row>
          ))}
        </Table>
      </div>
    </section>
  )
}

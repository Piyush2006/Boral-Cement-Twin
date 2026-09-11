"use client"

/**
 * Inventory › Expiry — expiry management for materials where expiry applies.
 *
 *   Expired             → write off as an EXPIRY (−) transaction
 *   Expiring Soon       → within EXPIRING_SOON_DAYS; use first
 *   Healthy Shelf Life  → nothing to do
 *   No expiry date      → an expiry-tracked balance with no date is a gap; set it
 *
 * Materials where expiry does not apply never appear here and never get an
 * expiry field. Every figure comes from the inventory records and the ledger.
 */

import { useMemo, useState } from "react"

import { usePiles } from "@/components/shell/pile-store"
import { gradeEntry, locationName, materialEntry } from "@/lib/inventory/catalog"
import type { InventoryRecord } from "@/lib/inventory/model"
import { useMasters } from "@/lib/masters/useMasters"
import { EXPIRING_SOON_DAYS, daysToExpiry, shelfLife, type ShelfLife } from "@/lib/reports/insights"
import { ExpiryWriteOffModal, SetExpiryModal, ShelfLifePill } from "./Expiry"
import { Empty, LinkButton, Row, Table, Td, Th } from "./Table"

type State = ShelfLife | "NO_DATE"

const STATE_LABEL: Record<State, string> = {
  EXPIRED: "Expired",
  EXPIRING_SOON: "Expiring Soon",
  HEALTHY_SHELF_LIFE: "Healthy Shelf Life",
  NO_DATE: "No Expiry Date",
}

const fmt = (n: number) => Math.round(n).toLocaleString()
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })

/** Quantities per unit of measure, e.g. "11 DRUM · 4 EA" — never summed across units. */
function perUom(rows: InventoryRecord[]): string {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.uom, (totals.get(r.uom) ?? 0) + r.quantity)
  return totals.size ? [...totals].map(([u, q]) => `${fmt(q)} ${u}`).join(" · ") : "—"
}

export function ExpiryView({ onOpenInventory }: { onOpenInventory: (inventoryId: string) => void }) {
  const { inventory, ledger, canWriteInventory } = usePiles()
  const masters = useMasters()
  // "Now" moves with the data, so a write-off is never newer than the view.
  const now = useMemo(() => new Date(), [inventory, ledger])
  const [filter, setFilter] = useState<"" | State>("")
  const [query, setQuery] = useState("")
  const [writeOff, setWriteOff] = useState<InventoryRecord | null>(null)
  const [setDate, setSetDate] = useState<InventoryRecord | null>(null)

  const tracked = useMemo(() => masters.materials.filter((m) => m.expiryApplicable), [masters.materials])
  const trackedIds = useMemo(() => new Set(tracked.map((m) => m.materialId)), [tracked])

  const rows = useMemo(
    () =>
      inventory
        .filter((r) => r.active && trackedIds.has(r.materialId))
        .map((r) => {
          const state: State = r.expiryDate ? shelfLife(r.expiryDate, now) : "NO_DATE"
          return { record: r, state, days: r.expiryDate ? daysToExpiry(r.expiryDate, now) : null }
        })
        // Most urgent first; undated last.
        .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity)),
    [inventory, trackedIds, now],
  )

  const byState = (s: State) => rows.filter((r) => r.state === s)
  const shown = rows.filter((r) => {
    if (filter && r.state !== filter) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    const m = materialEntry(r.record.materialId)
    return [r.record.inventoryId, r.record.locationId, r.record.lotId, r.record.batch, m?.name, m?.code, locationName(r.record.locationId)].some((v) =>
      v?.toLowerCase().includes(q),
    )
  })

  const writeOffs = useMemo(() => ledger.filter((t) => t.type === "EXPIRY"), [ledger])

  if (tracked.length === 0) {
    return (
      <p className="rounded-lg bg-panel-2 px-4 py-6 text-center text-[12.5px] text-ink-2 ring-1 ring-line">
        No material is set up with expiry. Tick &ldquo;Expiry applies&rdquo; on a material under Master › Materials + Grades and its
        stock appears here.
      </p>
    )
  }

  return (
    <section className="grid gap-5">
      <p className="text-[12px] text-ink-3">
        Expiry is tracked for {tracked.map((m) => m.name).join(", ")} only. Expired stock is written off as its own EXPIRY transaction — a
        loss, never consumption. &ldquo;Expiring Soon&rdquo; means within {EXPIRING_SOON_DAYS} days.
      </p>

      {/* Tiles double as filters. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["EXPIRED", "EXPIRING_SOON", "HEALTHY_SHELF_LIFE", "NO_DATE"] as State[]).map((s) => {
          const list = byState(s)
          const on = filter === s
          return (
            <button
              key={s}
              onClick={() => setFilter(on ? "" : s)}
              aria-pressed={on}
              className={`rounded-xl bg-panel p-3.5 text-left ring-1 transition-colors hover:bg-panel-2 ${on ? "ring-2 ring-accent" : "ring-line"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{STATE_LABEL[s]}</span>
                {(s === "EXPIRED" || s === "NO_DATE") && list.length > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-crit/15 px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wide text-ink ring-1 ring-crit/40">
                    <span aria-hidden>!</span> Action
                  </span>
                )}
              </span>
              <span className="mt-1 block font-mono text-[22px] font-bold leading-tight text-ink">{list.length}</span>
              <span className="mt-1 block text-[11px] text-ink-3">
                {list.length ? perUom(list.map((x) => x.record)) : s === "NO_DATE" ? "Every balance has a date" : "None"}
              </span>
            </button>
          )
        })}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search expiry"
            placeholder="Search Inventory ID, material, lot or location…"
            className="w-full max-w-[360px] rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
          />
          <span className="text-[11.5px] text-ink-3">
            {shown.length} of {rows.length} expiry-tracked balances{filter ? ` · ${STATE_LABEL[filter]}` : ""}
          </span>
          {filter && (
            <button onClick={() => setFilter("")} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-2 ring-1 ring-line hover:text-ink">
              Show all
            </button>
          )}
        </div>
        <Table
          head={
            <>
              <Th>Material</Th>
              <Th>Inventory ID</Th>
              <Th>Location</Th>
              <Th>Lot / Batch</Th>
              <Th className="text-right">Expiry Quantity</Th>
              <Th>Expiry Date</Th>
              <Th className="text-right">Days to Expiry</Th>
              <Th>Shelf Life</Th>
              <Th className="text-right">Actions</Th>
            </>
          }
          empty={shown.length === 0 ? <Empty>No expiry-tracked balance matches.</Empty> : undefined}
        >
          {shown.map(({ record: r, state, days }) => (
            <Row key={r.inventoryId}>
              <Td>
                <span className="block text-ink">{materialEntry(r.materialId)?.name}</span>
                <span className="block text-[11px] text-ink-3">{gradeEntry(r.gradeId)?.name}</span>
              </Td>
              <Td>
                <button onClick={() => onOpenInventory(r.inventoryId)} className="font-mono text-ink hover:text-accent hover:underline">
                  {r.inventoryId}
                </button>
              </Td>
              <Td className="text-ink-2">{locationName(r.locationId)}</Td>
              <Td className="font-mono text-ink-2">{r.lotId ?? r.batch ?? "—"}</Td>
              <Td className="text-right font-mono text-ink">
                {fmt(r.quantity)} {r.uom}
              </Td>
              <Td className="text-ink-2">{r.expiryDate ? day(r.expiryDate) : <span className="text-ink-3">Not recorded</span>}</Td>
              <Td className="text-right font-mono text-ink-2">
                {days === null ? "—" : days < 0 ? `${Math.abs(days)} days ago` : days}
              </Td>
              <Td>
                {state === "NO_DATE" ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-crit/15 px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide text-ink ring-1 ring-crit/40">
                    <span aria-hidden>?</span> No Date
                  </span>
                ) : (
                  <ShelfLifePill state={state} />
                )}
              </Td>
              <Td className="whitespace-nowrap text-right">
                {canWriteInventory ? (
                  <span className="inline-flex gap-1">
                    {state === "EXPIRED" && r.quantity > 0 && <LinkButton onClick={() => setWriteOff(r)}>Write Off</LinkButton>}
                    <LinkButton onClick={() => setSetDate(r)}>{r.expiryDate ? "Change Date" : "Set Date"}</LinkButton>
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </Td>
            </Row>
          ))}
        </Table>
      </div>

      <div>
        <h2 className="text-[14px] font-bold text-ink">Expiry Write-offs</h2>
        <p className="mb-2.5 text-[11.5px] text-ink-3">Every EXPIRY transaction, newest first, with the balance before and after.</p>
        <Table
          head={
            <>
              <Th>Transaction</Th>
              <Th>Date / Time</Th>
              <Th>Inventory ID</Th>
              <Th>Material</Th>
              <Th>Lot / Batch</Th>
              <Th className="text-right">Written Off</Th>
              <Th className="text-right">Before → After</Th>
              <Th>Reason</Th>
              <Th>User</Th>
            </>
          }
          empty={writeOffs.length === 0 ? <Empty>No stock has been written off as expired.</Empty> : undefined}
        >
          {writeOffs.map((t) => (
            <Row key={t.txnId}>
              <Td className="font-mono text-ink">{t.txnId}</Td>
              <Td className="whitespace-nowrap text-ink-2">{stamp(t.at)}</Td>
              <Td className="font-mono text-ink-2">{t.inventoryId}</Td>
              <Td className="text-ink-2">{materialEntry(t.materialId)?.name}</Td>
              <Td className="font-mono text-ink-2">{t.lotId ?? t.batch ?? "—"}</Td>
              <Td className="text-right font-mono text-ink">
                {fmt(Math.abs(t.quantity))} {t.uom}
              </Td>
              <Td className="whitespace-nowrap text-right font-mono text-ink-2">
                {fmt(t.balanceBefore)} → {fmt(t.balanceAfter)}
              </Td>
              <Td className="text-ink-2">{t.reason ?? "—"}</Td>
              <Td className="font-mono text-ink-3">{t.actor}</Td>
            </Row>
          ))}
        </Table>
      </div>

      {writeOff && <ExpiryWriteOffModal record={writeOff} onClose={() => setWriteOff(null)} />}
      {setDate && <SetExpiryModal record={setDate} onClose={() => setSetDate(null)} />}
    </section>
  )
}

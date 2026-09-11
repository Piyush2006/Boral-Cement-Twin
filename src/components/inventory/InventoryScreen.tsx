"use client"

/**
 * Inventory — actual physical stock.
 *
 * One row per inventory record: an existing Material + Grade at an existing
 * Location, with its quantity, its own min / target / max, and a HEALTHY or
 * CRITICAL status. Records are created here by mapping Master data; nothing
 * about the material or grade is created or edited in this module. Every
 * change to a quantity is a ledger transaction, listed under Transactions.
 */

import { useMemo, useState } from "react"

import { usePiles } from "@/components/shell/pile-store"
import { MATERIAL_GROUPS, gradeEntry, locationEntry, materialEntry, type MaterialGroup } from "@/lib/inventory/catalog"
import { holdsStock } from "@/lib/masters/types"
import { useMasters } from "@/lib/masters/useMasters"
import { STOCK_STATUSES, STOCK_STATUS_META, type InventoryRecord, type StockStatus } from "@/lib/inventory/model"
import { recordStatus } from "@/lib/inventory/status"
import { CreateInventoryModal } from "./CreateInventoryModal"
import { InventoryDetailModal } from "./InventoryDetailModal"
import { StatusBadge } from "./StatusBadge"
import { PrimaryButton } from "./Table"
import { TransactionsView } from "./TransactionsView"
import { ExpiryView } from "./ExpiryView"
import { AddedBanner, useJustAdded } from "@/components/shell/just-added"

type InventoryTab = "balances" | "transactions" | "expiry"

const TABS: Array<{ id: InventoryTab; label: string }> = [
  { id: "balances", label: "Inventory" },
  { id: "transactions", label: "Transactions" },
  { id: "expiry", label: "Expiry" },
]

export function InventoryScreen() {
  const { inventory, ledger, lastUpdated, canWriteInventory, inventoryTab: tab, setInventoryTab: setTab } = usePiles()
  const masters = useMasters()
  const storage = useMemo(() => masters.locations.filter((l) => holdsStock(l)), [masters.locations])
  const [createOpen, setCreateOpen] = useState(false)

  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<"" | MaterialGroup>("")
  const [location, setLocation] = useState("")
  const [status, setStatus] = useState<"" | StockStatus>("")
  const [showArchived, setShowArchived] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const added = useJustAdded()

  const active = useMemo(() => inventory.filter((r) => r.active), [inventory])
  /** Expired balances still holding stock — shown on the Expiry tab. */
  const expiredCount = useMemo(
    () =>
      active.filter(
        (r) => r.quantity > 0 && r.expiryDate && materialEntry(r.materialId)?.expiryApplicable && new Date(r.expiryDate).getTime() < Date.now(),
      ).length,
    [active],
  )
  const counts = useMemo(
    () => ({
      HEALTHY: active.filter((r) => recordStatus(r) === "HEALTHY").length,
      CRITICAL: active.filter((r) => recordStatus(r) === "CRITICAL").length,
    }),
    [active],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inventory.filter((r) => {
      if (!showArchived && !r.active) return false
      const m = materialEntry(r.materialId)
      if (group && m?.group !== group) return false
      if (location && r.locationId !== location) return false
      if (status && recordStatus(r) !== status) return false
      if (!q) return true
      return [r.inventoryId, r.locationId, r.batch, r.lotId, r.description, m?.name, m?.code, m?.group, gradeEntry(r.gradeId)?.name, locationEntry(r.locationId)?.name].some(
        (v) => v?.toLowerCase().includes(q),
      )
    })
  }, [inventory, query, group, location, status, showArchived])

  const detail = detailId ? inventory.find((r) => r.inventoryId === detailId) ?? null : null
  const filtersOn = query || group || location || status || showArchived

  return (
    <div className="absolute inset-0 overflow-auto bg-bg pt-[86px]">
      <div className="mx-auto max-w-[1400px] px-6 pb-10">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-ink">Inventory</h1>
            <p className="text-[12px] text-ink-3">
              {tab === "balances" ? (
                <>
                  {filtered.length} of {active.length} records · {counts.HEALTHY} HEALTHY · {counts.CRITICAL} CRITICAL
                  {lastUpdated && ` · updated ${lastUpdated.toLocaleTimeString([], { hour12: false })}`}
                </>
              ) : tab === "expiry" ? (
                <>Expiry management · shelf life, expiry dates and write-offs for expiry-tracked materials</>
              ) : (
                <>Inventory transaction history · {ledger.length} transactions</>
              )}
            </p>
          </div>

          <PrimaryButton onClick={() => setCreateOpen(true)} disabled={!canWriteInventory}>
            + Create Inventory
          </PrimaryButton>
        </header>

        <div role="tablist" aria-label="Inventory sections" className="mb-4 flex gap-6 border-b border-line">
          {TABS.map((t) => (
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
              {t.id === "transactions" && ledger.length > 0 && (
                <span className="ml-2 rounded-full bg-panel-2 px-1.5 py-[1px] text-[10px] font-bold text-ink-2">{ledger.length}</span>
              )}
              {t.id === "expiry" && expiredCount > 0 && (
                <span className="ml-2 rounded-full bg-crit/15 px-1.5 py-[1px] text-[10px] font-bold text-ink ring-1 ring-crit/40" title="Expired balances holding stock">
                  {expiredCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "transactions" ? (
          <TransactionsView onOpenInventory={(id) => setDetailId(id)} />
        ) : tab === "expiry" ? (
          <ExpiryView onOpenInventory={(id) => setDetailId(id)} />
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
                  aria-label="Search inventory"
                  placeholder="Search Material, Grade, Inventory ID or Location…"
                  className="w-full rounded-lg bg-panel px-3 py-2 pl-9 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
                />
              </div>
              <Select value={group} onChange={(v) => setGroup(v as MaterialGroup | "")} label="Category">
                {MATERIAL_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              <Select value={location} onChange={setLocation} label="Location">
                {storage.map((l) => (
                  <option key={l.locationId} value={l.locationId}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Select value={status} onChange={(v) => setStatus(v as StockStatus | "")} label="Status">
                {STOCK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STOCK_STATUS_META[s].label}
                  </option>
                ))}
              </Select>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-ink-2 ring-1 ring-line hover:text-ink">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[var(--color-accent)]" />
                Show archived
              </label>
              {filtersOn && (
                <button
                  onClick={() => {
                    setQuery("")
                    setGroup("")
                    setLocation("")
                    setStatus("")
                    setShowArchived(false)
                  }}
                  className="rounded-lg px-3 py-2 text-[12px] text-ink-2 ring-1 ring-line hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>

            <AddedBanner added={added} />
            <div className="overflow-x-auto rounded-xl ring-1 ring-line">
              <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-panel-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                    <Th>Material</Th>
                    <Th>Inventory ID</Th>
                    <Th>Location</Th>
                    <Th className="text-right">Quantity</Th>
                    <Th className="w-[64px]">UOM</Th>
                    <Th className="text-right">Min Stock</Th>
                    <Th className="text-right">Target</Th>
                    <Th className="text-right">Max Stock</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <InventoryRow key={r.inventoryId} record={r} added={added.is(r.inventoryId)} onView={() => setDetailId(r.inventoryId)} />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="border-t border-line py-8 text-center text-ink-3">
                        No inventory records match those filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-ink-3">
              Status is HEALTHY while the quantity is above Min Stock and CRITICAL at or below it. Quantity is system-controlled: it
              changes only through Incoming, Issue &amp; Consumption, returns, adjustments and loss transactions. Quantities are Demo /
              Simulated until the inventory system is connected.
            </p>
          </>
        )}
      </div>

      {detail && <InventoryDetailModal record={detail} onClose={() => setDetailId(null)} />}
      {createOpen && (
        <CreateInventoryModal
          onClose={() => setCreateOpen(false)}
          onCreated={(record, txn) => {
            // Back to the list, with nothing filtering the new record out.
            setTab("balances")
            setQuery("")
            setGroup("")
            setLocation("")
            setStatus("")
            const m = materialEntry(record.materialId)
            const g = gradeEntry(record.gradeId)
            added.mark(
              record.inventoryId,
              `Inventory ${record.inventoryId} created — ${m?.name ?? record.materialId}${g ? ` ${g.name}` : ""} at ${locationEntry(record.locationId)?.name ?? record.locationId}, ${
                txn ? `opening balance ${Math.round(record.quantity).toLocaleString()} ${record.uom} (${txn.txnId})` : `starting at 0 ${record.uom}`
              }, ${recordStatus(record)}.`,
            )
          }}
        />
      )}
    </div>
  )
}

function InventoryRow({ record: r, onView, added }: { record: InventoryRecord; onView: () => void; added?: boolean }) {
  const m = materialEntry(r.materialId)
  const grade = gradeEntry(r.gradeId)
  const status = recordStatus(r)
  return (
    <tr
      className={`border-t border-line bg-panel/60 hover:bg-panel-2 ${r.active ? "" : "opacity-60"} ${added ? "added-row" : ""}`}
      data-inventory={r.inventoryId}
      data-added-key={r.inventoryId}
    >
      <Td>
        <span className="block text-ink">{m?.name ?? r.materialId}</span>
        <span className="block text-[11px] text-ink-3">
          {grade?.name ?? "—"} · {m?.code}
        </span>
      </Td>
      <Td>
        <span className="block font-mono text-ink">{r.inventoryId}</span>
        {/* Expiry, where it applies — text, not colour alone. */}
        {r.expiryDate && m?.expiryApplicable && (
          <span className="block text-[11px] text-ink-3">
            {new Date(r.expiryDate).getTime() < Date.now() ? "✕ Expired " : "Expires "}
            {new Date(r.expiryDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
        {!r.active && <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Archived</span>}
      </Td>
      <Td className="text-ink-2">{locationEntry(r.locationId)?.name ?? r.locationId}</Td>
      <Td className="text-right font-mono font-semibold text-ink">{Math.round(r.quantity).toLocaleString()}</Td>
      <Td className="text-ink-3">{r.uom}</Td>
      <Td className="text-right font-mono text-ink-2">{r.minStock.toLocaleString()}</Td>
      <Td className="text-right font-mono text-ink-2">{r.targetStock.toLocaleString()}</Td>
      <Td className="text-right font-mono text-ink-2">{r.maxStock.toLocaleString()}</Td>
      <Td>
        <StatusBadge status={status} />
      </Td>
      <Td className="text-right">
        <button onClick={onView} className="rounded px-2 py-1 text-[12px] font-medium text-accent hover:underline">
          View
        </button>
      </Td>
    </tr>
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

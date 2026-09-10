"use client"

/**
 * Inventory workspace.
 *
 * A working table over the plant's existing inventory balances — search,
 * filter, add, inspect. Quantities are the balances the rest of the application
 * uses; this screen performs no inventory arithmetic of its own, and every
 * addition goes through the transaction ledger.
 */

import { useMemo, useState } from "react"

import {
  LOCATIONS,
  MATERIAL_GROUPS,
  locationEntry,
  materialEntry,
  type MaterialGroup,
} from "@/lib/inventory/catalog"
import { STATUS_META } from "@/lib/inventory/pile-inventory"
import type { PileStatus } from "@/lib/assets/piles"
import { usePiles } from "@/components/shell/pile-store"
import { AddInventoryModal } from "./AddInventoryModal"
import { InventoryDetailModal } from "./InventoryDetailModal"
import { TransactionsView } from "./TransactionsView"

export type InventoryRow = {
  locationId: string
  materialId: string
  materialCode: string
  materialName: string
  materialGroup: MaterialGroup
  description: string
  locationName: string
  quantity: number
  capacity: number
  uom: string
  status: PileStatus
  lastUpdatedAt: string
}

/** Sections of the Inventory module. */
type InventoryTab = "balances" | "transactions"

const TABS: Array<{ id: InventoryTab; label: string }> = [
  { id: "balances", label: "Inventory" },
  { id: "transactions", label: "Transactions" },
]

export function InventoryScreen() {
  const { records, silos, ledger, canWriteInventory, lastUpdated } = usePiles()
  const [tab, setTab] = useState<InventoryTab>("balances")

  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<"" | MaterialGroup>("")
  const [location, setLocation] = useState("")
  const [status, setStatus] = useState<"" | PileStatus>("")
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<InventoryRow | null>(null)

  /**
   * One row per material AND location. Balances at different locations are
   * never merged — the data model treats them separately.
   */
  const rows: InventoryRow[] = useMemo(() => {
    const fromPiles = records.map((r) => {
      const m = materialEntry(r.materialId)
      return {
        locationId: r.pileId,
        materialId: r.materialId,
        materialCode: r.id,
        materialName: r.materialName,
        materialGroup: m?.group ?? ("Raw Material" as MaterialGroup),
        description: m?.description ?? r.materialName,
        locationName: locationEntry(r.pileId)?.name ?? r.pileId,
        quantity: r.quantityMt,
        capacity: r.capacityMt,
        uom: "MT",
        status: r.status,
        lastUpdatedAt: r.lastUpdatedAt,
      }
    })

    const fromSilos = silos.map((s) => {
      const m = materialEntry("MAT-CEMENT")
      return {
        locationId: s.id,
        materialId: "MAT-CEMENT",
        materialCode: m?.code ?? "FG-OPC-001",
        materialName: "Cement",
        materialGroup: "Finished Product" as MaterialGroup,
        description: m?.description ?? "Ordinary Portland Cement",
        locationName: locationEntry(s.id)?.name ?? s.name,
        quantity: s.quantityMt,
        capacity: s.capacityMt,
        uom: "MT",
        status: s.status,
        lastUpdatedAt: s.lastUpdatedAt,
      }
    })

    return [...fromPiles, ...fromSilos]
  }, [records, silos])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (group && r.materialGroup !== group) return false
      if (location && r.locationId !== location) return false
      if (status && r.status !== status) return false
      if (!q) return true
      return (
        r.materialCode.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.materialName.toLowerCase().includes(q) ||
        r.materialGroup.toLowerCase().includes(q)
      )
    })
  }, [rows, query, group, location, status])

  return (
    <div className="absolute inset-0 overflow-auto bg-bg pt-[86px]">
      <div className="mx-auto max-w-[1400px] px-6 pb-10">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-ink">Inventory</h1>
            <p className="text-[12px] text-ink-3">
              {tab === "balances" ? (
                <>
                  Material balances by location · {filtered.length} of {rows.length} records
                  {lastUpdated &&
                    ` · updated ${lastUpdated.toLocaleTimeString([], { hour12: false })}`}
                </>
              ) : (
                <>Inventory transaction history · {ledger.length} records</>
              )}
            </p>
          </div>

          {canWriteInventory ? (
            <button
              onClick={() => setAddOpen(true)}
              className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110"
            >
              + Add Inventory
            </button>
          ) : (
            // Read-only users get no working action, not a disabled decoration.
            <span className="rounded-lg bg-panel-2 px-3.5 py-2 text-[12px] text-ink-3 ring-1 ring-line">
              Read-only access
            </span>
          )}
        </header>

        {/* Module sections */}
        <div
          role="tablist"
          aria-label="Inventory sections"
          className="mb-4 flex gap-6 border-b border-line"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-1 pb-2.5 text-[13px] font-semibold transition-colors ${
                tab === t.id
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {t.label}
              {t.id === "transactions" && ledger.length > 0 && (
                <span className="ml-2 rounded-full bg-panel-2 px-1.5 py-[1px] text-[10px] font-bold text-ink-2">
                  {ledger.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "transactions" ? (
          <TransactionsView />
        ) : (
          <>
        {/* Search and filters */}
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
              aria-label="Search inventory"
              placeholder="Search Material ID, Description or Group…"
              className="w-full rounded-lg bg-panel px-3 py-2 pl-9 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
            />
          </div>

          <Select value={group} onChange={(v) => setGroup(v as MaterialGroup | "")} label="Material Group">
            {MATERIAL_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>

          <Select value={location} onChange={setLocation} label="Location">
            {LOCATIONS.map((l) => (
              <option key={l.locationId} value={l.locationId}>
                {l.name}
              </option>
            ))}
          </Select>

          <Select value={status} onChange={(v) => setStatus(v as PileStatus | "")} label="Status">
            {(Object.keys(STATUS_META) as PileStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>

          {(query || group || location || status) && (
            <button
              onClick={() => {
                setQuery("")
                setGroup("")
                setLocation("")
                setStatus("")
              }}
              className="rounded-lg px-3 py-2 text-[12px] text-ink-2 ring-1 ring-line hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {/* Table — scrolls horizontally on small screens rather than reflowing. */}
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-panel-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                <Th className="w-[52px]">S.No.</Th>
                <Th>Material Group</Th>
                <Th>Material ID</Th>
                <Th>Material Description</Th>
                <Th>Location</Th>
                <Th className="text-right">Quantity</Th>
                <Th className="w-[64px]">UOM</Th>
                <Th>Status</Th>
                <Th>Last Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const st = STATUS_META[r.status]
                return (
                  <tr
                    key={`${r.locationId}-${r.materialId}`}
                    className="border-t border-line bg-panel/60 hover:bg-panel-2"
                  >
                    <Td className="text-ink-3">{i + 1}</Td>
                    <Td>{r.materialGroup}</Td>
                    <Td className="font-mono text-ink">{r.materialCode}</Td>
                    <Td>
                      <span className="block text-ink">{r.materialName}</span>
                      <span className="block text-[11px] text-ink-3">{r.description}</span>
                    </Td>
                    <Td className="text-ink-2">{r.locationName}</Td>
                    <Td className="text-right font-mono font-semibold text-ink">
                      {Math.round(r.quantity).toLocaleString()}
                    </Td>
                    <Td className="text-ink-3">{r.uom}</Td>
                    <Td>
                      {/* Colour plus icon plus text — never colour alone. */}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-semibold"
                        style={{ color: st.colour, background: `${st.colour}1f` }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: st.colour }} />
                        {st.label}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-3">
                      {new Date(r.lastUpdatedAt).toLocaleString("en-AU", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </Td>
                    <Td className="text-right">
                      <button
                        onClick={() => setDetail(r)}
                        className="rounded px-2 py-1 text-[12px] font-medium text-accent hover:underline"
                      >
                        View
                      </button>
                    </Td>
                  </tr>
                )
              })}
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
          Quantities are the plant&apos;s inventory balances and are marked Demo / Simulated until
          the inventory system is connected. Valuation is not held by the current system, so no
          Total Value is shown.
        </p>
          </>
        )}
      </div>

      {addOpen && <AddInventoryModal onClose={() => setAddOpen(false)} />}
      {detail && (
        <InventoryDetailModal row={detail} ledger={ledger} onClose={() => setDetail(null)} />
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

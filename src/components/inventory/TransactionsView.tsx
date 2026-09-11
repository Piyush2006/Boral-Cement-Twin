"use client"

/**
 * Inventory transaction ledger.
 *
 * Every quantity change in the application is written here before a balance
 * moves — incoming, returns, adjustments, consumption, expiry, waste, loss and
 * unaccounted — each under its exact type, so any balance can be traced to the
 * transactions that produced it. This screen reads the ledger; it never writes to it and performs no
 * inventory arithmetic.
 */

import { useMemo, useState } from "react"

import { usePiles } from "@/components/shell/pile-store"
import { gradeEntry, locationEntry, materialEntry } from "@/lib/inventory/catalog"
import {
  TRANSACTION_TYPES,
  transactionLabel,
  transactionReference,
  type InventoryTransaction,
  type TransactionType,
} from "@/lib/inventory/ledger"
import { toneText } from "@/lib/theme/tone"

export const TYPE_TONE: Record<TransactionType, string> = {
  INCOMING: "#22c55e",
  RETURN: "#38bdf8",
  ADJUSTMENT: "#14b8a6",
  CONSUMPTION: "#f97316",
  ISSUE: "#f87171",
  EXPIRY: "#ef4444",
  WASTE: "#f59e0b",
  LOSS: "#e11d48",
  UNACCOUNTED: "#94a3b8",
}

export const stampFull = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

export function TransactionsView({ onOpenInventory }: { onOpenInventory?: (inventoryId: string) => void }) {
  const { ledger } = usePiles()
  const [query, setQuery] = useState("")
  const [type, setType] = useState<"" | TransactionType>("")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ledger.filter((t) => {
      if (type && t.type !== type) return false
      if (!q) return true
      const material = materialEntry(t.materialId)
      return [
        t.txnId,
        t.inventoryId,
        t.locationId,
        t.reason,
        t.reference,
        t.batch,
        ...Object.values(t.links),
        material?.name,
        material?.code,
      ].some((v) => v?.toLowerCase().includes(q))
    })
  }, [ledger, query, type])

  return (
    <div>
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
            aria-label="Search transactions"
            placeholder="Search Transaction, Inventory ID, PO, Gate Entry, GRN, Issue, lot, reason…"
            className="w-full rounded-lg bg-panel px-3 py-2 pl-9 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TransactionType | "")}
          aria-label="Transaction type"
          className="rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line focus:ring-accent"
        >
          <option value="">Type: All</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {transactionLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[1180px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-panel-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
              <th className="px-3 py-2.5">Transaction</th>
              <th className="px-3 py-2.5">Date / Time</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Inventory ID</th>
              <th className="px-3 py-2.5">Material + Grade</th>
              <th className="px-3 py-2.5 text-right">Previous</th>
              <th className="px-3 py-2.5 text-right">Movement</th>
              <th className="px-3 py-2.5 text-right">New</th>
              <th className="px-3 py-2.5">Reason / Reference</th>
              <th className="px-3 py-2.5">User</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <TransactionRow key={t.txnId} t={t} onOpenInventory={onOpenInventory} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="border-t border-line py-10 text-center text-[13px] text-ink-2">
                  {ledger.length === 0 ? "No inventory transactions recorded yet." : "No transactions match that search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-ink-3">
        Every quantity change is recorded here before the balance moves, so the ledger and the on-hand
        figure cannot disagree. {ledger.length} transactions.
      </p>
    </div>
  )
}

function TransactionRow({ t, onOpenInventory }: { t: InventoryTransaction; onOpenInventory?: (id: string) => void }) {
  const material = materialEntry(t.materialId)
  const tone = TYPE_TONE[t.type]
  const reference = transactionReference(t)
  return (
    <tr className="border-t border-line bg-panel/60 hover:bg-panel-2">
      <td className="px-3 py-2.5 font-mono text-[11.5px] text-ink">{t.txnId}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{stampFull(t.at)}</td>
      <td className="px-3 py-2.5">
        {/* Colour plus dot plus text — never colour alone. */}
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-[2px] text-[11px] font-semibold"
          style={{ color: toneText(tone), background: `${tone}1f` }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
          {transactionLabel(t.type, t.quantity)}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {onOpenInventory ? (
          <button onClick={() => onOpenInventory(t.inventoryId)} className="font-mono text-[12px] text-accent hover:underline">
            {t.inventoryId}
          </button>
        ) : (
          <span className="font-mono text-[12px] text-ink">{t.inventoryId}</span>
        )}
        <span className="block text-[11px] text-ink-3">{locationEntry(t.locationId)?.name ?? t.locationId}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="block text-ink">{material?.name ?? t.materialId}</span>
        <span className="block text-[11px] text-ink-3">
          {gradeEntry(t.gradeId)?.name ?? "—"}
          {t.lotId ? ` · ${t.lotId}` : t.batch ? ` · Batch ${t.batch}` : ""}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-ink-2">{Math.round(t.balanceBefore).toLocaleString()}</td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: toneText(t.quantity >= 0 ? "#22c55e" : "#f87171") }}>
        {t.quantity > 0 ? "+" : ""}
        {Math.round(t.quantity).toLocaleString()} {t.uom}
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink">{Math.round(t.balanceAfter).toLocaleString()}</td>
      <td className="px-3 py-2.5 text-ink-2">
        {t.reason && <span className="block text-ink">{t.reason}</span>}
        <span className="block font-mono text-[11px] text-ink-3">{reference}</span>
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px] text-ink-3">{t.actor}</td>
    </tr>
  )
}

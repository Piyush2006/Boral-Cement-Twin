"use client"

/**
 * Inventory transaction history.
 *
 * The full ledger, in one place. Every balance movement in the application is
 * written here — receipts from Add Inventory and adjustments from the physical
 * count workflow — so a quantity can always be traced back to what moved it.
 *
 * This screen reads the ledger; it never writes to it and performs no
 * inventory arithmetic.
 */

import { useMemo, useState } from "react"

import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { transactionLabel, type TransactionType } from "@/lib/inventory/ledger"
import { usePiles } from "@/components/shell/pile-store"

const TYPES: TransactionType[] = ["RECEIPT", "COUNT_ADJUSTMENT", "ISSUE"]

const TYPE_TONE: Record<TransactionType, string> = {
  RECEIPT: "#22c55e",
  COUNT_ADJUSTMENT: "#eab308",
  ISSUE: "#f87171",
}

export function TransactionsView() {
  const { ledger } = usePiles()
  const [query, setQuery] = useState("")
  const [type, setType] = useState<"" | TransactionType>("")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ledger.filter((t) => {
      if (type && t.type !== type) return false
      if (!q) return true
      const material = materialEntry(t.materialId)
      return (
        t.txnId.toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        t.locationId.toLowerCase().includes(q) ||
        (material?.name ?? "").toLowerCase().includes(q) ||
        (material?.code ?? "").toLowerCase().includes(q)
      )
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
            aria-label="Search transactions"
            placeholder="Search transaction ID, reference, material or location…"
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
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {transactionLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[1040px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-panel-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
              <th className="px-3 py-2.5">Transaction ID</th>
              <th className="px-3 py-2.5">Date / Time</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Material</th>
              <th className="px-3 py-2.5">Location</th>
              <th className="px-3 py-2.5 text-right">Quantity</th>
              <th className="px-3 py-2.5 text-right">Balance After</th>
              <th className="px-3 py-2.5">Reference</th>
              <th className="px-3 py-2.5">User</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const material = materialEntry(t.materialId)
              const tone = TYPE_TONE[t.type]
              return (
                <tr key={t.txnId} className="border-t border-line bg-panel/60 hover:bg-panel-2">
                  <td className="px-3 py-2.5 font-mono text-[11px] text-ink-2">{t.txnId}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">
                    {new Date(t.at).toLocaleString("en-AU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </td>
                  <td className="px-3 py-2.5">
                    {/* Colour plus dot plus text — never colour alone. */}
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-semibold"
                      style={{ color: tone, background: `${tone}1f` }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
                      {transactionLabel(t.type)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-ink">{material?.name ?? t.materialId}</span>
                    <span className="block font-mono text-[10.5px] text-ink-3">
                      {material?.code ?? t.materialId}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">
                    {locationEntry(t.locationId)?.name ?? t.locationId}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-mono font-semibold"
                    style={{ color: t.quantity >= 0 ? "#22c55e" : "#f87171" }}
                  >
                    {t.quantity > 0 ? "+" : ""}
                    {Math.round(t.quantity).toLocaleString()} {t.uom}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    {Math.round(t.balanceAfter).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{t.reference}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-ink-3">{t.actor}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="border-t border-line py-10 text-center">
                  <div className="text-[13px] text-ink-2">
                    {ledger.length === 0
                      ? "No inventory transactions recorded yet."
                      : "No transactions match that search."}
                  </div>
                  {ledger.length === 0 && (
                    <div className="mt-1 text-[11.5px] text-ink-3">
                      Adding inventory or recording a physical count will appear here.
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-ink-3">
        Every balance movement is recorded here before the quantity changes, so the ledger and the
        on-hand figure cannot disagree.
      </p>
    </div>
  )
}

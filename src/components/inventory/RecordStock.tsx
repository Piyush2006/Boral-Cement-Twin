"use client"

/**
 * Record Stock — physical verification against a pile.
 *
 * Shows the system quantity, takes the counted quantity, and reports the
 * variance before anything is recorded. Consistent with the QR workflow: this
 * captures a count, it is not a free-hand edit of the book figure.
 */

import { useEffect, useState } from "react"

import { materialColour } from "@/lib/assets/materials"
import { usePiles } from "@/components/shell/pile-store"

export function RecordStock() {
  const { recordStockOpen, setRecordStockOpen, selected, applyCount } = usePiles()
  const [count, setCount] = useState("")
  const [done, setDone] = useState<{ variance: number; pct: number } | null>(null)

  useEffect(() => {
    if (recordStockOpen) {
      setCount("")
      setDone(null)
    }
  }, [recordStockOpen])

  if (!recordStockOpen || !selected) return null

  const physical = Number(count)
  const valid = count !== "" && Number.isFinite(physical) && physical >= 0
  const variance = valid ? physical - selected.quantityMt : null

  const submit = () => {
    if (!valid) return
    const v = physical - selected.quantityMt
    applyCount(selected.pileId, physical)
    setDone({ variance: v, pct: selected.quantityMt ? (v / selected.quantityMt) * 100 : 0 })
  }

  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-[400px] overflow-hidden rounded-xl bg-panel ring-1 ring-white/12">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-[14px] font-bold text-white">Record Stock</div>
            <div className="text-[11.5px] text-ink-3">Physical verification</div>
          </div>
          <button
            aria-label="Close"
            onClick={() => setRecordStockOpen(false)}
            className="text-[20px] leading-none text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-panel-2 p-3">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/40"
              style={{ background: materialColour(selected.materialId) }}
            />
            <div className="min-w-0 text-[12.5px]">
              <div className="font-bold text-white">{selected.pileId}</div>
              <div className="text-ink-2">
                {selected.id} · {selected.materialName}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[10px] uppercase tracking-wide text-ink-3">System qty</div>
              <div className="font-mono text-[14px] text-ink">
                {Math.round(selected.quantityMt).toLocaleString()} MT
              </div>
            </div>
          </div>

          {!done ? (
            <>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
                Counted quantity (MT)
              </label>
              <input
                autoFocus
                inputMode="decimal"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="0"
                className="w-full rounded-lg bg-panel-2 px-3 py-2.5 font-mono text-[16px] text-ink outline-none ring-1 ring-white/10 focus:ring-accent"
              />

              {variance !== null && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-panel-2 px-3 py-2.5">
                  <span className="text-[12px] text-ink-3">Variance</span>
                  <span
                    className="font-mono text-[15px] font-bold"
                    style={{
                      color: variance === 0 ? "#22c55e" : variance < 0 ? "#ef4444" : "#eab308",
                    }}
                  >
                    {variance > 0 ? "+" : ""}
                    {variance.toLocaleString()} MT
                  </span>
                </div>
              )}

              <button
                onClick={submit}
                disabled={!valid}
                className="mt-4 w-full rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink disabled:opacity-40"
              >
                Submit Count
              </button>
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">
                Recorded as a physical count for reconciliation. Quantities shown are demo data
                until the inventory system is connected.
              </p>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-ok/10 p-3 ring-1 ring-ok/40">
                <div className="text-[13px] font-semibold text-ok">Count recorded</div>
                <div className="mt-1 text-[12px] text-ink-2">
                  Variance{" "}
                  <span className="font-mono text-ink">
                    {done.variance > 0 ? "+" : ""}
                    {done.variance.toLocaleString()} MT ({done.pct.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setRecordStockOpen(false)}
                className="mt-4 w-full rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink"
              >
                Back to the plant map
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

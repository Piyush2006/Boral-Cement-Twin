"use client"

/** Stock-health badge. Only HEALTHY and CRITICAL exist; colour + dot + text. */

import { STOCK_STATUS_META, type StockStatus } from "@/lib/inventory/model"
import { toneText } from "@/lib/theme/tone"

export function StatusBadge({ status, size = "sm" }: { status: StockStatus; size?: "sm" | "md" }) {
  const meta = STOCK_STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold tracking-wide ${
        size === "md" ? "px-2.5 py-[3px] text-[11.5px]" : "px-2 py-[2px] text-[10.5px]"
      }`}
      style={{ color: toneText(meta.colour), background: `${meta.colour}1f` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: meta.colour }} />
      {meta.label}
    </span>
  )
}

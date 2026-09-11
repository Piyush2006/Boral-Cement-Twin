"use client"

/**
 * Inventory legend for the Satellite view: material colours, the two kinds of
 * stock location, and the two stock statuses. Nothing else is drawn on the map.
 */

import { MATERIALS } from "@/lib/assets/materials"
import { PLANT_ICONS, TYPE_META, type PlantAssetType } from "@/lib/assets/plant-assets"
import { STOCK_STATUSES, STOCK_STATUS_META } from "@/lib/inventory/model"

const LOCATION_TYPES: Array<{ type: PlantAssetType; label: string }> = [
  { type: "pile", label: "Stockpile" },
  { type: "silo", label: "Cement Silo" },
]

export function PlantLegend() {
  return (
    <div className="grid gap-2.5">
      <div>
        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-3">Material Type</div>
        {MATERIALS.map((m) => (
          <div key={m.materialId} className="flex items-center gap-2 py-[2px] text-[11.5px] text-ink-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-[var(--surface-border)]"
              style={{ background: m.colour }}
            />
            {m.name}
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-3">Inventory Location</div>
        {LOCATION_TYPES.map(({ type, label }) => (
          <div key={type} className="flex items-center gap-2 py-[2px] text-[11.5px] text-ink-2">
            <span
              aria-hidden
              className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px]"
              style={{ background: TYPE_META[type].colour, color: "#0b1220" }}
              dangerouslySetInnerHTML={{
                __html: `<svg viewBox="0 0 24 24" width="12" height="12">${PLANT_ICONS[TYPE_META[type].icon]}</svg>`,
              }}
            />
            {label}
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-3">Stock Status</div>
        {STOCK_STATUSES.map((s) => (
          <div key={s} className="flex items-center gap-2 py-[2px] text-[11.5px] text-ink-2">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STOCK_STATUS_META[s].colour }} />
            {STOCK_STATUS_META[s].label === "HEALTHY" ? "Healthy — above Min Stock" : "Critical — at or below Min Stock"}
          </div>
        ))}
      </div>
    </div>
  )
}

"use client"

/** Floating map furniture: title, legend, note, view switcher and scale bar. */

import { MATERIALS } from "@/lib/assets/materials"
import { usePiles } from "@/components/shell/pile-store"

export function MaterialLegend() {
  const { panels, togglePanel } = usePiles()
  if (!panels.legend) return null
  return (
    <div className="absolute left-4 top-[86px] z-[900] rounded-xl bg-white/95 px-4 py-3 shadow-2xl ring-1 ring-black/10">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-[13px] font-bold text-[#0d1219]">Material Type (Legend)</span>
        <button
          onClick={() => togglePanel("legend", false)}
          aria-label="Close Legend"
          className="text-[16px] leading-none text-black/45 hover:text-black"
        >
          ×
        </button>
      </div>
      {MATERIALS.map((m) => (
        <div key={m.materialId} className="flex items-center gap-2.5 py-[3px]">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/30"
            style={{ background: m.colour }}
          />
          <span className="text-[12.5px] text-[#1c2530]">{m.name}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * The provenance note. It is on the map, not buried in a panel, because these
 * pile IDs and quantities are configured demo data — not Boral's.
 */
export function NoteCard() {
  const { panels, togglePanel } = usePiles()
  if (!panels.note) return null
  return (
    <div className="absolute left-4 top-4 z-[900] max-w-[340px] rounded-xl bg-panel/92 px-4 py-3 pr-8 text-[11px] leading-relaxed text-ink-2 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <button
        onClick={() => togglePanel("note", false)}
        aria-label="Close Note"
        className="absolute right-2 top-2 text-[15px] leading-none text-ink-3 hover:text-ink"
      >
        ×
      </button>
      <span className="font-semibold text-ink">Note:</span> Pile locations are identified based on
      satellite imagery. Actual pile IDs, materials, capacities and quantities should be validated
      with plant data/verified layout.
      <div className="mt-1 text-ink-3">Image source: Esri World Imagery (2024)</div>
    </div>
  )
}

export function ScaleBar() {
  return (
    <div className="pointer-events-none absolute bottom-5 right-6 z-[900] text-[10px] text-white/85">
      <div className="mb-0.5 flex justify-between" style={{ width: 190 }}>
        <span>0</span>
        <span>100</span>
        <span>200</span>
        <span>500 m</span>
      </div>
      <div className="flex h-[7px]" style={{ width: 190 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 border border-white/80"
            style={{ background: i % 2 ? "transparent" : "rgba(255,255,255,.85)" }}
          />
        ))}
      </div>
    </div>
  )
}

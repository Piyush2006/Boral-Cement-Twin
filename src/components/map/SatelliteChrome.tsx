"use client"

/** Asset Type legend, Live Inventory summary, note, compass, zoom and scale. */

import { KIND_META, LEGEND_ORDER } from "@/lib/assets/site-assets"
import { materialColour } from "@/lib/assets/materials"
import { STATUS_META } from "@/lib/inventory/pile-inventory"
import { usePiles } from "@/components/shell/pile-store"
import { mapControls } from "./map-controls"

export function AssetTypeLegend() {
  return (
    <div
      className="pointer-events-none absolute right-3 top-[96px] z-[700] rounded-xl px-3.5 py-3 backdrop-blur-md"
      style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
    >
      <div className="mb-2 text-[12.5px] font-bold text-ink">Asset Type</div>
      {LEGEND_ORDER.map((kind) => (
        <div key={kind} className="flex items-center gap-2.5 py-[3px]">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: KIND_META[kind].colour }}
          />
          <span className="text-[11.5px] text-ink-2">{KIND_META[kind].label}</span>
        </div>
      ))}
    </div>
  )
}

export function LiveInventoryCard() {
  const { records, selectedId, select, panels, togglePanel } = usePiles()
  if (!panels.inventory) return null

  const top = records.slice(0, 5)

  return (
    <div
      className="absolute bottom-3 left-3 z-[700] w-[430px] max-w-[calc(100%-24px)] overflow-hidden rounded-xl backdrop-blur-md"
      style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
    >
      <div className="flex items-center justify-between px-3.5 pb-1.5 pt-2.5">
        <span className="text-[12.5px] font-bold text-ink">Live Inventory (Top Assets)</span>
        <button
          onClick={() => togglePanel("inventory", false)}
          className="text-[11.5px] font-medium text-[#4da3ff] hover:underline"
        >
          View All
        </button>
      </div>
      <div className="px-1.5 pb-2">
        {top.map((r) => {
          const st = STATUS_META[r.status]
          const active = r.pileId === selectedId
          return (
            <button
              key={r.pileId}
              onClick={() => select(r.pileId)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] text-left ${
                active ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: materialColour(r.materialId) }}
              />
              <span className="w-[92px] shrink-0 font-mono text-[11px] text-white">{r.pileId}</span>
              <span className="flex-1 truncate text-[11.5px] text-ink-2">{r.materialName}</span>
              <span className="w-[74px] shrink-0 text-right font-mono text-[11.5px] text-white">
                {Math.round(r.quantityMt).toLocaleString()} MT
              </span>
              <span
                className="flex w-[76px] shrink-0 items-center justify-end gap-1.5 text-[11px]"
                style={{ color: st.colour }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: st.colour }} />
                {st.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ApproximateNote() {
  const { panels, togglePanel } = usePiles()
  if (!panels.note) return null
  return (
    <div
      className="absolute bottom-3 left-1/2 z-[700] flex max-w-[420px] -translate-x-1/2 items-start gap-2.5 rounded-xl px-3.5 py-2.5 backdrop-blur-md"
      style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
    >
      <span className="mt-[1px] text-[13px] text-ink-3" aria-hidden>
        ⓘ
      </span>
      <span className="text-[11px] leading-relaxed text-ink-2">
        Asset positions are approximate and based on satellite imagery. Not survey-verified.
      </span>
      <button
        onClick={() => togglePanel("note", false)}
        aria-label="Close note"
        className="ml-1 text-[14px] leading-none text-ink-3 hover:text-white"
      >
        ×
      </button>
    </div>
  )
}

export function MapChrome() {
  return (
    <div className="absolute bottom-3 right-3 z-[700] flex items-end gap-2">
      <ScaleBar />
      <div
        className="grid h-[46px] w-[46px] place-items-center rounded-full backdrop-blur-md"
        style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
        aria-hidden
      >
        <svg viewBox="0 0 44 44" width="34" height="34">
          <text x="22" y="10" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.75)">
            N
          </text>
          <path d="M22 14 27 32 22 28 17 32z" fill="#fff" opacity="0.9" />
        </svg>
      </div>
      <div
        className="flex flex-col overflow-hidden rounded-lg backdrop-blur-md"
        style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
      >
        <button
          onClick={() => mapControls.zoomIn()}
          aria-label="Zoom in"
          className="px-2.5 py-1.5 text-[15px] leading-none text-ink-2 hover:bg-white/10"
        >
          +
        </button>
        <span className="h-px bg-white/15" />
        <button
          onClick={() => mapControls.zoomOut()}
          aria-label="Zoom out"
          className="px-2.5 py-1.5 text-[15px] leading-none text-ink-2 hover:bg-white/10"
        >
          −
        </button>
      </div>
    </div>
  )
}

function ScaleBar() {
  return (
    <div className="pointer-events-none mb-1 text-[10px] text-ink-2">
      <div className="mb-0.5 flex justify-between" style={{ width: 190 }}>
        <span>0</span>
        <span>100</span>
        <span>200</span>
        <span>300 m</span>
      </div>
      <div className="flex h-[6px]" style={{ width: 190 }}>
        {[0, 1, 2].map((i) => (
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

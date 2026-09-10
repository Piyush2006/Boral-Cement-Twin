"use client"

/**
 * Plant Flow — the process as a diagram, with live figures on each stage.
 * Same asset IDs and same feed as the map and the twin.
 */

import { KIND_META, SITE_ICONS } from "@/lib/assets/site-assets"
import { STATUS_META } from "@/lib/inventory/pile-inventory"
import { usePiles } from "@/components/shell/pile-store"

type Stage = {
  id: string
  title: string
  tag: string
  icon: keyof typeof SITE_ICONS
  colour: string
}

const STAGES: Stage[] = [
  { id: "PILE-RM-01", title: "Raw Material Piles", tag: "PILE-RM-01…07", icon: "stacker", colour: KIND_META.PILE.colour },
  { id: "CR-01", title: "Primary Crusher", tag: "CR-01", icon: "crusher", colour: KIND_META.CRUSHER.colour },
  { id: "ST-01", title: "Stacker / Reclaimer", tag: "ST-01 / RC-01", icon: "stacker", colour: KIND_META.STACKER.colour },
  { id: "RM-01", title: "Raw Mill", tag: "RM-01", icon: "mill", colour: KIND_META.RAW_MILL.colour },
  { id: "KILN-01", title: "Kiln", tag: "KILN-01", icon: "kiln", colour: KIND_META.KILN.colour },
  { id: "CC-01", title: "Clinker Cooler", tag: "CC-01", icon: "cooler", colour: KIND_META.COOLER.colour },
  { id: "SL-GRP", title: "Cement Silos", tag: "SL-01 / 02 / 03", icon: "silo", colour: KIND_META.SILO.colour },
  { id: "PK-01", title: "Cement Packing", tag: "PK-01", icon: "packing", colour: KIND_META.PACKING.colour },
  { id: "DS-01", title: "Dispatch / Loadout", tag: "DS-01", icon: "truck", colour: KIND_META.PACKING.colour },
]

export function PlantFlowView() {
  const { records, silos, selectedId, select } = usePiles()

  const detailFor = (id: string): string | null => {
    if (id === "PILE-RM-01") {
      const total = records.reduce((s, r) => s + r.quantityMt, 0)
      return `${Math.round(total).toLocaleString()} MT on ground`
    }
    if (id === "SL-GRP") {
      const total = silos.reduce((s, r) => s + r.quantityMt, 0)
      return `${Math.round(total).toLocaleString()} MT stored`
    }
    return null
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-[#0a1018] pb-24 pt-[92px]">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-6">
        <p className="text-[12px] text-white/50">
          Material route through the works. Figures are live from the same feed as the map and the
          3D twin.
        </p>

        <div className="flex flex-wrap items-stretch gap-2">
          {STAGES.map((stage, i) => {
            const active = selectedId === stage.id
            const detail = detailFor(stage.id)
            return (
              <div key={stage.id} className="flex items-stretch gap-2">
                <button
                  onClick={() => select(stage.id)}
                  className="flex w-[196px] flex-col gap-1.5 rounded-xl px-3.5 py-3 text-left transition-shadow"
                  style={{
                    background: "rgba(15,21,32,.95)",
                    border: `1px solid ${active ? stage.colour : "rgba(255,255,255,.13)"}`,
                    borderLeft: `4px solid ${stage.colour}`,
                    boxShadow: active ? `0 0 0 2px ${stage.colour}44` : "none",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      style={{ color: stage.colour }}
                      aria-hidden
                      dangerouslySetInnerHTML={{
                        __html: `<svg viewBox="0 0 24 24" width="17" height="17">${SITE_ICONS[stage.icon]}</svg>`,
                      }}
                    />
                    <span className="text-[13px] font-semibold text-white">{stage.title}</span>
                  </span>
                  <span className="font-mono text-[10.5px] text-white/55">{stage.tag}</span>
                  {detail && (
                    <span className="text-[11.5px] font-medium" style={{ color: stage.colour }}>
                      {detail}
                    </span>
                  )}
                </button>
                {i < STAGES.length - 1 && (
                  <span className="self-center text-white/30" aria-hidden>
                    →
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[12.5px] font-bold text-white">Raw material on ground</div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {records.map((r) => {
              const st = STATUS_META[r.status]
              const fill = Math.min(100, (r.quantityMt / r.capacityMt) * 100)
              return (
                <button
                  key={r.pileId}
                  onClick={() => select(r.pileId)}
                  className="rounded-lg px-3 py-2.5 text-left"
                  style={{
                    background: "rgba(15,21,32,.95)",
                    border: `1px solid ${selectedId === r.pileId ? st.colour : "rgba(255,255,255,.12)"}`,
                  }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-white/60">{r.pileId}</span>
                    <span className="ml-auto font-mono text-[12.5px] font-bold text-white">
                      {Math.round(r.quantityMt).toLocaleString()} MT
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[11.5px] text-white/75">{r.materialName}</span>
                    <span className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: st.colour }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: st.colour }} />
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${fill}%`, background: st.colour }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

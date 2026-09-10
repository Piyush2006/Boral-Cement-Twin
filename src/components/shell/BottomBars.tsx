"use client"

/** Plant KPIs and the material flow strip. Both dismissible. */

import { usePiles } from "./pile-store"
import { PanelShell } from "./PanelShell"

export function KpiBar() {
  const { kpis, panels, togglePanel } = usePiles()
  if (!panels.kpis) return null

  const items = [
    { label: "Total Raw Material", value: `${Math.round(kpis.rawTotal).toLocaleString()} MT`, delta: "+2.3%" },
    { label: "Cement in Silos", value: `${Math.round(kpis.cementTotal).toLocaleString()} MT`, delta: "+1.1%" },
    { label: "Plant Throughput", value: `${kpis.throughputTpd.toLocaleString()} TPD`, delta: "+4.2%" },
    { label: "Active Equipment", value: `${kpis.equipmentUp} / ${kpis.equipmentTotal}`, delta: null },
    { label: "Stock Alerts", value: String(kpis.alerts), delta: null, alert: true },
  ]

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[900] w-[600px] max-w-[calc(100%-24px)]">
      <PanelShell title="Plant KPIs (Live)" onClose={() => togglePanel("kpis", false)}>
        <div className="flex gap-2 overflow-x-auto p-3">
          {items.map((k) => (
            <div
              key={k.label}
              className="min-w-[108px] flex-1 rounded-lg bg-panel-2 p-2.5 ring-1 ring-white/8"
            >
              <div className="text-[10.5px] leading-tight text-ink-3">{k.label}</div>
              <div
                className={`mt-1 flex items-center gap-1.5 text-[17px] font-bold ${
                  k.alert ? "text-crit" : "text-white"
                }`}
              >
                {k.alert && <span aria-hidden>⚠</span>}
                {k.value}
              </div>
              {k.delta && (
                <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-ok">
                  <span aria-hidden>▲</span>
                  {k.delta}
                </div>
              )}
            </div>
          ))}
        </div>
      </PanelShell>
    </div>
  )
}

/** Brings dismissed panels back, so closing one is never a dead end. */
export function PanelRestore() {
  const { panels, togglePanel } = usePiles()
  const hidden = (Object.keys(panels) as Array<keyof typeof panels>).filter((k) => !panels[k])
  if (hidden.length === 0) return null

  return (
    <div className="absolute bottom-3 right-3 z-[950] flex max-w-[60%] flex-wrap justify-end gap-1.5">
      {hidden.map((key) => (
        <button
          key={key}
          onClick={() => togglePanel(key, true)}
          className="rounded-full bg-panel/95 px-3 py-1.5 text-[11.5px] font-medium text-ink-2 ring-1 ring-white/12 backdrop-blur hover:text-ink"
        >
          + {PANEL_LABELS[key]}
        </button>
      ))}
    </div>
  )
}

const PANEL_LABELS: Record<string, string> = {
  inventory: "Live Inventory",
  details: "Asset Details",
  kpis: "Plant KPIs",
  legend: "Legend",
  note: "Note",
}

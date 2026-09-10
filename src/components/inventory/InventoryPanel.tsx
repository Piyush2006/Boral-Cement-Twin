"use client"

/**
 * Live Inventory (Top Assets) and Asset Details.
 *
 * Both read the same live feed the map draws from, so the table, the map
 * callouts and the detail card can never disagree. Both are dismissible.
 */

import { useState } from "react"

import { materialColour } from "@/lib/assets/materials"
import { STATUS_META } from "@/lib/inventory/pile-inventory"
import { tileThumbnail } from "@/lib/map/thumbnail"
import { usePiles } from "@/components/shell/pile-store"
import { PanelShell } from "@/components/shell/PanelShell"

const CEMENT = "#93c5fd"

export function RightPanel() {
  const { panels } = usePiles()
  if (!panels.inventory && !panels.details) return null

  return (
    <aside className="pointer-events-none absolute right-3 top-3 z-[900] flex max-h-[calc(100%-24px)] w-[380px] flex-col gap-3">
      {panels.inventory && <LiveInventory />}
      {panels.details && <AssetDetails />}
    </aside>
  )
}

function LiveInventory() {
  const { filtered, selectedId, select, togglePanel } = usePiles()

  return (
    <PanelShell title="Live Inventory (Top Assets)" onClose={() => togglePanel("inventory", false)}>
      <div className="twin-scroll max-h-[320px] overflow-y-auto px-1">
        <table className="w-full border-collapse text-[11.5px]">
          <thead className="sticky top-0 bg-panel">
            <tr className="text-left text-[10.5px] font-semibold text-ink-2">
              <th className="border-b border-line px-2 py-1.5">ID</th>
              <th className="border-b border-line px-2 py-1.5">Material</th>
              <th className="whitespace-nowrap border-b border-line px-2 py-1.5 text-right">
                Quantity (MT)
              </th>
              <th className="border-b border-line px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const active = r.key === selectedId
              const st = STATUS_META[r.status]
              const dot = r.materialId === "MAT-CEMENT" ? CEMENT : materialColour(r.materialId)
              return (
                <tr
                  key={r.key}
                  onClick={() => select(r.key)}
                  className={`cursor-pointer ${active ? "bg-accent/20" : "hover:bg-panel-2"}`}
                >
                  <td className="whitespace-nowrap border-b border-line px-2 py-[7px]">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40"
                        style={{ background: dot }}
                      />
                      <span className="font-medium text-ink">{r.id}</span>
                    </span>
                  </td>
                  <td className="border-b border-line px-2 py-[7px] text-ink-2">{r.material}</td>
                  <td className="border-b border-line px-2 py-[7px] text-right font-mono text-ink">
                    {Math.round(r.quantityMt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-[7px]">
                    <span className="flex items-center gap-1.5" style={{ color: st.colour }}>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: st.colour }}
                        aria-hidden
                      />
                      {st.label}
                    </span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-ink-3">
                  Nothing matches that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  )
}

const TABS = ["Overview", "Inventory", "History", "Photos"] as const

function AssetDetails() {
  const {
    selected,
    selectedPile,
    selectedSilo,
    selectedEquipment,
    selectedId,
    setMode,
    togglePanel,
    setRecordStockOpen,
    lastUpdated,
  } = usePiles()
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview")

  const centre =
    selectedPile?.centre ?? selectedEquipment?.position ?? { lat: -34.5099, lng: 150.3365 }
  const title = selected?.pileId ?? selectedEquipment?.name ?? selectedSilo?.name ?? selectedId
  const colour = selected
    ? materialColour(selected.materialId)
    : selectedSilo
      ? CEMENT
      : "#94a3b8"

  const rows: Array<[string, React.ReactNode]> = selected
    ? [
        ["Asset Type", "Raw Material Pile"],
        ["Material", selected.materialName],
        ["Location", selectedPile ? "Stockyard" : "—"],
        ["Connected To", "Crusher (CR-01)"],
        ["Height (approx.)", "12 m"],
        ["Footprint (approx.)", "80 m x 60 m"],
      ]
    : selectedEquipment
      ? [
          ["Asset Type", selectedEquipment.kind.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())],
          ["Tag", selectedEquipment.tag],
          ["Location", selectedEquipment.location],
          ["Connected To", selectedEquipment.connectedTo ?? "—"],
          ["Height (approx.)", selectedEquipment.heightMetres ? `${selectedEquipment.heightMetres} m` : "—"],
          ["Footprint (approx.)", selectedEquipment.footprint ?? "—"],
        ]
      : [["Asset Type", "—"]]

  return (
    <PanelShell title="Asset Details" onClose={() => togglePanel("details", false)}>
      <div className="px-3 pb-3">
        <div className="flex gap-3">
          <img
            src={tileThumbnail(centre)}
            alt={`Satellite view of ${title}`}
            className="h-[92px] w-[112px] shrink-0 rounded-lg object-cover ring-1 ring-white/15"
          />
          <div className="min-w-0 text-[12px] leading-[1.6]">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/40"
                style={{ background: colour }}
              />
              <span className="text-[13.5px] font-bold text-white">{title}</span>
            </div>
            {selected && <div className="text-ink-2">{selected.materialName}</div>}
            <div className="text-ink-2">ID: {selected?.id ?? selectedEquipment?.tag ?? selectedId}</div>
            {(selected || selectedSilo) && (
              <div className="text-ink-2">
                Quantity:{" "}
                <span className="font-mono text-ink">
                  {Math.round(
                    (selected?.quantityMt ?? selectedSilo?.quantityMt) ?? 0,
                  ).toLocaleString()}{" "}
                  MT
                </span>
              </div>
            )}
            {(selected || selectedSilo) && (
              <div className="flex items-center gap-1.5 text-ink-2">
                Status:
                <span
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: STATUS_META[(selected?.status ?? selectedSilo!.status)].colour }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: STATUS_META[(selected?.status ?? selectedSilo!.status)].colour,
                    }}
                  />
                  {STATUS_META[(selected?.status ?? selectedSilo!.status)].label}
                </span>
              </div>
            )}
            <div className="text-ink-3">
              Last Updated:{" "}
              {lastUpdated
                ? lastUpdated.toLocaleString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                : "—"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-panel-2 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 text-[11.5px] font-medium transition-colors ${
                tab === t ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {tab === "Overview" &&
            rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 py-[3px] text-[12px]">
                <span className="text-ink-3">{label}</span>
                <span className="text-right text-ink">{value}</span>
              </div>
            ))}

          {tab === "Inventory" && (
            <div className="text-[12px] text-ink-2">
              {selected || selectedSilo ? (
                <button
                  onClick={() => setRecordStockOpen(true)}
                  className="w-full rounded-lg bg-panel-2 py-2 text-[12.5px] font-semibold text-ink ring-1 ring-white/12 hover:bg-line"
                >
                  Record Stock
                </button>
              ) : (
                "This asset does not hold stock."
              )}
            </div>
          )}

          {tab === "History" && (
            <p className="text-[12px] text-ink-3">
              No movement history yet — history comes from the inventory system once connected.
            </p>
          )}

          {tab === "Photos" && (
            <p className="text-[12px] text-ink-3">
              No site photographs supplied. The thumbnail above is live satellite imagery.
            </p>
          )}

          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-3">
            <span className="mt-[1px]">Position</span>
            <span className="ml-auto text-ink-2">Approximate</span>
            <span title="Traced from satellite imagery, not survey-verified." className="cursor-help">
              ⓘ
            </span>
          </div>
        </div>

        <button
          onClick={() => setMode("satellite")}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2.5 text-[12.5px] font-semibold text-accent-ink hover:brightness-110"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M12 22s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12z" fill="currentColor" />
          </svg>
          View in Satellite
        </button>
      </div>
    </PanelShell>
  )
}

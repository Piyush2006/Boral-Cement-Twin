"use client"

/**
 * Asset details — a closable modal, never a permanent side panel.
 *
 * Spatial identity from the plant asset model; stock from Inventory; process
 * links from the asset's supported connections. Operating status is shown only
 * where the app has a (demo) feed for that unit, and says so.
 */

import { useEffect } from "react"

import { Modal } from "@/components/incoming/StageModals"
import { usePiles } from "@/components/shell/pile-store"
import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { STATUS_META } from "@/lib/inventory/pile-inventory"
import { HEALTH_LABEL, TWIN_CARDS } from "@/lib/assets/twin-cards"
import {
  TYPE_META,
  assetColour,
  plantAsset,
  upstreamOf,
  type PlantAsset,
} from "@/lib/assets/plant-assets"
import { toneText } from "@/lib/theme/tone"

export function AssetDetailsModal({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const asset = plantAsset(assetId)
  const { records, silos, setMode, lastUpdated } = usePiles()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!asset) return null
  const meta = TYPE_META[asset.type]
  const colour = assetColour(asset)
  const pile = asset.type === "pile" ? records.find((r) => r.pileId === asset.inventoryLocationId) : undefined
  const silo = asset.type === "silo" && !asset.members ? silos.find((s) => s.id === asset.inventoryLocationId) : undefined
  const members = asset.members?.map((id) => silos.find((s) => s.id === id)).filter(Boolean)
  const twin = TWIN_CARDS.find((c) => c.id === asset.id)
  const upstream = upstreamOf(asset.id)
  const downstream = (asset.connections ?? []).map((id) => plantAsset(id)).filter((a): a is PlantAsset => Boolean(a))
  const hasInventory = Boolean(pile || silo || members?.length)

  return (
    <Modal title="Asset Details" subtitle={asset.id} onClose={onClose} width={500}>
      <div className="mb-4 flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-[var(--surface-border)]"
          style={{ background: colour }}
        />
        <span className="text-[16px] font-bold text-ink">
          {asset.type === "pile" ? `${materialEntry(asset.materialId ?? "")?.name ?? "Raw material"} Pile` : asset.name}
        </span>
        <span className="ml-auto rounded-full bg-panel-2 px-2 py-[2px] text-[11px] font-semibold text-ink-2 ring-1 ring-line">
          {meta.label}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        <Item label="Asset ID" value={asset.id} mono />
        <Item
          label="Position"
          value={asset.positionAccuracy === "verified" ? "Verified" : "Approximate"}
          note={asset.positionSource}
        />

        {asset.type !== "pile" && asset.type !== "silo" && asset.type !== "conveyor" && (
          <Item
            label="Status"
            value={twin ? HEALTH_LABEL[twin.health] : "Not connected"}
            note={twin ? "Demo / simulated feed" : "No equipment feed for this asset"}
          />
        )}
        {asset.type === "conveyor" && <Item label="Route" value="Indicative" note="Traced from imagery, not surveyed" />}
        {asset.demoObject && <Item label="Configuration" value="Demo object" note="Not a Boral-supplied asset" />}

        {pile && (
          <>
            <Item label="Material" value={pile.materialName} />
            <Item label="Inventory ID" value={pile.id} mono />
            <Item label="Quantity" value={`${Math.round(pile.quantityMt).toLocaleString()} MT`} strong />
            <Item label="Capacity" value={`${pile.capacityMt.toLocaleString()} MT`} />
            <Item label="Min Stock" value={`${pile.minStock.toLocaleString()} MT`} note="Status is CRITICAL at or below this" />
            <Item
              label="Stock Status"
              value={STATUS_META[pile.status].label}
              colour={STATUS_META[pile.status].colour}
            />
            <Item label="Fill" value={`${Math.round((pile.quantityMt / pile.capacityMt) * 100)}%`} />
          </>
        )}

        {silo && (
          <>
            <Item label="Material" value={silo.materialName} />
            <Item label="Location" value={locationEntry(silo.id)?.name ?? silo.id} />
            <Item label="Inventory ID" value={silo.inventoryId} mono />
            <Item label="Quantity" value={`${Math.round(silo.quantityMt).toLocaleString()} MT`} strong />
            <Item label="Capacity" value={`${silo.capacityMt.toLocaleString()} MT`} />
            <Item label="Min Stock" value={`${silo.minStock.toLocaleString()} MT`} />
            <Item label="Stock Status" value={STATUS_META[silo.status].label} colour={STATUS_META[silo.status].colour} />
          </>
        )}
      </dl>

      {members && members.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-3">
              <th className="border-b border-line py-1.5">Silo</th>
              <th className="border-b border-line py-1.5 text-right">Quantity</th>
              <th className="border-b border-line py-1.5 text-right">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {members.map((s) => (
              <tr key={s!.id}>
                <td className="border-b border-line py-1.5 text-ink">
                  {s!.name} <span className="font-mono text-[11px] text-ink-3">{s!.id}</span>
                </td>
                <td className="border-b border-line py-1.5 text-right font-mono font-semibold text-ink">
                  {Math.round(s!.quantityMt).toLocaleString()} MT
                </td>
                <td className="border-b border-line py-1.5 text-right font-mono text-ink-2">
                  {s!.capacityMt.toLocaleString()} MT
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(upstream.length > 0 || downstream.length > 0) && (
        <div className="mt-4 rounded-lg bg-panel-2 p-3 text-[12.5px] ring-1 ring-line">
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Process</div>
          {upstream.length > 0 && (
            <div className="text-ink-2">
              <span className="text-ink-3">From </span>
              {upstream.map((a) => a.name + (a.type === "pile" ? ` (${materialEntry(a.materialId ?? "")?.name})` : "")).join(", ")}
            </div>
          )}
          {downstream.length > 0 && (
            <div className="text-ink-2">
              <span className="text-ink-3">To </span>
              {downstream.map((a) => a.name).join(", ")}
            </div>
          )}
        </div>
      )}

      {hasInventory && (
        <p className="mt-3 text-[11px] text-ink-3">
          Quantities from Inventory · Demo / Simulated
          {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString("en-AU", { hour12: false })}` : ""}
        </p>
      )}

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line"
        >
          Close
        </button>
        {hasInventory && (
          <button
            onClick={() => {
              onClose()
              setMode("inventory")
            }}
            className="flex-1 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110"
          >
            Open Inventory
          </button>
        )}
      </div>
    </Modal>
  )
}

function Item({
  label,
  value,
  note,
  mono,
  strong,
  colour,
}: {
  label: string
  value: string
  note?: string
  mono?: boolean
  strong?: boolean
  colour?: string
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className={`flex items-center gap-1.5 ${mono ? "font-mono" : ""} ${strong ? "font-bold" : ""} text-ink`}>
        {colour && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colour }} />}
        <span style={colour ? { color: toneText(colour) } : undefined}>{value}</span>
      </dd>
      {note && <dd className="text-[11px] text-ink-3">{note}</dd>}
    </div>
  )
}

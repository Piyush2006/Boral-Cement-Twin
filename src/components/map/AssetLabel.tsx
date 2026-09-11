"use client"

/**
 * Annotation card content and its SVG rendering.
 *
 * Card SIZE is computed from static text only (names, IDs, a fixed-width
 * quantity template), never from live figures. Quantities tick every few
 * seconds; if they changed the card width the layout would reshuffle with them.
 */

import type { PileRecord } from "@/lib/inventory/pile-inventory"
import { STATUS_META } from "@/lib/inventory/pile-inventory"
import type { SiloRecord } from "@/lib/inventory/silo-inventory"
import { material } from "@/lib/assets/materials"
import { TYPE_META, assetColour, type PlantAsset } from "@/lib/assets/plant-assets"
import type { Rect } from "@/lib/map/annotation-layout"

export type InventoryView = {
  pile: (locationId: string) => PileRecord | undefined
  silo: (locationId: string) => SiloRecord | undefined
}

type Line = { text: string; strong?: boolean; dim?: boolean; dot?: string }

export type CardContent = {
  title: string
  /** Small header tag, e.g. APPROX — position accuracy on compact cards. */
  tag?: string
  lines: Line[]
  /** Text used to size the card — stable while live values change. */
  sizing: string[]
}

const qty = (n: number | undefined, uom = "MT") =>
  n === undefined ? "—" : `${Math.round(n).toLocaleString("en-AU")} ${uom}`

export function cardContent(asset: PlantAsset, inv: InventoryView, detailed: boolean): CardContent {
  const approx = asset.positionAccuracy === "verified" ? "Position: Verified" : "Position: Approximate"
  // Compact cards carry accuracy in the header; detailed cards spell it out.
  const tag = detailed ? undefined : asset.positionAccuracy === "verified" ? "VERIFIED" : "APPROX"

  if (asset.type === "pile" && asset.inventoryLocationId) {
    const rec = inv.pile(asset.inventoryLocationId)
    const name = material(asset.materialId ?? "")?.name ?? rec?.materialName ?? "Raw material"
    const status = rec ? STATUS_META[rec.status] : undefined
    const lines: Line[] = [
      { text: name },
      {
        text: rec ? `Qty: ${qty(rec.quantityMt)}${status ? ` · ${status.label}` : ""}` : "No inventory record",
        strong: true,
        dot: status?.colour,
      },
    ]
    if (detailed) {
      lines.push({ text: `Inventory ID: ${asset.inventoryId}`, dim: true }, { text: approx, dim: true })
    }
    return {
      title: asset.id,
      tag,
      lines,
      sizing: [asset.id, name, "Qty: 00,000 MT · CRITICAL", ...(detailed ? [`Inventory ID: ${asset.inventoryId}`, approx] : [])],
    }
  }

  if (asset.members?.length) {
    const recs = asset.members.map((id) => ({ id, rec: inv.silo(id) }))
    const total = recs.reduce((s, r) => s + (r.rec?.quantityMt ?? 0), 0)
    const lines: Line[] = detailed
      ? recs.map((r) => ({ text: `${r.id}  ${qty(r.rec?.quantityMt)}` }))
      : [{ text: `${recs.length} silos · ${qty(total)}`, strong: true }]
    lines.push({ text: detailed ? "Demo objects · Position: Approximate" : "Demo objects", dim: true })
    return {
      title: asset.name.toUpperCase(),
      tag,
      lines,
      sizing: [asset.name.toUpperCase(), "SL-00  0,000 MT", "3 silos · 00,000 MT", detailed ? "Demo objects · Position: Approximate" : "Demo objects"],
    }
  }

  if (asset.type === "silo" && asset.inventoryLocationId) {
    const rec = inv.silo(asset.inventoryLocationId)
    const lines: Line[] = [
      { text: rec ? `${qty(rec.quantityMt)} / ${qty(rec.capacityMt)}` : "No inventory record", strong: true },
      { text: `${asset.id} · Demo object`, dim: true },
    ]
    if (detailed) lines.push({ text: approx, dim: true })
    return {
      title: asset.name.toUpperCase(),
      tag,
      lines,
      sizing: [asset.name.toUpperCase(), "0,000 MT / 0,000 MT", `${asset.id} · Demo object`, approx],
    }
  }

  if (asset.type === "conveyor") {
    return {
      title: `CONVEYOR ${asset.id}`,
      tag,
      lines: [{ text: "Indicative route", dim: true }],
      sizing: [`CONVEYOR ${asset.id}`, "Indicative route"],
    }
  }

  const lines: Line[] = detailed
    ? [{ text: `Asset ID: ${asset.id}` }, { text: approx, dim: true }]
    : [{ text: asset.id, dim: true }]
  return {
    title: asset.name.toUpperCase(),
    tag,
    lines,
    sizing: [asset.name.toUpperCase(), ...lines.map((l) => l.text), TYPE_META[asset.type].label],
  }
}

const HEADER_H = 22
const LINE_H = 15

export function cardSize(content: CardContent): { w: number; h: number } {
  const [title, ...rest] = content.sizing
  const titleW = title.length * 7.3 + 34 + (content.tag ? content.tag.length * 5.6 + 12 : 0)
  const restW = rest.length ? Math.max(...rest.map((t) => t.length * 6.25 + 22)) : 0
  const w = Math.round(Math.min(220, Math.max(112, titleW, restW)))
  return { w, h: HEADER_H + 5 + content.lines.length * LINE_H + 5 }
}

export function AssetLabel({
  asset,
  content,
  rect,
  active,
  onOpen,
  onHover,
}: {
  asset: PlantAsset
  content: CardContent
  rect: Rect
  active: boolean
  onOpen: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const colour = assetColour(asset)
  const clipId = `card-clip-${asset.id}`
  return (
    <g
      transform={`translate(${Math.round(rect.x)} ${Math.round(rect.y)})`}
      role="button"
      tabIndex={0}
      aria-label={`${asset.name} (${asset.id}) — open details`}
      style={{ pointerEvents: "auto", cursor: "pointer", outline: "none" }}
      onClick={() => onOpen(asset.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(asset.id)}
      onMouseEnter={() => onHover(asset.id)}
      onMouseLeave={() => onHover(null)}
    >
      <clipPath id={clipId}>
        <rect width={rect.w} height={rect.h} rx={7} />
      </clipPath>
      {/* Shadow, card, header tint */}
      <rect x={1} y={3} width={rect.w} height={rect.h} rx={7} style={{ fill: "rgba(0,0,0,.35)" }} />
      <rect
        width={rect.w}
        height={rect.h}
        rx={7}
        style={{ fill: "var(--surface-solid)", stroke: colour, strokeWidth: active ? 2.5 : 1.5 }}
      />
      <g clipPath={`url(#${clipId})`}>
        <rect width={rect.w} height={HEADER_H} style={{ fill: colour, opacity: 0.22 }} />
        <line x1={0} x2={rect.w} y1={HEADER_H} y2={HEADER_H} style={{ stroke: colour, strokeOpacity: 0.55 }} />
        <circle cx={11} cy={HEADER_H / 2} r={4} style={{ fill: colour, stroke: "var(--surface-ink)", strokeWidth: 1 }} />
        <text
          x={21}
          y={HEADER_H / 2 + 4}
          style={{ fill: "var(--surface-ink)", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2 }}
        >
          {content.title}
        </text>
        {content.tag && (
          <text
            x={rect.w - 8}
            y={HEADER_H / 2 + 3.5}
            textAnchor="end"
            style={{ fill: "var(--surface-ink-dim)", fontSize: 9, fontWeight: 700, letterSpacing: 0.4 }}
          >
            {content.tag}
          </text>
        )}
        {content.lines.map((line, i) => {
          const y = HEADER_H + 5 + i * LINE_H + 11
          return (
            <g key={i}>
              {line.dot && <circle cx={13} cy={y - 4} r={3.5} style={{ fill: line.dot }} />}
              <text
                x={line.dot ? 21 : 10}
                y={y}
                style={{
                  fill: line.dim ? "var(--surface-ink-dim)" : "var(--surface-ink)",
                  fontSize: 11,
                  fontWeight: line.strong ? 700 : 500,
                }}
              >
                {line.text}
              </text>
            </g>
          )
        })}
      </g>
    </g>
  )
}

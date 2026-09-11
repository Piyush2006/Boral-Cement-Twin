"use client"

/**
 * High-contrast asset marker: a class shape in the asset colour with a white
 * rim and a dark halo, so it holds against bright and dark imagery alike, and
 * an icon for the asset class. Shape and icon both differ by class, so the
 * marker never relies on colour alone.
 */

import {
  PLANT_ICONS,
  TYPE_META,
  assetColour,
  type MarkerShape,
  type PlantAsset,
} from "@/lib/assets/plant-assets"
import type { Pt } from "@/lib/map/annotation-layout"

export function markerRadius(asset: PlantAsset): number {
  if (asset.type === "conveyor") return 9
  if (asset.type === "pile") return 11
  return 13
}

function shapePath(shape: MarkerShape, r: number): string {
  switch (shape) {
    case "circle":
      return `M ${-r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
    case "square": {
      const s = r * 0.9
      return `M ${-s + 3} ${-s} H ${s - 3} Q ${s} ${-s} ${s} ${-s + 3} V ${s - 3} Q ${s} ${s} ${s - 3} ${s} H ${-s + 3} Q ${-s} ${s} ${-s} ${s - 3} V ${-s + 3} Q ${-s} ${-s} ${-s + 3} ${-s} Z`
    }
    case "diamond": {
      const d = r * 1.18
      return `M 0 ${-d} L ${d} 0 L 0 ${d} L ${-d} 0 Z`
    }
    case "hexagon": {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2
        return `${(Math.cos(a) * r * 1.08).toFixed(2)} ${(Math.sin(a) * r * 1.08).toFixed(2)}`
      })
      return `M ${pts.join(" L ")} Z`
    }
  }
}

/** Dark glyph on light fills, white on dark ones. */
function glyphColour(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? "#0b1220" : "#ffffff"
}

export function AssetMarker({
  asset,
  at,
  active,
  dimmed,
  onOpen,
  onHover,
}: {
  asset: PlantAsset
  at: Pt
  active: boolean
  /** Not matched by the current search — kept in place, faded. */
  dimmed?: boolean
  onOpen: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const meta = TYPE_META[asset.type]
  const colour = assetColour(asset)
  const r = markerRadius(asset) + (active ? 3 : 0)
  const path = shapePath(meta.shape, r)
  const icon = Math.round(r * 1.15)
  return (
    <g
      transform={`translate(${Math.round(at.x)} ${Math.round(at.y)})`}
      role="button"
      tabIndex={0}
      aria-label={`${asset.name} (${asset.id}) — open details`}
      style={{ pointerEvents: "auto", cursor: "pointer", outline: "none", opacity: dimmed ? 0.35 : 1 }}
      onClick={() => onOpen(asset.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(asset.id)}
      onMouseEnter={() => onHover(asset.id)}
      onMouseLeave={() => onHover(null)}
    >
      {active && <path d={shapePath(meta.shape, r + 6)} style={{ fill: colour, opacity: 0.3 }} />}
      <path d={path} style={{ fill: "none", stroke: "rgba(0,0,0,.6)", strokeWidth: 5 }} />
      <path d={path} style={{ fill: colour, stroke: "#ffffff", strokeWidth: 2 }} />
      <svg
        x={-icon / 2}
        y={-icon / 2}
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        style={{ color: glyphColour(colour), overflow: "visible" }}
        dangerouslySetInnerHTML={{ __html: PLANT_ICONS[meta.icon] }}
      />
    </g>
  )
}

/** Short asset ID under a marker whose card is not shown. */
export function MarkerIdChip({ asset, at }: { asset: PlantAsset; at: Pt }) {
  const w = asset.id.length * 6.2 + 10
  const y = at.y + markerRadius(asset) + 5
  return (
    <g transform={`translate(${Math.round(at.x - w / 2)} ${Math.round(y)})`} style={{ pointerEvents: "none" }}>
      <rect width={w} height={15} rx={4} style={{ fill: "var(--surface-solid)", stroke: "rgba(0,0,0,.35)" }} />
      <text
        x={w / 2}
        y={11}
        textAnchor="middle"
        style={{ fill: "var(--surface-ink)", fontSize: 10, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}
      >
        {asset.id}
      </text>
    </g>
  )
}

export function chipRect(asset: PlantAsset, at: Pt) {
  const w = asset.id.length * 6.2 + 10
  return { x: at.x - w / 2, y: at.y + markerRadius(asset) + 5, w, h: 15 }
}

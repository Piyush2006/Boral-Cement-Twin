"use client"

/**
 * Plant annotation layer — one SVG over the live map.
 *
 *   asset lat/lng → Leaflet projection → screen anchor → layout engine
 *                → markers, leader lines, cards
 *
 * Layout runs when the view settles (move end, zoom end, resize, or a change
 * of filters or selection). While the map is being dragged the whole layer is
 * translated by exactly the map's pixel offset, so every card, line and marker
 * stays attached to its asset without re-rendering React on each frame. During
 * a zoom animation the layer is hidden and re-laid out at the new zoom.
 *
 * The SVG is mounted INSIDE the Leaflet container (above the map panes, below
 * the controls), so a drag or scroll that starts on a card still pans or zooms
 * the map, while a click on a card or marker opens its details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type L from "leaflet"

import {
  PLANT_ASSETS,
  TYPE_META,
  assetColour,
  detailedAt,
  labelledPriorityAt,
  markerVisibleAt,
  zoomDepth,
  type AssetGroup,
  type PlantAsset,
} from "@/lib/assets/plant-assets"
import {
  layoutAnnotations,
  rectsOverlap,
  type LayoutItem,
  type Placement,
  type Pt,
  type Rect,
  type Side,
} from "@/lib/map/annotation-layout"
import { assetMatches } from "@/lib/assets/search"
import { AssetLabel, cardContent, cardSize, type InventoryView } from "./AssetLabel"
import { AssetMarker, MarkerIdChip, chipRect, markerRadius } from "./AssetMarker"
import { LeaderLine } from "./LeaderLine"

/** Above Leaflet's map panes (400), below its controls (1000). */
const LAYER_STYLE = { zIndex: 500, overflow: "visible", transition: "opacity 120ms", fontFamily: "inherit" } as const

/** The top bar floats over the map; cards never go under it. */
const HEADER_BAND = 84

type View = { zoom: number; w: number; h: number; origin: L.LatLng; stamp: number }

export function PlantAnnotationLayer({
  map,
  overviewZoom,
  annotationsOn,
  groups,
  activeId,
  query,
  inventory,
  onOpen,
}: {
  map: L.Map
  /** Zoom at which the whole works is framed, for this screen size. */
  overviewZoom: (map: L.Map) => number
  annotationsOn: boolean
  groups: Record<AssetGroup, boolean>
  activeId: string | null
  /** Top-bar search: matching assets are always carded, others fade. */
  query: string
  inventory: InventoryView
  onOpen: (id: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const originRef = useRef<L.LatLng | null>(null)
  const previous = useRef(new Map<string, { side: Side; gap: number }>())
  const [view, setView] = useState<View | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  /* ── view tracking ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let frame = 0
    const settle = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const size = map.getSize()
        if (size.x === 0 || size.y === 0) return
        const origin = map.containerPointToLatLng([0, 0])
        originRef.current = origin
        const svg = svgRef.current
        if (svg) {
          svg.style.transform = ""
          svg.style.opacity = "1"
        }
        setView({ zoom: map.getZoom(), w: size.x, h: size.y, origin, stamp: performance.now() })
      })
    }
    const follow = () => {
      const svg = svgRef.current
      const origin = originRef.current
      if (!svg || !origin) return
      const p = map.latLngToContainerPoint(origin)
      svg.style.transform = `translate(${p.x}px, ${p.y}px)`
    }
    const hide = () => {
      if (svgRef.current) svgRef.current.style.opacity = "0"
    }

    map.on("moveend zoomend resize viewreset", settle)
    map.on("move", follow)
    map.on("zoomstart", hide)
    settle()
    return () => {
      cancelAnimationFrame(frame)
      map.off("moveend zoomend resize viewreset", settle)
      map.off("move", follow)
      map.off("zoomstart", hide)
    }
  }, [map])

  /* ── layout ─────────────────────────────────────────────────────────────── */
  // Card sizes depend on static text only, so live quantity updates re-render
  // text without moving anything. The inventory reader is read through a ref.
  const inventoryRef = useRef(inventory)
  inventoryRef.current = inventory

  const layout = useMemo(() => {
    if (!view) return null
    const { zoom, w, h } = view
    const depth = zoomDepth(zoom, overviewZoom(map))
    const detailed = detailedAt(depth)
    const labelled = labelledPriorityAt(depth)

    const visible = PLANT_ASSETS.filter((a) => groups[TYPE_META[a.type].group] && markerVisibleAt(a, depth))
    const anchors = new Map<string, Pt>()
    for (const a of visible) {
      const p = map.latLngToContainerPoint([a.latitude, a.longitude])
      anchors.set(a.id, { x: p.x, y: p.y })
    }
    const onScreen = (p: Pt) => p.x > -40 && p.y > -40 && p.x < w + 40 && p.y < h + 40

    // UI that floats over the map: the header band, then any element that
    // declares itself a map reservation (panels, zoom controls, notes).
    const host = svgRef.current?.parentElement?.getBoundingClientRect()
    const reserved: Rect[] = [{ x: 0, y: 0, w, h: HEADER_BAND }]
    if (host && typeof document !== "undefined") {
      document.querySelectorAll<HTMLElement>("[data-map-reserve], .leaflet-control-attribution").forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width && r.height) reserved.push({ x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height })
      })
    }

    // Pile areas: soft obstacles, so cards prefer not to cover stockpiles.
    const soft: Rect[] = []
    for (const a of visible) {
      if (!a.outline) continue
      const pts = a.outline.map((ll) => map.latLngToContainerPoint([ll.lat, ll.lng]))
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
      soft.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
    }

    const searching = query.trim() !== ""
    const contents = new Map<string, ReturnType<typeof cardContent>>()
    const items: LayoutItem[] = []
    if (annotationsOn) {
      for (const a of visible) {
        const anchor = anchors.get(a.id)!
        const isActive = a.id === activeId
        if (!onScreen(anchor)) continue
        // A search shows exactly what it matched, at every zoom.
        if (searching) {
          if (!assetMatches(a, query)) continue
        } else if (!isActive && a.priority > labelled) continue
        const content = cardContent(a, inventoryRef.current, detailed || isActive)
        contents.set(a.id, content)
        const size = cardSize(content)
        items.push({ id: a.id, anchor, ...size, priority: isActive || searching ? 0 : a.priority, anchorRadius: markerRadius(a) })
      }
    }

    const placements = layoutAnnotations(items, {
      width: w,
      height: h,
      reserved,
      soft,
      markers: visible.map((a) => ({ id: a.id, anchor: anchors.get(a.id)!, radius: markerRadius(a) })),
      previous: previous.current,
    })
    previous.current = new Map(placements.map((p) => [p.id, { side: p.side, gap: p.gap }]))

    return { visible, anchors, placements, detailed, labelled }
    // `view.stamp` is the trigger: layout reads the map's live projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, groups, annotationsOn, activeId, query, map, overviewZoom])

  const hover = useCallback((id: string | null) => setHovered(id), [])
  // A drag that starts on a card pans the map; releasing it is not a click.
  const openOnClick = useCallback(
    (id: string) => {
      // Leaflet's drag handler exposes moved() at runtime; the typings omit it.
      if ((map.dragging as L.Handler & { moved?: () => boolean }).moved?.()) return
      onOpen(id)
    },
    [map, onOpen],
  )

  const container = map.getContainer()
  if (!layout) {
    return createPortal(<svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full" style={LAYER_STYLE} />, container)
  }

  const { visible, anchors, placements, detailed, labelled } = layout
  const byId = new Map(visible.map((a) => [a.id, a]))
  const placedIds = new Set(placements.map((p) => p.id))
  const focus = hovered ?? activeId

  // ID chips for markers without a card, where they do not collide with cards.
  const searching = query.trim() !== ""
  const chips = annotationsOn
    ? visible.filter((a) => {
        if (placedIds.has(a.id) || a.priority > labelled) return false
        if (searching && !assetMatches(a, query)) return false
        const r = chipRect(a, anchors.get(a.id)!)
        return !placements.some((p) => rectsOverlap(r, p.rect, 2))
      })
    : []

  const ordered = [...placements].sort((a, b) => (a.id === focus ? 1 : 0) - (b.id === focus ? 1 : 0))
  const markerOrder = [...visible].sort(
    (a, b) => (a.id === focus ? 1 : 0) - (b.id === focus ? 1 : 0) || (a.type === "conveyor" ? -1 : 0) - (b.type === "conveyor" ? -1 : 0),
  )

  return createPortal(
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={LAYER_STYLE}
      data-annotation-layer
      data-detailed={detailed ? "1" : "0"}
    >
      {/* Leader lines under markers, so each line emerges from its marker. */}
      {ordered.map((p: Placement) => {
        const a = byId.get(p.id)!
        return <LeaderLine key={`l-${p.id}`} anchor={p.anchor} connector={p.connector} colour={assetColour(a)} active={p.id === focus} />
      })}
      {markerOrder.map((a) => (
        <AssetMarker
          key={`m-${a.id}`}
          asset={a}
          at={anchors.get(a.id)!}
          active={a.id === focus}
          dimmed={searching && !assetMatches(a, query)}
          onOpen={openOnClick}
          onHover={hover}
        />
      ))}
      {chips.map((a) => (
        <MarkerIdChip key={`c-${a.id}`} asset={a} at={anchors.get(a.id)!} />
      ))}
      {ordered.map((p) => {
        const a = byId.get(p.id)!
        return (
          <g key={`card-${p.id}`} data-card={p.id}>
            <AssetLabel
              asset={a}
              content={cardContent(a, inventory, detailed || a.id === activeId)}
              rect={p.rect}
              active={p.id === focus}
              onOpen={openOnClick}
              onHover={hover}
            />
          </g>
        )
      })}
    </svg>,
    container,
  )
}

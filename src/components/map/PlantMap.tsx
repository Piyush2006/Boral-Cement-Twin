"use client"

/**
 * Satellite view — the primary Digital Twin workspace.
 *
 *   Leaflet map
 *   ├── Satellite tile layer (live, licensed; attribution always shown)
 *   ├── Geographic vectors: pile outlines
 *   └── SVG annotation layer: anchors, leader lines, cards, selection
 *
 * INVENTORY ONLY: the map shows the places that hold stock — stockpiles and
 * cement silos — with their quantity and HEALTHY / CRITICAL status, read from
 * Inventory. Machines, conveyors, utilities and process flow belong to the 3D
 * view and are not drawn here. Clicking an asset opens a closable details
 * modal — there is no permanent side panel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import {
  PLANT_ASSETS,
  PLANT_EXTENT,
  TYPE_META,
  assetColour,
  plantAsset,
  type AssetGroup,
} from "@/lib/assets/plant-assets"
import { activeProvider } from "@/lib/map/providers"
import { usePiles } from "@/components/shell/pile-store"
import { AssetDetailsModal } from "./AssetDetailsModal"
import { AssetFilter } from "./AssetFilter"
import type { InventoryView } from "./AssetLabel"
import { PlantAnnotationLayer } from "./PlantAnnotationLayer"
import { PlantLegend } from "./PlantLegend"
import { mapControls, resetMapControls } from "./map-controls"

const BOUNDS = L.latLngBounds(
  L.latLng(PLANT_EXTENT.south, PLANT_EXTENT.west),
  L.latLng(PLANT_EXTENT.north, PLANT_EXTENT.east),
)

/** Frame the works clear of the top bar (top) and the Map Layers panel (right). */
const FRAME_TOP_LEFT = L.point(12, 92)
const FRAME_BOTTOM_RIGHT = L.point(236, 12)

/** The zoom at which the whole works fits this screen — "overview". */
export function overviewZoom(map: L.Map): number {
  return map.getBoundsZoom(BOUNDS, false, FRAME_TOP_LEFT.add(FRAME_BOTTOM_RIGHT))
}

/** Satellite shows inventory only: piles and silos. Machines, conveyors and utilities are not drawn. */
const INVENTORY_ONLY: Record<AssetGroup, boolean> = {
  machines: false,
  piles: true,
  storage: true,
  conveyors: false,
  utilities: false,
}

export function PlantMap() {
  const holder = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const vectors = useRef<L.LayerGroup | null>(null)

  const { records, silos, select, query } = usePiles()
  const [annotationsOn, setAnnotationsOn] = useState(true)
  const [groups, setGroups] = useState(INVENTORY_ONLY)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [legendOpen, setLegendOpen] = useState(true)
  const [noteOpen, setNoteOpen] = useState(true)
  const [zoom, setZoom] = useState(15)

  /* ── map ────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!holder.current) return
    const provider = activeProvider()
    const m = L.map(holder.current, {
      center: BOUNDS.getCenter(),
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
      minZoom: 13,
      maxZoom: 20,
      zoomSnap: 0.25,
    })
    if (provider.urlTemplate) {
      L.tileLayer(provider.urlTemplate, {
        maxNativeZoom: provider.maxNativeZoom,
        maxZoom: provider.maxZoom,
        attribution: provider.attribution,
      }).addTo(m)
    }
    m.setMaxBounds(BOUNDS.pad(0.8))
    vectors.current = L.layerGroup().addTo(m)

    mapControls.zoomIn = () => m.zoomIn(0.5)
    mapControls.zoomOut = () => m.zoomOut(0.5)
    mapControls.fit = () => frameWorks(m, true)

    const onZoom = () => setZoom(m.getZoom())
    m.on("zoomend", onZoom)
    // Clicking open ground clears the selection.
    m.on("click", () => setActiveId(null))

    // This view can mount inside a `display: none` wrapper, where Leaflet would
    // measure a zero-size container. Frame the works once it has real size.
    let framed = false
    const sizeObserver = new ResizeObserver(() => {
      const el = holder.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      m.invalidateSize()
      if (!framed) {
        frameWorks(m)
        framed = true
      }
    })
    sizeObserver.observe(holder.current)
    setMap(m)

    return () => {
      sizeObserver.disconnect()
      m.remove()
      setMap(null)
      resetMapControls()
    }
  }, [])

  const open = useCallback(
    (id: string) => {
      setActiveId(id)
      setDetailsId(id)
      // Keep the rest of the application's selection in step.
      const asset = plantAsset(id)
      select(asset?.members?.[0] ?? id)
    },
    [select],
  )

  /* ── geographic vectors ─────────────────────────────────────────────────── */
  useEffect(() => {
    const group = vectors.current
    if (!map || !group) return
    group.clearLayers()

    for (const a of PLANT_ASSETS) {
      if (!groups[TYPE_META[a.type].group]) continue
      const colour = assetColour(a)
      const active = a.id === activeId

      if (a.path) {
        const latlngs = a.path.map((p) => [p.lat, p.lng] as [number, number])
        group.addLayer(L.polyline(latlngs, { color: "#05070b", weight: 7, opacity: 0.5, interactive: false }))
        const route = L.polyline(latlngs, { color: colour, weight: active ? 5 : 3.5, opacity: 0.95 })
        route.on("click", (e) => {
          L.DomEvent.stopPropagation(e)
          open(a.id)
        })
        group.addLayer(route)
      }

      if (a.outline) {
        const ring = a.outline.map((p) => [p.lat, p.lng] as [number, number])
        group.addLayer(L.polygon(ring, { color: "#05070b", weight: active ? 7 : 5, opacity: 0.5, fill: false, interactive: false }))
        const poly = L.polygon(ring, {
          color: colour,
          weight: active ? 4 : 2.6,
          opacity: 1,
          fillColor: colour,
          fillOpacity: active ? 0.32 : 0.16,
        })
        poly.on("click", (e) => {
          L.DomEvent.stopPropagation(e)
          open(a.id)
        })
        group.addLayer(poly)
      }
    }
  }, [map, groups, activeId, zoom, open])

  /* ── inventory, read by location — never stored here ────────────────────── */
  const inventory: InventoryView = useMemo(
    () => ({
      pile: (id) => records.find((r) => r.pileId === id),
      silo: (id) => silos.find((s) => s.id === id),
    }),
    [records, silos],
  )

  return (
    <div className="absolute inset-0 isolate">
      <div ref={holder} className="absolute inset-0 z-0" />

      {/* Portalled into the Leaflet container — see PlantAnnotationLayer. */}
      {map && (
        <PlantAnnotationLayer
          map={map}
          overviewZoom={overviewZoom}
          annotationsOn={annotationsOn}
          groups={groups}
          activeId={activeId}
          query={query}
          inventory={inventory}
          onOpen={open}
        />
      )}

      {/* Visibility and legend. Declares itself so cards are laid out around it. */}
      <div
        data-map-reserve
        className="absolute right-3 top-[86px] z-20 w-[212px] overflow-hidden rounded-xl backdrop-blur-md"
        style={{
          background: "var(--surface-float)",
          border: "1px solid var(--surface-border)",
          boxShadow: "0 4px 14px var(--surface-shadow)",
        }}
      >
        <button
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[12.5px] font-bold text-ink"
        >
          Map Layers
          <Chevron open={panelOpen} />
        </button>
        {panelOpen && (
          <div className="twin-scroll max-h-[calc(100vh-240px)] overflow-y-auto border-t border-line px-3.5 pb-3 pt-2">
            <AssetFilter
              annotationsOn={annotationsOn}
              onAnnotations={setAnnotationsOn}
              groups={groups}
              onGroup={(g, on) => setGroups((prev) => ({ ...prev, [g]: on }))}
            />
            <button
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
              className="mt-2.5 flex w-full items-center justify-between border-t border-line pt-2.5 text-left text-[12.5px] font-bold text-ink"
            >
              Legend
              <Chevron open={legendOpen} />
            </button>
            {legendOpen && (
              <div className="mt-2">
                <PlantLegend />
              </div>
            )}
          </div>
        )}
      </div>

      {noteOpen && (
        <div
          data-map-reserve
          className="absolute bottom-3 left-3 z-20 flex max-w-[400px] items-start gap-2 rounded-lg px-3 py-2 backdrop-blur-md"
          style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
        >
          <span aria-hidden className="text-[12px] leading-[1.45] text-ink-3">
            ⓘ
          </span>
          <p className="text-[11px] leading-[1.45] text-ink-2">
            Asset positions are indicative and may be approximate. Verified survey coordinates are not
            available for all assets.
          </p>
          <button
            onClick={() => setNoteOpen(false)}
            aria-label="Dismiss note"
            className="text-[14px] leading-none text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </div>
      )}

      {detailsId && <AssetDetailsModal assetId={detailsId} onClose={() => setDetailsId(null)} />}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="text-ink-3" style={{ transform: open ? "rotate(180deg)" : undefined }}>
      <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Frame the whole works, clear of the floating UI. */
function frameWorks(map: L.Map, animate = false) {
  const options = { paddingTopLeft: FRAME_TOP_LEFT, paddingBottomRight: FRAME_BOTTOM_RIGHT }
  if (animate) map.flyToBounds(BOUNDS, { ...options, duration: 0.6 })
  else map.fitBounds(BOUNDS, { ...options, animate: false })
}

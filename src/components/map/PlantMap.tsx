"use client"

/**
 * Satellite site map — annotated plant assets on live imagery.
 *
 * Every asset carries a compact marker: a coloured icon, with a short label
 * beside it where there is room. Full detail opens on hover or click.
 *
 * Showing a full card for all twenty assets at once put six of them on top of
 * each other, so labels are now decluttered in screen space and detail is
 * on demand.
 *
 * Imagery is fetched live from the licensed provider; nothing is bundled and the
 * attribution stays on screen.
 */

import { useCallback, useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { PILES } from "@/lib/assets/piles"
import { materialColour } from "@/lib/assets/materials"
import {
  CONVEYORS,
  KIND_META,
  SILO_GROUP,
  SITE_ASSETS,
  SITE_ICONS,
  type AssetKind,
  type SiteIcon,
} from "@/lib/assets/site-assets"
import { activeProvider } from "@/lib/map/providers"
import type { LatLng } from "@/lib/map/projection"
import { STATUS_META, type PileRecord } from "@/lib/inventory/pile-inventory"
import { usePiles } from "@/components/shell/pile-store"
import { mapControls, resetMapControls } from "./map-controls"

/** One annotated thing on the map. */
type Annotation = {
  id: string
  position: LatLng
  colour: string
  icon: SiteIcon
  /** Short text beside the marker. Omitted for minor assets. */
  label?: string
  /** Lower wins when labels compete for space. */
  priority: number
  detail: () => DetailContent
}

type DetailContent = {
  title: string
  tag: string
  rows: Array<[string, string]>
  accent: string
}

const BOUNDS = (() => {
  const lats: number[] = []
  const lngs: number[] = []
  const add = (p: LatLng) => {
    lats.push(p.lat)
    lngs.push(p.lng)
  }
  for (const pile of PILES) {
    add(pile.centre)
    for (const pt of pile.outline) add(pt)
  }
  for (const asset of SITE_ASSETS) add(asset.position)
  for (const silo of SILO_GROUP.silos) add(silo.position)
  for (const run of CONVEYORS) for (const pt of run.points) add(pt)
  const padLat = 0.0005
  const padLng = 0.0006
  return L.latLngBounds(
    L.latLng(Math.min(...lats) - padLat, Math.min(...lngs) - padLng),
    L.latLng(Math.max(...lats) + padLat, Math.max(...lngs) + padLng),
  )
})()

export function PlantMap() {
  const holder = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routes = useRef<L.LayerGroup | null>(null)
  const shapes = useRef<L.LayerGroup | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const detail = useRef<L.LayerGroup | null>(null)
  const hovered = useRef<string | null>(null)

  const { piles, byId, selectedId, select } = usePiles()
  const live = useRef({ byId, selectedId })
  live.current = { byId, selectedId }

  useEffect(() => {
    if (!holder.current || mapRef.current) return
    const provider = activeProvider()

    const map = L.map(holder.current, {
      // Leaflet needs a view before setMaxBounds; the real framing happens in
      // frameWorks() once the container has been measured.
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
      }).addTo(map)
    }
    map.setMaxBounds(BOUNDS.pad(0.8))

    routes.current = L.layerGroup().addTo(map)
    shapes.current = L.layerGroup().addTo(map)
    markers.current = L.layerGroup().addTo(map)
    detail.current = L.layerGroup().addTo(map)
    mapRef.current = map

    mapControls.zoomIn = () => map.zoomIn(0.5)
    mapControls.zoomOut = () => map.zoomOut(0.5)
    mapControls.fit = () => frameWorks(map, true)

    // The satellite view is not the default, so this map can mount inside a
    // `display: none` wrapper. Leaflet then measures a zero-size container and
    // fitBounds zooms to the maximum. Fit once the container has real size.
    let fitted = false
    const sizeObserver = new ResizeObserver(() => {
      const el = holder.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      map.invalidateSize()
      if (!fitted) {
        frameWorks(map)
        fitted = true
      }
    })
    sizeObserver.observe(holder.current)

    return () => {
      sizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      resetMapControls()
    }
  }, [])

  /* ── the annotation set ─────────────────────────────────────────────────── */
  const annotations = useCallback((): Annotation[] => {
    const { byId: records } = live.current
    const list: Annotation[] = []

    for (const pile of piles) {
      const record = records.get(pile.pileId)
      list.push({
        id: pile.pileId,
        position: pile.centre,
        colour: materialColour(pile.materialId),
        icon: "stacker",
        label: record?.materialName ?? pile.pileId,
        priority: 0,
        detail: () => ({
          title: `${record?.materialName ?? "Raw material"} Pile`,
          tag: pile.pileId,
          accent: materialColour(pile.materialId),
          rows: record
            ? [
                ["Inventory ID", record.id],
                ["Quantity", `${Math.round(record.quantityMt).toLocaleString()} MT`],
                ["Capacity", `${record.capacityMt.toLocaleString()} MT`],
                ["Status", STATUS_META[record.status].label],
              ]
            : [["Status", "No inventory record"]],
        }),
      })
    }

    for (const asset of SITE_ASSETS) {
      list.push({
        id: asset.id,
        position: asset.position,
        colour: KIND_META[asset.kind].colour,
        icon: asset.icon,
        label: asset.title,
        priority: 1,
        detail: () => ({
          title: asset.title,
          tag: asset.tag,
          accent: KIND_META[asset.kind].colour,
          rows: [
            ["Asset type", KIND_META[asset.kind].label],
            ["Tag", asset.tag],
            ["Position", "Approximate — from imagery"],
          ],
        }),
      })
    }

    for (const silo of SILO_GROUP.silos) {
      const qty = { "SL-01": 5120, "SL-02": 4980, "SL-03": 6230 }[silo.id] ?? 0
      list.push({
        id: silo.id,
        position: silo.position,
        colour: KIND_META.SILO.colour,
        icon: "silo",
        label: silo.name,
        priority: 1,
        detail: () => ({
          title: silo.name,
          tag: silo.id,
          accent: KIND_META.SILO.colour,
          rows: [
            ["Asset type", "Cement Silo"],
            ["Stock", `${qty.toLocaleString()} MT`],
            ["Status", "Healthy"],
          ],
        }),
      })
    }

    for (const run of CONVEYORS) {
      const mid = run.points[Math.floor(run.points.length / 2)]
      list.push({
        id: run.id,
        position: mid,
        colour: KIND_META.CONVEYOR.colour,
        icon: "conveyor",
        // Conveyors are read from their routes; a label each only adds noise.
        priority: 3,
        detail: () => ({
          title: "Conveyor",
          tag: run.id,
          accent: KIND_META.CONVEYOR.colour,
          rows: [
            ["Asset type", "Conveyor"],
            ["Route", "Indicative — from imagery"],
          ],
        }),
      })
    }

    return list
  }, [piles])

  /* ── drawing ────────────────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const map = mapRef.current
    const routeGroup = routes.current
    const shapeGroup = shapes.current
    const markerGroup = markers.current
    if (!map || !routeGroup || !shapeGroup || !markerGroup) return

    routeGroup.clearLayers()
    shapeGroup.clearLayers()
    markerGroup.clearLayers()

    const { byId: records, selectedId: sel } = live.current

    // Conveyor routes.
    for (const run of CONVEYORS) {
      const latlngs = run.points.map((p) => [p.lat, p.lng] as [number, number])
      routeGroup.addLayer(
        L.polyline(latlngs, { color: "#05070b", weight: 6, opacity: 0.45, interactive: false }),
      )
      routeGroup.addLayer(
        L.polyline(latlngs, {
          color: KIND_META.CONVEYOR.colour,
          weight: 3,
          opacity: 0.9,
          dashArray: "1 7",
          lineCap: "round",
          interactive: false,
        }),
      )
    }

    // Pile outlines.
    for (const pile of piles) {
      const colour = materialColour(pile.materialId)
      const isSel = pile.pileId === sel || pile.pileId === hovered.current
      const ring = pile.outline.map((p) => [p.lat, p.lng] as [number, number])
      shapeGroup.addLayer(
        L.polygon(ring, {
          color: "#05070b",
          weight: isSel ? 7 : 5,
          opacity: 0.5,
          fill: false,
          interactive: false,
        }),
      )
      const poly = L.polygon(ring, {
        color: colour,
        weight: isSel ? 4 : 2.6,
        opacity: 1,
        fillColor: colour,
        fillOpacity: isSel ? 0.3 : 0.14,
      })
      poly.on("click", (e) => {
        L.DomEvent.stopPropagation(e)
        select(pile.pileId)
      })
      poly.on("mouseover", () => setHover(pile.pileId))
      poly.on("mouseout", () => setHover(null))
      shapeGroup.addLayer(poly)
    }

    /*
     * Label decluttering. Markers are always drawn; a label is added only when
     * its box is still clear, in priority order — piles first, then equipment,
     * conveyors last. This is what stopped cards stacking on each other.
     */
    const items = annotations()
    const taken: Array<{ x: number; y: number; w: number; h: number }> = []
    const overlaps = (a: (typeof taken)[number], b: (typeof taken)[number]) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

    for (const item of [...items].sort((a, b) => a.priority - b.priority)) {
      const pt = map.latLngToContainerPoint([item.position.lat, item.position.lng])
      const active = item.id === sel || item.id === hovered.current

      // The marker itself always claims its own space.
      taken.push({ x: pt.x - 15, y: pt.y - 15, w: 30, h: 30 })

      let label: string | undefined
      if (item.label) {
        const w = item.label.length * 6.3 + 16
        const box = { x: pt.x + 16, y: pt.y - 10, w, h: 20 }
        if (active || !taken.some((t) => overlaps(t, box))) {
          label = item.label
          taken.push(box)
        }
      }

      markerGroup.addLayer(marker(item, label, active, select, setHover))
    }
  }, [piles, annotations, select])

  const setHover = useCallback(
    (id: string | null) => {
      if (hovered.current === id) return
      hovered.current = id
      draw()
      drawDetail()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** The single open detail card, anchored to its asset so it moves with the map. */
  const drawDetail = useCallback(() => {
    const group = detail.current
    if (!group) return
    group.clearLayers()

    const id = hovered.current ?? live.current.selectedId
    if (!id) return
    const item = annotations().find((a) => a.id === id)
    if (!item) return
    group.addLayer(detailCard(item))
  }, [annotations])

  useEffect(() => {
    draw()
    drawDetail()
    const map = mapRef.current
    if (!map) return
    // Labels are laid out in screen space, so they must be recomputed on move.
    map.on("zoomend", draw)
    map.on("moveend", draw)
    return () => {
      map.off("zoomend", draw)
      map.off("moveend", draw)
    }
  }, [draw, drawDetail, byId, selectedId])

  return <div ref={holder} className="absolute inset-0" />
}

/**
 * Frame the works. The asset extent is far wider than it is tall, so a plain
 * fitBounds leaves the plant as a band with paddocks above and below; fitting
 * then zooming slightly past it fills the frame without cropping any asset.
 */
function frameWorks(map: L.Map, animate = false) {
  map.fitBounds(BOUNDS, { padding: [6, 6], animate: false })
  const target = map.getZoom() + 0.25
  if (animate) map.flyTo(BOUNDS.getCenter(), target, { duration: 0.6 })
  else map.setView(BOUNDS.getCenter(), target, { animate: false })
}

/* ── rendering helpers ───────────────────────────────────────────────────── */

function marker(
  item: Annotation,
  label: string | undefined,
  active: boolean,
  select: (id: string) => void,
  setHover: (id: string | null) => void,
): L.Marker {
  const size = active ? 30 : 26
  const html = `
    <div style="transform:translate(-${size / 2}px,-${size / 2}px);display:flex;align-items:center;gap:7px">
      <span style="
        width:${size}px;height:${size}px;flex:0 0 auto;
        display:flex;align-items:center;justify-content:center;border-radius:50%;
        background:${active ? item.colour : "var(--surface-float)"};
        border:2px solid ${item.colour};
        color:${active ? "#08131f" : item.colour};
        box-shadow:${active ? `0 0 0 5px ${item.colour}33` : "0 2px 7px var(--surface-shadow)"};
      "><svg viewBox="0 0 24 24" width="${Math.round(size * 0.58)}" height="${Math.round(size * 0.58)}">${SITE_ICONS[item.icon]}</svg></span>
      ${
        label
          ? `<span style="
               white-space:nowrap;padding:2px 8px;border-radius:6px;
               background:var(--surface-float);border:1px solid ${item.colour}66;
               color:var(--surface-ink);font-size:11.5px;font-weight:600;
               box-shadow:0 2px 7px var(--surface-shadow);">${esc(label)}</span>`
          : ""
      }
    </div>`

  const m = L.marker([item.position.lat, item.position.lng], {
    icon: L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0] }),
    zIndexOffset: active ? 1000 : 0,
    riseOnHover: true,
  })
  m.on("mouseover", () => setHover(item.id))
  m.on("mouseout", () => setHover(null))
  m.on("click", (e) => {
    L.DomEvent.stopPropagation(e)
    select(item.id)
  })
  return m
}

function detailCard(item: Annotation): L.Marker {
  const d = item.detail()
  const rows = d.rows
    .map(
      ([k, v]) => `
      <div style="display:flex;gap:12px;padding:1.5px 0;font-size:11px">
        <span style="color:var(--surface-ink-dim)">${esc(k)}</span>
        <span style="margin-left:auto;color:#fff;font-weight:600">${esc(v)}</span>
      </div>`,
    )
    .join("")

  const html = `
    <div style="
      transform:translate(24px,-50%);min-width:210px;
      border-radius:10px;overflow:hidden;
      background:var(--surface-float-solid);
      border:1px solid ${d.accent};
      border-left:4px solid ${d.accent};
      box-shadow:0 10px 30px rgba(0,0,0,.7);color:var(--surface-ink);">
      <div style="padding:7px 11px;border-bottom:1px solid rgba(255,255,255,.1)">
        <div style="font-size:12.5px;font-weight:700">${esc(d.title)}</div>
        <div style="font-size:10.5px;opacity:.65;font-family:ui-monospace,monospace">${esc(d.tag)}</div>
      </div>
      <div style="padding:6px 11px 8px">${rows}</div>
    </div>`

  return L.marker([item.position.lat, item.position.lng], {
    interactive: false,
    icon: L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0] }),
    zIndexOffset: 2000,
  })
}

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export { STATUS_META }
export type { PileRecord }

import { describe, expect, it } from "vitest"

import { PILES } from "@/lib/assets/piles"
import {
  PLANT_ASSETS,
  TYPE_META,
  labelledPriorityAt,
  markerVisibleAt,
  plantAsset,
} from "@/lib/assets/plant-assets"
import { TWIN_CARDS } from "@/lib/assets/twin-cards"
import { storageLocations } from "@/lib/inventory/catalog"
import {
  candidateRect,
  layoutAnnotations,
  rectsOverlap,
  segmentHitsRect,
  type LayoutItem,
  type Rect,
} from "@/lib/map/annotation-layout"

/** A deterministic scatter of anchors, clustered like the plant core. */
function scatter(n: number, seed = 7): LayoutItem[] {
  let s = seed
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  return Array.from({ length: n }, (_, i) => ({
    id: `A-${i}`,
    anchor: { x: 250 + rand() * 900, y: 180 + rand() * 520 },
    w: 130 + Math.round(rand() * 50),
    h: 42 + Math.round(rand() * 30),
    priority: 1 + (i % 3),
    anchorRadius: 13,
  }))
}

const onEdge = (p: { x: number; y: number }, r: Rect) =>
  ((Math.abs(p.x - r.x) < 0.01 || Math.abs(p.x - (r.x + r.w)) < 0.01) && p.y >= r.y - 0.01 && p.y <= r.y + r.h + 0.01) ||
  ((Math.abs(p.y - r.y) < 0.01 || Math.abs(p.y - (r.y + r.h)) < 0.01) && p.x >= r.x - 0.01 && p.x <= r.x + r.w + 0.01)

describe("annotation layout", () => {
  const W = 1600
  const H = 880
  const reserved: Rect[] = [
    { x: 0, y: 0, w: W, h: 84 },
    { x: W - 224, y: 86, w: 212, h: 520 },
  ]
  const items = scatter(22)
  const markers = items.map((i) => ({ id: i.id, anchor: i.anchor, radius: i.anchorRadius }))
  const placed = layoutAnnotations(items, { width: W, height: H, reserved, markers })

  it("places most cards in a busy scene", () => {
    expect(placed.length).toBeGreaterThanOrEqual(14)
  })

  it("never overlaps two cards", () => {
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) expect(rectsOverlap(placed[i].rect, placed[j].rect)).toBe(false)
  })

  it("keeps every card inside the viewport and off reserved UI", () => {
    for (const p of placed) {
      expect(p.rect.x).toBeGreaterThanOrEqual(0)
      expect(p.rect.y).toBeGreaterThanOrEqual(0)
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(W)
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(H)
      for (const r of reserved) expect(rectsOverlap(p.rect, r)).toBe(false)
    }
  })

  it("starts every leader exactly at its own anchor and ends on its card's edge", () => {
    for (const p of placed) {
      const item = items.find((i) => i.id === p.id)!
      expect(p.anchor).toEqual(item.anchor)
      expect(onEdge(p.connector, p.rect)).toBe(true)
    }
  })

  it("never runs a leader line through another card", () => {
    for (const p of placed)
      for (const q of placed) if (p.id !== q.id) expect(segmentHitsRect(p.anchor, p.connector, q.rect)).toBe(false)
  })

  it("never covers another asset's marker", () => {
    for (const p of placed)
      for (const m of markers) {
        if (m.id === p.id) continue
        const nx = Math.max(p.rect.x, Math.min(m.anchor.x, p.rect.x + p.rect.w))
        const ny = Math.max(p.rect.y, Math.min(m.anchor.y, p.rect.y + p.rect.h))
        expect((m.anchor.x - nx) ** 2 + (m.anchor.y - ny) ** 2).toBeGreaterThanOrEqual(m.radius ** 2)
      }
  })

  it("places higher priorities first and drops only what cannot fit", () => {
    const tiny = layoutAnnotations(items, { width: 420, height: 320, markers })
    const p1 = items.filter((i) => i.priority === 1 && i.anchor.x < 420 && i.anchor.y < 320)
    const placedIds = new Set(tiny.map((t) => t.id))
    const droppedP1 = p1.filter((i) => !placedIds.has(i.id)).length
    const placedP3 = tiny.filter((t) => items.find((i) => i.id === t.id)!.priority === 3).length
    expect(droppedP1 === 0 || placedP3 === 0).toBe(true)
  })

  it("is deterministic, and keeps a card on the same side when it still fits", () => {
    const again = layoutAnnotations(items, { width: W, height: H, reserved, markers })
    expect(again).toEqual(placed)
    const prev = new Map(placed.map((p) => [p.id, { side: p.side, gap: p.gap }]))
    const shifted = items.map((i) => ({ ...i, anchor: { x: i.anchor.x + 3, y: i.anchor.y + 2 } }))
    const next = layoutAnnotations(shifted, {
      width: W,
      height: H,
      reserved,
      markers: shifted.map((i) => ({ id: i.id, anchor: i.anchor, radius: i.anchorRadius })),
      previous: prev,
    })
    const same = next.filter((n) => prev.get(n.id)?.side === n.side).length
    expect(same / next.length).toBeGreaterThan(0.8)
  })

  it("puts a TOP card directly above its anchor", () => {
    const { rect, connector } = candidateRect({ x: 500, y: 400 }, 120, 50, "top", 40)
    expect(connector).toEqual({ x: 500, y: 360 })
    expect(rect.x + rect.w / 2).toBe(500)
  })
})

describe("plant asset model", () => {
  it("gives every asset a unique ID", () => {
    const ids = PLANT_ASSETS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("claims no verified positions", () => {
    for (const a of PLANT_ASSETS) expect(a.positionAccuracy).toBe("approximate")
  })

  it("takes pile positions from the pile configuration, not a second copy", () => {
    for (const p of PILES) {
      const a = plantAsset(p.pileId)!
      expect([a.latitude, a.longitude]).toEqual([p.centre.lat, p.centre.lng])
      expect(a.inventoryLocationId).toBe(p.pileId)
    }
  })

  it("links stock-holding assets only to real inventory locations", () => {
    const locations = new Set(storageLocations().map((l) => l.locationId))
    for (const a of PLANT_ASSETS) if (a.inventoryLocationId) expect(locations.has(a.inventoryLocationId)).toBe(true)
  })

  it("connects only assets that exist", () => {
    for (const a of PLANT_ASSETS) for (const c of a.connections ?? []) expect(plantAsset(c)).toBeDefined()
  })

  it("represents Cement Silos 1–3 as approximate demo objects", () => {
    for (const id of ["SL-01", "SL-02", "SL-03"]) expect(plantAsset(id)).toMatchObject({ demoObject: true, positionAccuracy: "approximate" })
  })

  it("uses the same kiln ID as the 3D twin", () => {
    expect(plantAsset("KLN-01")?.type).toBe("kiln")
    expect(TWIN_CARDS.some((c) => c.id === "KLN-01")).toBe(true)
    expect(plantAsset("KILN-01")).toBeUndefined()
  })

  it("labels major assets at overview and minor ones only when zoomed in", () => {
    expect(labelledPriorityAt(-1.5)).toBe(1)
    expect(labelledPriorityAt(0)).toBe(2)
    expect(labelledPriorityAt(1)).toBe(3)
  })

  it("swaps the silo group for individual silos when zoomed in", () => {
    const group = plantAsset("SL-GRP")!
    const silo = plantAsset("SL-01")!
    expect(markerVisibleAt(group, 0)).toBe(true)
    expect(markerVisibleAt(silo, 0)).toBe(false)
    expect(markerVisibleAt(group, 1.5)).toBe(false)
    expect(markerVisibleAt(silo, 1.5)).toBe(true)
  })

  it("files every asset type under a filter group", () => {
    for (const a of PLANT_ASSETS) expect(TYPE_META[a.type].group).toBeTruthy()
  })
})

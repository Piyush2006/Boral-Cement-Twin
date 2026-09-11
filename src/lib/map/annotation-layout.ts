/**
 * Annotation layout engine.
 *
 *   asset lat/lng → map projection → screen anchor → THIS → card rect + leader
 *
 * Pure: screen geometry in, placements out, so it is testable without a map.
 *
 * Cards are placed greedily in priority order. For each, eight directions are
 * tried at several distances from the anchor, and the cheapest candidate that
 * breaks no hard rule wins:
 *
 *   TOP-LEFT    TOP    TOP-RIGHT
 *   LEFT        ●      RIGHT
 *   BOTTOM-LEFT BOTTOM BOTTOM-RIGHT
 *
 * Hard rules (candidate rejected): card leaves the viewport, card overlaps a
 * reserved UI region, card overlaps a card already placed, card covers another
 * asset's marker, or the leader line runs through a card already placed.
 * Soft costs: leader length, crossing another leader, covering pile areas,
 * and moving away from the direction the card had last time (so cards do not
 * jump sides on every redraw). A card with no legal position is not drawn.
 */

export type Pt = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export type Side =
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "top-left"

export type LayoutItem = {
  id: string
  anchor: Pt
  w: number
  h: number
  /** Lower is placed first. */
  priority: number
  /** Radius around the anchor the card must keep clear of. */
  anchorRadius: number
}

export type Placement = {
  id: string
  rect: Rect
  /** Where the leader line meets the card. */
  connector: Pt
  anchor: Pt
  side: Side
  gap: number
}

export type LayoutOptions = {
  width: number
  height: number
  /** UI regions cards may not cover (header, panels, controls). */
  reserved?: Rect[]
  /** Markers of every visible asset, including ones without a card. */
  markers?: Array<{ id: string; anchor: Pt; radius: number }>
  /** Areas cards should avoid covering where possible, e.g. pile outlines. */
  soft?: Rect[]
  /** Last placement per id, for stability. */
  previous?: Map<string, { side: Side; gap: number }>
  margin?: number
}

const SIDES: Side[] = ["top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left", "top-left"]
const GAPS = [30, 52, 78, 110, 150]

/** Preference, in cost units — cards above their asset read most naturally. */
const SIDE_COST: Record<Side, number> = {
  top: 0,
  "top-left": 6,
  "top-right": 6,
  left: 12,
  right: 12,
  bottom: 16,
  "bottom-left": 20,
  "bottom-right": 20,
}

export function candidateRect(anchor: Pt, w: number, h: number, side: Side, gap: number): { rect: Rect; connector: Pt } {
  const d = gap * 0.72 // diagonal offsets, so diagonal cards sit at a similar distance
  switch (side) {
    case "top": {
      const rect = { x: anchor.x - w / 2, y: anchor.y - gap - h, w, h }
      return { rect, connector: { x: anchor.x, y: rect.y + h } }
    }
    case "bottom": {
      const rect = { x: anchor.x - w / 2, y: anchor.y + gap, w, h }
      return { rect, connector: { x: anchor.x, y: rect.y } }
    }
    case "left": {
      const rect = { x: anchor.x - gap - w, y: anchor.y - h / 2, w, h }
      return { rect, connector: { x: rect.x + w, y: anchor.y } }
    }
    case "right": {
      const rect = { x: anchor.x + gap, y: anchor.y - h / 2, w, h }
      return { rect, connector: { x: rect.x, y: anchor.y } }
    }
    case "top-right": {
      const rect = { x: anchor.x + d, y: anchor.y - d - h, w, h }
      return { rect, connector: { x: rect.x + Math.min(18, w / 4), y: rect.y + h } }
    }
    case "top-left": {
      const rect = { x: anchor.x - d - w, y: anchor.y - d - h, w, h }
      return { rect, connector: { x: rect.x + w - Math.min(18, w / 4), y: rect.y + h } }
    }
    case "bottom-right": {
      const rect = { x: anchor.x + d, y: anchor.y + d, w, h }
      return { rect, connector: { x: rect.x + Math.min(18, w / 4), y: rect.y } }
    }
    case "bottom-left": {
      const rect = { x: anchor.x - d - w, y: anchor.y + d, w, h }
      return { rect, connector: { x: rect.x + w - Math.min(18, w / 4), y: rect.y } }
    }
  }
}

export function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function circleHitsRect(c: Pt, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.w))
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.h))
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r
}

function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const o = (a: Pt, b: Pt, c: Pt) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  return o(p1, p2, q1) !== o(p1, p2, q2) && o(q1, q2, p1) !== o(q1, q2, p2)
}

/** Whether a segment passes through a rectangle's interior. */
export function segmentHitsRect(a: Pt, b: Pt, r: Rect, inset = 2): boolean {
  const rr = { x: r.x + inset, y: r.y + inset, w: r.w - inset * 2, h: r.h - inset * 2 }
  if (rr.w <= 0 || rr.h <= 0) return false
  const inside = (p: Pt) => p.x > rr.x && p.x < rr.x + rr.w && p.y > rr.y && p.y < rr.y + rr.h
  if (inside(a) || inside(b)) return true
  const tl = { x: rr.x, y: rr.y }
  const tr = { x: rr.x + rr.w, y: rr.y }
  const br = { x: rr.x + rr.w, y: rr.y + rr.h }
  const bl = { x: rr.x, y: rr.y + rr.h }
  return (
    segmentsCross(a, b, tl, tr) || segmentsCross(a, b, tr, br) || segmentsCross(a, b, br, bl) || segmentsCross(a, b, bl, tl)
  )
}

export function layoutAnnotations(items: LayoutItem[], opts: LayoutOptions): Placement[] {
  const margin = opts.margin ?? 8
  const reserved = opts.reserved ?? []
  const markers = opts.markers ?? []
  const soft = opts.soft ?? []
  const placed: Placement[] = []

  const ordered = [...items].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))

  for (const item of ordered) {
    let best: { p: Placement; cost: number } | null = null
    const prev = opts.previous?.get(item.id)

    for (const gap of GAPS) {
      for (const side of SIDES) {
        const { rect, connector } = candidateRect(item.anchor, item.w, item.h, side, gap + item.anchorRadius)

        // Hard rules.
        if (rect.x < margin || rect.y < margin) continue
        if (rect.x + rect.w > opts.width - margin || rect.y + rect.h > opts.height - margin) continue
        if (reserved.some((r) => rectsOverlap(rect, r, 4))) continue
        if (placed.some((p) => rectsOverlap(rect, p.rect, 6))) continue
        if (circleHitsRect(item.anchor, item.anchorRadius + 4, rect)) continue
        if (markers.some((m) => m.id !== item.id && circleHitsRect(m.anchor, m.radius + 3, rect))) continue
        if (placed.some((p) => segmentHitsRect(item.anchor, connector, p.rect))) continue
        if (placed.some((p) => segmentHitsRect(p.anchor, p.connector, rect))) continue

        // Soft costs.
        let cost = gap * 0.9 + SIDE_COST[side]
        for (const p of placed) {
          if (segmentsCross(item.anchor, connector, p.anchor, p.connector)) cost += 120
        }
        for (const s of soft) cost += (overlapArea(rect, s) / (rect.w * rect.h)) * 60
        if (prev && (prev.side !== side || prev.gap !== gap)) cost += 35

        if (!best || cost < best.cost) {
          best = { p: { id: item.id, rect, connector, anchor: item.anchor, side, gap }, cost }
        }
      }
    }

    if (best) placed.push(best.p)
  }

  return placed
}

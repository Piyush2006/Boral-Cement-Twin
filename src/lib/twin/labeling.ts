/**
 * Label placement.
 *
 * A real plant is dense — Berrima's process core packs the kiln, preheater,
 * cooler, bypass, mills and stores into ~200 m. Drawing every label at every
 * zoom makes it unreadable, so labels compete for space by priority, try several
 * positions, and the losers are dropped rather than overlapped.
 */

import type { ProcessStage, TwinAsset } from "@/lib/assets/types"

export type Box = { x: number; y: number; w: number; h: number }

/** Lower wins. Big landmarks and the selection outrank incidental buildings. */
export function priorityOf(asset: TwinAsset, selected: boolean): number {
  if (selected) return -1
  if (asset.type === "KILN") return 0
  if (asset.type === "STOCKPILE" || asset.type === "SILO") return 1
  if (asset.type === "MILL" || asset.type === "CRUSHER") return 1
  if (asset.type === "PROCESS_AREA" || asset.type === "LOADING_AREA") return 2
  return 3
}

/**
 * How much detail to show, from the map's zoom. Berrima is ~1.3 km across, so
 * z15 sees the whole site and z18 sees individual structures.
 */
export function detailFor(zoom: number): 0 | 1 | 2 | 3 {
  if (zoom < 15) return 0
  if (zoom < 16.5) return 1
  if (zoom < 17.5) return 2
  return 3
}

export function passesDetail(asset: TwinAsset, detail: number, selected: boolean): boolean {
  if (selected) return true
  return priorityOf(asset, false) <= detail
}

export function boxFor(text: string, cx: number, cy: number, bold: boolean): Box {
  const w = text.length * (bold ? 6.9 : 6.4) + 18
  const h = 19
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export type Candidate<T> = { item: T; priority: number; options: Array<{ box: Box; ox: number; oy: number }> }

/**
 * Greedy multi-position placement: walk candidates by priority and take the
 * first offset still clear of everything already placed. Ties break on position
 * so the same scene always resolves the same way and labels do not flicker.
 */
export function place<T>(
  candidates: Array<Candidate<T>>,
  obstacles: Box[] = [],
): Array<{ item: T; ox: number; oy: number }> {
  const sorted = [...candidates].sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.options[0]?.box.x ?? 0) - (b.options[0]?.box.x ?? 0) ||
      (a.options[0]?.box.y ?? 0) - (b.options[0]?.box.y ?? 0),
  )
  const taken = [...obstacles]
  const kept: Array<{ item: T; ox: number; oy: number }> = []

  for (const c of sorted) {
    const fit = c.options.find((o) => !taken.some((t) => overlaps(t, o.box)))
    if (!fit) continue
    taken.push(fit.box)
    kept.push({ item: c.item, ox: fit.ox, oy: fit.oy })
  }
  return kept
}

export const STAGE_TINT: Record<ProcessStage, string> = {
  EXTRACTION: "#fb7185",
  RAW_MATERIALS: "#eab308",
  RAW_PREPARATION: "#c084fc",
  PYROPROCESSING: "#f472b6",
  CLINKER: "#fb923c",
  FINISH_MILLING: "#4ade80",
  CEMENT_STORAGE: "#60a5fa",
  DISPATCH: "#2dd4bf",
  UTILITY: "#94a3b8",
}

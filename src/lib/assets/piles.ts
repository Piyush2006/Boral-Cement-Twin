/**
 * Raw material piles — the subject of the Plant Map screen.
 *
 * Pile IDs, materials and quantities are CONFIGURED FOR THIS BUILD, not supplied
 * by Boral. Pile outlines are traced from satellite imagery. Both facts are
 * stated on the map itself, in the note card, exactly as the client's design
 * specifies:
 *
 *   "Pile locations are identified based on satellite imagery. Actual pile IDs,
 *    materials, capacities and quantities should be validated with plant
 *    data/verified layout."
 */

import { fromLocalMetres, toLocalMetres, type LatLng } from "@/lib/map/projection"
import type { MaterialId } from "./materials"

/**
 * Pile stock status. NOTE: the client's design specifies three bands —
 * Healthy / Moderate / Critical — so "Moderate" exists here by explicit request,
 * overriding the two-band vocabulary in CLAUDE.md §24. When the real inventory
 * system is connected its own status values take over.
 */
export type PileStatus = "HEALTHY" | "MODERATE" | "CRITICAL"

export type Pile = {
  /** Map label, e.g. PILE-RM-01. */
  pileId: string
  /** Inventory identifier, e.g. RM-LS-001. */
  id: string
  materialId: MaterialId
  centre: LatLng
  /** Traced outline of the pile area. */
  outline: LatLng[]
  /** Where the callout sits, in metres east/north of the centre. */
  callout: { east: number; north: number }
  capacityMt: number
}

/**
 * Organic outline around a centre — a stable pseudo-random blob rather than a
 * rectangle, so a traced pile area reads as ground rather than a drawing tool.
 * Deterministic per seed so outlines never shift between renders.
 */
function blob(centre: LatLng, radiusMetres: number, seed: number, stretch = 1, tilt = 0): LatLng[] {
  const o = toLocalMetres(centre)
  const points: LatLng[] = []
  const sides = 16
  let s = seed
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  const t = (tilt * Math.PI) / 180
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2
    const r = radiusMetres * (0.74 + rand() * 0.5)
    const ex = Math.cos(a) * r * stretch
    const ny = Math.sin(a) * r
    points.push(
      fromLocalMetres({
        east: o.east + ex * Math.cos(t) - ny * Math.sin(t),
        north: o.north + ex * Math.sin(t) + ny * Math.cos(t),
      }),
    )
  }
  return points
}

type Seed = {
  pileId: string
  id: string
  materialId: MaterialId
  lat: number
  lng: number
  radius: number
  stretch: number
  tilt: number
  seed: number
  capacityMt: number
  callout: { east: number; north: number }
}

const SEEDS: Seed[] = [
  {
    pileId: "PILE-RM-01", id: "RM-LS-001", materialId: "MAT-LIMESTONE",
    lat: -34.507570, lng: 150.327900, radius: 78, stretch: 1.35, tilt: 118, seed: 11,
    capacityMt: 29000, callout: { east: -120, north: 205 },
  },
  {
    pileId: "PILE-RM-02", id: "RM-CS-002", materialId: "MAT-CLAY-SHALE",
    lat: -34.507760, lng: 150.329560, radius: 62, stretch: 1.2, tilt: 118, seed: 23,
    capacityMt: 11800, callout: { east: 95, north: 120 },
  },
  {
    pileId: "PILE-RM-03", id: "RM-SN-003", materialId: "MAT-SAND",
    lat: -34.508050, lng: 150.331700, radius: 55, stretch: 1.25, tilt: 100, seed: 37,
    capacityMt: 8000, callout: { east: 95, north: 165 },
  },
  {
    pileId: "PILE-RM-04", id: "RM-GY-004", materialId: "MAT-GYPSUM",
    lat: -34.510980, lng: 150.339900, radius: 46, stretch: 1.1, tilt: 30, seed: 51,
    capacityMt: 3200, callout: { east: 150, north: 150 },
  },
  {
    pileId: "PILE-RM-05", id: "RM-CO-005", materialId: "MAT-COAL",
    lat: -34.512500, lng: 150.338250, radius: 58, stretch: 1.15, tilt: 60, seed: 67,
    capacityMt: 10000, callout: { east: 205, north: 15 },
  },
  {
    pileId: "PILE-RM-06", id: "RM-AF-006", materialId: "MAT-ALT-FUEL",
    lat: -34.510850, lng: 150.330050, radius: 85, stretch: 1.3, tilt: 128, seed: 83,
    capacityMt: 5000, callout: { east: -175, north: 150 },
  },
  {
    pileId: "PILE-RM-07", id: "RM-BM-007", materialId: "MAT-RAW-MIX",
    lat: -34.512700, lng: 150.331200, radius: 105, stretch: 1.4, tilt: 42, seed: 97,
    capacityMt: 36000, callout: { east: -195, north: -25 },
  },
]

export const PILES: Pile[] = SEEDS.map((s) => ({
  pileId: s.pileId,
  id: s.id,
  materialId: s.materialId,
  centre: { lat: s.lat, lng: s.lng },
  outline: blob({ lat: s.lat, lng: s.lng }, s.radius, s.seed, s.stretch, s.tilt),
  callout: s.callout,
  capacityMt: s.capacityMt,
}))

export function getPile(pileId: string | null): Pile | undefined {
  if (!pileId) return undefined
  return PILES.find((p) => p.pileId === pileId || p.id === pileId)
}

/** Site and landmark pins shown on the plant map. */
export const MAP_PINS = [
  { id: "SITE", label: "Boral Cement Works", sub: "Berrima, NSW", lat: -34.5099, lng: 150.3365, tone: "#2563eb" },
  { id: "CREEK", label: "Stony Creek", sub: "", lat: -34.512900, lng: 150.341600, tone: "#14b8a6" },
] as const

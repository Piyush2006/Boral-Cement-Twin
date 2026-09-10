/**
 * Process layout for the Digital Twin.
 *
 * The twin is arranged along the PROCESS LINE, not at true geographic spacing.
 * At real coordinates Berrima's units sit within tens of metres of each other
 * and the model reads as one crowded lump; laid out along the process spine,
 * each unit has room and the flow is legible end to end.
 *
 *   piles → crusher → raw mill → preheater → KILN → cooler → silos → packing
 *
 * The Satellite view remains the geographic truth layer; this view is the
 * process truth layer. Both are driven by the same asset IDs and live data.
 */

export type ScenePoint = { x: number; z: number }

/** Ground positions in scene units (x = east, z = south). */
export const NODE: Record<string, ScenePoint> = {
  // Raw material stockyard, west end.
  "PILE-RM-01": { x: -560, z: -120 },
  "PILE-RM-02": { x: -560, z: -10 },
  "PILE-AF": { x: -520, z: 120 },
  "PILE-COAL": { x: -370, z: 200 },
  "PILE-RM-07": { x: -200, z: 235 },

  // Raw preparation.
  "CR-01": { x: -330, z: -70 },
  "RM-01": { x: -140, z: -30 },
  "GEO-01": { x: -110, z: -195 },

  // Pyroprocessing — the kiln is the spine of the plant.
  "PH-01": { x: 40, z: -130 },
  "KLN-01": { x: 110, z: 30 },
  "CC-01": { x: 285, z: 85 },
  "BYPASS-DUST": { x: 170, z: 205 },

  // Cement storage and despatch, east end.
  "SL-GRP": { x: 350, z: -95 },
  "PK-01": { x: 500, z: 45 },
  "UT-01": { x: 585, z: 165 },
  "ADMIN-01": { x: 545, z: 250 },
}

/** Height in metres to aim a leader line at, per unit. */
export const NODE_LIFT: Record<string, number> = {
  "PILE-RM-01": 30,
  "PILE-RM-02": 28,
  "PILE-AF": 28,
  "PILE-COAL": 28,
  "PILE-RM-07": 32,
  "CR-01": 62,
  "RM-01": 46,
  "GEO-01": 54,
  "PH-01": 150,
  "KLN-01": 52,
  "CC-01": 56,
  "BYPASS-DUST": 22,
  "SL-GRP": 120,
  "PK-01": 44,
  "UT-01": 34,
  "ADMIN-01": 30,
}

export type Link = {
  from: string
  to: string
  /** Conveyor gallery, duct, or a simple pipe run. */
  kind: "gallery" | "duct" | "pipe"
}

/**
 * The end-to-end process connections drawn in the scene. These show the
 * material route through the plant; they are indicative, as on the client's
 * annotated site plan, not surveyed conveyor centrelines.
 */
export const LINKS: Link[] = [
  { from: "PILE-RM-01", to: "CR-01", kind: "gallery" },
  { from: "PILE-RM-02", to: "CR-01", kind: "gallery" },
  { from: "CR-01", to: "RM-01", kind: "gallery" },
  { from: "RM-01", to: "PH-01", kind: "duct" },
  { from: "GEO-01", to: "PH-01", kind: "pipe" },
  { from: "PILE-AF", to: "GEO-01", kind: "gallery" },
  { from: "PILE-COAL", to: "KLN-01", kind: "pipe" },
  { from: "PILE-RM-07", to: "RM-01", kind: "gallery" },
  { from: "PH-01", to: "KLN-01", kind: "duct" },
  { from: "KLN-01", to: "CC-01", kind: "duct" },
  { from: "KLN-01", to: "BYPASS-DUST", kind: "pipe" },
  { from: "CC-01", to: "SL-GRP", kind: "gallery" },
  { from: "SL-GRP", to: "PK-01", kind: "gallery" },
]

export function node(id: string): ScenePoint {
  return NODE[id] ?? { x: 0, z: 0 }
}

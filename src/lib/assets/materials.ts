/**
 * Raw material types and their map colours.
 *
 * Colours are the legend from the client's design and are the primary visual
 * key on the Plant Map: a pile is coloured by WHAT IT HOLDS, not by category.
 */

export type MaterialId =
  | "MAT-LIMESTONE"
  | "MAT-CLAY-SHALE"
  | "MAT-SAND"
  | "MAT-GYPSUM"
  | "MAT-COAL"
  | "MAT-ALT-FUEL"
  | "MAT-RAW-MIX"

export type MaterialDef = {
  materialId: MaterialId
  name: string
  colour: string
  uom: string
}

export const MATERIALS: MaterialDef[] = [
  { materialId: "MAT-LIMESTONE", name: "Limestone", colour: "#facc15", uom: "MT" },
  { materialId: "MAT-CLAY-SHALE", name: "Clay / Shale", colour: "#22c55e", uom: "MT" },
  { materialId: "MAT-SAND", name: "Sand / Correctives", colour: "#f9a8d4", uom: "MT" },
  { materialId: "MAT-GYPSUM", name: "Gypsum", colour: "#a78bfa", uom: "MT" },
  { materialId: "MAT-COAL", name: "Coal", colour: "#f97316", uom: "MT" },
  { materialId: "MAT-ALT-FUEL", name: "Alternate Fuel (AF)", colour: "#3b82f6", uom: "MT" },
  { materialId: "MAT-RAW-MIX", name: "Raw Mix / Blended Material", colour: "#ef4444", uom: "MT" },
]

const BY_ID = new Map(MATERIALS.map((m) => [m.materialId, m]))

export function material(id: string | undefined): MaterialDef | undefined {
  return id ? BY_ID.get(id as MaterialId) : undefined
}

export function materialColour(id: string | undefined, fallback = "#94a3b8"): string {
  return material(id)?.colour ?? fallback
}

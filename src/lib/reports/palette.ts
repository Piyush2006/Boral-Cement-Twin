/**
 * Chart colours for materials — the same hue each material has on the map,
 * stepped to a chart-safe shade.
 *
 * Validated with the dataviz palette validator (light surface #fcfcfb and dark
 * surface #111827): every slot inside the lightness band, above the chroma
 * floor and ≥ 3:1 against the surface; adjacent pairs clear the colour-blind
 * target (ΔE ≥ 8) and the normal-vision floor (ΔE ≥ 15) — including the pair
 * where a donut ring wraps round. The ORDER is part of that result, so charts
 * draw materials in this order and never re-sort the colours.
 */

export const MATERIAL_CHART_ORDER: Array<{ materialId: string; colour: string }> = [
  { materialId: "MAT-LIMESTONE", colour: "#c2860a" },
  { materialId: "MAT-ALT-FUEL", colour: "#2563eb" },
  { materialId: "MAT-CLAY-SHALE", colour: "#16a34a" },
  { materialId: "MAT-GYPSUM", colour: "#8b5cf6" },
  { materialId: "MAT-SAND", colour: "#db2777" },
  { materialId: "MAT-COAL", colour: "#ea580c" },
  { materialId: "MAT-CEMENT", colour: "#0d9488" },
  { materialId: "MAT-RAW-MIX", colour: "#dc2626" },
]

/** A material registered later, with no validated slot, folds into "Other" in grey. */
export const OTHER_COLOUR = "#64748b"

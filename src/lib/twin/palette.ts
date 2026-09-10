/**
 * One visual language for both views (§14, §24).
 *
 * Colour is keyed to the client annotation's legend so the app reads the same
 * way as the drawing: pile areas amber, process units pink, grinding green,
 * storage blue, utility purple, quarry rose.
 *
 * Colour is NEVER the only channel (§24) — every status also carries an icon
 * glyph and a text label.
 */

import type { AssetStatus, AssetType } from "@/lib/assets/types"

export type Category = "PILE" | "PROCESS" | "GRIND" | "STORAGE" | "UTILITY" | "QUARRY"

export const CATEGORY_OF: Record<AssetType, Category> = {
  SITE: "UTILITY",
  PROCESS_AREA: "PROCESS",
  STOCKPILE: "PILE",
  SILO: "STORAGE",
  CRUSHER: "UTILITY",
  MILL: "GRIND",
  KILN: "PROCESS",
  CONVEYOR: "UTILITY",
  TRANSFER_POINT: "UTILITY",
  LOADING_AREA: "STORAGE",
  UTILITY: "UTILITY",
  BUILDING: "UTILITY",
  ROAD: "UTILITY",
}

export const CATEGORY_COLOR: Record<Category, string> = {
  PILE: "#eab308",
  PROCESS: "#f472b6",
  GRIND: "#4ade80",
  STORAGE: "#60a5fa",
  UTILITY: "#c084fc",
  QUARRY: "#fb7185",
}

export const CATEGORY_LABEL: Record<Category, string> = {
  PILE: "Raw Material Pile Area",
  PROCESS: "Process Unit",
  GRIND: "Grinding Unit",
  STORAGE: "Storage / Silo",
  UTILITY: "Utility / Other",
  QUARRY: "Quarry (not a stockpile)",
}

export function categoryOf(type: AssetType, assetId?: string): Category {
  if (assetId?.startsWith("QUARRY")) return "QUARRY"
  return CATEGORY_OF[type]
}

export function colorFor(type: AssetType, assetId?: string): string {
  return CATEGORY_COLOR[categoryOf(type, assetId)]
}

/** Status: colour + glyph + text, never colour alone (§24). */
export const STATUS_META: Record<AssetStatus, { color: string; glyph: string; label: string }> = {
  OPERATIONAL: { color: "#34d399", glyph: "●", label: "Operational" },
  WARNING: { color: "#fbbf24", glyph: "▲", label: "Warning" },
  CRITICAL: { color: "#f87171", glyph: "■", label: "Critical" },
  OFFLINE: { color: "#7c8695", glyph: "○", label: "Offline" },
  VERIFICATION_REQUIRED: { color: "#c084fc", glyph: "?", label: "Verification Required" },
}

export const INVENTORY_STATUS_META = {
  HEALTHY: { color: "#34d399", glyph: "●", label: "Healthy" },
  CRITICAL: { color: "#f87171", glyph: "■", label: "Critical" },
} as const

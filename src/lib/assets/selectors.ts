/**
 * Pure reads over the asset registry. No inventory logic (§19).
 */

import { TWIN_ASSETS } from "./registry"
import type { AssetType, ProcessStage, TwinAsset } from "./types"

export type LayerId =
  | "plantAreas"
  | "rawMaterialPiles"
  | "cementSilos"
  | "processEquipment"
  | "materialFlow"
  | "roads"
  | "inventoryStatus"
  | "qrAssets"
  | "labels"

export type LayerState = Record<LayerId, boolean>

/** §23: do not show every layer by default. Open clean. */
export const DEFAULT_LAYERS: LayerState = {
  plantAreas: true,
  rawMaterialPiles: true,
  cementSilos: true,
  processEquipment: true,
  materialFlow: false,
  roads: false,
  inventoryStatus: true,
  qrAssets: false,
  labels: true,
}

const TYPE_LAYER: Record<AssetType, LayerId> = {
  SITE: "plantAreas",
  PROCESS_AREA: "processEquipment",
  STOCKPILE: "rawMaterialPiles",
  SILO: "cementSilos",
  CRUSHER: "processEquipment",
  MILL: "processEquipment",
  KILN: "processEquipment",
  CONVEYOR: "materialFlow",
  TRANSFER_POINT: "processEquipment",
  LOADING_AREA: "processEquipment",
  UTILITY: "plantAreas",
  BUILDING: "plantAreas",
  ROAD: "roads",
}

export function layerFor(asset: TwinAsset): LayerId {
  return TYPE_LAYER[asset.type]
}

export function visibleAssets(layers: LayerState, assets = TWIN_ASSETS): TwinAsset[] {
  return assets.filter((a) => layers[layerFor(a)])
}

export function getAsset(assetId: string | null, assets = TWIN_ASSETS): TwinAsset | null {
  if (!assetId) return null
  return assets.find((a) => a.assetId === assetId) ?? null
}

export function assetsWithInventory(assets = TWIN_ASSETS): TwinAsset[] {
  return assets.filter((a) => Boolean(a.inventoryLocationId))
}

export function qrAssets(assets = TWIN_ASSETS): TwinAsset[] {
  return assets.filter((a) => a.qrEnabled)
}

/** A quarry is a source area, never a stock location (§11 / client annotation). */
export function canHoldInventory(asset: TwinAsset): boolean {
  if (asset.assetId.startsWith("QUARRY")) return false
  return Boolean(asset.inventoryLocationId)
}

export function searchAssets(query: string, assets = TWIN_ASSETS): TwinAsset[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return assets
    .filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.assetId.toLowerCase().includes(q) ||
        a.type.toLowerCase().replace(/_/g, " ").includes(q),
    )
    .slice(0, 8)
}

export const STAGE_ORDER: ProcessStage[] = [
  "EXTRACTION",
  "RAW_MATERIALS",
  "RAW_PREPARATION",
  "PYROPROCESSING",
  "CLINKER",
  "FINISH_MILLING",
  "CEMENT_STORAGE",
  "DISPATCH",
  "UTILITY",
]

export const STAGE_LABEL: Record<ProcessStage, string> = {
  EXTRACTION: "Extraction",
  RAW_MATERIALS: "Raw Materials",
  RAW_PREPARATION: "Raw Preparation",
  PYROPROCESSING: "Pyroprocessing",
  CLINKER: "Clinker",
  FINISH_MILLING: "Finish Milling",
  CEMENT_STORAGE: "Cement Storage",
  DISPATCH: "Dispatch",
  UTILITY: "Utility",
}

/** Geographic extent of the assets, for framing both views. */
export function assetBounds(assets = TWIN_ASSETS) {
  const lats = assets.map((a) => a.position.lat)
  const lngs = assets.map((a) => a.position.lng)
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  }
}

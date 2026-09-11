/**
 * The top-bar search, applied to plant assets. Matches the asset ID, its name,
 * and for a stockpile the material it holds. Empty query matches everything.
 */

import { material } from "./materials"
import type { PlantAsset } from "./plant-assets"

export function assetMatches(asset: Pick<PlantAsset, "id" | "name" | "materialId">, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [asset.id, asset.name, asset.materialId ? material(asset.materialId)?.name : undefined].some((v) =>
    v?.toLowerCase().includes(q),
  )
}

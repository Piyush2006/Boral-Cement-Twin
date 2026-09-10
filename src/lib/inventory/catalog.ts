/**
 * Material and location catalogues for the Inventory module.
 *
 * Both are derived from the existing plant configuration rather than a new
 * table: materials come from MATERIALS, locations from the assets that already
 * carry an `inventoryLocationId`. Adding inventory therefore cannot invent a
 * material or a location that the plant does not model.
 */

import { PILES } from "@/lib/assets/piles"
import { SILO_SEED } from "@/lib/inventory/silo-inventory"
import { MATERIALS, material } from "@/lib/assets/materials"

/** Material group, in the client's terminology. */
export type MaterialGroup = "Raw Material" | "Fuel" | "Additive" | "Finished Product"

export type MaterialCatalogEntry = {
  materialId: string
  /** Material ID as shown in the table, e.g. RM-LS-001. */
  code: string
  name: string
  description: string
  group: MaterialGroup
  uom: string
}

const GROUP: Record<string, MaterialGroup> = {
  "MAT-LIMESTONE": "Raw Material",
  "MAT-CLAY-SHALE": "Raw Material",
  "MAT-SAND": "Additive",
  "MAT-GYPSUM": "Additive",
  "MAT-COAL": "Fuel",
  "MAT-ALT-FUEL": "Fuel",
  "MAT-RAW-MIX": "Raw Material",
  "MAT-CEMENT": "Finished Product",
}

const DESCRIPTION: Record<string, string> = {
  "MAT-LIMESTONE": "Crushed limestone, kiln feed",
  "MAT-CLAY-SHALE": "Clay and shale, raw mix component",
  "MAT-SAND": "Silica sand and correctives",
  "MAT-GYPSUM": "Gypsum, cement set retarder",
  "MAT-COAL": "Thermal coal, kiln fuel",
  "MAT-ALT-FUEL": "Solid recovered fuel, kiln substitution",
  "MAT-RAW-MIX": "Blended raw mix, pre-kiln",
  "MAT-CEMENT": "Ordinary Portland Cement",
}

/** Inventory code for a material, taken from the pile that holds it. */
const CODE_BY_MATERIAL = new Map(PILES.map((p) => [p.materialId as string, p.id]))

export const MATERIAL_CATALOG: MaterialCatalogEntry[] = [
  ...MATERIALS.map((m) => ({
    materialId: m.materialId as string,
    code: CODE_BY_MATERIAL.get(m.materialId) ?? m.materialId,
    name: m.name,
    description: DESCRIPTION[m.materialId] ?? m.name,
    group: GROUP[m.materialId] ?? ("Raw Material" as MaterialGroup),
    uom: m.uom,
  })),
  {
    materialId: "MAT-CEMENT",
    code: "FG-OPC-001",
    name: "Cement",
    description: DESCRIPTION["MAT-CEMENT"],
    group: "Finished Product",
    uom: "MT",
  },
]

export function materialEntry(materialId: string): MaterialCatalogEntry | undefined {
  return MATERIAL_CATALOG.find((m) => m.materialId === materialId)
}

export const MATERIAL_GROUPS: MaterialGroup[] = [
  "Raw Material",
  "Fuel",
  "Additive",
  "Finished Product",
]

export type LocationEntry = {
  /** The key inventory balances are held against. */
  locationId: string
  name: string
  /** The material this location holds, where the plant models one. */
  materialId: string
  area: string
}

/**
 * Locations are the stock-holding assets the plant already models. A material
 * can sit at more than one, and balances are never merged across them.
 */
export const LOCATIONS: LocationEntry[] = [
  ...PILES.map((p) => ({
    locationId: p.pileId,
    name: `${material(p.materialId)?.name ?? p.pileId} Pile — ${p.pileId}`,
    materialId: p.materialId as string,
    area: "Stockyard",
  })),
  ...SILO_SEED.map((s) => ({
    locationId: s.id,
    name: `${s.name} — ${s.id}`,
    materialId: "MAT-CEMENT",
    area: "Cement Storage",
  })),
]

export function locationEntry(locationId: string): LocationEntry | undefined {
  return LOCATIONS.find((l) => l.locationId === locationId)
}

/** Locations that can receive a given material. */
export function locationsForMaterial(materialId: string): LocationEntry[] {
  return LOCATIONS.filter((l) => l.materialId === materialId)
}

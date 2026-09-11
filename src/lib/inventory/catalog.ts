/**
 * Lookups into the master data.
 *
 * Materials, grades and locations are registered masters (see lib/masters).
 * This module is the thin reading layer the rest of the application uses, so
 * nothing has to know where the registry lives.
 */

import {
  activeMaterials,
  gradeMaster,
  gradesFor,
  inventoryLocations,
  locationMaster,
  materialMaster,
} from "@/lib/masters/registry"
import { MATERIAL_GROUPS, type GradeMaster, type LocationMaster, type MaterialGroup, type MaterialMaster } from "@/lib/masters/types"

export type { MaterialGroup }
export { MATERIAL_GROUPS }

/** A material's master record. */
export function materialEntry(materialId: string | undefined): MaterialMaster | undefined {
  return materialMaster(materialId)
}

/** A grade's master record. */
export function gradeEntry(gradeId: string | undefined): GradeMaster | undefined {
  return gradeMaster(gradeId)
}

/** A location's master record. */
export function locationEntry(locationId: string | undefined): LocationMaster | undefined {
  return locationMaster(locationId)
}

/** Materials available to register stock against. */
export function materialOptions(): MaterialMaster[] {
  return activeMaterials()
}

/** Grades registered under a material. */
export function gradeOptions(materialId: string | undefined): GradeMaster[] {
  return gradesFor(materialId)
}

/** Locations material can be stored at. */
export function storageLocations(): LocationMaster[] {
  return inventoryLocations()
}

/** A readable name for a location, falling back to its ID. */
export function locationName(locationId: string | undefined): string {
  return locationMaster(locationId)?.name ?? locationId ?? "—"
}

/** Material and grade as one label, e.g. "Limestone · Grade A". */
export function materialGradeLabel(materialId: string | undefined, gradeId: string | undefined): string {
  const m = materialMaster(materialId)
  const g = gradeMaster(gradeId)
  return [m?.name ?? materialId ?? "—", g?.name].filter(Boolean).join(" · ")
}

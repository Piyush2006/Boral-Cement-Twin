/**
 * The live master-data registry.
 *
 * One in-memory registry so that a lookup anywhere in the application — the
 * map, the twin, traceability — sees the same masters the registration screens
 * edit. The store owns the mutations; everything else reads.
 *
 * Same shape as the ledger: a module singleton with subscribe, so the two
 * behave alike and neither becomes a second source of truth.
 */

import { GRADE_SEED_LIST, LOCATION_SEED, MATERIAL_SEED } from "./seed"
import { consumesStock, holdsStock, type GradeMaster, type LocationMaster, type MaterialMaster } from "./types"

type Masters = { materials: MaterialMaster[]; grades: GradeMaster[]; locations: LocationMaster[] }

let masters: Masters = {
  materials: MATERIAL_SEED,
  grades: GRADE_SEED_LIST,
  locations: LOCATION_SEED,
}

const listeners = new Set<(m: Masters) => void>()

function publish(next: Masters) {
  masters = next
  for (const l of listeners) l(masters)
}

export function allMasters(): Masters {
  return masters
}

export function subscribeMasters(fn: (m: Masters) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setMaterials(materials: MaterialMaster[]): void {
  publish({ ...masters, materials })
}

export function setGrades(grades: GradeMaster[]): void {
  publish({ ...masters, grades })
}

/** Save a material and its grades together — Materials + Grades is one master. */
export function setMaterialsAndGrades(materials: MaterialMaster[], grades: GradeMaster[]): void {
  publish({ ...masters, materials, grades })
}

export function setLocations(locations: LocationMaster[]): void {
  publish({ ...masters, locations })
}

/* ── lookups ─────────────────────────────────────────────────────────────── */

export function materialMaster(materialId: string | undefined): MaterialMaster | undefined {
  return materialId ? masters.materials.find((m) => m.materialId === materialId) : undefined
}

export function gradeMaster(gradeId: string | undefined): GradeMaster | undefined {
  return gradeId ? masters.grades.find((g) => g.gradeId === gradeId) : undefined
}

export function gradesFor(materialId: string | undefined): GradeMaster[] {
  return materialId ? masters.grades.filter((g) => g.materialId === materialId && g.active) : []
}

export function locationMaster(locationId: string | undefined): LocationMaster | undefined {
  return locationId ? masters.locations.find((l) => l.locationId === locationId) : undefined
}

/** Active locations that can hold an inventory balance (Inventory or Both). */
export function inventoryLocations(): LocationMaster[] {
  return masters.locations.filter((l) => holdsStock(l) && l.active)
}

/** Active locations material can be consumed at (Consumption or Both). */
export function consumptionLocations(): LocationMaster[] {
  return masters.locations.filter((l) => consumesStock(l) && l.active)
}

export function activeMaterials(): MaterialMaster[] {
  return masters.materials.filter((m) => m.active)
}

/** One option per active Material + Grade pair, as Inventory and Issue select it. */
export type MaterialGradeOption = { materialId: string; gradeId: string; label: string; uom: string }

export function materialGradeOptions(): MaterialGradeOption[] {
  const out: MaterialGradeOption[] = []
  for (const m of masters.materials) {
    if (!m.active) continue
    for (const g of masters.grades) {
      if (g.materialId !== m.materialId || !g.active) continue
      out.push({ materialId: m.materialId, gradeId: g.gradeId, label: `${m.name} — ${g.name}`, uom: m.uom })
    }
  }
  return out
}

/** Test seam — restores the seeded masters. */
export function resetMasters(): void {
  publish({ materials: MATERIAL_SEED, grades: GRADE_SEED_LIST, locations: LOCATION_SEED })
}

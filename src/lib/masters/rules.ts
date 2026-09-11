/**
 * Registration validation — pure, so the rules are testable without the UI.
 */

import {
  LOCATION_KINDS,
  LOCATION_USAGES,
  type GradeMaster,
  type LocationKind,
  type LocationMaster,
  type LocationUsage,
  type MaterialMaster,
  type QualityParameter,
} from "./types"

export type Check = { ok: true } | { ok: false; error: string }

const clean = (v: string | undefined) => (v ?? "").trim()
const key = (v: string | undefined) => clean(v).toUpperCase()

const ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,23}$/

export function parseNumber(raw: string): number | null {
  const t = raw.trim()
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function parseNonNegativeNumber(raw: string): number | null {
  const n = parseNumber(raw)
  return n !== null && n >= 0 ? n : null
}

/** Internal material identity, derived from its code. */
export function materialIdFor(code: string): string {
  return `MAT-${key(code)}`
}

/** Internal grade identity, derived from the material code and grade name. */
export function gradeIdFor(materialCode: string, gradeName: string, existing: GradeMaster[]): string {
  const base = `GRD-${key(materialCode)}-${key(gradeName).replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 32)
  let id = base
  for (let n = 2; existing.some((g) => g.gradeId === id); n += 1) id = `${base.slice(0, 29)}-${n}`
  return id
}

/* ── material ────────────────────────────────────────────────────────────── */

export type MaterialInput = {
  code: string
  name: string
  uom: string
  /** Optional category. */
  group?: string
  unitCost: number | null
}

export function validateMaterial(input: MaterialInput, existing: MaterialMaster[], editingId?: string): Check {
  const code = key(input.code)
  if (!code) return { ok: false, error: "Enter a material code." }
  if (!CODE_PATTERN.test(code)) return { ok: false, error: "Material code may use letters, digits and hyphens (2–24 characters)." }
  if (existing.some((m) => key(m.code) === code && m.materialId !== editingId)) {
    return { ok: false, error: `Material code ${code} is already used.` }
  }
  if (!editingId && existing.some((m) => m.materialId === materialIdFor(code))) {
    return { ok: false, error: `Material code ${code} is already used.` }
  }
  if (!clean(input.name)) return { ok: false, error: "Enter a material name." }
  if (existing.some((m) => key(m.name) === key(input.name) && m.materialId !== editingId)) {
    return { ok: false, error: `A material named ${clean(input.name)} already exists.` }
  }
  if (!clean(input.uom)) return { ok: false, error: "Enter the unit of measure." }
  if (input.unitCost !== null && input.unitCost < 0) return { ok: false, error: "Standard cost cannot be negative." }
  return { ok: true }
}

/* ── grade ───────────────────────────────────────────────────────────────── */

export type GradeInput = {
  materialId: string
  name: string
  version?: string
  sampleEvery: number | null
  qualityParameters: QualityParameter[]
}

export function validateGrade(input: GradeInput, existing: GradeMaster[], editingId?: string): Check {
  if (!clean(input.materialId)) return { ok: false, error: "Select the material this grade belongs to." }
  if (!clean(input.name)) return { ok: false, error: "Enter a grade." }
  if (
    existing.some(
      (g) => g.materialId === input.materialId && key(g.name) === key(input.name) && g.gradeId !== editingId,
    )
  ) {
    return { ok: false, error: `This material already has a grade named ${clean(input.name)}.` }
  }
  if (input.sampleEvery === null || !Number.isInteger(input.sampleEvery) || input.sampleEvery < 0) {
    return { ok: false, error: "Sampling frequency must be a whole number of deliveries, or not required." }
  }

  // Quality parameters — material characteristics. Stock levels never live here.
  const seen = new Set<string>()
  for (const p of input.qualityParameters) {
    const name = clean(p.name)
    if (!name) return { ok: false, error: "Every quality parameter needs a name." }
    if (seen.has(name.toUpperCase())) return { ok: false, error: `Quality parameter ${name} is listed twice.` }
    seen.add(name.toUpperCase())
    if (p.min === null && p.max === null && p.target === null) {
      return { ok: false, error: `Give ${name} a minimum, a maximum or a target.` }
    }
    if (p.min !== null && p.max !== null && p.max < p.min) {
      return { ok: false, error: `${name}: maximum must be greater than or equal to minimum.` }
    }
    if (p.target !== null) {
      if (p.min !== null && p.target < p.min) return { ok: false, error: `${name}: target is below the minimum.` }
      if (p.max !== null && p.target > p.max) return { ok: false, error: `${name}: target is above the maximum.` }
    }
  }
  return { ok: true }
}

/* ── location ────────────────────────────────────────────────────────────── */

export type LocationInput = {
  locationId: string
  name: string
  /** Location Type — the physical kind. */
  kind: string
  /** Inventory / Consumption / Both. */
  usage: string
  capacity: number | null
  latitude: number | null
  longitude: number | null
}

export function validateLocation(input: LocationInput, existing: LocationMaster[], editingId?: string): Check {
  const id = key(input.locationId)
  if (!id) return { ok: false, error: "Enter a Location ID." }
  if (!ID_PATTERN.test(id)) {
    return { ok: false, error: "Location ID may use letters, digits and hyphens (3–32 characters)." }
  }
  if (existing.some((l) => key(l.locationId) === id && l.locationId !== editingId)) {
    return { ok: false, error: `Location ID ${id} already exists.` }
  }
  if (!clean(input.name)) return { ok: false, error: "Enter a location name." }
  if (!LOCATION_KINDS.includes(input.kind as LocationKind)) return { ok: false, error: "Select the location type." }
  if (!LOCATION_USAGES.includes(input.usage as LocationUsage)) {
    return { ok: false, error: "Select whether the location holds inventory, consumes it, or both." }
  }
  if (input.capacity !== null && input.capacity < 0) return { ok: false, error: "Capacity cannot be negative." }
  if (input.capacity !== null && input.usage === "CONSUMPTION") {
    return { ok: false, error: "A consumption-only location holds no stock, so it has no capacity." }
  }
  if ((input.latitude === null) !== (input.longitude === null)) {
    return { ok: false, error: "Enter both latitude and longitude, or neither." }
  }
  if (input.latitude !== null && (input.latitude < -90 || input.latitude > 90)) {
    return { ok: false, error: "Latitude must be between −90 and 90." }
  }
  if (input.longitude !== null && (input.longitude < -180 || input.longitude > 180)) {
    return { ok: false, error: "Longitude must be between −180 and 180." }
  }
  return { ok: true }
}

/**
 * Whether a location's usage may change: a location that still holds active
 * inventory cannot become consumption-only.
 */
export function validateUsageChange(heldRecords: number, usage: string): Check {
  if (heldRecords > 0 && usage === "CONSUMPTION") {
    return {
      ok: false,
      error: `This location holds ${heldRecords} active inventory ${heldRecords === 1 ? "record" : "records"}. Archive them before making it consumption-only.`,
    }
  }
  return { ok: true }
}

/** Whether a master can be deactivated: nothing active may still depend on it. */
export function validateDeactivate(inUse: number, what: string): Check {
  if (inUse > 0) {
    return {
      ok: false,
      error: `${what} is used by ${inUse} active inventory ${inUse === 1 ? "record" : "records"}. Archive those first — nothing is deleted.`,
    }
  }
  return { ok: true }
}

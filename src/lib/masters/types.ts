/**
 * Master data: Locations, and Materials + Grades.
 *
 * Master defines WHAT EXISTS. It carries no stock figures: how much the plant
 * holds, and the minimum / target / maximum for it, belong to the inventory
 * record that maps a Material + Grade to a Location (lib/inventory/model.ts).
 *
 *   Material   code, name, category, UOM — maintained once
 *     └ Grade  grade-specific parameters, version, status, sampling frequency
 *
 *   Location   where material is held and/or consumed
 */

export type MaterialGroup = "Raw Material" | "Fuel" | "Additive" | "Intermediate" | "Finished Product" | "Spare"

export const MATERIAL_GROUPS: MaterialGroup[] = [
  "Raw Material",
  "Fuel",
  "Additive",
  "Intermediate",
  "Finished Product",
  "Spare",
]

export type MaterialMaster = {
  /** Internal identity. Derived from the code at registration; never shown as a field to fill. */
  materialId: string
  /** Material code as shown to users, e.g. RM-LS. */
  code: string
  name: string
  uom: string
  /** Category — optional. Spares are costed to an asset when consumed. */
  group?: MaterialGroup
  description?: string
  /** Expiry is tracked only for materials where it applies. */
  expiryApplicable: boolean
  /**
   * Lot / batch tracking. Where on, each accepted delivery is given an internal
   * lot reference that its transactions carry. Where off, no lot is asked for
   * or created — traceability runs on PO, Gate Entry, GRN and Incoming ID.
   */
  lotTracking: boolean
  /** Maintenance: a spare the plant must not run out of. Only meaningful for spares. */
  criticalSpare?: boolean
  /** Standard cost per UOM. Valuation and material cost are shown only where this is set. */
  unitCost?: number
  active: boolean
}

/**
 * One grade-specific parameter — a characteristic the plant tests. Parameters
 * are added by the user; nothing is hard-coded to C, Mn, S, P, Si or Al.
 */
export type QualityParameter = {
  parameterId: string
  name: string
  unit?: string
  min: number | null
  max: number | null
  target: number | null
}

export type GradeMaster = {
  gradeId: string
  materialId: string
  name: string
  /** Revision of the grade specification, e.g. "1.0". Optional. */
  version?: string
  /** Grade-specific parameters. */
  qualityParameters: QualityParameter[]
  /**
   * Sampling frequency for incoming deliveries of this grade:
   *   0  no sample required
   *   1  every delivery
   *   N  every Nth delivery
   */
  sampleEvery: number
  /** Status: an inactive grade takes no new inventory or deliveries. */
  active: boolean
}

/** What a location is used for. Stock is held at INVENTORY and BOTH; used at CONSUMPTION and BOTH. */
export type LocationUsage = "INVENTORY" | "CONSUMPTION" | "BOTH"

export const LOCATION_USAGES: LocationUsage[] = ["INVENTORY", "CONSUMPTION", "BOTH"]

export const LOCATION_USAGE_LABEL: Record<LocationUsage, string> = {
  INVENTORY: "Inventory Location",
  CONSUMPTION: "Consumption Location",
  BOTH: "Both",
}

/** The physical type of place. For grouping and display — usage decides what a location may do. */
export type LocationKind =
  | "PILE"
  | "SILO"
  | "WAREHOUSE"
  | "STORE"
  | "PRODUCTION_AREA"
  | "MAINTENANCE_AREA"
  | "OTHER"

export const LOCATION_KINDS: LocationKind[] = [
  "PILE",
  "SILO",
  "WAREHOUSE",
  "STORE",
  "PRODUCTION_AREA",
  "MAINTENANCE_AREA",
  "OTHER",
]

export const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  PILE: "Pile",
  SILO: "Silo",
  WAREHOUSE: "Warehouse",
  STORE: "Store",
  PRODUCTION_AREA: "Production Area",
  MAINTENANCE_AREA: "Maintenance Area",
  OTHER: "Other",
}

export type LocationMaster = {
  locationId: string
  name: string
  /** Location Type — the physical kind of place. */
  kind: LocationKind
  /** Whether stock is held here, used here, or both. */
  usage: LocationUsage
  description?: string
  /** Holding capacity, where the plant has one. Drives location utilisation. Never invented. */
  capacity?: number
  uom?: string
  /** Approximate position; the Digital Twin can place the location with it. */
  latitude?: number
  longitude?: number
  active: boolean
}

/** Stock can be held here. */
export function holdsStock(l: Pick<LocationMaster, "usage">): boolean {
  return l.usage === "INVENTORY" || l.usage === "BOTH"
}

/** Material can be consumed here. */
export function consumesStock(l: Pick<LocationMaster, "usage">): boolean {
  return l.usage === "CONSUMPTION" || l.usage === "BOTH"
}

/** A reading taken against one of a grade's parameters. */
export type QualityReading = {
  parameterId: string
  name: string
  unit?: string
  value: number | null
  min: number | null
  max: number | null
  target: number | null
  pass: boolean
}

/** Whether a reading sits inside its parameter's limits. */
export function readingPasses(value: number | null, min: number | null, max: number | null): boolean {
  if (value === null) return false
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

/** Sampling frequency in words. */
export function samplingLabel(sampleEvery: number): string {
  if (sampleEvery <= 0) return "No sample required"
  if (sampleEvery === 1) return "Every delivery"
  return `Every ${sampleEvery}${ordinal(sampleEvery)} delivery`
}

function ordinal(n: number): string {
  const t = n % 100
  if (t >= 11 && t <= 13) return "th"
  return ["th", "st", "nd", "rd"][n % 10] ?? "th"
}

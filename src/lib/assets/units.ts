/**
 * Plant units shown on the Digital Twin, in process order.
 *
 * These are Berrima's units — Boral names one kiln (No. 6) and two cement mills
 * (6 and 7), and those are what appear here.
 *
 * Warning / critical counts and maintenance cost are DEMO VALUES. Boral has
 * supplied no maintenance data; the header note says so, and every figure is
 * flagged `provenance: "DEMO"` so it cannot be read as plant data.
 */

import type { LatLng } from "@/lib/map/projection"

export type UnitKind =
  | "CRUSHER"
  | "MILL"
  | "TOWER"
  | "KILN"
  | "COOLER"
  | "SILO_GROUP"
  | "PACKING"
  | "UTILITY"

export type PlantUnit = {
  no: string
  tag: string
  name: string
  kind: UnitKind
  position: LatLng
  /** Anchor for the callout: which side of the plant its card sits on. */
  side: "left" | "right"
  /** Vertical slot 0..1 down the frame, used to lay cards out without overlap. */
  slot: number
  warnings: number
  criticals: number
  /** Month-to-date maintenance cost, in lakhs. Demo value. */
  maintenanceLakhs: number
  /** Units without condition monitoring show cost only, as on the reference. */
  costOnly?: boolean
}

export const PLANT_UNITS: PlantUnit[] = [
  {
    no: "01", tag: "CR-01", name: "Shale Crusher", kind: "CRUSHER",
    position: { lat: -34.509651, lng: 150.334403 },
    side: "left", slot: 0.06, warnings: 0, criticals: 0, maintenanceLakhs: 2.54,
  },
  {
    no: "02", tag: "RM-01", name: "Raw Mill", kind: "MILL",
    position: { lat: -34.510535, lng: 150.335798 },
    side: "left", slot: 0.3, warnings: 14, criticals: 0, maintenanceLakhs: 2.07,
  },
  {
    no: "03", tag: "PH-01", name: "Preheater Tower", kind: "TOWER",
    position: { lat: -34.510800, lng: 150.337515 },
    side: "right", slot: 0.04, warnings: 0, criticals: 0, maintenanceLakhs: 1.32,
  },
  {
    no: "04", tag: "KLN-06", name: "Kiln 6", kind: "KILN",
    position: { lat: -34.511196, lng: 150.337010 },
    side: "right", slot: 0.24, warnings: 2, criticals: 0, maintenanceLakhs: 12.95,
  },
  {
    no: "05", tag: "CC-01", name: "Clinker Cooler", kind: "COOLER",
    position: { lat: -34.511110, lng: 150.337783 },
    side: "right", slot: 0.44, warnings: 0, criticals: 0, maintenanceLakhs: 3.97,
  },
  {
    no: "06", tag: "CM-06", name: "Cement Mill 6", kind: "MILL",
    position: { lat: -34.511773, lng: 150.337649 },
    side: "left", slot: 0.54, warnings: 4, criticals: 0, maintenanceLakhs: 0.92,
  },
  {
    no: "07", tag: "CM-07", name: "Cement Mill 7", kind: "MILL",
    position: { lat: -34.511928, lng: 150.338078 },
    side: "left", slot: 0.78, warnings: 3, criticals: 0, maintenanceLakhs: 9.76,
  },
  {
    no: "08", tag: "SL-GRP", name: "Cement Silos", kind: "SILO_GROUP",
    position: { lat: -34.511176, lng: 150.339312 },
    side: "right", slot: 0.64, warnings: 0, criticals: 0, maintenanceLakhs: 0.48,
  },
  {
    no: "09", tag: "PK-01", name: "Packing & Dispatch", kind: "PACKING",
    position: { lat: -34.512259, lng: 150.336549 },
    side: "left", slot: 0.94, warnings: 0, criticals: 0, maintenanceLakhs: 0.02,
    costOnly: true,
  },
  {
    no: "10", tag: "UT-01", name: "Utilities - Pump House", kind: "UTILITY",
    position: { lat: -34.511614, lng: 150.341248 },
    side: "right", slot: 0.86, warnings: 0, criticals: 0, maintenanceLakhs: 1.75,
    costOnly: true,
  },
]

export function totalMaintenanceLakhs(): number {
  return PLANT_UNITS.reduce((s, u) => s + u.maintenanceLakhs, 0)
}

export function totalWarnings(): number {
  return PLANT_UNITS.reduce((s, u) => s + u.warnings, 0)
}

export function totalCriticals(): number {
  return PLANT_UNITS.reduce((s, u) => s + u.criticals, 0)
}

/** Header colour: green when clear, red when anything is raised, slate for
 *  utilities that carry cost only. */
export function unitTone(u: PlantUnit): "ok" | "alert" | "neutral" {
  if (u.costOnly) return "neutral"
  return u.warnings > 0 || u.criticals > 0 ? "alert" : "ok"
}

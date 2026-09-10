/**
 * Plant equipment shown on the twin, with the tag IDs used across the UI.
 *
 * Positions are traced from satellite imagery and are approximate — the footer
 * and the Asset Details panel both say so. Nothing here is survey-verified.
 */

import type { LatLng } from "@/lib/map/projection"

export type EquipmentKind =
  | "CRUSHER"
  | "STACKER"
  | "RECLAIMER"
  | "MILL"
  | "KILN"
  | "COOLER"
  | "SILO"
  | "PACKING"

export type Equipment = {
  tag: string
  name: string
  kind: EquipmentKind
  position: LatLng
  /** Callout offset from the asset, in metres east/north. */
  callout: { east: number; north: number }
  connectedTo?: string
  heightMetres?: number
  footprint?: string
  location: string
  /** Inventory id when the equipment holds stock (the cement silos). */
  inventoryId?: string
}

export const EQUIPMENT: Equipment[] = [
  {
    tag: "CR-01", name: "Primary Crusher", kind: "CRUSHER",
    position: { lat: -34.509651, lng: 150.334403 },
    callout: { east: -120, north: 90 },
    connectedTo: "RM-01", heightMetres: 24, footprint: "26 m x 26 m",
    location: "Raw Material Infeed",
  },
  {
    tag: "ST-01", name: "Stacker", kind: "STACKER",
    position: { lat: -34.508650, lng: 150.331900 },
    callout: { east: 60, north: 95 },
    connectedTo: "CR-01", heightMetres: 18, footprint: "60 m x 12 m",
    location: "North Stockyard",
  },
  {
    tag: "RC-01", name: "Reclaimer", kind: "RECLAIMER",
    position: { lat: -34.511900, lng: 150.331700 },
    callout: { east: 150, north: 30 },
    connectedTo: "RM-01", heightMetres: 16, footprint: "55 m x 12 m",
    location: "South Stockyard",
  },
  {
    tag: "RM-01", name: "Raw Mill", kind: "MILL",
    position: { lat: -34.510535, lng: 150.335798 },
    callout: { east: 40, north: 105 },
    connectedTo: "KLN-01", heightMetres: 30, footprint: "36 m x 30 m",
    location: "Raw Preparation",
  },
  {
    tag: "KLN-01", name: "Kiln", kind: "KILN",
    position: { lat: -34.511196, lng: 150.337010 },
    callout: { east: 95, north: 70 },
    connectedTo: "CC-01", heightMetres: 14, footprint: "86 m long",
    location: "Pyroprocessing",
  },
  {
    tag: "CC-01", name: "Clinker Cooler", kind: "COOLER",
    position: { lat: -34.511110, lng: 150.337783 },
    callout: { east: 60, north: -70 },
    connectedTo: "SL-01", heightMetres: 20, footprint: "28 m x 20 m",
    location: "Pyroprocessing",
  },
  {
    tag: "PK-01", name: "Cement Packing", kind: "PACKING",
    position: { lat: -34.512259, lng: 150.336549 },
    callout: { east: 190, north: 60 },
    connectedTo: "Dispatch", heightMetres: 16, footprint: "46 m x 30 m",
    location: "Packing & Dispatch",
  },
  {
    tag: "SL-01", name: "Cement Silo 1", kind: "SILO",
    position: { lat: -34.511021, lng: 150.339124 },
    callout: { east: -30, north: 120 },
    connectedTo: "PK-01", heightMetres: 42, footprint: "20 m dia",
    location: "Cement Storage", inventoryId: "SL-01",
  },
  {
    tag: "SL-02", name: "Cement Silo 2", kind: "SILO",
    position: { lat: -34.511176, lng: 150.339312 },
    callout: { east: 40, north: 130 },
    connectedTo: "PK-01", heightMetres: 42, footprint: "20 m dia",
    location: "Cement Storage", inventoryId: "SL-02",
  },
  {
    tag: "SL-03", name: "Cement Silo 3", kind: "SILO",
    position: { lat: -34.511331, lng: 150.339499 },
    callout: { east: 110, north: 140 },
    connectedTo: "PK-01", heightMetres: 42, footprint: "20 m dia",
    location: "Cement Storage", inventoryId: "SL-03",
  },
]

export function getEquipment(tag: string | null): Equipment | undefined {
  if (!tag) return undefined
  return EQUIPMENT.find((e) => e.tag === tag)
}

const S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'

/** Glyph per equipment kind, used on map callouts and in the flow strip. */
export const EQUIPMENT_ICON: Record<EquipmentKind, string> = {
  CRUSHER: `<g ${S}><path d="M4 4h16l-5 8v5l-6 4v-9z"/><path d="M9 12h6"/></g>`,
  STACKER: `<g ${S}><path d="M12 3 4 19h16z"/><path d="M12 3v16"/></g>`,
  RECLAIMER: `<g ${S}><path d="M3 18h18"/><path d="M6 18V9l10-3"/><circle cx="6" cy="20" r="1.6"/><path d="M16 6v6"/></g>`,
  MILL: `<g ${S}><rect x="4" y="7" width="13" height="10" rx="2"/><path d="M8 7v10"/><path d="M13 7v10"/><circle cx="20" cy="12" r="1.8"/></g>`,
  KILN: `<g ${S}><path d="M4 14 19 9"/><path d="M4.6 16.4 19.6 11.4"/><path d="M4 14l.6 2.4M19 9l.6 2.4"/><path d="M8 17v3M16 14v3"/></g>`,
  COOLER: `<g ${S}><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></g>`,
  SILO: `<g ${S}><path d="M7 9h10v11H7z"/><path d="M7 9l5-5 5 5"/><path d="M10 20v1h4v-1"/></g>`,
  PACKING: `<g ${S}><path d="M2 16V7h11v9"/><path d="M13 10h4l4 3.5V16"/><circle cx="7" cy="18" r="1.9"/><circle cx="17" cy="18" r="1.9"/></g>`,
}

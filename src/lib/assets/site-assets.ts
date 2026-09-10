/**
 * Satellite-view annotations: plant equipment and conveyor routes.
 *
 * Positions are read from licensed satellite imagery and are approximate — the
 * note on the map says so, and nothing here is survey-verified. Tag IDs are
 * application configuration, not a Boral equipment register.
 */

import type { LatLng } from "@/lib/map/projection"

export type AssetKind =
  | "PILE"
  | "CRUSHER"
  | "CONVEYOR"
  | "STACKER"
  | "RAW_MILL"
  | "KILN"
  | "COOLER"
  | "SILO"
  | "PACKING"
  | "BUILDING"

/** Legend colours, in the order the Asset Type panel lists them. */
export const KIND_META: Record<AssetKind, { label: string; colour: string }> = {
  PILE: { label: "Raw Material Pile", colour: "#eab308" },
  CRUSHER: { label: "Crusher", colour: "#2b7fff" },
  CONVEYOR: { label: "Conveyor", colour: "#38bdf8" },
  STACKER: { label: "Stacker / Reclaimer", colour: "#f43f5e" },
  RAW_MILL: { label: "Raw Mill", colour: "#22c55e" },
  KILN: { label: "Kiln", colour: "#f97316" },
  COOLER: { label: "Clinker Cooler", colour: "#a855f7" },
  SILO: { label: "Cement Silo", colour: "#a855f7" },
  PACKING: { label: "Packing / Dispatch", colour: "#22c55e" },
  BUILDING: { label: "Building / Other", colour: "#94a3b8" },
}

export const LEGEND_ORDER: AssetKind[] = [
  "PILE",
  "CRUSHER",
  "CONVEYOR",
  "STACKER",
  "RAW_MILL",
  "KILN",
  "COOLER",
  "SILO",
  "PACKING",
  "BUILDING",
]

export type SiteAsset = {
  id: string
  /** Card heading. */
  title: string
  /** Tag line under the heading, e.g. "CR-01". */
  tag: string
  kind: AssetKind
  position: LatLng
  /** Where the card sits relative to the marker, in metres east/north. */
  callout: { east: number; north: number }
  icon: SiteIcon
}

export type SiteIcon =
  | "crusher"
  | "conveyor"
  | "stacker"
  | "mill"
  | "kiln"
  | "cooler"
  | "silo"
  | "packing"
  | "truck"

const S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'

export const SITE_ICONS: Record<SiteIcon, string> = {
  crusher: `<g ${S}><circle cx="9" cy="9" r="3"/><circle cx="16" cy="15.5" r="3.4"/><path d="M9 3.8v1.2M9 13v1.2M3.8 9H5M13 9h1.2"/></g>`,
  conveyor: `<g ${S}><path d="M4 16 18 8"/><circle cx="4" cy="16.5" r="1.6"/><circle cx="18.5" cy="7.6" r="1.6"/><path d="M8 18v2M15 13v7"/></g>`,
  stacker: `<g ${S}><path d="M3 19h18"/><path d="M6 19V9l11-4"/><path d="M17 5v7"/><circle cx="6" cy="20.4" r="1.2"/></g>`,
  mill: `<g ${S}><rect x="4" y="8" width="12" height="9" rx="2"/><path d="M8 8v9M12 8v9"/><circle cx="19" cy="12.5" r="1.7"/></g>`,
  kiln: `<g ${S}><path d="M12 3c1.5 3-1 4.5-1 6.5A3 3 0 0 0 14 12c1.5-1 2-3 1-5 2.5 1.5 4 4 4 6.5a7 7 0 1 1-14 0C5 9 8.5 5.5 12 3z"/></g>`,
  cooler: `<g ${S}><circle cx="12" cy="12" r="2.6"/><path d="M12 3.4v6M12 14.6v6M3.4 12h6M14.6 12h6"/></g>`,
  silo: `<g ${S}><path d="M7 9h10v11H7z"/><path d="M7 9l5-5 5 5"/><path d="M10 20v1h4v-1"/></g>`,
  packing: `<g ${S}><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M4 10h16M10 15h4"/></g>`,
  truck: `<g ${S}><path d="M2 16V7h11v9"/><path d="M13 10h4l4 3.5V16"/><circle cx="7" cy="18" r="1.9"/><circle cx="17" cy="18" r="1.9"/></g>`,
}

/** Plant equipment annotated on the satellite view. */
export const SITE_ASSETS: SiteAsset[] = [
  {
    id: "CR-01", title: "Primary Crusher", tag: "CR-01", kind: "CRUSHER", icon: "crusher",
    position: { lat: -34.509651, lng: 150.334403 },
    callout: { east: -110, north: 150 },
  },
  {
    id: "ST-01", title: "Stacker / Reclaimer", tag: "ST-01 / RC-01", kind: "STACKER", icon: "stacker",
    position: { lat: -34.512480, lng: 150.331500 },
    callout: { east: 300, north: -30 },
  },
  {
    id: "RM-01", title: "Raw Mill", tag: "RM-01", kind: "RAW_MILL", icon: "mill",
    position: { lat: -34.510535, lng: 150.335798 },
    callout: { east: -60, north: 215 },
  },
  {
    id: "KILN-01", title: "Kiln", tag: "KILN-01", kind: "KILN", icon: "kiln",
    position: { lat: -34.511196, lng: 150.337010 },
    callout: { east: 205, north: 120 },
  },
  {
    id: "CC-01", title: "Clinker Cooler", tag: "CC-01", kind: "COOLER", icon: "cooler",
    position: { lat: -34.511110, lng: 150.337783 },
    callout: { east: 60, north: -190 },
  },
  {
    id: "PK-01", title: "Cement Packing", tag: "PK-01", kind: "PACKING", icon: "packing",
    position: { lat: -34.511900, lng: 150.339900 },
    callout: { east: 250, north: 40 },
  },
  {
    id: "DS-01", title: "Dispatch / Loadout", tag: "DS-01", kind: "PACKING", icon: "truck",
    position: { lat: -34.512450, lng: 150.340350 },
    callout: { east: 250, north: -110 },
  },
]

/** The three cement silos, annotated as one grouped card. */
export const SILO_GROUP = {
  id: "SL-GRP",
  kind: "SILO" as const,
  position: { lat: -34.511176, lng: 150.339312 },
  callout: { east: 40, north: 330 },
  silos: [
    { id: "SL-01", name: "Cement Silo 1", position: { lat: -34.511021, lng: 150.339124 } },
    { id: "SL-02", name: "Cement Silo 2", position: { lat: -34.511176, lng: 150.339312 } },
    { id: "SL-03", name: "Cement Silo 3", position: { lat: -34.511331, lng: 150.339499 } },
  ],
}

export type ConveyorRun = {
  id: string
  points: LatLng[]
  /** Where the small CV card sits along the run, 0..1. */
  labelAt: number
  callout: { east: number; north: number }
}

/**
 * Conveyor routes. Traced along the visible galleries in imagery where one is
 * apparent, and otherwise drawn as the direct run between the units they join —
 * indicative, not surveyed centrelines.
 */
export const CONVEYORS: ConveyorRun[] = [
  {
    id: "CV-01",
    labelAt: 0.5,
    callout: { east: -30, north: -105 },
    points: [
      { lat: -34.507570, lng: 150.327900 },
      { lat: -34.508500, lng: 150.330600 },
      { lat: -34.509651, lng: 150.334403 },
    ],
  },
  {
    id: "CV-02",
    labelAt: 0.5,
    callout: { east: -150, north: -95 },
    points: [
      { lat: -34.510850, lng: 150.330050 },
      { lat: -34.510200, lng: 150.332600 },
      { lat: -34.509651, lng: 150.334403 },
    ],
  },
  {
    id: "CV-03",
    labelAt: 0.45,
    callout: { east: 80, north: 120 },
    points: [
      { lat: -34.508050, lng: 150.331700 },
      { lat: -34.509300, lng: 150.334900 },
      { lat: -34.510535, lng: 150.335798 },
    ],
  },
  {
    id: "CV-04",
    labelAt: 0.55,
    callout: { east: 20, north: -120 },
    points: [
      { lat: -34.511110, lng: 150.337783 },
      { lat: -34.511100, lng: 150.338700 },
      { lat: -34.511176, lng: 150.339312 },
    ],
  },
  {
    id: "CV-05",
    labelAt: 0.5,
    callout: { east: 165, north: -35 },
    points: [
      { lat: -34.511331, lng: 150.339499 },
      { lat: -34.511900, lng: 150.339900 },
      { lat: -34.512450, lng: 150.340350 },
    ],
  },
]

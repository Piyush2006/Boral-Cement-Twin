/**
 * Asset-class colours and icon glyphs, shared by the Plant Flow diagram and the
 * satellite markers. Asset POSITIONS live in one place only: plant-assets.ts.
 */

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

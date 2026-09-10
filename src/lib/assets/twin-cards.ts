/**
 * Digital Twin callout cards.
 *
 * Card set, metrics and layout for the twin view. Berrima runs one kiln (No. 6)
 * and Boral operates Geocycle co-processing, so the alternate-fuel facility
 * appears alongside the process line.
 *
 * PROCESS METRICS ARE DEMO VALUES — throughput, power, temperatures, fan speed
 * and intake are not supplied by Boral. They move on the live feed to show the
 * twin running; the legend and footer both say the data is simulated.
 */

import type { LatLng } from "@/lib/map/projection"

export type Health = "NORMAL" | "WARNING" | "CRITICAL" | "OFFLINE"

export type CardRow = {
  label: string
  value: string
  /** Optional status dot at the end of the row. */
  dot?: Health
  /** Highlight the value in the status colour (used for Status rows). */
  tone?: Health
}

export type SiloTile = { name: string; qty: number; dot?: Health }

export type TwinCard = {
  id: string
  /** Marker number, shown on the card and on the unit in the scene. */
  no: string
  title: string
  /** Parenthesised qualifier under the title, e.g. "(Limestone)". */
  subtitle?: string
  /** Equipment tag shown under the title, e.g. CR-01. */
  tag?: string
  icon: IconKey
  position: LatLng
  side: "left" | "right"
  slot: number
  /** Preferred offset of the card from its anchor, in screen pixels. */
  offset: [number, number]
  health: Health
  rows: CardRow[]
  silos?: SiloTile[]
  /** Large figure shown in the header, used by the pile cards. */
  headline?: string
  /** Height in metres to aim the leader line at. */
  lift: number
}

export type IconKey =
  | "pile"
  | "crusher"
  | "mill"
  | "kiln"
  | "cooler"
  | "silo"
  | "packing"
  | "utility"
  | "admin"
  | "geocycle"

const S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'

export const ICONS: Record<IconKey, string> = {
  pile: `<g ${S}><path d="M12 4 3 20h18z"/><path d="M12 4 8.5 20"/></g>`,
  crusher: `<g ${S}><circle cx="9" cy="9" r="3.2"/><circle cx="16" cy="15" r="3.6"/><path d="M9 3.6v1.2M9 13.2v1.2M3.6 9h1.2M13.2 9h1.2"/></g>`,
  mill: `<g ${S}><rect x="4" y="8" width="12" height="9" rx="2"/><path d="M8 8v9M12 8v9"/><circle cx="19" cy="12.5" r="1.8"/></g>`,
  kiln: `<g ${S}><path d="M12 3c1.5 3-1 4.5-1 6.5A3 3 0 0 0 14 12c1.5-1 2-3 1-5 2.5 1.5 4 4 4 6.5a7 7 0 1 1-14 0C5 9 8.5 5.5 12 3z"/></g>`,
  cooler: `<g ${S}><circle cx="12" cy="12" r="2.6"/><path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6"/></g>`,
  silo: `<g ${S}><path d="M7 9h10v11H7z"/><path d="M7 9l5-5 5 5"/><path d="M10 20v1h4v-1"/></g>`,
  packing: `<g ${S}><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M4 10h16"/><path d="M10 15h4"/></g>`,
  utility: `<g ${S}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2 5.4 5.4"/></g>`,
  admin: `<g ${S}><path d="M4 21V6l8-3 8 3v15z"/><path d="M9 21v-5h6v5"/><path d="M8 10h2M14 10h2"/></g>`,
  geocycle: `<g ${S}><path d="M3 21V10l5-3v3l5-3v3l5-3v14z"/><path d="M7 17v-3M12 17v-3M17 17v-3"/></g>`,
}

export const HEALTH_COLOUR: Record<Health, string> = {
  NORMAL: "#22c55e",
  WARNING: "#f5b301",
  CRITICAL: "#ef4444",
  OFFLINE: "#94a3b8",
}

export const HEALTH_LABEL: Record<Health, string> = {
  NORMAL: "Normal",
  WARNING: "Warning",
  CRITICAL: "Critical",
  OFFLINE: "Offline",
}

export const TWIN_CARDS: TwinCard[] = [
  {
    id: "PILE-RM-01", no: "01", title: "Raw Material Pile 1", subtitle: "(Limestone)", icon: "pile",
    position: { lat: -34.507570, lng: 150.327900 },
    side: "left", slot: 0.0, offset: [-150, -120], health: "WARNING", lift: 26,
    rows: [
      { label: "Qty", value: "18,450 MT", dot: "WARNING" },
      { label: "Warning", value: "14", dot: "CRITICAL" },
    ],
  },
  {
    id: "PILE-RM-02", no: "02", title: "Raw Material Pile 2", subtitle: "(Clay / Shale)", icon: "pile",
    position: { lat: -34.507760, lng: 150.329560 },
    side: "left", slot: 0.0, offset: [-40, -150], health: "NORMAL", lift: 24,
    rows: [
      { label: "Qty", value: "7,860 MT", dot: "WARNING" },
      { label: "Critical", value: "0", dot: "CRITICAL" },
    ],
  },
  {
    id: "CR-01", no: "06", title: "Primary Crusher", tag: "CR-01", icon: "crusher",
    position: { lat: -34.509651, lng: 150.334403 },
    side: "left", slot: 0.16, offset: [-70, -120], health: "NORMAL", lift: 42,
    rows: [
      { label: "Status", value: "Running", tone: "NORMAL" },
      { label: "Throughput", value: "429 TPH" },
    ],
  },
  {
    id: "PILE-COAL", no: "04", title: "Coal Pile", icon: "pile", headline: "5,670 MT",
    position: { lat: -34.512500, lng: 150.338250 },
    side: "left", slot: 0.33, offset: [-190, -60], health: "WARNING", lift: 24,
    rows: [
      { label: "Warning", value: "2", dot: "WARNING" },
      { label: "Critical", value: "0", dot: "CRITICAL" },
    ],
  },
  {
    id: "PILE-AF", no: "03", title: "Alternate Fuel (AF) Pile", icon: "pile", headline: "3,280 MT",
    position: { lat: -34.510850, lng: 150.330050 },
    side: "left", slot: 0.58, offset: [-170, 30], health: "NORMAL", lift: 24,
    rows: [
      { label: "Warning", value: "0", dot: "WARNING" },
      { label: "Critical", value: "0", dot: "CRITICAL" },
    ],
  },
  {
    id: "PILE-RM-07", no: "05", title: "Raw Mix / Blended Pile", icon: "pile", headline: "22,940 MT",
    position: { lat: -34.512700, lng: 150.331200 },
    side: "left", slot: 0.76, offset: [-60, 90], health: "WARNING", lift: 26,
    rows: [
      { label: "Warning", value: "3", dot: "WARNING" },
      { label: "Critical", value: "0", dot: "CRITICAL" },
    ],
  },
  {
    id: "RM-01", no: "07", title: "Raw Mill", tag: "RM-01", icon: "mill",
    position: { lat: -34.510535, lng: 150.335798 },
    side: "left", slot: 0.24, offset: [-30, -110], health: "NORMAL", lift: 32,
    rows: [
      { label: "Status", value: "Running", tone: "NORMAL" },
      { label: "Power", value: "4.2 MW" },
    ],
  },
  {
    id: "GEO-01", no: "08", title: "Geocycle Co-processing", subtitle: "Facility (AF & Waste)", icon: "geocycle",
    position: { lat: -34.509900, lng: 150.336900 },
    side: "right", slot: 0.0, offset: [10, -170], health: "NORMAL", lift: 40,
    rows: [
      { label: "Status", value: "Operational", tone: "NORMAL" },
      { label: "Daily Intake", value: "350 MT" },
      { label: "Primary AF type", value: "Solid Recovered Fuel" },
    ],
  },
  {
    id: "SL-GRP", no: "11", title: "Cement Silos", icon: "silo",
    position: { lat: -34.511176, lng: 150.339312 },
    side: "right", slot: 0.02, offset: [-60, -160], health: "NORMAL", lift: 82,
    rows: [],
    silos: [
      { name: "Silo 1", qty: 5120 },
      { name: "Silo 2", qty: 4980, dot: "WARNING" },
      { name: "Silo 3", qty: 6230 },
    ],
  },
  {
    id: "KLN-01", no: "09", title: "Kiln", tag: "KLN-01", icon: "kiln",
    position: { lat: -34.511196, lng: 150.337010 },
    side: "right", slot: 0.26, offset: [60, -140], health: "WARNING", lift: 38,
    rows: [
      { label: "Status", value: "Running", tone: "NORMAL", dot: "WARNING" },
      { label: "Feed", value: "410 TPH" },
      { label: "Clinker", value: "395 TPH" },
      { label: "Kiln ID Fan Speed", value: "92%" },
    ],
  },
  {
    id: "PK-01", no: "12", title: "Cement Packing", tag: "PK-01", icon: "packing",
    position: { lat: -34.512259, lng: 150.336549 },
    side: "right", slot: 0.26, offset: [170, -70], health: "NORMAL", lift: 30,
    rows: [
      { label: "Status", value: "Running", tone: "NORMAL" },
      { label: "Rate", value: "220 TPH" },
    ],
  },
  {
    id: "UT-01", no: "13", title: "Utilities", subtitle: "(Compressor & Power)", icon: "utility",
    position: { lat: -34.511614, lng: 150.341248 },
    side: "right", slot: 0.5, offset: [150, -60], health: "NORMAL", lift: 26,
    rows: [
      { label: "Status", value: "Running", tone: "NORMAL" },
      { label: "Power", value: "2.1 MW" },
      { label: "Grid Contribution", value: "1.1 MW", dot: "NORMAL" },
    ],
  },
  {
    id: "CC-01", no: "10", title: "Clinker Cooler", tag: "CC-01", icon: "cooler",
    position: { lat: -34.511110, lng: 150.337783 },
    side: "right", slot: 0.63, offset: [60, 60], health: "NORMAL", lift: 44,
    rows: [
      { label: "Status", value: "Running", tone: "NORMAL" },
      { label: "Air Flow", value: "280,000 m³/h" },
      { label: "Outlet Temp", value: "120 °C" },
    ],
  },
  {
    id: "BYPASS-DUST", no: "15", title: "Kiln By-pass Dust Pile", icon: "pile",
    position: { lat: -34.512100, lng: 150.338900 },
    side: "right", slot: 0.84, offset: [30, 90], health: "WARNING", lift: 20,
    rows: [
      { label: "Status", value: "", dot: "WARNING" },
      { label: "Qty", value: "120 MT", dot: "WARNING" },
    ],
  },
  {
    id: "ADMIN-01", no: "14", title: "Admin & Labs", icon: "admin",
    position: { lat: -34.507140, lng: 150.338566 },
    side: "right", slot: 0.86, offset: [110, 20], health: "NORMAL", lift: 22,
    rows: [{ label: "Status", value: "Operational", tone: "NORMAL" }],
  },
]

/** Live metric drift, so the twin visibly runs. Demo values only. */
export const DRIFTING: Record<string, { row: number; base: number; unit: string; dp?: number }> = {
  "CR-01": { row: 1, base: 429, unit: " TPH" },
  "RM-01": { row: 1, base: 4.2, unit: " MW", dp: 1 },
  "KLN-01": { row: 1, base: 410, unit: " TPH" },
  "PK-01": { row: 1, base: 220, unit: " TPH" },
  "CC-01": { row: 2, base: 120, unit: " °C" },
  "GEO-01": { row: 1, base: 350, unit: " MT" },
  "UT-01": { row: 1, base: 2.1, unit: " MW", dp: 1 },
}

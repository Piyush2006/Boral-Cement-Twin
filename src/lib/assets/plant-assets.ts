/**
 * The plant asset model — one dataset for every view.
 *
 * Spatial identity only: where an asset is, what it is, how it connects in the
 * process, and which inventory location (if any) holds its stock. Operational
 * and inventory values are NOT stored here; they are read from their own
 * sources by ID, so the map never keeps a second inventory balance.
 *
 * Every position is read from licensed satellite imagery and is APPROXIMATE.
 * None is survey-verified, and nothing here claims otherwise. IDs are
 * application identifiers, not a Boral equipment register.
 */

import type { LatLng } from "@/lib/map/projection"
import { PILES } from "./piles"
import { materialColour } from "./materials"
import { SITE_ICONS, type SiteIcon } from "./site-assets"

export type PlantAssetType =
  | "pile"
  | "crusher"
  | "stacker"
  | "mill"
  | "cement_mill"
  | "kiln"
  | "cooler"
  | "silo"
  | "packaging"
  | "dispatch"
  | "conveyor"
  | "utility"

/** The groups the map filters by. */
export type AssetGroup = "machines" | "piles" | "storage" | "conveyors" | "utilities"

export const GROUP_LABEL: Record<AssetGroup, string> = {
  machines: "Machines",
  piles: "Piles",
  storage: "Storage",
  conveyors: "Conveyors",
  utilities: "Utilities",
}

export const GROUP_ORDER: AssetGroup[] = ["machines", "piles", "storage", "conveyors", "utilities"]

/**
 * The groups that hold stock. The Satellite view shows inventory only, so it
 * draws these and nothing else; the 3D view still shows the whole plant.
 */
export const INVENTORY_GROUPS: AssetGroup[] = ["piles", "storage"]

export type MarkerShape = "circle" | "square" | "diamond" | "hexagon"

export type PlantIcon = SiteIcon | "pile" | "cement" | "utility"

export const PLANT_ICONS: Record<PlantIcon, string> = {
  ...SITE_ICONS,
  pile: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"/><path d="M5 18c1.5-4.5 3.5-8 7-8s5.5 3.5 7 8"/><path d="M9 11.5 11 8l2 2 1.5-1.5"/></g>`,
  cement: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="14" height="9" rx="4.5"/><path d="M7 8v9M13 8v9"/><path d="M17 12.5h4"/></g>`,
  utility: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/></g>`,
}

export const TYPE_META: Record<
  PlantAssetType,
  { label: string; colour: string; icon: PlantIcon; shape: MarkerShape; group: AssetGroup }
> = {
  pile: { label: "Raw Material Pile", colour: "#eab308", icon: "pile", shape: "circle", group: "piles" },
  crusher: { label: "Crusher", colour: "#fb923c", icon: "crusher", shape: "diamond", group: "machines" },
  stacker: { label: "Stacker / Reclaimer", colour: "#f472b6", icon: "stacker", shape: "diamond", group: "machines" },
  mill: { label: "Raw Mill", colour: "#4ade80", icon: "mill", shape: "square", group: "machines" },
  cement_mill: { label: "Cement Mill", colour: "#22d3ee", icon: "cement", shape: "square", group: "machines" },
  kiln: { label: "Kiln", colour: "#f87171", icon: "kiln", shape: "hexagon", group: "machines" },
  cooler: { label: "Cooler", colour: "#c084fc", icon: "cooler", shape: "circle", group: "machines" },
  silo: { label: "Silos / Storage", colour: "#818cf8", icon: "silo", shape: "circle", group: "storage" },
  packaging: { label: "Packaging Plant", colour: "#2dd4bf", icon: "packing", shape: "square", group: "machines" },
  dispatch: { label: "Dispatch / Loadout", colour: "#5eead4", icon: "truck", shape: "square", group: "machines" },
  conveyor: { label: "Conveyor", colour: "#38bdf8", icon: "conveyor", shape: "square", group: "conveyors" },
  utility: { label: "Utilities", colour: "#cbd5e1", icon: "utility", shape: "diamond", group: "utilities" },
}

/** Legend order for the plant-asset key. */
export const TYPE_LEGEND: PlantAssetType[] = [
  "crusher",
  "stacker",
  "mill",
  "kiln",
  "cooler",
  "cement_mill",
  "silo",
  "packaging",
  "dispatch",
  "conveyor",
  "utility",
]

/**
 * 1 — always labelled; 2 — labelled from plant overview; 3 — only when zoomed
 * in. Lower numbers also win when labels compete for space.
 */
export type Priority = 1 | 2 | 3

export type PlantAsset = {
  id: string
  name: string
  type: PlantAssetType
  latitude: number
  longitude: number
  positionAccuracy: "approximate" | "verified"
  /** Where the position came from, in words. */
  positionSource: string
  priority: Priority
  /**
   * Zoom DEPTH — levels in from the plant overview, whatever the screen size —
   * at which the marker appears / disappears. Used to split the silo group
   * into individual silos when zoomed in.
   */
  showFrom?: number
  hideFrom?: number
  /** Inventory location holding this asset's stock — the key into Inventory. */
  inventoryLocationId?: string
  /** Inventory identifier shown on the card, e.g. RM-LS-001. */
  inventoryId?: string
  materialId?: string
  /** Members of a grouped asset, e.g. the three silos. */
  members?: string[]
  /** Route for linear assets. */
  path?: LatLng[]
  /** Pile area outline. */
  outline?: LatLng[]
  /** Downstream assets in the process, where the relationship is supported. */
  connections?: string[]
  /** Configured for the demo rather than identified on site. */
  demoObject?: boolean
}

const FROM_IMAGERY = "Read from satellite imagery"

const pileAssets: PlantAsset[] = PILES.map((p) => ({
  id: p.pileId,
  name: `${p.pileId}`,
  type: "pile",
  latitude: p.centre.lat,
  longitude: p.centre.lng,
  positionAccuracy: "approximate",
  positionSource: FROM_IMAGERY,
  priority: 2,
  inventoryLocationId: p.pileId,
  inventoryId: p.id,
  materialId: p.materialId,
  outline: p.outline,
}))

/**
 * Process connections. Only relationships the plant model supports: raw
 * materials and correctives to the crusher / raw mill, raw meal and coal to
 * the kiln, clinker through the cooler and cement mill (with gypsum) to the
 * silos, then packing and dispatch. Proximity on the imagery is never a reason
 * for a connection.
 */
const CONNECTIONS: Record<string, string[]> = {
  "PILE-RM-01": ["CR-01"],
  "PILE-RM-02": ["CR-01"],
  "PILE-RM-03": ["RM-01"],
  "PILE-RM-04": ["CEM-01"],
  "PILE-RM-05": ["KLN-01"],
  "PILE-RM-07": ["RM-01"],
  "CR-01": ["RM-01"],
  "RM-01": ["KLN-01"],
  "KLN-01": ["CC-01"],
  "CC-01": ["CEM-01"],
  "CEM-01": ["SL-GRP"],
  "SL-GRP": ["PK-01"],
  "PK-01": ["DS-01"],
}

const equipment: PlantAsset[] = [
  {
    id: "CR-01", name: "Primary Crusher", type: "crusher", priority: 1,
    latitude: -34.509651, longitude: 150.334403,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
  {
    id: "RM-01", name: "Raw Mill", type: "mill", priority: 1,
    latitude: -34.510535, longitude: 150.335798,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
  {
    // On the rotary tube, the one kiln Boral operates at Berrima (No. 6).
    id: "KLN-01", name: "Kiln", type: "kiln", priority: 1,
    latitude: -34.51122, longitude: 150.337139,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
  {
    id: "CC-01", name: "Clinker Cooler", type: "cooler", priority: 2,
    latitude: -34.51138, longitude: 150.33782,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
  {
    // Placed as on the client's annotated site image; not identified on site.
    id: "CEM-01", name: "Cement Mill", type: "cement_mill", priority: 1,
    latitude: -34.51189, longitude: 150.33798,
    positionAccuracy: "approximate", positionSource: "Client's annotated site image",
  },
  {
    id: "SL-GRP", name: "Cement Silos", type: "silo", priority: 1,
    latitude: -34.511176, longitude: 150.339312, hideFrom: 1.25,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
    members: ["SL-01", "SL-02", "SL-03"], demoObject: true,
  },
  ...(
    [
      ["SL-01", "Cement Silo 1", -34.511021, 150.339124],
      ["SL-02", "Cement Silo 2", -34.511176, 150.339312],
      ["SL-03", "Cement Silo 3", -34.511331, 150.339499],
    ] as const
  ).map(
    ([id, name, latitude, longitude]): PlantAsset => ({
      id, name, type: "silo", priority: 2, latitude, longitude, showFrom: 1.25,
      positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
      inventoryLocationId: id, inventoryId: id, materialId: "MAT-CEMENT", demoObject: true,
    }),
  ),
  {
    // The long shed south-west of the kiln.
    id: "PK-01", name: "Cement Packing", type: "packaging", priority: 2,
    latitude: -34.51213, longitude: 150.33584,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
  {
    // The bulk loadout building with tanker access.
    id: "DS-01", name: "Dispatch / Loadout", type: "dispatch", priority: 3,
    latitude: -34.5125, longitude: 150.33651,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
  {
    id: "ST-01", name: "Stacker / Reclaimer", type: "stacker", priority: 3,
    latitude: -34.51248, longitude: 150.3315,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
  {
    // The fenced switchyard north of the works.
    id: "UT-01", name: "Utilities (Power)", type: "utility", priority: 3,
    latitude: -34.508016, longitude: 150.339231,
    positionAccuracy: "approximate", positionSource: FROM_IMAGERY,
  },
]

/**
 * Conveyor routes, traced along galleries visible in the imagery. Indicative,
 * not surveyed centrelines.
 */
const conveyors: PlantAsset[] = (
  [
    ["CV-01", [[-34.50757, 150.3279], [-34.5085, 150.3306], [-34.509651, 150.334403]]],
    ["CV-02", [[-34.51085, 150.33005], [-34.5102, 150.3326], [-34.509651, 150.334403]]],
    ["CV-03", [[-34.50805, 150.3317], [-34.5093, 150.3349], [-34.510535, 150.335798]]],
    ["CV-04", [[-34.51138, 150.33782], [-34.5111, 150.3387], [-34.511176, 150.339312]]],
  ] as const
).map(([id, pts]): PlantAsset => {
  const path = pts.map(([lat, lng]) => ({ lat, lng }))
  const mid = path[Math.floor(path.length / 2)]
  return {
    id, name: `Conveyor ${id}`, type: "conveyor", priority: 3,
    latitude: mid.lat, longitude: mid.lng, path,
    positionAccuracy: "approximate", positionSource: "Traced along galleries in satellite imagery",
  }
})

export const PLANT_ASSETS: PlantAsset[] = [...pileAssets, ...equipment, ...conveyors].map((a) => ({
  ...a,
  connections: CONNECTIONS[a.id],
}))

const BY_ID = new Map(PLANT_ASSETS.map((a) => [a.id, a]))

export function plantAsset(id: string | null | undefined): PlantAsset | undefined {
  return id ? BY_ID.get(id) : undefined
}

/** The asset's marker colour: material colour for piles, type colour otherwise. */
export function assetColour(asset: PlantAsset): string {
  return asset.type === "pile" && asset.materialId ? materialColour(asset.materialId) : TYPE_META[asset.type].colour
}

/** Assets that feed into this one. */
export function upstreamOf(id: string): PlantAsset[] {
  return PLANT_ASSETS.filter((a) => a.connections?.includes(id))
}

/**
 * Zoom depth: levels in from the plant overview (0 = the whole works framed).
 * Visibility rules use depth, not absolute zoom, so a 1280 px laptop and a
 * 1920 px wall screen show the same set of labels at their overview.
 */
export function zoomDepth(zoom: number, overviewZoom: number): number {
  return zoom - overviewZoom
}

/** Whether an asset's marker belongs on the map at this zoom depth. */
export function markerVisibleAt(asset: PlantAsset, depth: number): boolean {
  if (asset.showFrom !== undefined && depth < asset.showFrom) return false
  if (asset.hideFrom !== undefined && depth >= asset.hideFrom) return false
  return true
}

/**
 * Priorities that may carry a card: at the plant overview, the major machines,
 * silos and piles; conveyors, utilities and minor units once zoomed in.
 */
export function labelledPriorityAt(depth: number): Priority {
  if (depth >= 0.75) return 3
  if (depth > -1) return 2
  return 1
}

/** Cards switch from compact to full detail once zoomed in from overview. */
export function detailedAt(depth: number): boolean {
  return depth >= 0.75
}

/** The geographic extent of every asset, outlines and routes included. */
export const PLANT_EXTENT = (() => {
  const pts = PLANT_ASSETS.flatMap((a) => [{ lat: a.latitude, lng: a.longitude }, ...(a.outline ?? []), ...(a.path ?? [])])
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  return {
    south: Math.min(...lats) - 0.0004,
    west: Math.min(...lngs) - 0.0005,
    north: Math.max(...lats) + 0.0004,
    east: Math.max(...lngs) + 0.0005,
  }
})()

export function assetPosition(asset: PlantAsset): LatLng {
  return { lat: asset.latitude, lng: asset.longitude }
}

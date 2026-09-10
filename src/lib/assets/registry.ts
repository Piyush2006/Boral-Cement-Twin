/**
 * Berrima Cement Works — physical asset registry.
 *
 * ============================== SOURCING ==============================
 * LAYOUT / IDENTITY comes from the client-supplied annotated satellite view
 * ("Boral Cement Works – Berrima, NSW — Annotated Satellite View"), which itself
 * states it is based on satellite imagery and publicly available Boral
 * information. It establishes what each area is and how the plant is arranged:
 *
 *   raw material piles in the north-west, limestone from the quarry to the
 *   south-west, and the chain
 *   Piles -> Crusher -> Raw Mill -> Kiln 6 -> Cooler -> Cement Mills -> Silos
 *   -> Dispatch, with one kiln (No. 6) and two cement mills (6 and 7).
 *
 * COORDINATES were read off licensed satellite imagery (Esri World Imagery,
 * z16-z18, 0.49-1.97 m/px) by matching each annotated area to the structure
 * visible there, then converting to WGS84.
 *
 * Therefore, per §30, EVERY asset here is:
 *
 *   verified: false          — no survey or client CAD/GIS data exists
 *   positionSource: IMAGERY  — or DEMO for objects that exist only for the demo
 *
 * and the UI renders them as "Approximate location". Nothing in this file is
 * presented as survey-grade.
 *
 * Boral states Berrima operates ONE kiln, No. 6 (§13). No other kiln is listed.
 * ======================================================================
 */

import { bearingDegrees, distanceMetres, midpoint } from "@/lib/map/projection"
import type { FlowLink, TwinAsset } from "./types"

const CLIENT_LAYOUT = "Client annotated satellite view (Berrima), Sept 2026"
const IMAGERY = "Esri World Imagery — structure visible and matched to the client annotation"

/** Build a linear asset (kiln shell, gallery, shed) from its two ends. */
function linear(
  base: Omit<TwinAsset, "position" | "bearingDegrees" | "lengthMetres"> & {
    run: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }
  },
): TwinAsset {
  return {
    ...base,
    position: midpoint(base.run.from, base.run.to),
    bearingDegrees: bearingDegrees(base.run.from, base.run.to),
    lengthMetres: distanceMetres(base.run.from, base.run.to),
  }
}

/* ── Extraction ───────────────────────────────────────────────────────────── */

const EXTRACTION: TwinAsset[] = [
  {
    assetId: "QUARRY-01",
    name: "Quarry Area",
    type: "PROCESS_AREA",
    position: { lat: -34.512950, lng: 150.329750 },
    heightMetres: -30,
    radiusMetres: 260,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${CLIENT_LAYOUT}; worked benches and standing water clearly visible in imagery`,
    note: "Limestone source, south-west of the works. NOT a stockpile — it holds no inventory.",
    stage: "EXTRACTION",
    status: "OPERATIONAL",
      zoneLengthMetres: 600,
    zoneWidthMetres: 350,
    bearingDegrees: 40,
    subtitle: "Limestone Source · Not a Stockpile",
},
]

/* ── Raw material piles (north-west) ──────────────────────────────────────── */

type PileSeed = {
  id: string
  name: string
  lat: number
  lng: number
  radius: number
  height: number
  materialId: string
  status: TwinAsset["status"]
}

const PILE_SEEDS: PileSeed[] = [
  { id: "PILE-RM-001", name: "Limestone Stockpile", lat: -34.507494, lng: 150.327838, radius: 70, height: 14, materialId: "MAT-LIMESTONE", status: "OPERATIONAL" },
  { id: "PILE-RM-002", name: "Clay / Shale Stockpile", lat: -34.507724, lng: 150.32949, radius: 55, height: 11, materialId: "MAT-SHALE", status: "OPERATIONAL" },
  { id: "PILE-RM-003", name: "Sand / Correctives Stockpile", lat: -34.507848, lng: 150.33052, radius: 45, height: 9, materialId: "MAT-SAND", status: "OPERATIONAL" },
  { id: "PILE-AF-001", name: "Alternate Fuel Stockpile", lat: -34.510810, lng: 150.329980, radius: 75, height: 10, materialId: "MAT-ALT-FUEL", status: "OPERATIONAL" },
  { id: "PILE-COAL-001", name: "Coal Stockpile", lat: -34.51271, lng: 150.338995, radius: 50, height: 10, materialId: "MAT-COAL", status: "OPERATIONAL" },
  { id: "PILE-GYP-001", name: "Gypsum Stockpile", lat: -34.511198, lng: 150.339768, radius: 40, height: 9, materialId: "MAT-GYPSUM", status: "OPERATIONAL" },
]

/** Annotated pile-area zones: length, width (m) and bearing. */
const PILE_ZONES: Record<string, [number, number, number]> = {
  "PILE-RM-001": [210, 120, 118],
  "PILE-RM-002": [150, 110, 118],
  "PILE-RM-003": [135, 108, 118],
  "PILE-AF-001": [210, 165, 128],
  "PILE-COAL-001": [125, 95, 0],
  "PILE-GYP-001": [95, 90, 0],
}

const PILES: TwinAsset[] = PILE_SEEDS.map((seed) => ({
  assetId: seed.id,
  name: seed.name,
  type: "STOCKPILE" as const,
  position: { lat: seed.lat, lng: seed.lng },
  heightMetres: seed.height,
  radiusMetres: seed.radius,
  zoneLengthMetres: PILE_ZONES[seed.id]?.[0],
  zoneWidthMetres: PILE_ZONES[seed.id]?.[1],
  bearingDegrees: PILE_ZONES[seed.id]?.[2],
  subtitle: "Pile Area",
  verified: false,
  positionSource: "IMAGERY" as const,
  identitySource: "DOCUMENTED" as const,
  source: CLIENT_LAYOUT,
  note: "Pile area identified in the client annotation. Extent is approximate and stock figures are demo data until the inventory system is connected.",
  stage: seed.id === "PILE-GYP-001" ? ("FINISH_MILLING" as const) : ("RAW_MATERIALS" as const),
  status: seed.status,
  materialId: seed.materialId,
  inventoryLocationId: `LOC-${seed.id}`,
  qrEnabled: true,
}))

/* ── Raw preparation ──────────────────────────────────────────────────────── */

const RAW_PREPARATION: TwinAsset[] = [
  {
    assetId: "CRUSHER-01",
    name: "Primary Crusher",
    type: "CRUSHER",
    position: { lat: -34.509651, lng: 150.334403 },
    heightMetres: 24,
    widthMetres: 26,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    note: "Raw material infeed, on the conveyor run from the north-west pile area.",
    stage: "RAW_PREPARATION",
    status: "OPERATIONAL",
      zoneLengthMetres: 70,
    zoneWidthMetres: 62,
    subtitle: "Raw Material Infeed",
},
  {
    assetId: "RAW-MILL-01",
    name: "Raw Mill",
    type: "MILL",
    position: { lat: -34.510535, lng: 150.335798 },
    heightMetres: 30,
    widthMetres: 36,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    note: "Grinding and drying, west of the kiln line.",
    stage: "RAW_PREPARATION",
    status: "OPERATIONAL",
      zoneLengthMetres: 100,
    zoneWidthMetres: 86,
    subtitle: "Grinding & Drying",
},
  {
    assetId: "BLEND-STORE-01",
    name: "Blending Store",
    type: "SILO",
    position: { lat: -34.511375, lng: 150.33848 },
    heightMetres: 26,
    radiusMetres: 34,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${IMAGERY} — circular radial-roof store`,
    note: "Circular store with a radial roof. Contents not confirmed.",
    stage: "RAW_PREPARATION",
    status: "OPERATIONAL",
      subtitle: "Raw Meal Storage",
},
]

/* ── Pyroprocessing ───────────────────────────────────────────────────────── */

const PYRO: TwinAsset[] = [
  {
    assetId: "PREHEATER-01",
    name: "Preheater Tower",
    type: "PROCESS_AREA",
    position: { lat: -34.5108, lng: 150.337515 },
    heightMetres: 90,
    widthMetres: 22,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${IMAGERY} — tall structure at the kiln inlet with a long shadow`,
    stage: "PYROPROCESSING",
    status: "OPERATIONAL",
      zoneLengthMetres: 70,
    zoneWidthMetres: 60,
    subtitle: "Kiln Inlet",
},
  linear({
    assetId: "KILN-06",
    name: "Kiln 6",
    type: "KILN",
    run: {
      from: { lat: -34.511251, lng: 150.336549 }, // inlet / feed end (west)
      to: { lat: -34.511141, lng: 150.337472 }, // discharge end (east)
    },
    heightMetres: 14,
    widthMetres: 5,
    zoneLengthMetres: 190,
    zoneWidthMetres: 120,
    subtitle: "Pyroprocessing",
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${CLIENT_LAYOUT}; rotary shell clearly visible in imagery — ~86 m long, bearing ~82° from north`,
    note: "Pyroprocessing. Berrima operates one kiln, No. 6. Shell traced from imagery; not surveyed.",
    stage: "PYROPROCESSING",
    status: "OPERATIONAL",
  }),
  {
    assetId: "BYPASS-01",
    name: "Chloride Bypass Plant",
    type: "PROCESS_AREA",
    position: { lat: -34.510712, lng: 150.336969 },
    heightMetres: 30,
    widthMetres: 16,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: "Named in Boral Berrima plant information",
    note: "Placed at the kiln inlet, where a bypass normally sits. Not shown on the client annotation and not individually identified in imagery.",
    stage: "PYROPROCESSING",
    status: "VERIFICATION_REQUIRED",
      zoneLengthMetres: 55,
    zoneWidthMetres: 45,
    subtitle: "Kiln Gas Bypass",
},
  {
    assetId: "COOLER-01",
    name: "Cooler",
    type: "PROCESS_AREA",
    position: { lat: -34.51111, lng: 150.337783 },
    heightMetres: 20,
    widthMetres: 28,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    note: "Clinker cooling, immediately east of the kiln discharge.",
    stage: "PYROPROCESSING",
    status: "OPERATIONAL",
      zoneLengthMetres: 180,
    zoneWidthMetres: 85,
    bearingDegrees: 82,
    subtitle: "Clinker Cooling",
},
]

/* ── Clinker and finish milling ───────────────────────────────────────────── */

const CLINKER_AND_MILLS: TwinAsset[] = [
  {
    assetId: "CLINKER-STORE-01",
    name: "Clinker Store",
    type: "SILO",
    position: { lat: -34.510491, lng: 150.338856 },
    heightMetres: 40,
    radiusMetres: 54,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${IMAGERY} — domed store ~108 m across`,
    note: "Large domed store north-east of the cooler.",
    stage: "CLINKER",
    status: "OPERATIONAL",
    materialId: "MAT-CLINKER",
    inventoryLocationId: "LOC-CLINKER-01",
    qrEnabled: true,
      subtitle: "Clinker Storage",
},
  {
    assetId: "CEMENT-MILL-06",
    name: "Cement Mill 6",
    type: "MILL",
    position: { lat: -34.511773, lng: 150.337649 },
    heightMetres: 26,
    widthMetres: 32,
    bearingDegrees: 70,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    note: "Grinding. Berrima runs two cement mills, 6 and 7. Which building carries which number is not confirmed — the pairing is unverified.",
    stage: "FINISH_MILLING",
    status: "OPERATIONAL",
      zoneLengthMetres: 95,
    zoneWidthMetres: 82,
    subtitle: "Grinding",
},
  {
    assetId: "CEMENT-MILL-07",
    name: "Cement Mill 7",
    type: "MILL",
    position: { lat: -34.511928, lng: 150.338078 },
    heightMetres: 26,
    widthMetres: 32,
    bearingDegrees: 70,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    note: "Grinding. Berrima runs two cement mills, 6 and 7. Which building carries which number is not confirmed — the pairing is unverified.",
    stage: "FINISH_MILLING",
    status: "WARNING",
      zoneLengthMetres: 95,
    zoneWidthMetres: 82,
    subtitle: "Grinding",
},
]

/* ── Cement storage (demo objects, §12) ───────────────────────────────────── */

const SILOS: TwinAsset[] = [1, 2, 3].map((n) => ({
  assetId: `SILO-CEM-00${n}`,
  name: `Cement Silo ${n}`,
  type: "SILO" as const,
  // Spread along the silo group shown south-east of the mills.
  position: {
    lat: -34.512259 + (n - 2) * 0.00009,
    lng: 150.339446 + (n - 2) * 0.00016,
  },
  heightMetres: 42,
  radiusMetres: 10,
  subtitle: "Product Storage",
  verified: false,
  positionSource: "DEMO" as const,
  identitySource: "DEMO_OBJECT" as const,
  source: "Application configuration — product storage area from the client annotation",
  note: "Demo object. The client annotation marks a cement silo group here, but Boral has supplied no silo count, identifiers or positions. These three exist as application configuration only.",
  stage: "CEMENT_STORAGE" as const,
  status: "OPERATIONAL" as const,
  materialId: n === 3 ? "MAT-OPC-53" : "MAT-OPC-43",
  inventoryLocationId: `LOC-SILO-CEM-00${n}`,
  qrEnabled: true,
}))

/* ── Dispatch, handling, site ─────────────────────────────────────────────── */

const SITE_ASSETS: TwinAsset[] = [
  {
    assetId: "DISPATCH-01",
    name: "Packing & Dispatch",
    type: "LOADING_AREA",
    position: { lat: -34.512259, lng: 150.336549 },
    heightMetres: 16,
    widthMetres: 46,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${CLIENT_LAYOUT}; loading sheds with vehicles visible in imagery`,
    note: "Bulk and bag despatch.",
    stage: "DISPATCH",
    status: "OPERATIONAL",
      zoneLengthMetres: 170,
    zoneWidthMetres: 120,
    subtitle: "Bulk & Bag",
},
  {
    assetId: "RAIL-SIDING-01",
    name: "Rail Siding",
    type: "TRANSFER_POINT",
    position: { lat: -34.509607, lng: 150.339768 },
    heightMetres: 6,
    widthMetres: 30,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${IMAGERY} — siding with wagons. Boral states limestone is delivered by rail from Marulan South.`,
    stage: "RAW_MATERIALS",
    status: "OPERATIONAL",
      zoneLengthMetres: 200,
    zoneWidthMetres: 45,
    bearingDegrees: 78,
    subtitle: "Limestone by Rail",
},
  {
    assetId: "WORKSHOPS-01",
    name: "Workshops, Stores & Maintenance",
    type: "BUILDING",
    position: { lat: -34.507494, lng: 150.33642 },
    heightMetres: 12,
    widthMetres: 60,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    status: "OPERATIONAL",
      zoneLengthMetres: 170,
    zoneWidthMetres: 70,
    subtitle: "Stores & Maintenance",
},
  {
    assetId: "ADMIN-01",
    name: "Administration & Laboratory",
    type: "BUILDING",
    position: { lat: -34.50714, lng: 150.338566 },
    heightMetres: 10,
    widthMetres: 40,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    status: "OPERATIONAL",
      zoneLengthMetres: 130,
    zoneWidthMetres: 60,
    subtitle: "Labs",
},
  {
    assetId: "WATER-01",
    name: "Water Treatment & Ponds",
    type: "UTILITY",
    position: { lat: -34.511614, lng: 150.341248 },
    heightMetres: 0,
    radiusMetres: 70,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "DOCUMENTED",
    source: CLIENT_LAYOUT,
    stage: "UTILITY",
    status: "OPERATIONAL",
      zoneLengthMetres: 175,
    zoneWidthMetres: 120,
    subtitle: "Water Treatment",
},
  {
    assetId: "SUBSTATION-01",
    name: "Substation",
    type: "UTILITY",
    position: { lat: -34.508016, lng: 150.339231 },
    heightMetres: 8,
    widthMetres: 30,
    verified: false,
    positionSource: "IMAGERY",
    identitySource: "IDENTIFIED",
    source: `${IMAGERY} — fenced switchyard`,
    stage: "UTILITY",
    status: "OPERATIONAL",
      zoneLengthMetres: 80,
    zoneWidthMetres: 55,
    subtitle: "Switchyard",
},
]

export const TWIN_ASSETS: TwinAsset[] = [
  ...EXTRACTION,
  ...PILES,
  ...RAW_PREPARATION,
  ...PYRO,
  ...CLINKER_AND_MILLS,
  ...SILOS,
  ...SITE_ASSETS,
]

/**
 * The process chain, exactly as the client annotation states it:
 *
 *   Piles -> Crusher -> Raw Mill -> Kiln -> Cooler -> Cement Mills
 *         -> Silos -> Dispatch
 *
 * Every link is routeVerified: false. The annotation itself marks conveyors as
 * "indicative", so these are drawn dashed and never claimed as surveyed routes.
 */
export const FLOW_LINKS: FlowLink[] = [
  { from: "QUARRY-01", to: "PILE-RM-001", label: "Limestone", routeVerified: false },
  { from: "RAIL-SIDING-01", to: "PILE-RM-001", label: "Rail (Marulan South)", routeVerified: false },
  { from: "PILE-RM-001", to: "CRUSHER-01", routeVerified: false },
  { from: "PILE-RM-002", to: "CRUSHER-01", routeVerified: false },
  { from: "PILE-RM-003", to: "CRUSHER-01", routeVerified: false },
  { from: "CRUSHER-01", to: "RAW-MILL-01", label: "Crushed feed", routeVerified: false },
  { from: "RAW-MILL-01", to: "BLEND-STORE-01", routeVerified: false },
  { from: "BLEND-STORE-01", to: "PREHEATER-01", label: "Raw meal", routeVerified: false },
  { from: "PREHEATER-01", to: "KILN-06", routeVerified: false },
  { from: "PILE-AF-001", to: "KILN-06", label: "Alternate fuel", routeVerified: false },
  { from: "PILE-COAL-001", to: "KILN-06", label: "Coal", routeVerified: false },
  { from: "KILN-06", to: "BYPASS-01", label: "Kiln gas bypass", routeVerified: false },
  { from: "KILN-06", to: "COOLER-01", routeVerified: false },
  { from: "COOLER-01", to: "CLINKER-STORE-01", label: "Clinker", routeVerified: false },
  { from: "CLINKER-STORE-01", to: "CEMENT-MILL-06", routeVerified: false },
  { from: "CLINKER-STORE-01", to: "CEMENT-MILL-07", routeVerified: false },
  { from: "PILE-GYP-001", to: "CEMENT-MILL-06", label: "Gypsum", routeVerified: false },
  { from: "PILE-GYP-001", to: "CEMENT-MILL-07", label: "Gypsum", routeVerified: false },
  { from: "CEMENT-MILL-06", to: "SILO-CEM-001", label: "Cement", routeVerified: false },
  { from: "CEMENT-MILL-07", to: "SILO-CEM-002", routeVerified: false },
  { from: "CEMENT-MILL-07", to: "SILO-CEM-003", routeVerified: false },
  { from: "SILO-CEM-001", to: "DISPATCH-01", routeVerified: false },
  { from: "SILO-CEM-002", to: "DISPATCH-01", routeVerified: false },
  { from: "SILO-CEM-003", to: "DISPATCH-01", routeVerified: false },
]

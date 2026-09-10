/**
 * Physical asset model (spec §10).
 *
 * One asset, one `assetId`, one lat/lng. The map and the 3D twin both render
 * from this — neither holds its own copy of a position.
 */

import type { LatLng } from "@/lib/map/projection"

export type AssetType =
  | "SITE"
  | "PROCESS_AREA"
  | "STOCKPILE"
  | "SILO"
  | "CRUSHER"
  | "MILL"
  | "KILN"
  | "CONVEYOR"
  | "TRANSFER_POINT"
  | "LOADING_AREA"
  | "UTILITY"
  | "BUILDING"
  | "ROAD"

/** Operational status (§24). Never communicated by colour alone. */
export type AssetStatus =
  | "OPERATIONAL"
  | "WARNING"
  | "CRITICAL"
  | "OFFLINE"
  | "VERIFICATION_REQUIRED"

/**
 * How the position was obtained.
 *
 * SURVEY / PLANT_LAYOUT — authoritative client data. Nothing in this build has it.
 * IMAGERY              — traced from licensed satellite imagery. Approximate.
 * DEMO                 — an object placed to demonstrate the application (§12, §20).
 */
export type PositionSource = "SURVEY" | "PLANT_LAYOUT" | "IMAGERY" | "DEMO"

/**
 * Why we believe the asset is what we call it.
 *
 * IDENTIFIED  — the structure is unambiguous in imagery (a rotary kiln, a dome).
 * DOCUMENTED  — Boral names it, but we cannot single it out in imagery.
 * DEMO_OBJECT — application configuration for the demo, not a Boral fact.
 */
export type IdentitySource = "IDENTIFIED" | "DOCUMENTED" | "DEMO_OBJECT"

export type TwinAsset = {
  assetId: string
  name: string
  type: AssetType

  /** Canonical position. Elongated assets use `run` and derive this. */
  position: LatLng
  /** Both ends of a linear asset: kiln shell, conveyor gallery, long shed. */
  run?: { from: LatLng; to: LatLng }

  /** Metres. Real dimensions where measurable from imagery. */
  heightMetres: number
  widthMetres?: number
  lengthMetres?: number
  /** Degrees clockwise from north. Derived from `run` when present. */
  bearingDegrees?: number
  /** Footprint radius for circular assets (domes, silos, piles). */
  radiusMetres?: number

  /**
   * The annotated ZONE drawn on the map — the operating area, which is larger
   * than the structure itself (a pile area, a mill house, the kiln enclosure).
   * Either explicit corners, or a rectangle from these dimensions.
   */
  footprint?: Array<{ lat: number; lng: number }>
  zoneLengthMetres?: number
  zoneWidthMetres?: number
  /** Short qualifier shown under the name in the callout, e.g. "Pile Area". */
  subtitle?: string

  /**
   * §10: a modelled object must not be presented as fact when its physical
   * identity or location has not been verified. NOTHING in this build is
   * verified — there is no survey or client layout data yet.
   */
  verified: boolean
  positionSource: PositionSource
  identitySource: IdentitySource
  source?: string
  note?: string

  status?: AssetStatus
  /** Join keys into the inventory system (§28). Never joined by name. */
  materialId?: string
  inventoryLocationId?: string
  /** Where the asset sits in the process chain (§2). */
  stage?: ProcessStage
  /** True when this asset carries a scannable QR tag (§18). */
  qrEnabled?: boolean
}

export type ProcessStage =
  | "EXTRACTION"
  | "RAW_MATERIALS"
  | "RAW_PREPARATION"
  | "PYROPROCESSING"
  | "CLINKER"
  | "FINISH_MILLING"
  | "CEMENT_STORAGE"
  | "DISPATCH"
  | "UTILITY"

/** A process relationship (§25). */
export type FlowLink = {
  from: string
  to: string
  label?: string
  /**
   * True only when a physical material-handling route is confirmed by plant
   * information. False everywhere in this build: these are process
   * relationships, drawn dashed, never claimed as surveyed conveyor routes.
   */
  routeVerified: boolean
}

/** UI text for an asset's positional confidence (§30). */
export function locationLabel(asset: TwinAsset): string {
  if (asset.verified) return "Verified location"
  switch (asset.positionSource) {
    case "IMAGERY":
      return "Approximate location"
    case "DEMO":
      return "Demo object — approximate"
    default:
      return "To be verified"
  }
}

export function identityLabel(asset: TwinAsset): string {
  switch (asset.identitySource) {
    case "IDENTIFIED":
      return "Identified in imagery"
    case "DOCUMENTED":
      return "Named by Boral, not individually identified"
    case "DEMO_OBJECT":
      return "Demo object"
  }
}

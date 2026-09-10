/**
 * The single coordinate bridge.
 *
 *                 WGS84 lat/lng  (canonical — lives on every asset)
 *                         |
 *         ┌───────────────┴───────────────┐
 *         v                               v
 *   Leaflet EPSG:3857              local ENU metres
 *   (Satellite + Hybrid)           (3D Twin, Three.js)
 *
 * The previous build kept two coordinate spaces in sync by hand and drifted.
 * Here lat/lng is the only truth; both views derive from it and neither can
 * reposition an asset independently.
 *
 * The local frame is a tangent-plane (equirectangular) projection about the site
 * centre. Over a ~1.3 km site the error against a rigorous projection is well
 * under a centimetre, so it needs no dependency and no datum handling.
 */

import { BERRIMA_SITE } from "@/config/site"

export type LatLng = { lat: number; lng: number }
/** East/north metres from the site centre. Three.js: east = +X, north = -Z. */
export type LocalPoint = { east: number; north: number }

const EARTH_RADIUS_M = 6378137

const ORIGIN = BERRIMA_SITE.center
const METRES_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M
const METRES_PER_DEG_LNG =
  (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((ORIGIN.lat * Math.PI) / 180)

export function toLocalMetres({ lat, lng }: LatLng): LocalPoint {
  return {
    east: (lng - ORIGIN.lng) * METRES_PER_DEG_LNG,
    north: (lat - ORIGIN.lat) * METRES_PER_DEG_LAT,
  }
}

export function fromLocalMetres({ east, north }: LocalPoint): LatLng {
  return {
    lat: ORIGIN.lat + north / METRES_PER_DEG_LAT,
    lng: ORIGIN.lng + east / METRES_PER_DEG_LNG,
  }
}

/** Three.js world position. Y is up and comes from the asset's height. */
export function toWorld(ll: LatLng): [number, number, number] {
  const { east, north } = toLocalMetres(ll)
  return [east, 0, -north]
}

export function worldToLatLng(x: number, z: number): LatLng {
  return fromLocalMetres({ east: x, north: -z })
}

/** Ground distance in metres. Real units — no normalised fudge factor. */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const pa = toLocalMetres(a)
  const pb = toLocalMetres(b)
  return Math.hypot(pb.east - pa.east, pb.north - pa.north)
}

/** Bearing in degrees clockwise from north, for orienting elongated assets. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const a = toLocalMetres(from)
  const b = toLocalMetres(to)
  return (Math.atan2(b.east - a.east, b.north - a.north) * 180) / Math.PI
}

/** Midpoint of a two-point run (kilns, galleries, long sheds). */
export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
}

export function isValidLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false
  const { lat, lng } = value as Partial<LatLng>
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

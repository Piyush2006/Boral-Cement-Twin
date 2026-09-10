/**
 * Footprint geometry.
 *
 * The client annotation draws each area as a filled zone, not a dot, so assets
 * carry a real ground footprint. Most are oriented rectangles derived from
 * `widthMetres` × `lengthMetres` × `bearingDegrees`; irregular areas (the
 * quarry, the fuel pile) carry an explicit outline.
 *
 * All footprints are approximate, like every other position in this build.
 */

import { fromLocalMetres, toLocalMetres, type LatLng } from "@/lib/map/projection"
import type { TwinAsset } from "./types"

export type Polygon = LatLng[]

/** Oriented rectangle around a point, in metres. */
export function rectangleAround(
  centre: LatLng,
  lengthMetres: number,
  widthMetres: number,
  bearingDegrees = 0,
): Polygon {
  const o = toLocalMetres(centre)
  const t = (bearingDegrees * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const hl = lengthMetres / 2
  const hw = widthMetres / 2

  // Local frame: +along = bearing direction, +across = 90° clockwise of it.
  return [
    [-hl, -hw],
    [hl, -hw],
    [hl, hw],
    [-hl, hw],
  ].map(([along, across]) =>
    fromLocalMetres({
      east: o.east + along * sin + across * cos,
      north: o.north + along * cos - across * sin,
    }),
  )
}

/** Regular polygon approximating a circular area (domes, ponds, piles). */
export function circleAround(centre: LatLng, radiusMetres: number, sides = 28): Polygon {
  const o = toLocalMetres(centre)
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2
    return fromLocalMetres({
      east: o.east + Math.cos(a) * radiusMetres,
      north: o.north + Math.sin(a) * radiusMetres,
    })
  })
}

/**
 * The zone to draw for an asset: its explicit outline if it has one, otherwise a
 * rectangle or circle sized from its dimensions.
 */
export function footprintOf(asset: TwinAsset): Polygon {
  if (asset.footprint && asset.footprint.length >= 3) return asset.footprint

  if (asset.zoneLengthMetres && asset.zoneWidthMetres) {
    return rectangleAround(
      asset.position,
      asset.zoneLengthMetres,
      asset.zoneWidthMetres,
      asset.bearingDegrees ?? 0,
    )
  }

  if (asset.radiusMetres) return circleAround(asset.position, asset.radiusMetres)

  const w = asset.widthMetres ?? 30
  return rectangleAround(asset.position, w * 1.4, w, asset.bearingDegrees ?? 0)
}

/** Offset a point by metres east/north — used to place callout labels. */
export function offsetMetres(point: LatLng, east: number, north: number): LatLng {
  const o = toLocalMetres(point)
  return fromLocalMetres({ east: o.east + east, north: o.north + north })
}

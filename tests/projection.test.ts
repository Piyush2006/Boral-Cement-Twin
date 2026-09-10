import { describe, expect, it } from "vitest"

import { BERRIMA_SITE } from "@/config/site"
import {
  bearingDegrees,
  distanceMetres,
  fromLocalMetres,
  isValidLatLng,
  toLocalMetres,
  toWorld,
  worldToLatLng,
} from "@/lib/map/projection"

/** The one coordinate bridge — both views depend on it being exact. */
describe("plant projection", () => {
  it("puts the site centre at the local origin", () => {
    const o = toLocalMetres(BERRIMA_SITE.center)
    expect(o.east).toBeCloseTo(0, 6)
    expect(o.north).toBeCloseTo(0, 6)
  })

  it("round-trips lat/lng through local metres", () => {
    const p = { lat: -34.5112, lng: 150.3371 }
    const back = fromLocalMetres(toLocalMetres(p))
    expect(back.lat).toBeCloseTo(p.lat, 9)
    expect(back.lng).toBeCloseTo(p.lng, 9)
  })

  it("round-trips through Three.js world coordinates", () => {
    const p = { lat: -34.5105, lng: 150.3348 }
    const [x, , z] = toWorld(p)
    const back = worldToLatLng(x, z)
    expect(back.lat).toBeCloseTo(p.lat, 9)
    expect(back.lng).toBeCloseTo(p.lng, 9)
  })

  it("maps east to +X and north to -Z, so the 3D scene is north-up", () => {
    const [eastX] = toWorld({ lat: BERRIMA_SITE.center.lat, lng: BERRIMA_SITE.center.lng + 0.001 })
    expect(eastX).toBeGreaterThan(0)
    const [, , northZ] = toWorld({
      lat: BERRIMA_SITE.center.lat + 0.001,
      lng: BERRIMA_SITE.center.lng,
    })
    expect(northZ).toBeLessThan(0)
  })

  it("measures real ground distance in metres", () => {
    // 0.001 deg of latitude is ~111.3 m anywhere.
    const d = distanceMetres(BERRIMA_SITE.center, {
      lat: BERRIMA_SITE.center.lat + 0.001,
      lng: BERRIMA_SITE.center.lng,
    })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(113)
  })

  it("gives bearings clockwise from north", () => {
    const c = BERRIMA_SITE.center
    expect(bearingDegrees(c, { lat: c.lat + 0.001, lng: c.lng })).toBeCloseTo(0, 3)
    expect(bearingDegrees(c, { lat: c.lat, lng: c.lng + 0.001 })).toBeCloseTo(90, 3)
  })

  it("rejects malformed coordinates rather than coercing them", () => {
    expect(isValidLatLng({ lat: -34.5, lng: 150.3 })).toBe(true)
    for (const bad of [null, undefined, {}, { lat: NaN, lng: 0 }, { lat: 99, lng: 0 }, { lat: 0 }]) {
      expect(isValidLatLng(bad)).toBe(false)
    }
  })

  it("opens on the works, not on Berrima township ~4 km away", () => {
    expect(BERRIMA_SITE.center.lat).toBeCloseTo(-34.5099, 3)
    expect(BERRIMA_SITE.center.lng).toBeCloseTo(150.3365, 3)
  })
})

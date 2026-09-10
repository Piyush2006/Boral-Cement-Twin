/**
 * Berrima Cement Works — site configuration.
 *
 * Spec §7: the map must open on the WORKS, not on Berrima township (which is
 * ~4 km north-east and is the trap that section warns about).
 */

export const BERRIMA_SITE = {
  id: "berrima",
  name: "Berrima Cement Works",
  operator: "Boral",
  address: "Taylor Ave, New Berrima NSW, Australia",

  /**
   * Verified works location (not the township).
   * Source: Global Energy Monitor — Berrima cement plant.
   * https://www.gem.wiki/Berrima_cement_plant
   */
  center: { lat: -34.5099, lng: 150.3365 },

  defaultZoom: 16,
  /** Esri World Imagery has no z19 coverage here — see providers.ts. */
  minZoom: 13,
  maxZoom: 20,

  /**
   * Operating area used to frame the site. Derived from the extent of the works
   * and the extraction area as visible in imagery — approximate, like every
   * other position in this application.
   */
  bounds: {
    north: -34.5054,
    south: -34.5167,
    west: 150.3270,
    east: 150.3407,
  },

  /**
   * The operating core — piles, process line, silos, dispatch. The map opens
   * here so the plant fills the frame, as on the client annotation. The quarry
   * and outlying ponds sit outside it and are reached by panning out.
   */
  worksBounds: {
    north: -34.5066,
    south: -34.5131,
    west: 150.3272,
    east: 150.3408,
  },

  /** Boral's public page for the works (spec §4). */
  reference: "https://www.boral.com.au/locations/boral-cement-works-berrima",
} as const

/** Ground span of `bounds`, in metres. Used for scale bars and sanity checks. */
export const SITE_SPAN_METRES = { width: 1260, height: 1260 } as const

/**
 * Basemap providers (spec §5, §6, §31).
 *
 * Esri ArcGIS World Imagery is active: it needs no API key, so the application
 * builds and demos without one. Google Maps Platform can be added later by
 * supplying a key — nothing outside this file changes.
 *
 * Two rules this module exists to hold:
 *
 *  1. Imagery is ALWAYS fetched live from the licensed provider. Tiles are never
 *     downloaded, stitched or committed into the application (§5, §31).
 *  2. Attribution is part of the provider definition, not an optional prop, so a
 *     provider cannot be rendered without its credit.
 */

export type BasemapProvider = {
  id: string
  label: string
  /** Leaflet tile template, or null when the provider needs its own SDK. */
  urlTemplate: string | null
  attribution: string
  /** Highest zoom with real coverage; above this Leaflet upscales. */
  maxNativeZoom: number
  maxZoom: number
  /** Env var holding the key, when one is required. */
  apiKeyEnv?: string
  available: boolean
  note?: string
}

/**
 * Esri World Imagery. Verified against Berrima: z18 is the deepest level with
 * real coverage here — z19 returns a "Map data not yet available" placeholder,
 * which is why maxNativeZoom is pinned to 18 and Leaflet over-zooms beyond it.
 */
export const ESRI_WORLD_IMAGERY: BasemapProvider = {
  id: "esri-world-imagery",
  label: "Esri World Imagery",
  urlTemplate:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    'Imagery &copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
  maxNativeZoom: 18,
  maxZoom: 20,
  available: true,
}

/**
 * Google Maps Platform. Requires the Maps JavaScript API with
 * `mapTypeId = satellite` and a restricted key (§5, §32) — deliberately NOT a
 * tile template, because pulling Google tiles directly would breach their terms.
 */
export const GOOGLE_SATELLITE: BasemapProvider = {
  id: "google-satellite",
  label: "Google Satellite",
  urlTemplate: null,
  attribution: "Map data &copy; Google",
  maxNativeZoom: 20,
  maxZoom: 21,
  apiKeyEnv: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  available: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
  note: "Needs the Maps JavaScript API and a restricted key. Renders through Google's SDK, never as raw tiles.",
}

export const PROVIDERS: BasemapProvider[] = [ESRI_WORLD_IMAGERY, GOOGLE_SATELLITE]

/** The provider to render with: Google when a key exists, otherwise Esri. */
export function activeProvider(): BasemapProvider {
  return GOOGLE_SATELLITE.available ? GOOGLE_SATELLITE : ESRI_WORLD_IMAGERY
}

export function getProvider(id: string): BasemapProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

/**
 * Thumbnail of a location, taken from the licensed provider's own tile at the
 * point of use. It is fetched live like every other tile — nothing is cached or
 * bundled into the application (§5, §31).
 */

import { activeProvider } from "./providers"
import type { LatLng } from "./projection"

export function tileThumbnail({ lat, lng }: LatLng, zoom = 17): string {
  const provider = activeProvider()
  if (!provider.urlTemplate) return ""
  const z = Math.min(zoom, provider.maxNativeZoom)
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  )
  return provider.urlTemplate
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
}

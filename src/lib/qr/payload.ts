/**
 * QR payloads (spec §18).
 *
 * A tag encodes one asset id and nothing else. Scanning identifies an asset; it
 * never carries a quantity, so a tag can't be forged into a stock movement.
 */

export const QR_PREFIX = "berrima-twin:asset:"

export function encodeAssetQr(assetId: string): string {
  return `${QR_PREFIX}${assetId}`
}

/**
 * Parse a scanned string. Accepts the canonical payload, and a bare asset id so
 * an operator can key one in when a camera is unavailable. Anything else is
 * rejected rather than coerced into a match.
 */
export function parseAssetQr(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  if (value.startsWith(QR_PREFIX)) {
    const id = value.slice(QR_PREFIX.length).trim()
    return isAssetIdShaped(id) ? id : null
  }
  return isAssetIdShaped(value) ? value.toUpperCase() : null
}

/** Asset ids are upper-case alphanumeric with dashes, e.g. PILE-RM-001. */
function isAssetIdShaped(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9-]{2,39}$/.test(value)
}

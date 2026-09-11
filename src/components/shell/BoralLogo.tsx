/**
 * Boral logo — black square, white BORAL wordmark, yellow and green bands.
 *
 * Drawn as inline SVG (proportions taken from the supplied artwork) so it is
 * crisp at any size and needs no network request. To use the official file
 * instead, place it in public/ and swap this for an <img>.
 */

export function BoralLogo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 95.4"
      width={size}
      height={(size * 95.4) / 100}
      role="img"
      aria-label="Boral"
      className={className}
    >
      <rect width="100" height="95.4" fill="#000" />
      {/* A plain bold face thickened by a white stroke gives the heavy
          wordmark on every machine, whichever bold sans it has installed. */}
      <text
        x="3.3"
        y="28.4"
        textLength="91.4"
        lengthAdjust="spacingAndGlyphs"
        fill="#fff"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="miter"
        paintOrder="stroke"
        fontFamily="Arial, Helvetica, 'DejaVu Sans', sans-serif"
        fontWeight="700"
        fontSize="28.5"
      >
        BORAL
      </text>
      <rect x="4.6" y="34.2" width="90.8" height="26.3" fill="#FDDA24" />
      <rect x="4.6" y="63.8" width="90.8" height="27.6" fill="#2DB35C" />
    </svg>
  )
}

/**
 * A status or asset colour, made legible as TEXT on the active theme.
 *
 * The palette (yellow piles, cyan conveyors, green "Healthy"…) is tuned for
 * dark surfaces; used as-is for text on white it falls well below contrast
 * (#eab308 on white is ~1.9:1). On light surfaces the colour is mixed towards
 * the ink colour instead, keeping its hue while clearing 4.5:1. Dots, borders
 * and fills keep the raw colour — only text goes through here.
 *
 * Returns a CSS colour string, so it works in React style objects and in the
 * inline HTML strings used for Leaflet markers alike.
 */
export function toneText(colour: string): string {
  return `color-mix(in srgb, ${colour} var(--tone-keep), var(--surface-ink))`
}

/**
 * Imperative bridge between the map chrome and the Leaflet instance.
 *
 * Kept in its own module with no Leaflet import: the chrome renders on the
 * server, and importing Leaflet there fails because it touches `window` at
 * module scope. PlantMap installs these handlers on mount.
 */

const noop = () => {}

export const mapControls = {
  zoomIn: noop as () => void,
  zoomOut: noop as () => void,
  fit: noop as () => void,
}

export function resetMapControls(): void {
  mapControls.zoomIn = noop
  mapControls.zoomOut = noop
  mapControls.fit = noop
}

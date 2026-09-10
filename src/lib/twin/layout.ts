/**
 * Scene layout for the Digital Twin.
 *
 * Berrima's works span ~700 m while its equipment is 30-90 m, so at true scale
 * the model reads as scattered specks. The scene compresses plan distances
 * toward the plant centroid and scales the equipment up, which is how a plant
 * schematic is normally drawn — relative arrangement and process order are
 * preserved exactly, absolute distances are not.
 *
 * Both the 3D scene and the callout projection import from here, so the cards
 * and the model can never disagree about where a unit is.
 */

import { PLANT_UNITS } from "@/lib/assets/units"
import { toWorld, type LatLng } from "@/lib/map/projection"

/** Plan compression toward the works centroid. 1 = true scale. */
export const LAYOUT_SCALE = 0.62

/** Equipment size multiplier, to keep units legible after compression. */
export const UNIT_SCALE = 1.5

const CENTROID = (() => {
  let x = 0
  let z = 0
  for (const u of PLANT_UNITS) {
    const [wx, , wz] = toWorld(u.position)
    x += wx
    z += wz
  }
  return { x: x / PLANT_UNITS.length, z: z / PLANT_UNITS.length }
})()

/** Ground position in scene space for any real coordinate. */
export function scenePos(position: LatLng): readonly [number, number] {
  const [wx, , wz] = toWorld(position)
  return [
    (wx - CENTROID.x) * LAYOUT_SCALE,
    (wz - CENTROID.z) * LAYOUT_SCALE,
  ] as const
}

export function sceneUnit(tag: string): readonly [number, number] {
  const u = PLANT_UNITS.find((x) => x.tag === tag)
  return u ? scenePos(u.position) : ([0, 0] as const)
}

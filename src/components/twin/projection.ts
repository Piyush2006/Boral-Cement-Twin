/**
 * Shared handles between the 3D canvas and the DOM annotation layer.
 *
 * Tag positions are written straight to the elements from inside the render
 * loop. Routing them through React state made the tags lag the canvas by a
 * frame or more, so they visibly slid off their units while the view was being
 * orbited.
 */

export type TagElements = Record<string, HTMLElement | null>

export type AnnotationHandles = {
  /** One element per unit tag, keyed by card id. */
  tags: TagElements
  /** The open detail card, when there is one. */
  card: HTMLElement | null
  /** Which card is open — read by the driver, never written by it. */
  activeId: string | null
  /** Screen position of each anchor, refreshed every frame. */
  anchors: Record<string, { x: number; y: number; visible: boolean }>
}

export function createHandles(): AnnotationHandles {
  return { tags: {}, card: null, activeId: null, anchors: {} }
}

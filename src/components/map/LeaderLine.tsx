"use client"

/**
 * Leader line from an asset anchor to its card.
 *
 * It begins on the anchor — drawn from the marker's centre and visible from
 * its rim — and ends on the card edge with a small terminal dot, over a dark
 * halo so it reads on any imagery.
 */

import type { Pt } from "@/lib/map/annotation-layout"

export function LeaderLine({
  anchor,
  connector,
  colour,
  active,
}: {
  anchor: Pt
  connector: Pt
  colour: string
  active: boolean
}) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <line
        x1={anchor.x}
        y1={anchor.y}
        x2={connector.x}
        y2={connector.y}
        style={{ stroke: "rgba(0,0,0,.62)", strokeWidth: active ? 6 : 5, strokeLinecap: "round" }}
      />
      <line
        x1={anchor.x}
        y1={anchor.y}
        x2={connector.x}
        y2={connector.y}
        style={{ stroke: colour, strokeWidth: active ? 3 : 2, strokeLinecap: "round" }}
      />
      <circle cx={connector.x} cy={connector.y} r={3} style={{ fill: colour, stroke: "rgba(0,0,0,.6)", strokeWidth: 1 }} />
    </g>
  )
}

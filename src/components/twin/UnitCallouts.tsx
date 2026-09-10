"use client"

/**
 * Numbered unit cards with leader lines to the plant.
 *
 * The cards live in normal DOM (not in the 3D scene) so they stay crisp and
 * legible at any zoom; each frame the unit's world position is projected to
 * screen space and the leader line is redrawn to meet it. Cards are laid out
 * down the left and right margins, so they never cover the plant.
 */

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"

import { PLANT_UNITS, unitTone, type PlantUnit } from "@/lib/assets/units"
import { UNIT_SCALE, scenePos } from "@/lib/twin/layout"

type Anchor = { unit: PlantUnit; x: number; y: number; visible: boolean }

/** Camera + size handed over by the canvas each frame. */
export type ProjectionState = {
  camera: THREE.Camera | null
  width: number
  height: number
  tick: number
}

export function UnitCallouts({
  projection,
  selected,
  onSelect,
}: {
  projection: ProjectionState
  selected: string | null
  onSelect: (tag: string) => void
}) {
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const { camera, width, height } = projection
    if (!camera || width === 0) return
    const next: Anchor[] = PLANT_UNITS.map((unit) => {
      const [wx, wz] = scenePos(unit.position)
      // Aim at the top of the unit so the line meets the structure, not the pad.
      const v = new THREE.Vector3(wx, unitLift(unit), wz).project(camera)
      return {
        unit,
        x: ((v.x + 1) / 2) * width,
        y: ((1 - v.y) / 2) * height,
        visible: v.z < 1,
      }
    })
    setAnchors(next)
  }, [projection])

  const { width, height } = projection
  if (width === 0) return null

  const CARD_W = 268
  const MARGIN = 16
  const topPad = 12
  const usable = height - 150

  return (
    <div ref={host} className="pointer-events-none absolute inset-0 z-[600]">
      <svg width={width} height={height} className="absolute inset-0">
        {anchors.map((a) => {
          const cardX = a.unit.side === "left" ? MARGIN + CARD_W : width - MARGIN - CARD_W
          const cardY = topPad + a.unit.slot * usable + 46
          const tone = unitTone(a.unit)
          const stroke = tone === "alert" ? "#d92d20" : tone === "ok" ? "#0f9d58" : "#5b6b8c"
          return (
            <g key={a.unit.tag}>
              <path
                d={`M ${cardX} ${cardY} L ${(cardX + a.x) / 2} ${cardY} L ${a.x} ${a.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={selected === a.unit.tag ? 2 : 1.2}
                opacity={0.85}
              />
              <circle cx={a.x} cy={a.y} r={selected === a.unit.tag ? 6 : 4} fill="#fff" stroke={stroke} strokeWidth={2} />
            </g>
          )
        })}
      </svg>

      {PLANT_UNITS.map((unit) => {
        const cardY = topPad + unit.slot * usable
        return (
          <div
            key={unit.tag}
            className="pointer-events-auto absolute"
            style={{
              width: CARD_W,
              top: cardY,
              left: unit.side === "left" ? MARGIN : undefined,
              right: unit.side === "right" ? MARGIN : undefined,
            }}
          >
            <UnitCard
              unit={unit}
              selected={selected === unit.tag}
              onClick={() => onSelect(unit.tag)}
            />
          </div>
        )
      })}
    </div>
  )
}

/** Height to aim the leader line at, so it meets the structure rather than the
 *  pad. Scaled with the model, so the two stay in step. */
function unitLift(unit: PlantUnit): number {
  const base = {
    TOWER: 104,
    SILO_GROUP: 80,
    KILN: 36,
    CRUSHER: 42,
    COOLER: 44,
    MILL: 30,
    PACKING: 28,
    UTILITY: 24,
  }[unit.kind]
  return base * UNIT_SCALE
}

const TONE_BG: Record<string, string> = {
  ok: "#0f9d58",
  alert: "#d92d20",
  neutral: "#6b7a99",
}

function UnitCard({
  unit,
  selected,
  onClick,
}: {
  unit: PlantUnit
  selected: boolean
  onClick: () => void
}) {
  const tone = unitTone(unit)
  return (
    <button
      onClick={onClick}
      className={`w-full overflow-hidden rounded-lg bg-white text-left shadow-xl transition-transform ${
        selected ? "scale-[1.02] ring-2 ring-[#1d4ed8]" : "ring-1 ring-black/10"
      }`}
    >
      <div
        className="flex items-center gap-2.5 px-3 py-2 text-white"
        style={{ background: TONE_BG[tone] }}
      >
        <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white/25 text-[11px] font-bold">
          {unit.no}
        </span>
        <span className="flex-1 truncate text-[14px] font-semibold">{unit.name}</span>
        <span aria-hidden className="text-[13px] opacity-90">
          ↗
        </span>
      </div>

      {!unit.costOnly && (
        <div className="flex items-center border-b border-black/10 text-[12.5px]">
          <span className="flex flex-1 items-center gap-1.5 px-3 py-2">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[#f59e0b] text-[10px] font-bold text-white">
              !
            </span>
            <span className="text-[#334155]">Warning-</span>
            <span className="font-semibold text-[#0f172a]">{unit.warnings}</span>
          </span>
          <span className="h-5 w-px bg-black/10" />
          <span className="flex flex-1 items-center gap-1.5 px-3 py-2">
            <span aria-hidden className="text-[#d92d20]">
              ▲
            </span>
            <span className="text-[#334155]">Critical-</span>
            <span className="font-semibold text-[#0f172a]">{unit.criticals}</span>
          </span>
        </div>
      )}

      <div className="flex items-baseline gap-2 px-3 py-2 text-[12.5px]">
        <span className="text-[#475569]">Maintenance Cost (MTD)</span>
        <span className="ml-auto font-semibold text-[#0f172a]">
          {unit.maintenanceLakhs.toFixed(2)} Lakhs
        </span>
      </div>
    </button>
  )
}

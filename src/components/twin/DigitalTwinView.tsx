"use client"

/**
 * Digital Twin view: the plant model, dark glass callout cards with leader
 * lines, a status legend and map controls.
 *
 * Process metrics on the cards drift on a timer so the twin visibly runs. They
 * are demo values — Boral supplies no live process data — which the footer and
 * the header note both state.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

import { DRIFTING, TWIN_CARDS } from "@/lib/assets/twin-cards"
import { NODE_LIFT, node } from "@/lib/twin/process-layout"
import { usePiles } from "@/components/shell/pile-store"
import { PlantScene } from "./PlantScene"
import { TwinCards } from "./TwinCards"
import { createHandles, type AnnotationHandles } from "./projection"
import { MapControls, StatusLegend } from "./TwinChrome"

const CAMERA_START: [number, number, number] = [-70, 700, 800]
const TARGET = new THREE.Vector3(10, 30, 30)

export function DigitalTwinView() {
  const { selectedId, select, live } = usePiles()
  // Shared with the render loop; never a React state update per frame.
  const handles = useRef<AnnotationHandles>(createHandles())
  const [metrics, setMetrics] = useState<Record<string, string>>({})
  const [hovered, setHovered] = useState<string | null>(null)
  const controls = useRef<OrbitControlsImpl | null>(null)
  const host = useRef<HTMLDivElement>(null)

  /* Live process metrics — demo drift around the configured baseline. */
  useEffect(() => {
    if (!live) return
    const tick = () => {
      const next: Record<string, string> = {}
      for (const [id, d] of Object.entries(DRIFTING)) {
        const jitter = (Math.random() - 0.5) * d.base * 0.06
        const value = d.base + jitter
        next[id] =
          (d.dp ? value.toFixed(d.dp) : Math.round(value).toLocaleString()) + d.unit
      }
      setMetrics(next)
    }
    tick()
    const t = setInterval(tick, 3000)
    return () => clearInterval(t)
  }, [live])

  const zoom = useCallback((delta: number) => {
    const c = controls.current
    if (!c) return
    const cam = c.object
    const dir = cam.position.clone().sub(c.target)
    dir.multiplyScalar(delta > 0 ? 1.18 : 0.85)
    const len = THREE.MathUtils.clamp(dir.length(), 120, 1100)
    cam.position.copy(c.target).add(dir.setLength(len))
    c.update()
  }, [])

  const fullscreen = useCallback(() => {
    const el = host.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }, [])

  return (
    <div ref={host} className="absolute inset-0 bg-[#0a1018]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: CAMERA_START, fov: 36, near: 1, far: 9000 }}
        onPointerMissed={() => select("")}
      >
        <color attach="background" args={["#0a1018"]} />
        <fog attach="fog" args={["#0a1018", 1500, 3200]} />

        <hemisphereLight args={["#cfe0ff", "#0a1018", 1.05]} />
        <directionalLight
          position={[420, 640, 380]}
          intensity={2.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-900}
          shadow-camera-right={900}
          shadow-camera-top={900}
          shadow-camera-bottom={-900}
          shadow-camera-far={2600}
        />
        <directionalLight position={[-260, 190, -220]} intensity={0.6} color="#88a6ff" />
        <Environment preset="night" />

        <PlantScene />

        {/* Invisible pick volumes over each unit, so hovering the equipment
            itself opens its card — not just the tag floating above it. */}
        <HoverTargets onHover={setHovered} onSelect={select} />

        <ContactShadows position={[0, 1.4, 20]} scale={1800} far={260} opacity={0.45} blur={2.6} />

        <OrbitControls
          ref={controls}
          makeDefault
          target={TARGET}
          enableDamping
          dampingFactor={0.08}
          minDistance={260}
          maxDistance={2400}
          maxPolarAngle={Math.PI / 2.15}
        />

        <ProjectionDriver handles={handles.current} />
      </Canvas>

      <TwinCards
        handles={handles.current}
        metrics={metrics}
        selected={selectedId}
        onSelect={select}
        hovered={hovered}
        onHover={setHovered}
      />

      <StatusLegend />
      <MapControls onZoom={zoom} onFullscreen={fullscreen} />
    </div>
  )
}

/**
 * Pick volumes. Each unit gets an invisible box sized to roughly cover it, so
 * pointing at the plant highlights the right unit. Picking these is cheaper and
 * far more predictable than raycasting the detailed meshes.
 */
function HoverTargets({
  onHover,
  onSelect,
}: {
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  return (
    <>
      {TWIN_CARDS.map((card) => {
        const n = node(card.id)
        const lift = NODE_LIFT[card.id] ?? 30
        const size = PICK_SIZE[card.id] ?? [110, 110]
        return (
          <mesh
            key={card.id}
            position={[n.x, lift / 2, n.z]}
            onPointerOver={(e) => {
              e.stopPropagation()
              onHover(card.id)
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(card.id)
            }}
          >
            <boxGeometry args={[size[0], Math.max(lift, 40), size[1]]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )
      })}
    </>
  )
}

/** Footprint of each pick volume, in scene units. */
const PICK_SIZE: Record<string, [number, number]> = {
  "PILE-RM-01": [210, 90],
  "PILE-RM-02": [150, 80],
  "PILE-AF": [150, 80],
  "PILE-COAL": [150, 80],
  "PILE-RM-07": [210, 90],
  "CR-01": [70, 60],
  "RM-01": [140, 70],
  "GEO-01": [110, 70],
  "PH-01": [70, 70],
  "KLN-01": [320, 80],
  "CC-01": [95, 60],
  "SL-GRP": [150, 70],
  "PK-01": [125, 75],
  "UT-01": [80, 55],
  "ADMIN-01": [95, 45],
  "BYPASS-DUST": [70, 70],
}

/**
 * Writes tag and card positions straight to the DOM each frame.
 *
 * Publishing camera state into React and re-rendering was a frame or more
 * behind the canvas, so tags slid off their units during an orbit. Projecting
 * here and setting `transform` directly keeps them locked to the geometry.
 */
function ProjectionDriver({ handles }: { handles: AnnotationHandles }) {
  const { camera, size } = useThree()
  const v = useRef(new THREE.Vector3())

  useFrame(() => {
    const { width, height } = size
    if (width === 0) return

    for (const card of TWIN_CARDS) {
      const el = handles.tags[card.id]
      const n = node(card.id)
      v.current.set(n.x, NODE_LIFT[card.id] ?? card.lift, n.z).project(camera)

      const x = ((v.current.x + 1) / 2) * width
      const y = ((1 - v.current.y) / 2) * height
      const visible = v.current.z < 1
      handles.anchors[card.id] = { x, y, visible }

      if (!el) continue
      // Behind the camera, or far outside the frame: hide rather than smear a
      // tag across the edge of the screen.
      const off = !visible || x < -160 || x > width + 160 || y < -120 || y > height + 120
      el.style.visibility = off ? "hidden" : "visible"
      if (off) continue
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`
    }

    const cardEl = handles.card
    const activeId = handles.activeId
    if (cardEl && activeId) {
      const a = handles.anchors[activeId]
      if (a) {
        const w = cardEl.offsetWidth || 246
        const h = cardEl.offsetHeight || 160
        // Open to whichever side has room, and stay inside the frame.
        const flip = a.x > width - w - 40
        const left = Math.max(12, Math.min(flip ? a.x - w - 22 : a.x + 22, width - w - 12))
        const top = Math.max(12, Math.min(a.y - 24, height - h - 88))
        cardEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`
        cardEl.style.visibility = a.visible ? "visible" : "hidden"
      }
    }
  })

  return null
}

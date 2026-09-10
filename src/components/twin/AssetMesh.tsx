"use client"

/**
 * 3D geometry per asset type (spec §8).
 *
 * Stylised, low-poly volumes built from primitives — a kiln is an inclined tube
 * on piers, a silo is a cylinder with a cone roof, a pile is a cone, a dome is a
 * hemisphere. These convey what KIND of equipment is there, which is what we
 * actually know. They are not engineering geometry and must not be read as such.
 *
 * Everything is positioned from the asset's real lat/lng through the shared
 * projection, so the 3D scene cannot drift from the map.
 */

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Mesh, Group } from "three"
import * as THREE from "three"

import type { TwinAsset } from "@/lib/assets/types"
import { toWorld } from "@/lib/map/projection"
import { colorFor } from "@/lib/twin/palette"

/**
 * Vertical exaggeration. Berrima is ~1.3 km across while its structures are
 * 8-90 m tall, so at true scale the plant reads as specks on a plain. Standard
 * practice for site-scale twins: exaggerate height so equipment is legible.
 * Plan position and footprint stay true — only height is scaled.
 */
export const HEIGHT_GAIN = 2.6

export function AssetMesh({
  asset,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  asset: TwinAsset
  selected: boolean
  hovered: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const group = useRef<Group>(null)
  const [x, , z] = toWorld(asset.position)
  const base = colorFor(asset.type, asset.assetId)

  const colour = useMemo(() => {
    const c = new THREE.Color(base)
    if (hovered && !selected) c.offsetHSL(0, 0, 0.12)
    return c
  }, [base, hovered, selected])

  // Selected assets breathe gently — enough to find them, not a game effect.
  useFrame(({ clock }) => {
    if (!group.current || !selected) return
    const t = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.02
    group.current.scale.setScalar(t)
  })

  const emissive = selected ? base : "#000000"
  const emissiveIntensity = selected ? 0.55 : 0

  const material = (
    <meshStandardMaterial
      color={colour}
      roughness={0.72}
      metalness={0.08}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
    />
  )

  const handlers = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      onHover(asset.assetId)
    },
    onPointerOut: () => onHover(null),
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      onSelect(asset.assetId)
    },
  }

  const yaw = THREE.MathUtils.degToRad(90 - (asset.bearingDegrees ?? 0))

  return (
    <group ref={group} position={[x, 0, z]} rotation={[0, yaw, 0]} {...handlers}>
      {renderBody(asset, material)}
    </group>
  )
}

function renderBody(asset: TwinAsset, material: React.ReactNode) {
  const h = Math.max(2, Math.abs(asset.heightMetres) || 8) * HEIGHT_GAIN
  const r = asset.radiusMetres ?? (asset.widthMetres ?? 20) / 2
  const len = asset.lengthMetres ?? asset.widthMetres ?? 30

  switch (asset.type) {
    case "KILN":
      return (
        <group>
          {/* Inclined rotary tube with tyre rings and support piers. */}
          <mesh castShadow receiveShadow position={[0, h * 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[h * 0.26, h * 0.26, len, 24]} />
            {material}
          </mesh>
          {[-0.32, 0, 0.32].map((t) => (
            <mesh key={t} position={[len * t, h * 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[h * 0.32, h * 0.32, h * 0.16, 24]} />
              {material}
            </mesh>
          ))}
          {[-0.34, 0.34].map((t) => (
            <mesh key={t} castShadow position={[len * t, h * 0.4, 0]}>
              <boxGeometry args={[h * 0.28, h * 0.8, h * 0.5]} />
              {material}
            </mesh>
          ))}
        </group>
      )

    case "SILO": {
      // Big domed stores render as a dome; slender silos as cylinder + cone.
      const domed = r > 30
      if (domed) {
        return (
          <group>
            <mesh castShadow receiveShadow position={[0, h * 0.18, 0]}>
              <cylinderGeometry args={[r, r, h * 0.36, 40]} />
              {material}
            </mesh>
            <mesh castShadow position={[0, h * 0.36, 0]} scale={[1, 0.62, 1]}>
              <sphereGeometry args={[r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
              {material}
            </mesh>
          </group>
        )
      }
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
            <cylinderGeometry args={[r, r, h, 28]} />
            {material}
          </mesh>
          <mesh castShadow position={[0, h + h * 0.07, 0]}>
            <coneGeometry args={[r * 1.08, h * 0.14, 28]} />
            {material}
          </mesh>
        </group>
      )
    }

    case "STOCKPILE":
      return (
        <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
          <coneGeometry args={[r, h, 32]} />
          {material}
        </mesh>
      )

    case "TRANSFER_POINT":
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, h * 0.3, 0]}>
            <boxGeometry args={[asset.widthMetres ?? 30, h * 0.6, 8]} />
            {material}
          </mesh>
        </group>
      )

    case "MILL":
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, h * 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[h * 0.36, h * 0.36, len * 0.8, 24]} />
            {material}
          </mesh>
          <mesh castShadow receiveShadow position={[0, h * 0.1, 0]}>
            <boxGeometry args={[len * 0.9, h * 0.2, r * 1.6]} />
            {material}
          </mesh>
        </group>
      )

    case "CRUSHER":
      return (
        <group>
          <mesh castShadow position={[0, h * 0.72, 0]}>
            <cylinderGeometry args={[r * 0.9, r * 0.3, h * 0.55, 4]} />
            {material}
          </mesh>
          <mesh castShadow receiveShadow position={[0, h * 0.22, 0]}>
            <boxGeometry args={[r * 1.2, h * 0.45, r * 1.2]} />
            {material}
          </mesh>
        </group>
      )

    case "PROCESS_AREA": {
      // Excavations read as stepped pits; everything else as stepped towers.
      if (asset.heightMetres < 0) {
        // Excavation. Drawn as flat terraces stepping INWARD just above ground
        // rather than solids below it: the ground plane would hide a true pit,
        // and stacked cones at this radius z-fight badly.
        const rings = 5
        return (
          <group>
            {Array.from({ length: rings }, (_, i) => {
              const outer = r * (1 - i * 0.18)
              const inner = r * (1 - (i + 1) * 0.18)
              return (
                <mesh
                  key={i}
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[0, 0.4 + i * 0.35, 0]}
                  receiveShadow
                >
                  <ringGeometry args={[Math.max(0, inner), outer, 64]} />
                  <meshStandardMaterial
                    color={new THREE.Color("#7a4f57").lerp(new THREE.Color("#1b1216"), i * 0.19)}
                    roughness={1}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )
            })}
            {/* Standing water in the floor of the void. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2.4, 0]}>
              <circleGeometry args={[r * 0.1, 48]} />
              <meshStandardMaterial color="#14323f" roughness={0.25} metalness={0.4} />
            </mesh>
          </group>
        )
      }
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
            <boxGeometry args={[(asset.widthMetres ?? 20) * 0.8, h, (asset.widthMetres ?? 20) * 0.8]} />
            {material}
          </mesh>
          <mesh castShadow position={[(asset.widthMetres ?? 20) * 0.55, h * 0.34, 0]}>
            <boxGeometry args={[(asset.widthMetres ?? 20) * 0.4, h * 0.68, (asset.widthMetres ?? 20) * 0.5]} />
            {material}
          </mesh>
        </group>
      )
    }

    case "LOADING_AREA":
      return (
        <group>
          <mesh castShadow position={[0, h * 0.92, 0]}>
            <boxGeometry args={[asset.widthMetres ?? 40, 2.5, (asset.widthMetres ?? 40) * 0.5]} />
            {material}
          </mesh>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} castShadow position={[(sx * (asset.widthMetres ?? 40)) / 2.4, h * 0.46, (sz * (asset.widthMetres ?? 40)) * 0.2]}>
                <boxGeometry args={[2.5, h * 0.92, 2.5]} />
                {material}
              </mesh>
            )),
          )}
        </group>
      )

    case "UTILITY":
      if (asset.radiusMetres) {
        // Ponds: a thin disc at ground level.
        return (
          <mesh receiveShadow position={[0, 0.6, 0]}>
            <cylinderGeometry args={[r, r, 1.2, 32]} />
            <meshStandardMaterial color="#2a6f97" roughness={0.2} metalness={0.4} />
          </mesh>
        )
      }
      return (
        <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
          <boxGeometry args={[asset.widthMetres ?? 20, h, (asset.widthMetres ?? 20) * 0.5]} />
          {material}
        </mesh>
      )

    case "CONVEYOR":
      return (
        <mesh castShadow position={[0, h, 0]} rotation={[0, 0, 0]}>
          <boxGeometry args={[len, 3, 5]} />
          {material}
        </mesh>
      )

    default:
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
            <boxGeometry args={[asset.widthMetres ?? 30, h, (asset.widthMetres ?? 30) * 0.42]} />
            {material}
          </mesh>
          <mesh castShadow position={[0, h + h * 0.12, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[(asset.widthMetres ?? 30) * 0.32, h * 0.24, 4]} />
            {material}
          </mesh>
        </group>
      )
  }
}

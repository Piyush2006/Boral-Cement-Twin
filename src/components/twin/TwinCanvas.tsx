"use client"

/**
 * 3D Digital Twin view (spec §2 Mode B, §26).
 *
 * The scene is in local ENU metres derived from each asset's real lat/lng, so it
 * is spatially aligned with the site rather than being a generic cement factory.
 * Ground is neutral — satellite imagery is the geographic reference, not the
 * model (§8), and bundling tiles as a texture is not permitted (§31).
 */

import { Suspense, useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { ContactShadows, Environment, Html, Line, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

import { visibleAssets } from "@/lib/assets/selectors"
import type { TwinAsset } from "@/lib/assets/types"
import { toWorld } from "@/lib/map/projection"
import { colorFor } from "@/lib/twin/palette"
import { useTwin } from "@/components/shell/twin-store"
import { AssetMesh, HEIGHT_GAIN } from "./AssetMesh"
import { TwinAnnotations } from "./TwinAnnotations"

export type CameraPreset = "reset" | "top" | "operator"

export function TwinCanvas() {
  const twin = useTwin()
  const { assets, layers, links, selectedId, hoveredId, focusNonce, select, setHoveredId } = twin

  // Piles and the quarry are drawn by TwinAnnotations from the pile registry —
  // exclude them here so the scene never shows two of the same thing.
  const shown = useMemo(
    () =>
      visibleAssets(layers, assets).filter(
        (a) => a.type !== "STOCKPILE" && !a.assetId.startsWith("QUARRY"),
      ),
    [layers, assets],
  )

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [700, 520, 860], fov: 42, near: 1, far: 14000 }}
      onPointerMissed={() => select(null)}
      className="absolute inset-0"
    >
      <color attach="background" args={["#070b11"]} />
      <fog attach="fog" args={["#070b11", 1400, 3200]} />

      <hemisphereLight args={["#dce7f5", "#0d1620", 1.1]} />
      <directionalLight
        position={[420, 620, 260]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-900}
        shadow-camera-right={900}
        shadow-camera-top={900}
        shadow-camera-bottom={-900}
        shadow-camera-far={2200}
      />
      <directionalLight position={[-380, 260, -320]} intensity={0.5} />

      <Suspense fallback={null}>
        <Environment preset="dawn" />
      </Suspense>

      <Ground />
      <gridHelper args={[2400, 48, "#1d2836", "#161e29"]} position={[0, 0.2, 0]} />

      {shown.map((asset) => (
        <AssetMesh
          key={asset.assetId}
          asset={asset}
          selected={asset.assetId === selectedId}
          hovered={asset.assetId === hoveredId}
          onSelect={select}
          onHover={setHoveredId}
        />
      ))}

      {layers.materialFlow && <FlowLines assets={shown} links={links} />}

      {/* Tagged piles and equipment, shared with the satellite view. */}
      <TwinAnnotations />

      <ContactShadows position={[0, 0.1, 0]} scale={2200} far={140} opacity={0.5} blur={2.4} />

      <CameraRig selectedId={selectedId} focusNonce={focusNonce} assets={assets} />
    </Canvas>
  )
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[6000, 6000]} />
      <meshStandardMaterial color="#0f151d" roughness={1} metalness={0} />
    </mesh>
  )
}

/**
 * Process relationships (§25): drawn as thin dashed ribbons above the ground.
 * Indicative only — the client annotation marks conveyors as indicative too.
 */
function FlowLines({
  assets,
  links,
}: {
  assets: TwinAsset[]
  links: { from: string; to: string }[]
}) {
  const byId = useMemo(() => new Map(assets.map((a) => [a.assetId, a])), [assets])
  return (
    <>
      {links.map((link, i) => {
        const a = byId.get(link.from)
        const b = byId.get(link.to)
        if (!a || !b) return null
        const [ax, , az] = toWorld(a.position)
        const [bx, , bz] = toWorld(b.position)
        const lift = 70
        const mid = new THREE.Vector3((ax + bx) / 2, lift + 40, (az + bz) / 2)
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(ax, lift, az),
          mid,
          new THREE.Vector3(bx, lift, bz),
        )
        return (
          <Line
            key={`${link.from}-${link.to}-${i}`}
            points={curve.getPoints(28)}
            color="#38bdf8"
            lineWidth={1.4}
            dashed
            dashSize={12}
            gapSize={9}
            transparent
            opacity={0.65}
          />
        )
      })}
    </>
  )
}

/** HTML labels in the scene, hidden behind geometry via drei's occlusion. */
function SceneLabels({
  assets,
  selectedId,
  onSelect,
}: {
  assets: TwinAsset[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const major = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.assetId === selectedId ||
          a.type === "KILN" ||
          a.type === "MILL" ||
          a.type === "CRUSHER" ||
          a.type === "LOADING_AREA" ||
          // Only the larger stores and piles; small ones crowd the core.
          ((a.type === "SILO" || a.type === "STOCKPILE") && (a.radiusMetres ?? 0) >= 40),
      ),
    [assets, selectedId],
  )

  return (
    <>
      {major.map((asset) => {
        const [x, , z] = toWorld(asset.position)
        const y = Math.max(14, Math.abs(asset.heightMetres)) * HEIGHT_GAIN + 34
        const selected = asset.assetId === selectedId
        const colour = colorFor(asset.type, asset.assetId)
        return (
          <Html
            key={asset.assetId}
            position={[x, y, z]}
            center
            distanceFactor={260}
            zIndexRange={[40, 0]}
            style={{ pointerEvents: "auto" }}
          >
            <button
              onClick={() => onSelect(asset.assetId)}
              style={{
                whiteSpace: "nowrap",
                padding: "3px 9px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: selected ? 700 : 550,
                color: selected ? "#08141c" : "#e9eef5",
                background: selected ? colour : "rgba(9,13,19,.86)",
                border: `1px solid ${colour}`,
                cursor: "pointer",
              }}
            >
              {asset.name}
            </button>
          </Html>
        )
      })}
    </>
  )
}

/** Smooth fly-to on selection (§17.6, §26). */
function CameraRig({
  selectedId,
  focusNonce,
  assets,
}: {
  selectedId: string | null
  focusNonce: number
  assets: TwinAsset[]
}) {
  const controls = useRef<OrbitControlsImpl>(null)
  const target = useRef<THREE.Vector3 | null>(null)
  const camTarget = useRef<THREE.Vector3 | null>(null)
  const { camera } = useThree()

  useEffect(() => {
    if (!selectedId) return
    const asset = assets.find((a) => a.assetId === selectedId)
    if (!asset) return
    const [x, , z] = toWorld(asset.position)
    const look = new THREE.Vector3(x, Math.abs(asset.heightMetres) * 0.4, z)
    target.current = look
    // Approach from the current direction so the camera never spins wildly.
    // Stand off by the asset's own size so a 70 m pile and a 90 m tower are
    // both framed, instead of the camera ending up inside the geometry.
    const extent = Math.max(
      asset.radiusMetres ?? 0,
      (asset.lengthMetres ?? asset.widthMetres ?? 30) / 2,
      Math.abs(asset.heightMetres),
    )
    const standoff = THREE.MathUtils.clamp(extent * 6, 260, 700)
    const dir = camera.position.clone().sub(controls.current?.target ?? new THREE.Vector3())
    dir.setLength(standoff)
    camTarget.current = look.clone().add(dir)
  }, [focusNonce, selectedId, assets, camera])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return
    const k = 1 - Math.pow(0.001, delta)
    if (target.current) {
      c.target.lerp(target.current, k)
      if (c.target.distanceTo(target.current) < 0.6) target.current = null
    }
    if (camTarget.current) {
      camera.position.lerp(camTarget.current, k)
      if (camera.position.distanceTo(camTarget.current) < 0.6) camTarget.current = null
    }
    c.update()
  })

  useEffect(() => {
    cameraPresets.apply = (preset: CameraPreset) => {
      const c = controls.current
      if (!c) return
      target.current = new THREE.Vector3(0, 0, 0)
      if (preset === "top") camTarget.current = new THREE.Vector3(0, 1150, 1)
      else if (preset === "operator") camTarget.current = new THREE.Vector3(420, 120, 560)
      else camTarget.current = new THREE.Vector3(700, 520, 860)
    }
    return () => {
      cameraPresets.apply = () => {}
    }
  }, [])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={60}
      maxDistance={2200}
      maxPolarAngle={Math.PI / 2.05}
    />
  )
}

export const cameraPresets: { apply: (preset: CameraPreset) => void } = { apply: () => {} }

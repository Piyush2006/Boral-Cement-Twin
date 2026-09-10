"use client"

/**
 * Berrima plant model, laid out along the process line.
 *
 * Geometry is stylised but industrially correct in KIND: the kiln is a long
 * inclined rotary cylinder on piers with tyre rings, mills are horizontal tube
 * cylinders, silos are tall cylinders with cone roofs, and units are joined by
 * elevated conveyor galleries and ducts so the route reads end to end.
 *
 * This is not engineering geometry (§8) — it conveys what each unit is and how
 * material moves between them.
 */

import { useMemo } from "react"
import * as THREE from "three"

import { PILES } from "@/lib/assets/piles"
import { materialColour } from "@/lib/assets/materials"
import { LINKS, NODE, node } from "@/lib/twin/process-layout"

const SHELL = "#d7dfeb"
const SHELL_DARK = "#aab6c8"
const BLUE = "#2f63e8"
const BLUE_DEEP = "#1e40b8"
const STEEL = "#7f8da0"
const RUST = "#9c5b3f"
const RUST_HOT = "#b8683f"
const PAD = "#232c39"

function useMats() {
  return useMemo(
    () => ({
      shell: new THREE.MeshStandardMaterial({ color: SHELL, roughness: 0.55, metalness: 0.12 }),
      shellDark: new THREE.MeshStandardMaterial({ color: SHELL_DARK, roughness: 0.65, metalness: 0.1 }),
      blue: new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.38, metalness: 0.2 }),
      deep: new THREE.MeshStandardMaterial({ color: BLUE_DEEP, roughness: 0.35, metalness: 0.25 }),
      steel: new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.5, metalness: 0.35 }),
      rust: new THREE.MeshStandardMaterial({ color: RUST, roughness: 0.72, metalness: 0.18 }),
      rustHot: new THREE.MeshStandardMaterial({
        color: RUST_HOT,
        roughness: 0.6,
        metalness: 0.15,
        emissive: new THREE.Color("#5a2410"),
        emissiveIntensity: 0.35,
      }),
      pad: new THREE.MeshStandardMaterial({ color: PAD, roughness: 1 }),
    }),
    [],
  )
}

type M = ReturnType<typeof useMats>

export function PlantScene() {
  const m = useMats()
  return (
    <group>
      <Ground m={m} />
      {LINKS.map((l) => (
        <Connector key={`${l.from}-${l.to}`} m={m} from={node(l.from)} to={node(l.to)} kind={l.kind} />
      ))}

      <Stockyard />
      <Crusher m={m} at={NODE["CR-01"]} />
      <Geocycle m={m} at={NODE["GEO-01"]} />
      <TubeMill m={m} at={NODE["RM-01"]} rot={-0.28} len={110} r={21} />
      <PreheaterTower m={m} at={NODE["PH-01"]} />
      <Kiln m={m} at={NODE["KLN-01"]} />
      <Cooler m={m} at={NODE["CC-01"]} />
      <SiloGroup m={m} at={NODE["SL-GRP"]} />
      <Packing m={m} at={NODE["PK-01"]} />
      <Utilities m={m} at={NODE["UT-01"]} />
      <AdminBlock m={m} at={NODE["ADMIN-01"]} />
      <DustPile m={m} at={NODE["BYPASS-DUST"]} />
    </group>
  )
}

type At = { at: { x: number; z: number }; m: M }

function Ground({ m }: { m: M }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1500, 72]} />
        <meshStandardMaterial color="#121a25" roughness={1} />
      </mesh>
      {/* Works platform under the process line. */}
      <mesh position={[0, 0.5, 20]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={m.pad}>
        <planeGeometry args={[1420, 620]} />
      </mesh>
    </group>
  )
}

/** Elevated conveyor gallery / duct / pipe between two units. */
function Connector({
  m,
  from,
  to,
  kind,
}: {
  m: M
  from: { x: number; z: number }
  to: { x: number; z: number }
  kind: "gallery" | "duct" | "pipe"
}) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  if (len < 1) return null
  const angle = Math.atan2(dz, dx)
  const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }

  const y = kind === "pipe" ? 26 : kind === "duct" ? 40 : 30
  const w = kind === "pipe" ? 3 : kind === "duct" ? 5.5 : 6.5
  const mat = kind === "pipe" ? m.steel : m.blue
  const legs = Math.max(2, Math.round(len / 70))

  return (
    <group position={[mid.x, 0, mid.z]} rotation={[0, -angle, 0]}>
      {kind === "pipe" ? (
        <mesh position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={mat}>
          <cylinderGeometry args={[w / 2, w / 2, len, 18]} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, y, 0]} castShadow material={mat}>
            <boxGeometry args={[len, w * 0.8, w]} />
          </mesh>
          <mesh position={[0, y + w * 0.48, 0]} material={m.deep}>
            <boxGeometry args={[len, 0.9, w + 0.5]} />
          </mesh>
        </>
      )}
      {Array.from({ length: legs }, (_, i) => {
        const t = (i + 0.5) / legs - 0.5
        return (
          <mesh key={i} position={[t * len, y / 2, 0]} castShadow material={m.steel}>
            <boxGeometry args={[1.6, y, 1.6]} />
          </mesh>
        )
      })}
    </group>
  )
}

function Crusher({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 20, 0]} castShadow receiveShadow material={m.shell}>
        <boxGeometry args={[62, 40, 48]} />
      </mesh>
      {/* Feed hopper. */}
      <mesh position={[0, 50, 0]} castShadow material={m.blue}>
        <cylinderGeometry args={[26, 12, 22, 4]} />
      </mesh>
      <mesh position={[0, 41, 0]} material={m.deep}>
        <boxGeometry args={[64, 4, 50]} />
      </mesh>
      <mesh position={[26, 12, 22]} castShadow material={m.shellDark}>
        <boxGeometry args={[20, 24, 16]} />
      </mesh>
    </group>
  )
}

/** Horizontal tube mill: cylinder shell with blue bands and an end drive. */
function TubeMill({ m, at, rot, len, r }: At & { rot: number; len: number; r: number }) {
  return (
    <group position={[at.x, 0, at.z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 3, 0]} receiveShadow material={m.pad}>
        <boxGeometry args={[len + 34, 6, r * 3.6]} />
      </mesh>
      <mesh position={[0, r + 10, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={m.shell}>
        <cylinderGeometry args={[r, r, len, 34]} />
      </mesh>
      {[-0.3, -0.1, 0.1, 0.3].map((t) => (
        <mesh key={t} position={[len * t, r + 10, 0]} rotation={[0, 0, Math.PI / 2]} material={m.blue}>
          <cylinderGeometry args={[r * 1.05, r * 1.05, len * 0.09, 34]} />
        </mesh>
      ))}
      <mesh position={[len * 0.62, r + 10, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={m.deep}>
        <cylinderGeometry args={[r * 0.55, r * 0.55, len * 0.16, 22]} />
      </mesh>
    </group>
  )
}

/** Stepped preheater tower with cyclone stack — the tallest thing on site. */
function PreheaterTower({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 70, 0]} castShadow receiveShadow material={m.shell}>
        <boxGeometry args={[46, 140, 46]} />
      </mesh>
      {[26, 54, 82, 110].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={m.blue}>
          <boxGeometry args={[48, 4.5, 48]} />
        </mesh>
      ))}
      <mesh position={[36, 82, 10]} castShadow material={m.shell}>
        <cylinderGeometry args={[13, 15, 164, 26]} />
      </mesh>
      {[38, 82, 126].map((y) => (
        <mesh key={y} position={[36, y, 10]} material={m.blue}>
          <cylinderGeometry args={[14, 14, 9, 26]} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Rotary kiln — the hero of the plant. A long inclined cylinder on piers with
 * tyre rings, a firing hood at the discharge end, and a warm shell.
 */
function Kiln({ m, at }: At) {
  const len = 300
  const r = 24
  return (
    <group position={[at.x, 0, at.z]} rotation={[0, -0.42, 0]}>
      <mesh position={[0, 2.5, 0]} receiveShadow material={m.pad}>
        <boxGeometry args={[len + 60, 5, r * 3.4]} />
      </mesh>

      <mesh position={[0, 46, 0]} rotation={[0, 0, Math.PI / 2 + 0.035]} castShadow material={m.rust}>
        <cylinderGeometry args={[r, r, len, 44]} />
      </mesh>

      {[-0.34, -0.12, 0.12, 0.34].map((t) => (
        <mesh
          key={t}
          position={[len * t, 46 - len * t * 0.035, 0]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          material={m.steel}
        >
          <cylinderGeometry args={[r * 1.16, r * 1.16, 12, 44]} />
        </mesh>
      ))}

      {[-0.34, 0.12].map((t) => (
        <mesh key={t} position={[len * t, 21, 0]} castShadow material={m.shellDark}>
          <boxGeometry args={[22, 44, 62]} />
        </mesh>
      ))}

      {/* Firing hood + burner floor at the discharge end. */}
      <mesh position={[len * 0.56, 44, 0]} castShadow material={m.shell}>
        <boxGeometry args={[56, 66, 62]} />
      </mesh>
      <mesh position={[len * 0.56, 44, 0]} material={m.rustHot}>
        <boxGeometry args={[57, 22, 63]} />
      </mesh>
      {/* Feed end housing. */}
      <mesh position={[-len * 0.56, 50, 0]} castShadow material={m.shellDark}>
        <boxGeometry args={[46, 74, 56]} />
      </mesh>
    </group>
  )
}

/** Geocycle co-processing: reception hall with an AF feed silo and duct. */
function Geocycle({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 21, 0]} castShadow receiveShadow material={m.shell}>
        <boxGeometry args={[104, 42, 58]} />
      </mesh>
      <mesh position={[0, 44, 0]} castShadow material={m.blue}>
        <boxGeometry args={[106, 6, 60]} />
      </mesh>
      {/* Solid-recovered-fuel dosing silo. */}
      <mesh position={[44, 36, -8]} castShadow material={m.shell}>
        <cylinderGeometry args={[15, 15, 72, 30]} />
      </mesh>
      <mesh position={[44, 58, -8]} material={m.blue}>
        <cylinderGeometry args={[15.6, 15.6, 8, 30]} />
      </mesh>
      <mesh position={[44, 75, -8]} castShadow material={m.deep}>
        <coneGeometry args={[16, 10, 30]} />
      </mesh>
      {/* Tipping doors. */}
      {[-30, 0].map((dx) => (
        <mesh key={dx} position={[dx, 11, 30]} castShadow material={m.deep}>
          <boxGeometry args={[22, 22, 3]} />
        </mesh>
      ))}
    </group>
  )
}

function Cooler({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 20, 0]} castShadow receiveShadow material={m.shell}>
        <boxGeometry args={[86, 40, 54]} />
      </mesh>
      <mesh position={[0, 45, 0]} castShadow material={m.blue}>
        <boxGeometry args={[72, 14, 44]} />
      </mesh>
      {[-24, 0, 24].map((dx) => (
        <mesh key={dx} position={[dx, 60, 0]} castShadow material={m.steel}>
          <cylinderGeometry args={[6, 6, 18, 18]} />
        </mesh>
      ))}
    </group>
  )
}

/** Three tall cement silos: cylinders with cone roofs and a common gallery. */
function SiloGroup({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      {[-52, 0, 52].map((dx, i) => {
        const h = 118 + (i === 1 ? 8 : 0)
        return (
          <group key={dx} position={[dx, 0, 0]}>
            <mesh position={[0, h / 2, 0]} castShadow receiveShadow material={m.shell}>
              <cylinderGeometry args={[24, 24, h, 40]} />
            </mesh>
            {[0.24, 0.52, 0.8].map((t) => (
              <mesh key={t} position={[0, h * t, 0]} material={m.blue}>
                <cylinderGeometry args={[24.6, 24.6, h * 0.07, 40]} />
              </mesh>
            ))}
            <mesh position={[0, h + 7, 0]} castShadow material={m.deep}>
              <coneGeometry args={[25.5, 15, 40]} />
            </mesh>
            <mesh position={[0, 4, 0]} receiveShadow material={m.pad}>
              <cylinderGeometry args={[29, 29, 8, 40]} />
            </mesh>
          </group>
        )
      })}
      {/* Gallery across the silo tops. */}
      <mesh position={[0, 128, 0]} castShadow material={m.blue}>
        <boxGeometry args={[128, 9, 13]} />
      </mesh>
    </group>
  )
}

function Packing({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 20, 0]} castShadow receiveShadow material={m.shell}>
        <boxGeometry args={[118, 40, 66]} />
      </mesh>
      <mesh position={[0, 42, 0]} castShadow material={m.blue}>
        <boxGeometry args={[120, 5, 68]} />
      </mesh>
      {[-34, 0, 34].map((dx) => (
        <mesh key={dx} position={[dx, 10, 40]} castShadow material={m.shellDark}>
          <boxGeometry args={[24, 20, 14]} />
        </mesh>
      ))}
    </group>
  )
}

function Utilities({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 14, 0]} castShadow receiveShadow material={m.shell}>
        <boxGeometry args={[70, 28, 46]} />
      </mesh>
      <mesh position={[0, 29, 0]} material={m.blue}>
        <boxGeometry args={[72, 4, 48]} />
      </mesh>
      {[-18, 6].map((dx) => (
        <mesh key={dx} position={[dx, 38, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={m.deep}>
          <cylinderGeometry args={[8, 8, 26, 22]} />
        </mesh>
      ))}
    </group>
  )
}

function AdminBlock({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 13, 0]} castShadow receiveShadow material={m.shell}>
        <boxGeometry args={[86, 26, 38]} />
      </mesh>
      <mesh position={[0, 27, 0]} material={m.deep}>
        <boxGeometry args={[88, 3, 40]} />
      </mesh>
    </group>
  )
}

function DustPile({ m, at }: At) {
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position={[0, 11, 0]} castShadow receiveShadow>
        <coneGeometry args={[30, 22, 28]} />
        <meshStandardMaterial color="#9aa4b3" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.8, 0]} receiveShadow material={m.pad}>
        <cylinderGeometry args={[38, 38, 1.6, 28]} />
      </mesh>
    </group>
  )
}

/**
 * Raw material stockyard: long windrows on pads, as Berrima's yard is worked,
 * with a stacker boom over the largest row.
 */
function Stockyard() {
  return (
    <group>
      {PILES.map((p) => {
        const n = NODE[p.pileId] ?? NODE[pileKey(p.pileId)]
        if (!n) return null
        const colour = materialColour(p.materialId)
        const long = p.pileId === "PILE-RM-07" || p.pileId === "PILE-RM-01"
        const len = long ? 190 : 130
        const w = long ? 52 : 40
        const h = long ? 34 : 27
        return (
          <group key={p.pileId} position={[n.x, 0, n.z]} rotation={[0, long ? 0.12 : -0.1, 0]}>
            <mesh position={[0, 0.8, 0]} receiveShadow>
              <boxGeometry args={[len + 30, 1.6, w + 26]} />
              <meshStandardMaterial color="#232c39" roughness={1} />
            </mesh>
            {/* Ridge: a trapezoidal prism, tapering to a crest along the row. */}
            <mesh position={[0, h / 2 + 1, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[w * 0.1, w / 2, h, 4, 1, false, Math.PI / 4]} />
              <meshStandardMaterial color={colour} roughness={0.95} />
            </mesh>
            {[-1, 1].map((sx) => (
              <mesh
                key={sx}
                position={[(sx * (len - w)) / 2, h / 2 + 1, 0]}
                castShadow
                receiveShadow
              >
                <cylinderGeometry args={[w * 0.1, w / 2, h, 4, 1, false, Math.PI / 4]} />
                <meshStandardMaterial color={colour} roughness={0.95} />
              </mesh>
            ))}
            {/* Crest joining the two ends. */}
            <mesh position={[0, h / 2 + 1, 0]} castShadow receiveShadow>
              <boxGeometry args={[len - w, h * 0.99, w * 0.72]} />
              <meshStandardMaterial color={colour} roughness={0.95} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function pileKey(id: string): string {
  return id
}

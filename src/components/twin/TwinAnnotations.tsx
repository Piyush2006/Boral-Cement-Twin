"use client"

/**
 * Annotation layer for the Digital Twin view: material piles as coloured cones
 * and every tagged plant item as a clickable callout, both driven by the same
 * store the satellite view and the inventory table use.
 */

import { Html } from "@react-three/drei"

import { EQUIPMENT, EQUIPMENT_ICON } from "@/lib/assets/equipment"
import { materialColour } from "@/lib/assets/materials"
import { toWorld } from "@/lib/map/projection"
import { usePiles } from "@/components/shell/pile-store"

const HEIGHT_GAIN = 2.6

export function TwinAnnotations() {
  const { piles, byId, silos, equipment, selectedId, select } = usePiles()

  return (
    <>
      {piles.map((pile) => {
        const record = byId.get(pile.pileId)
        const colour = materialColour(pile.materialId)
        const [x, , z] = toWorld(pile.centre)
        const selected = pile.pileId === selectedId
        // Real pile footprints, not the annotated zone: a cone this size reads
        // as a stockpile without swamping the plant beside it.
        const radius = 42
        const height = 11 * HEIGHT_GAIN

        return (
          <group key={pile.pileId} position={[x, 0, z]}>
            <mesh
              castShadow
              receiveShadow
              position={[0, height / 2, 0]}
              onClick={(e) => {
                e.stopPropagation()
                select(pile.pileId)
              }}
            >
              <coneGeometry args={[radius, height, 40]} />
              <meshStandardMaterial
                color={colour}
                roughness={0.85}
                emissive={selected ? colour : "#000000"}
                emissiveIntensity={selected ? 0.45 : 0}
              />
            </mesh>

            <Html position={[0, height + 30, 0]} center distanceFactor={420} zIndexRange={[60, 0]}>
              <Callout
                colour={colour}
                selected={selected}
                onClick={() => select(pile.pileId)}
                title={pile.pileId.replace("PILE-RM-0", "RM Pile 0")}
                sub={record?.materialName ?? ""}
                value={record ? `${Math.round(record.quantityMt).toLocaleString()} MT` : undefined}
              />
            </Html>
          </group>
        )
      })}

      {equipment.map((item) => {
        const [x, , z] = toWorld(item.position)
        const selected = item.tag === selectedId
        const silo = silos.find((s) => s.id === item.inventoryId)
        const colour = item.kind === "SILO" ? "#93c5fd" : "#e2e8f0"
        const lift = (item.heightMetres ?? 16) * HEIGHT_GAIN + 30

        return (
          <Html
            key={item.tag}
            position={[x, lift, z]}
            center
            distanceFactor={420}
            zIndexRange={[60, 0]}
          >
            <Callout
              colour={colour}
              selected={selected}
              onClick={() => select(item.tag)}
              icon={EQUIPMENT_ICON[item.kind]}
              title={silo ? item.name : item.name}
              sub={item.tag}
              value={silo ? `${Math.round(silo.quantityMt).toLocaleString()} MT` : undefined}
              dark
            />
          </Html>
        )
      })}
    </>
  )
}

function Callout({
  colour,
  selected,
  onClick,
  title,
  sub,
  value,
  icon,
  dark = false,
}: {
  colour: string
  selected: boolean
  onClick: () => void
  title: string
  sub?: string
  value?: string
  icon?: string
  dark?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        padding: "6px 10px",
        borderRadius: 9,
        background: dark ? "rgba(10,14,20,.92)" : "rgba(10,14,20,.92)",
        border: `2px solid ${colour}`,
        outline: selected ? "3px solid var(--surface-ring)" : "none",
        color: "var(--surface-ink)",
        cursor: "pointer",
        boxShadow: "0 3px 12px rgba(0,0,0,.55)",
        textAlign: "left",
      }}
    >
      {icon && (
        <span
          style={{ color: colour, display: "inline-flex" }}
          aria-hidden
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 24 24" width="17" height="17">${icon}</svg>`,
          }}
        />
      )}
      <span style={{ lineHeight: 1.3 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 11, opacity: 0.8 }}>{sub}</span>}
        {value && (
          <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: colour }}>
            {value}
          </span>
        )}
      </span>
    </button>
  )
}

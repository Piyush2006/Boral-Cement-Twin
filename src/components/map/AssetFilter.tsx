"use client"

/**
 * Annotation visibility: a master switch, then one toggle per inventory group.
 * The Satellite view shows inventory only — piles and silos — so those are the
 * only groups offered. Annotations OFF hides cards and leader lines; markers
 * stay. A group OFF removes its markers, cards and outlines entirely.
 */

import { INVENTORY_GROUPS, type AssetGroup } from "@/lib/assets/plant-assets"

const LABEL: Partial<Record<AssetGroup, string>> = { piles: "Show Piles", storage: "Show Silos" }

export function AssetFilter({
  annotationsOn,
  onAnnotations,
  groups,
  onGroup,
}: {
  annotationsOn: boolean
  onAnnotations: (on: boolean) => void
  groups: Record<AssetGroup, boolean>
  onGroup: (group: AssetGroup, on: boolean) => void
}) {
  return (
    <div>
      <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
        <span className="text-[12.5px] font-bold text-ink">Annotations</span>
        <button
          role="switch"
          aria-checked={annotationsOn}
          aria-label="Annotations"
          onClick={() => onAnnotations(!annotationsOn)}
          className={`relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors ${
            annotationsOn ? "bg-accent" : "bg-line-2"
          }`}
        >
          <span
            className="absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-[left]"
            style={{ left: annotationsOn ? 18 : 2 }}
          />
          <span className="sr-only">{annotationsOn ? "On" : "Off"}</span>
        </button>
      </label>
      <div className="mt-1 grid gap-0.5">
        {INVENTORY_GROUPS.map((g) => (
          <Check key={g} label={LABEL[g] ?? g} checked={groups[g]} onChange={(on) => onGroup(g, on)} />
        ))}
      </div>
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-[3px] text-[12px] text-ink-2 hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  )
}

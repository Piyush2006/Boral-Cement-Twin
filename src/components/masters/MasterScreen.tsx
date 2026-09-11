"use client"

/**
 * Master — define what exists.
 *
 *   Locations            the physical places: piles, silos, warehouses, stores,
 *                        production and maintenance areas
 *   Materials + Grades   material code, name, category, UOM, and each grade's
 *                        version, status, sampling and parameters
 *
 * The two are separate menus under Master in the sidebar, and each opens its
 * own page. Master holds no stock. Inventory — an existing Material + Grade
 * mapped to an existing Location — is created and managed in the Inventory
 * module.
 */

import { LocationsView } from "@/components/inventory/LocationsView"
import { MaterialsGradesView } from "@/components/inventory/MaterialsGradesView"
import type { MasterSection } from "@/components/shell/pile-store"

const SECTIONS: Array<{ id: MasterSection; label: string; blurb: string }> = [
  {
    id: "locations",
    label: "Locations",
    blurb: "Physical places in the plant, each with a Location ID — piles, silos, warehouses, stores, production and maintenance areas — and whether stock is held there, used there, or both.",
  },
  {
    id: "materials",
    label: "Materials + Grades",
    blurb: "Material code, name, category and UOM, with each material's grades — e.g. Limestone → Grade A / Grade B, Alternate Fuel → SRF — and their grade-specific parameters.",
  },
]

export function MasterScreen({ section }: { section: MasterSection }) {
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  return (
    <div className="absolute inset-0 overflow-auto bg-bg pt-[86px]">
      <div className="mx-auto max-w-[1400px] px-6 pb-10">
        {/* Each Master menu is its own page: reached from the sidebar, never
            shown alongside the other. */}
        <header className="mb-5 border-b border-line pb-4">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">Master › {current.label}</div>
          <h1 className="text-[20px] font-bold text-ink">{current.label}</h1>
          <p className="max-w-[860px] text-[12px] text-ink-3">{current.blurb}</p>
        </header>

        {section === "locations" ? <LocationsView /> : <MaterialsGradesView />}

        <p className="mt-6 text-[11px] text-ink-3">
          Nothing here is deleted: materials, grades and locations are deactivated, and only once no active inventory depends on
          them, so history stays traceable.
        </p>
      </div>
    </div>
  )
}

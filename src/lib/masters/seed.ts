/**
 * Seeded master data — CONFIGURED DEMO DATA.
 *
 * Boral has supplied no material master, grade specification, sampling plan or
 * standard costs. Everything here is configuration for the demonstration and is
 * flagged as such in the UI. Registering the real masters replaces it without
 * touching the workflow.
 *
 * Stock limits are NOT here: they belong to each inventory record
 * (lib/inventory/seed-records.ts).
 */

import { PILES } from "@/lib/assets/piles"
import { MATERIALS } from "@/lib/assets/materials"
import { plantAsset } from "@/lib/assets/plant-assets"
import { SILO_SEED } from "@/lib/inventory/silo-inventory"
import type { GradeMaster, LocationMaster, MaterialGroup, MaterialMaster, QualityParameter } from "./types"

const GROUP: Record<string, MaterialGroup> = {
  "MAT-LIMESTONE": "Raw Material",
  "MAT-CLAY-SHALE": "Raw Material",
  "MAT-SAND": "Additive",
  "MAT-GYPSUM": "Additive",
  "MAT-COAL": "Fuel",
  "MAT-ALT-FUEL": "Fuel",
  "MAT-RAW-MIX": "Intermediate",
}

const DESCRIPTION: Record<string, string> = {
  "MAT-LIMESTONE": "Crushed limestone, kiln feed",
  "MAT-CLAY-SHALE": "Clay and shale, raw mix component",
  "MAT-SAND": "Silica sand and correctives",
  "MAT-GYPSUM": "Gypsum, cement set retarder",
  "MAT-COAL": "Thermal coal, kiln fuel",
  "MAT-ALT-FUEL": "Solid recovered fuel, kiln substitution",
  "MAT-RAW-MIX": "Blended raw mix, pre-kiln",
}

/**
 * Where a received lot / batch reference is kept. Bought-in materials whose
 * specification varies by consignment carry one; blended stockpiles of the
 * plant's own raw materials do not, so the field is never forced on them.
 */
const LOT_TRACKED = new Set(["MAT-GYPSUM", "MAT-COAL", "MAT-ALT-FUEL", "MAT-SPARE-LUBRICANT"])

/** Indicative standard cost per UOM, for valuation only. Demo figures. */
const UNIT_COST: Record<string, number> = {
  "MAT-LIMESTONE": 18,
  "MAT-CLAY-SHALE": 22,
  "MAT-SAND": 34,
  "MAT-GYPSUM": 48,
  "MAT-COAL": 195,
  "MAT-ALT-FUEL": 65,
  "MAT-RAW-MIX": 27,
  "MAT-CEMENT": 165,
  "MAT-SPARE-BEARING": 80000,
  "MAT-SPARE-SEAL": 25000,
  "MAT-SPARE-LUBRICANT": 15000,
}

/** Materials whose stock carries an expiry date. Demo configuration. */
const EXPIRY_APPLIES = new Set(["MAT-ALT-FUEL"])

/** Material code, taken from the pile that holds it where there is one. */
const CODE_BY_MATERIAL = new Map(PILES.map((p) => [p.materialId as string, p.id.replace(/-\d+$/, "")]))

export const MATERIAL_SEED: MaterialMaster[] = [
  ...MATERIALS.map((m) => ({
    materialId: m.materialId as string,
    code: CODE_BY_MATERIAL.get(m.materialId) ?? m.materialId,
    name: m.name,
    uom: m.uom,
    group: GROUP[m.materialId] ?? ("Raw Material" as MaterialGroup),
    description: DESCRIPTION[m.materialId],
    // Expiry applies to SRF — demo configuration following the client's
    // example (PO-10250, Alternate Fuel — SRF, expiry 25-Oct-2026).
    expiryApplicable: EXPIRY_APPLIES.has(m.materialId as string),
    lotTracking: LOT_TRACKED.has(m.materialId),
    unitCost: UNIT_COST[m.materialId],
    active: true,
  })),
  {
    materialId: "MAT-CEMENT",
    code: "FG-OPC",
    name: "Cement",
    uom: "MT",
    group: "Finished Product",
    description: "Ordinary Portland Cement",
    expiryApplicable: false,
    lotTracking: false,
    unitCost: UNIT_COST["MAT-CEMENT"],
    active: true,
  },
  // Spares, so maintenance consumption can be costed against an asset.
  {
    materialId: "MAT-SPARE-BEARING",
    code: "SP-BRG",
    name: "Kiln Support Roller Bearing",
    uom: "EA",
    group: "Spare",
    description: "Spherical roller bearing, kiln support station",
    expiryApplicable: false,
    lotTracking: false,
    criticalSpare: true,
    unitCost: UNIT_COST["MAT-SPARE-BEARING"],
    active: true,
  },
  {
    materialId: "MAT-SPARE-SEAL",
    code: "SP-SEAL",
    name: "Kiln Inlet Seal",
    uom: "EA",
    group: "Spare",
    description: "Graphite block seal segment",
    expiryApplicable: false,
    lotTracking: false,
    criticalSpare: true,
    unitCost: UNIT_COST["MAT-SPARE-SEAL"],
    active: true,
  },
  {
    // Expiry applies here, so the expiry workflow has something real to act on.
    materialId: "MAT-SPARE-LUBRICANT",
    code: "SP-LUB",
    name: "Gear Lubricant",
    uom: "DRUM",
    group: "Spare",
    description: "Open gear lubricant, 180 kg drum",
    expiryApplicable: true,
    lotTracking: true,
    criticalSpare: false,
    unitCost: UNIT_COST["MAT-SPARE-LUBRICANT"],
    active: true,
  },
]

const param = (name: string, unit: string | undefined, min: number | null, max: number | null, target: number | null): QualityParameter => ({
  parameterId: `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  name,
  unit,
  min,
  max,
  target,
})

/**
 * Grades. `sampleEvery` is the sampling plan at Incoming: bought-in fuels and
 * additives on every delivery, the plant's own railed limestone and clay on
 * every second, and materials that never arrive by delivery not at all.
 */
export const GRADE_SEED_LIST: GradeMaster[] = [
  {
    gradeId: "GRD-LS-A", materialId: "MAT-LIMESTONE", name: "Grade A", version: "v1", sampleEvery: 2,
    qualityParameters: [param("CaO", "%", 50, null, 53), param("MgO", "%", null, 3, 1.8), param("Moisture", "%", null, 5, 3)],
  },
  {
    // A second limestone grade, so Limestone → Grade A / Grade B reads as it does at the plant.
    gradeId: "GRD-LS-B", materialId: "MAT-LIMESTONE", name: "Grade B", version: "v1", sampleEvery: 2,
    qualityParameters: [param("CaO", "%", 46, 50, 48), param("MgO", "%", null, 4, 2.5), param("Moisture", "%", null, 6, 4)],
  },
  {
    gradeId: "GRD-CS-STD", materialId: "MAT-CLAY-SHALE", name: "Standard", version: "v1", sampleEvery: 2,
    qualityParameters: [param("SiO2", "%", 55, 65, 60), param("Al2O3", "%", 15, 22, 18), param("Moisture", "%", null, 12, 8)],
  },
  {
    gradeId: "GRD-SN-STD", materialId: "MAT-SAND", name: "Standard", version: "v1", sampleEvery: 1,
    qualityParameters: [param("SiO2", "%", 85, null, 92), param("Moisture", "%", null, 6, 3)],
  },
  {
    gradeId: "GRD-GY-A", materialId: "MAT-GYPSUM", name: "Grade A", version: "v2", sampleEvery: 1,
    qualityParameters: [param("SO3", "%", 38, null, 41), param("Purity", "%", 85, null, 92), param("Free Moisture", "%", null, 8, 5)],
  },
  {
    gradeId: "GRD-CO-B", materialId: "MAT-COAL", name: "Grade B", version: "v1", sampleEvery: 1,
    qualityParameters: [
      param("Calorific Value", "kcal/kg", 5500, null, 6200),
      param("Ash", "%", null, 18, 12),
      param("Total Moisture", "%", null, 10, 6),
      param("Sulphur", "%", null, 0.8, 0.4),
    ],
  },
  {
    gradeId: "GRD-AF-SRF", materialId: "MAT-ALT-FUEL", name: "SRF", version: "v1", sampleEvery: 1,
    qualityParameters: [param("Calorific Value", "kcal/kg", 3800, null, 4400), param("Chlorine", "%", null, 1, 0.5), param("Moisture", "%", null, 20, 14)],
  },
  {
    gradeId: "GRD-BM-STD", materialId: "MAT-RAW-MIX", name: "Standard", version: "v1", sampleEvery: 0,
    qualityParameters: [param("LSF", undefined, 94, 98, 96), param("Silica Modulus", undefined, 2.3, 2.7, 2.5), param("Alumina Modulus", undefined, 1.4, 1.8, 1.6)],
  },
  {
    gradeId: "GRD-OPC-43", materialId: "MAT-CEMENT", name: "OPC 43", version: "v1", sampleEvery: 0,
    qualityParameters: [param("Blaine", "m²/kg", 300, 360, 330), param("SO3", "%", null, 3, 2.4), param("28-day Strength", "MPa", 43, null, 48)],
  },
  { gradeId: "GRD-BRG-STD", materialId: "MAT-SPARE-BEARING", name: "Standard", sampleEvery: 0, qualityParameters: [] },
  { gradeId: "GRD-SEAL-STD", materialId: "MAT-SPARE-SEAL", name: "Standard", sampleEvery: 0, qualityParameters: [] },
  { gradeId: "GRD-LUB-STD", materialId: "MAT-SPARE-LUBRICANT", name: "Standard", sampleEvery: 0, qualityParameters: [] },
].map((g) => ({ ...g, active: true }))

/** Approximate position from the twin's asset model, where the location is drawn there. */
function position(id: string): { latitude?: number; longitude?: number } {
  const a = plantAsset(id)
  return a?.latitude !== undefined && a?.longitude !== undefined ? { latitude: a.latitude, longitude: a.longitude } : {}
}

/** Areas that consume material — process units and maintenance. */
const CONSUMPTION_SEED: Array<Pick<LocationMaster, "locationId" | "name" | "kind" | "description">> = [
  { locationId: "RM-01", name: "Raw Mill", kind: "PRODUCTION_AREA", description: "Raw preparation" },
  { locationId: "KLN-01", name: "Kiln No. 6", kind: "PRODUCTION_AREA", description: "Pyroprocessing" },
  { locationId: "GEO-01", name: "Geocycle Co-processing", kind: "PRODUCTION_AREA", description: "Alternate fuel feed to the kiln" },
  { locationId: "PK-01", name: "Cement Packing", kind: "PRODUCTION_AREA", description: "Despatch" },
  { locationId: "MAINT-01", name: "Maintenance Area", kind: "MAINTENANCE_AREA", description: "Plant maintenance workshop" },
]

export const LOCATION_SEED: LocationMaster[] = [
  ...PILES.map((p) => ({
    locationId: p.pileId,
    name: `${MATERIALS.find((m) => m.materialId === p.materialId)?.name ?? p.pileId} Pile — ${p.pileId}`,
    kind: "PILE" as const,
    usage: "INVENTORY" as const,
    description: "Stockyard",
    capacity: p.capacityMt,
    uom: "MT",
    ...position(p.pileId),
    active: true,
  })),
  ...SILO_SEED.map((s) => ({
    locationId: s.id,
    name: `${s.name} — ${s.id}`,
    kind: "SILO" as const,
    usage: "INVENTORY" as const,
    description: "Cement storage",
    capacity: s.cap,
    uom: "MT",
    ...position(s.id),
    active: true,
  })),
  {
    locationId: "STORE-01",
    name: "Maintenance Store",
    kind: "STORE",
    usage: "INVENTORY",
    description: "Spare parts and consumables",
    active: true,
  },
  ...CONSUMPTION_SEED.map((c) => ({ ...c, usage: "CONSUMPTION" as const, ...position(c.locationId), active: true })),
]

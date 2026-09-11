/**
 * Seeded inventory records — CONFIGURED DEMO DATA.
 *
 * Boral has supplied no stock figures. These are the figures from the client's
 * design, flagged `provenance: "DEMO"` on every record and shown as
 * Demo / Simulated in the UI.
 *
 * Minimum, target and maximum stock belong to each record: the same grade held
 * at two locations can need two different minimums.
 *
 * `target` below is the balance the seeded history arrives at today; the
 * opening balance is derived from it so the ledger replays exactly to it.
 */

import { PILES } from "@/lib/assets/piles"

export type InventorySeed = {
  inventoryId: string
  materialId: string
  gradeId: string
  locationId: string
  target: number
  minStock: number
  targetStock: number
  maxStock: number
  description?: string
  /** Lot reference, where the stock is lot-tracked. */
  lotId?: string
  /** Only for materials where expiry applies. */
  expiryDate?: string
}

/** The grade each seeded balance is held against. */
const GRADE_BY_MATERIAL: Record<string, string> = {
  "MAT-LIMESTONE": "GRD-LS-A",
  "MAT-CLAY-SHALE": "GRD-CS-STD",
  "MAT-SAND": "GRD-SN-STD",
  "MAT-GYPSUM": "GRD-GY-A",
  "MAT-COAL": "GRD-CO-B",
  "MAT-ALT-FUEL": "GRD-AF-SRF",
  "MAT-RAW-MIX": "GRD-BM-STD",
  "MAT-CEMENT": "GRD-OPC-43",
}

/** Demo stock limits per pile record: [min, target, max] in MT. */
const PILE_LIMITS: Record<string, [number, number, number]> = {
  "RM-LS-001": [10000, 20000, 30000],
  "RM-CS-002": [4000, 8000, 12000],
  "RM-SN-003": [2000, 5000, 8000],
  "RM-GY-004": [2500, 5000, 8000],
  "RM-CO-005": [3000, 6500, 10000],
  "RM-AF-006": [3500, 4800, 6000],
  "RM-BM-007": [12000, 24000, 36000],
}

const limits = ([minStock, targetStock, maxStock]: [number, number, number]) => ({ minStock, targetStock, maxStock })

const PILE_TARGET: Record<string, number> = {
  "RM-LS-001": 18450,
  "RM-CS-002": 7860,
  "RM-SN-003": 4320,
  "RM-GY-004": 2150,
  "RM-CO-005": 5670,
  "RM-AF-006": 3280,
  "RM-BM-007": 22940,
}

export const INVENTORY_SEED: InventorySeed[] = [
  ...PILES.map((p) => ({
    inventoryId: p.id,
    materialId: p.materialId as string,
    gradeId: GRADE_BY_MATERIAL[p.materialId as string],
    locationId: p.pileId,
    target: PILE_TARGET[p.id],
    ...limits(PILE_LIMITS[p.id]),
  })),
  { inventoryId: "FG-OPC-001", materialId: "MAT-CEMENT", gradeId: "GRD-OPC-43", locationId: "SL-01", target: 5120, ...limits([2000, 4500, 7000]) },
  { inventoryId: "FG-OPC-002", materialId: "MAT-CEMENT", gradeId: "GRD-OPC-43", locationId: "SL-02", target: 4980, ...limits([2000, 4500, 7000]) },
  { inventoryId: "FG-OPC-003", materialId: "MAT-CEMENT", gradeId: "GRD-OPC-43", locationId: "SL-03", target: 6230, ...limits([2000, 4500, 7000]) },
  // Spares, held in the store. Consumption of these is costed to a plant asset.
  {
    inventoryId: "SP-BRG-001",
    ...limits([2, 4, 8]),
    materialId: "MAT-SPARE-BEARING",
    gradeId: "GRD-BRG-STD",
    locationId: "STORE-01",
    target: 5,
    description: "Kiln support roller bearings",
  },
  {
    inventoryId: "SP-SEAL-001",
    ...limits([4, 12, 20]),
    materialId: "MAT-SPARE-SEAL",
    gradeId: "GRD-SEAL-STD",
    locationId: "STORE-01",
    target: 14,
    description: "Kiln inlet seal segments",
  },
  // Expiry applies to lubricant, so it is held as two dated batches: one still
  // in date, one already past it, giving the expiry workflow real stock to act on.
  {
    inventoryId: "SP-LUB-001",
    ...limits([3, 8, 15]),
    materialId: "MAT-SPARE-LUBRICANT",
    gradeId: "GRD-LUB-STD",
    locationId: "STORE-01",
    target: 9,
    description: "Open gear lubricant drums",
    lotId: "LUB-2026-04",
    expiryDate: "2026-11-30T00:00:00.000Z",
  },
  {
    inventoryId: "SP-LUB-002",
    ...limits([0, 0, 5]),
    materialId: "MAT-SPARE-LUBRICANT",
    gradeId: "GRD-LUB-STD",
    locationId: "STORE-01",
    target: 2,
    description: "Open gear lubricant drums — past expiry",
    lotId: "LUB-2025-08",
    expiryDate: "2026-08-31T00:00:00.000Z",
  },
]

/** The seeded inventory record at a location — the default receiving/issuing balance. */
export function seedInventoryIdAt(locationId: string): string | undefined {
  return INVENTORY_SEED.find((s) => s.locationId === locationId)?.inventoryId
}

/** The seeded material held at a location. */
export function seedMaterialAt(locationId: string): string | undefined {
  return INVENTORY_SEED.find((s) => s.locationId === locationId)?.materialId
}

/** The seeded grade held at a location. */
export function seedGradeAt(locationId: string): string | undefined {
  return INVENTORY_SEED.find((s) => s.locationId === locationId)?.gradeId
}

/**
 * DEMO INVENTORY — NOT BERRIMA DATA.
 *
 * Spec §20 permits seed data for demonstration provided it is clearly marked and
 * never mixed with production values. Every record below is stamped
 * `provenance: "DEMO"`, and the UI renders a "Demo / Simulated" chip wherever a
 * DEMO number appears.
 *
 * These quantities are invented for the walkthrough. Boral has supplied no stock
 * figures. When the Integration API is connected this whole module is dropped.
 */

import type { InventoryRecord, Material } from "./types"

export const DEMO_MATERIALS: Material[] = [
  { materialId: "MAT-LIMESTONE", name: "Limestone", uom: "MT" },
  { materialId: "MAT-SHALE", name: "Clay / Shale", uom: "MT" },
  { materialId: "MAT-SAND", name: "Sand / Correctives", uom: "MT" },
  { materialId: "MAT-ALT-FUEL", name: "Alternate Fuel", uom: "MT" },
  { materialId: "MAT-COAL", name: "Coal", uom: "MT" },
  { materialId: "MAT-GYPSUM", name: "Gypsum", uom: "MT" },
  { materialId: "MAT-CLINKER", name: "Clinker", uom: "MT" },
  { materialId: "MAT-OPC-43", name: "OPC 43", uom: "MT" },
  { materialId: "MAT-OPC-53", name: "OPC 53", uom: "MT" },
]

const NOW = "2026-09-09T06:00:00.000Z"

type Seed = [string, string, number, number | undefined, "HEALTHY" | "CRITICAL", string | undefined]

const SEEDS: Seed[] = [
  ["LOC-PILE-RM-001", "MAT-LIMESTONE", 18450, 30000, "HEALTHY", "2026-09-02T04:30:00.000Z"],
  ["LOC-PILE-RM-002", "MAT-SHALE", 6240, 12000, "HEALTHY", "2026-08-28T23:15:00.000Z"],
  ["LOC-PILE-RM-003", "MAT-SAND", 1180, 8000, "CRITICAL", "2026-08-21T01:05:00.000Z"],
  ["LOC-PILE-AF-001", "MAT-ALT-FUEL", 4720, 15000, "HEALTHY", "2026-09-04T22:10:00.000Z"],
  ["LOC-PILE-COAL-001", "MAT-COAL", 2310, 10000, "CRITICAL", "2026-09-01T03:45:00.000Z"],
  ["LOC-PILE-GYP-001", "MAT-GYPSUM", 3480, 6000, "HEALTHY", "2026-09-06T05:20:00.000Z"],
  ["LOC-CLINKER-01", "MAT-CLINKER", 41200, 60000, "HEALTHY", "2026-09-05T02:00:00.000Z"],
  ["LOC-SILO-CEM-001", "MAT-OPC-43", 2850, 5000, "HEALTHY", "2026-09-07T21:40:00.000Z"],
  ["LOC-SILO-CEM-002", "MAT-OPC-43", 640, 5000, "CRITICAL", undefined],
  ["LOC-SILO-CEM-003", "MAT-OPC-53", 3960, 5000, "HEALTHY", "2026-09-08T19:05:00.000Z"],
]

export const DEMO_INVENTORY: InventoryRecord[] = SEEDS.map(
  ([inventoryLocationId, materialId, bookStock, capacity, status, lastVerifiedAt]) => {
    const material = DEMO_MATERIALS.find((m) => m.materialId === materialId)!
    return {
      inventoryLocationId,
      materialId,
      materialName: material.name,
      uom: material.uom,
      bookStock,
      capacity,
      status,
      lastVerifiedAt,
      lastUpdatedAt: NOW,
      // Every record is DEMO. Nothing here is Berrima stock.
      provenance: "DEMO" as const,
    }
  },
)

/**
 * Raw material pile inventory.
 *
 * Quantities below are the figures from the client's design. They are
 * CONFIGURED DEMO DATA — Boral has supplied no stock figures — which is why the
 * map carries the validation note and every record is `provenance: "DEMO"`.
 *
 * The live feed nudges these so the twin visibly runs; a real IMS subscription
 * replaces the simulation without touching anything downstream.
 */

import { PILES } from "@/lib/assets/piles"
import type { PileStatus } from "@/lib/assets/piles"
import { material } from "@/lib/assets/materials"

export type PileRecord = {
  pileId: string
  id: string
  materialId: string
  materialName: string
  quantityMt: number
  capacityMt: number
  status: PileStatus
  lastUpdatedAt: string
  provenance: "DEMO" | "LIVE"
}

/** Opening quantities, exactly as specified in the design. */
const OPENING: Record<string, { qty: number; status: PileStatus }> = {
  "RM-LS-001": { qty: 18450, status: "HEALTHY" },
  "RM-CS-002": { qty: 7860, status: "HEALTHY" },
  "RM-SN-003": { qty: 4320, status: "MODERATE" },
  "RM-GY-004": { qty: 2150, status: "HEALTHY" },
  "RM-CO-005": { qty: 5670, status: "MODERATE" },
  "RM-AF-006": { qty: 3280, status: "HEALTHY" },
  "RM-BM-007": { qty: 22940, status: "HEALTHY" },
}

/** Fixed seed timestamp: `new Date()` here would differ between the server and
 *  client renders and trip React hydration. The live feed sets a real one. */
export const SEED_TIMESTAMP = "2026-09-09T00:00:00.000Z"

export function openingRecords(now: string = SEED_TIMESTAMP): PileRecord[] {
  return PILES.map((p) => {
    const seed = OPENING[p.id]
    return {
      pileId: p.pileId,
      id: p.id,
      materialId: p.materialId,
      materialName: material(p.materialId)?.name ?? p.materialId,
      quantityMt: seed.qty,
      capacityMt: p.capacityMt,
      status: seed.status,
      lastUpdatedAt: now,
      provenance: "DEMO" as const,
    }
  })
}

/** Per-tick movement, signed: consumption negative, production positive. */
const RATE: Record<string, number> = {
  "RM-LS-001": -22,
  "RM-CS-002": -8,
  "RM-SN-003": -3,
  "RM-GY-004": -2,
  "RM-CO-005": -5,
  "RM-AF-006": -4,
  "RM-BM-007": +16,
}

export function advance(records: PileRecord[]): PileRecord[] {
  const now = new Date().toISOString()
  return records.map((r) => {
    const delta = (RATE[r.id] ?? 0) * (0.5 + Math.random())
    let next = r.quantityMt + delta
    // Bounce at the limits rather than running negative or overflowing.
    if (next <= r.capacityMt * 0.04) next = r.quantityMt + Math.abs(delta)
    if (next >= r.capacityMt * 0.96) next = r.quantityMt - Math.abs(delta)
    const qty = Math.max(0, Math.round(next))
    return { ...r, quantityMt: qty, status: statusFor(qty, r.capacityMt), lastUpdatedAt: now }
  })
}

/**
 * Demo status banding. A real IMS supplies status and this is dropped — the twin
 * never decides what "healthy" means for Berrima.
 */
export function statusFor(qty: number, capacity: number): PileStatus {
  const fill = capacity > 0 ? qty / capacity : 0
  if (fill < 0.15) return "CRITICAL"
  if (fill < 0.6) return "MODERATE"
  return "HEALTHY"
}

export const STATUS_META: Record<PileStatus, { label: string; colour: string }> = {
  HEALTHY: { label: "Healthy", colour: "#22c55e" },
  MODERATE: { label: "Moderate", colour: "#eab308" },
  CRITICAL: { label: "Critical", colour: "#ef4444" },
}

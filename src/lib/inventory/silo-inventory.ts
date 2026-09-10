/**
 * Cement silo stock, alongside the raw material piles in the live feed.
 * Demo figures, like everything else, until the inventory system is connected.
 */

import type { PileStatus } from "@/lib/assets/piles"

export type SiloRecord = {
  id: string
  name: string
  materialName: string
  quantityMt: number
  capacityMt: number
  status: PileStatus
  lastUpdatedAt: string
  provenance: "DEMO"
}

export const SILO_SEED: Array<{ id: string; name: string; qty: number; cap: number }> = [
  { id: "SL-01", name: "Cement (Silo 1)", qty: 5120, cap: 7000 },
  { id: "SL-02", name: "Cement (Silo 2)", qty: 4980, cap: 7000 },
  { id: "SL-03", name: "Cement (Silo 3)", qty: 6230, cap: 8000 },
]

export function openingSilos(now: string): SiloRecord[] {
  return SILO_SEED.map((s) => ({
    id: s.id,
    name: s.name,
    materialName: s.name,
    quantityMt: s.qty,
    capacityMt: s.cap,
    status: "HEALTHY" as const,
    lastUpdatedAt: now,
    provenance: "DEMO" as const,
  }))
}

/** Silos fill from the mills and draw down to packing. */
export function advanceSilos(records: SiloRecord[]): SiloRecord[] {
  const now = new Date().toISOString()
  return records.map((r, i) => {
    const rate = i === 2 ? -7 : 6
    const delta = rate * (0.5 + Math.random())
    let next = r.quantityMt + delta
    if (next <= r.capacityMt * 0.08) next = r.quantityMt + Math.abs(delta)
    if (next >= r.capacityMt * 0.95) next = r.quantityMt - Math.abs(delta)
    const qty = Math.max(0, Math.round(next))
    const fill = qty / r.capacityMt
    return {
      ...r,
      quantityMt: qty,
      status: fill < 0.15 ? "CRITICAL" : fill < 0.4 ? "MODERATE" : "HEALTHY",
      lastUpdatedAt: now,
    }
  })
}

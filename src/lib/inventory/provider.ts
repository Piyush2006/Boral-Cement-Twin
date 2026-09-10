/**
 * Integration API seam (spec §19).
 *
 * The Digital Twin owns spatial data. It does NOT own inventory. This module is
 * the only route to stock figures, and it contains no inventory logic beyond the
 * variance arithmetic the QR workflow needs.
 *
 * Until a real IMS/ERP is registered, the demo source answers and every record
 * is stamped `provenance: "DEMO"` — which the UI surfaces as
 * "Demo / Simulated" (§20). There is no second source of truth: connect a real
 * provider and the demo one is gone.
 */

import { DEMO_INVENTORY } from "./demo-source"
import type { Adjustment, CountSubmission, InventoryRecord } from "./types"

export type InventoryProvider = {
  id: string
  label: string
  /** All records the provider knows about. */
  list(): Promise<InventoryRecord[]>
  get(inventoryLocationId: string): Promise<InventoryRecord | null>
  /**
   * Record a physical count. §18: this must create an ADJUSTMENT for the
   * reconciliation workflow — it must never overwrite the book quantity.
   */
  submitCount(submission: CountSubmission): Promise<Adjustment>
  /** Adjustments raised so far, newest first. */
  adjustments(): Promise<Adjustment[]>
  /** Whether the current actor may submit counts (§32). */
  canSubmitCount(): Promise<boolean>
  /**
   * Live updates. A real IMS pushes here (websocket, SSE, polling); the demo
   * source simulates plant movement. Returns an unsubscribe function.
   */
  subscribe?(onChange: (records: InventoryRecord[]) => void): () => void
}

/* ── Demo provider ────────────────────────────────────────────────────────── */

function makeDemoProvider(): InventoryProvider {
  // Working copy so the demo can show the twin refreshing after a count.
  const records = new Map(DEMO_INVENTORY.map((r) => [r.inventoryLocationId, { ...r }]))
  const raised: Adjustment[] = []
  const listeners = new Set<(records: InventoryRecord[]) => void>()

  const emit = () => {
    const snapshot = [...records.values()]
    for (const l of listeners) l(snapshot)
  }

  /**
   * Simulated plant movement, so the twin visibly runs.
   *
   * Raw materials draw down as the kiln consumes them, cement builds up as the
   * mills produce, and dispatch draws the silos back down. It is a plausible
   * mass flow, NOT Berrima data — every record it touches stays
   * `provenance: "DEMO"` and the UI keeps its Demo / Simulated chip.
   */
  const RATE_PER_TICK: Record<string, number> = {
    "LOC-PILE-RM-001": -26,
    "LOC-PILE-RM-002": -9,
    "LOC-PILE-RM-003": -3,
    "LOC-PILE-AF-001": -6,
    "LOC-PILE-COAL-001": -4,
    "LOC-PILE-GYP-001": -2,
    "LOC-CLINKER-01": +14,
    "LOC-SILO-CEM-001": +7,
    "LOC-SILO-CEM-002": +5,
    "LOC-SILO-CEM-003": -9,
  }

  function tick() {
    const now = new Date().toISOString()
    for (const [id, rate] of Object.entries(RATE_PER_TICK)) {
      const r = records.get(id)
      if (!r) continue
      // Jitter so the feed does not look like a metronome.
      const delta = rate * (0.55 + Math.random() * 0.9)
      const cap = r.capacity ?? Number.POSITIVE_INFINITY
      let next = r.bookStock + delta
      // Bounce at the limits rather than running negative or overflowing.
      if (next <= cap * 0.04) next = r.bookStock + Math.abs(delta)
      if (next >= cap * 0.97) next = r.bookStock - Math.abs(delta)
      records.set(id, {
        ...r,
        bookStock: Math.max(0, Math.round(next)),
        status: deriveDemoStatus(next, r.capacity),
        lastUpdatedAt: now,
      })
    }
    emit()
  }

  return {
    id: "demo",
    label: "Demo / Simulated",
    async list() {
      return [...records.values()]
    },
    async get(id) {
      return records.get(id) ?? null
    },
    async canSubmitCount() {
      // Demo actor only. A real provider must check the IMS session (§32).
      return true
    },
    async submitCount(submission) {
      const record = records.get(submission.inventoryLocationId)
      if (!record) throw new Error(`No inventory location ${submission.inventoryLocationId}`)

      const adjustment = buildAdjustment(record, submission)
      raised.unshift(adjustment)

      // The demo stands in for the reconciliation workflow having accepted the
      // adjustment, so the twin visibly refreshes (§22 step 8). A real provider
      // does NOT do this — the IMS decides.
      records.set(submission.inventoryLocationId, {
        ...record,
        bookStock: submission.physicalCount,
        lastVerifiedAt: submission.countedAt,
        lastUpdatedAt: submission.countedAt,
        status: deriveDemoStatus(submission.physicalCount, record.capacity),
      })
      emit()
      return { ...adjustment, status: "APPLIED" }
    },
    async adjustments() {
      return [...raised]
    },
    subscribe(onChange) {
      listeners.add(onChange)
      const timer = setInterval(tick, 3000)
      return () => {
        listeners.delete(onChange)
        clearInterval(timer)
      }
    },
  }
}

/**
 * Demo-only status rule. A real IMS supplies status; the Twin never computes it.
 * Exists solely so the demo pile visibly changes state after a count.
 */
function deriveDemoStatus(qty: number, capacity?: number): "HEALTHY" | "CRITICAL" {
  if (!capacity) return qty > 0 ? "HEALTHY" : "CRITICAL"
  return qty / capacity < 0.15 ? "CRITICAL" : "HEALTHY"
}

/** Variance maths — the one calculation the Twin owns (§18). */
export function buildAdjustment(
  record: InventoryRecord,
  submission: CountSubmission,
): Adjustment {
  const variance = submission.physicalCount - record.bookStock
  return {
    adjustmentId: `ADJ-${Date.now().toString(36).toUpperCase()}`,
    inventoryLocationId: record.inventoryLocationId,
    assetId: submission.assetId,
    bookStock: record.bookStock,
    physicalCount: submission.physicalCount,
    variance,
    variancePercent: record.bookStock === 0 ? 0 : (variance / record.bookStock) * 100,
    countedBy: submission.countedBy,
    countedAt: submission.countedAt,
    status: "PENDING_RECONCILIATION",
    provenance: record.provenance,
  }
}

let provider: InventoryProvider = makeDemoProvider()

/** Register the real IMS integration. Replaces the demo source entirely. */
export function setInventoryProvider(next: InventoryProvider): void {
  provider = next
}

export function inventoryProvider(): InventoryProvider {
  return provider
}

export function isDemoProvider(): boolean {
  return provider.id === "demo"
}

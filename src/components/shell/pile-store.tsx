"use client"

/**
 * Application state: view mode, selection, and INVENTORY.
 *
 * Inventory records are held here, once, for every module. A quantity moves
 * only through `postMovement`, which writes a ledger transaction first and then
 * moves the record by that transaction's delta. The map, the twin and Plant
 * Flow read location views derived from the same records — none of them keeps
 * a quantity of its own, and nothing changes stock without a transaction.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { PILES } from "@/lib/assets/piles"
import { EQUIPMENT, getEquipment } from "@/lib/assets/equipment"
import { material } from "@/lib/assets/materials"
import {
  installLedger,
  recordTransaction,
  subscribeLedger,
  transactions,
  type InventoryTransaction,
  type TransactionLinks,
  type TransactionType,
} from "@/lib/inventory/ledger"
import { stockStatus, type InventoryRecord } from "@/lib/inventory/model"
import { recordLimits } from "@/lib/inventory/status"
import { materialEntry } from "@/lib/inventory/catalog"
import { dueExpiries, recordExpiry, replayBatches } from "@/lib/inventory/expiry"
import { installLots } from "@/lib/inventory/lots"
import type { PileRecord } from "@/lib/inventory/pile-inventory"
import { inventoryProvider } from "@/lib/inventory/provider"
import {
  validateAdjustment,
  validateArchive,
  validateLimits,
  validateNewInventory,
  type DecreaseType,
  type NewInventoryInput,
} from "@/lib/inventory/rules"
import { seedBundle } from "@/lib/inventory/seed"
import { SILO_SEED, type SiloRecord } from "@/lib/inventory/silo-inventory"

/**
 * Where the application is: the three Digital Twin views, the operational
 * modules, the two Master sections, and the Dashboard.
 */
export type MapMode =
  | "satellite"
  | "twin"
  | "inventory"
  | "incoming"
  | "issues"
  | "reports"
  | "master-locations"
  | "master-materials"

export type MasterSection = "locations" | "materials"

export function masterSection(mode: MapMode): MasterSection | null {
  return mode.startsWith("master-") ? (mode.slice(7) as MasterSection) : null
}

/** The Digital Twin module's views. */
export const TWIN_MODES: MapMode[] = ["satellite", "twin"]

/** Every floating panel can be dismissed and brought back. */
export type PanelKey = "inventory" | "details" | "kpis" | "legend" | "note"

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ACTOR = "operator.01"

export type MovementInput = {
  inventoryId: string
  type: TransactionType
  /** Signed: positive into stock, negative out of it. */
  quantity: number
  reason?: string
  reference?: string
  notes?: string
  batch?: string
  /** Overrides for traceability, where the caller knows more than the record. */
  gradeId?: string
  lotId?: string
  /** Inward batch of an expiry-tracked material: its expiry date. */
  expiryDate?: string
  links?: TransactionLinks
  actor?: string
  at?: string
}

function useStore() {
  const [mode, setMode] = useState<MapMode>("twin")
  const [selectedId, setSelectedId] = useState<string>("PILE-RM-01")
  const [panels, setPanels] = useState<Record<PanelKey, boolean>>({
    inventory: false,
    details: false,
    kpis: false,
    legend: false,
    note: false,
  })
  const [query, setQuery] = useState("")
  /** Which Inventory tab is showing — so other modules can open Transactions directly. */
  const [inventoryTab, setInventoryTab] = useState<"balances" | "transactions" | "expiry">("balances")
  const [live, setLive] = useState(true)
  // Null until mounted — a server-rendered clock would not match the client's.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [inventory, setInventoryState] = useState<InventoryRecord[]>(() => {
    const seed = seedBundle()
    installLedger(seed.ledger)
    installLots(seed.lots)
    return seed.inventory
  })
  // Postings read and write through a ref, so two movements in one event
  // handler both see the latest balance.
  const inventoryRef = useRef(inventory)
  const setInventory = useCallback((next: InventoryRecord[]) => {
    inventoryRef.current = next
    setInventoryState(next)
  }, [])

  const [ledger, setLedger] = useState<InventoryTransaction[]>(() => transactions())
  /** Existing RBAC: the only inventory-write capability the app defines. */
  const [canWriteInventory, setCanWriteInventory] = useState(false)

  useEffect(() => subscribeLedger(setLedger), [])

  useEffect(() => {
    void inventoryProvider()
      .canSubmitCount()
      .then(setCanWriteInventory)
      .catch(() => setCanWriteInventory(false))
  }, [])

  // The feed clock. Quantities do NOT drift: stock changes only by transaction.
  useEffect(() => {
    setLastUpdated(new Date())
    if (!live) return
    const t = setInterval(() => setLastUpdated(new Date()), 4000)
    return () => clearInterval(t)
  }, [live])

  /* ── location views ─────────────────────────────────────────────────────── */
  const atLocation = useCallback(
    (locationId: string) => inventory.filter((r) => r.active && r.locationId === locationId),
    [inventory],
  )

  const records: PileRecord[] = useMemo(
    () =>
      PILES.map((p) => {
        const held = atLocation(p.pileId)
        const qty = held.reduce((s, r) => s + r.quantity, 0)
        const min = held.reduce((s, r) => s + recordLimits(r).minStock, 0)
        const max = held.reduce((s, r) => s + recordLimits(r).maxStock, 0)
        return {
          pileId: p.pileId,
          id: held[0]?.inventoryId ?? p.id,
          materialId: p.materialId,
          materialName: material(p.materialId)?.name ?? p.materialId,
          quantityMt: qty,
          capacityMt: p.capacityMt,
          minStock: min,
          maxStock: max,
          status: stockStatus(qty, min),
          lastUpdatedAt: held.map((r) => r.updatedAt).sort().at(-1) ?? "",
          provenance: "DEMO" as const,
        }
      }),
    [atLocation],
  )

  const silos: SiloRecord[] = useMemo(
    () =>
      SILO_SEED.map((s) => {
        const held = atLocation(s.id)
        const qty = held.reduce((sum, r) => sum + r.quantity, 0)
        const min = held.reduce((sum, r) => sum + recordLimits(r).minStock, 0)
        return {
          id: s.id,
          name: s.name,
          inventoryId: held[0]?.inventoryId ?? "",
          materialName: "Cement",
          quantityMt: qty,
          capacityMt: s.cap,
          minStock: min,
          status: stockStatus(qty, min),
          lastUpdatedAt: held.map((r) => r.updatedAt).sort().at(-1) ?? "",
          provenance: "DEMO" as const,
        }
      }),
    [atLocation],
  )

  const byId = useMemo(() => new Map(records.map((r) => [r.pileId, r])), [records])
  const selected = byId.get(selectedId) ?? null
  const selectedSilo = silos.find((s) => s.id === selectedId) ?? null
  const selectedEquipment = getEquipment(selectedId) ?? null
  const selectedPile = PILES.find((p) => p.pileId === selectedId) ?? null

  /* ── inventory actions ──────────────────────────────────────────────────── */
  const recordOf = useCallback(
    (inventoryId: string) => inventoryRef.current.find((r) => r.inventoryId === inventoryId),
    [],
  )

  const balanceOf = useCallback(
    (inventoryId: string): number | null => inventory.find((r) => r.inventoryId === inventoryId)?.quantity ?? null,
    [inventory],
  )

  const patchRecord = useCallback(
    (inventoryId: string, apply: (r: InventoryRecord) => InventoryRecord) => {
      setInventory(inventoryRef.current.map((r) => (r.inventoryId === inventoryId ? apply(r) : r)))
    },
    [setInventory],
  )

  /**
   * The ONE way a quantity changes. Writes the transaction, then moves the
   * record by its delta. Refuses — writing nothing — on missing permission, an
   * archived or unknown record, or a balance that would go negative.
   */
  const postMovement = useCallback(
    (input: MovementInput): Result<InventoryTransaction> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to post inventory movements." }
      if (!Number.isFinite(input.quantity) || input.quantity === 0) {
        return { ok: false, error: "A movement must have a non-zero quantity." }
      }
      const record = recordOf(input.inventoryId)
      if (!record) return { ok: false, error: `Inventory record ${input.inventoryId} not found.` }
      if (!record.active) return { ok: false, error: `${record.inventoryId} is archived and cannot take movements.` }
      const before = record.quantity
      const after = before + input.quantity
      if (after < 0) {
        return {
          ok: false,
          error: `Insufficient stock in ${record.inventoryId}: ${Math.round(before).toLocaleString()} ${record.uom} on hand. Inventory cannot go negative.`,
        }
      }

      const txn = recordTransaction({
        type: input.type,
        inventoryId: record.inventoryId,
        locationId: record.locationId,
        materialId: record.materialId,
        gradeId: input.gradeId ?? record.gradeId,
        lotId: input.lotId ?? record.lotId,
        quantity: input.quantity,
        uom: record.uom,
        balanceBefore: before,
        balanceAfter: after,
        reason: input.reason,
        reference: input.reference,
        notes: input.notes,
        batch: input.batch ?? record.batch,
        expiryDate: input.quantity > 0 ? input.expiryDate : undefined,
        links: input.links ?? {},
        actor: input.actor ?? ACTOR,
        at: input.at,
        provenance: record.provenance,
      })
      patchRecord(record.inventoryId, (r) => ({
        ...r,
        // Move by the transaction's delta, never to a supplied figure.
        quantity: r.quantity + input.quantity,
        updatedAt: txn.at,
      }))
      setLastUpdated(new Date())
      return { ok: true, value: txn }
    },
    [canWriteInventory, recordOf, patchRecord],
  )

  /* ── expiry: batches replayed from the ledger; due batches leave by EXPIRY ── */
  // A minute clock, so a batch that reaches its date is picked up while the app is open.
  const [expiryNow, setExpiryNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setExpiryNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const batchIndex = useMemo(
    () => replayBatches(ledger, (materialId) => Boolean(materialEntry(materialId)?.expiryApplicable)),
    [ledger],
  )
  const expiryOf = useCallback(
    (inventoryId: string, now: Date = expiryNow) => recordExpiry(batchIndex.byRecord.get(inventoryId), now),
    [batchIndex, expiryNow],
  )

  /**
   * Once a batch reaches its expiry date its remaining quantity is Expired and
   * leaves available inventory through the normal transaction flow: an EXPIRY
   * transaction per batch, traced to its PO / GRN / lot. Nothing is overwritten.
   */
  const postDueExpiries = useCallback(
    (now: Date = new Date()): InventoryTransaction[] => {
      if (!canWriteInventory) return []
      const posted: InventoryTransaction[] = []
      const index = replayBatches(transactions(), (m) => Boolean(materialEntry(m)?.expiryApplicable))
      for (const b of dueExpiries(index, now)) {
        const record = recordOf(b.inventoryId)
        if (!record?.active) continue
        const qty = Math.min(b.remaining, record.quantity)
        if (qty <= 0) continue
        const day = new Date(b.expiryDate!).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
        const res = postMovement({
          inventoryId: b.inventoryId,
          type: "EXPIRY",
          quantity: -qty,
          reason: `Reached expiry date ${day}`,
          lotId: b.lotId,
          links: { batchId: b.batchId, poNumber: b.poNumber, grnNo: b.grnNo, incomingId: b.incomingId, lotId: b.lotId },
          actor: "system.expiry",
        })
        if (res.ok) posted.push(res.value)
      }
      return posted
    },
    [canWriteInventory, recordOf, postMovement],
  )
  // Run on load, whenever the ledger changes, and on the minute clock.
  useEffect(() => {
    if (!canWriteInventory) return
    if (dueExpiries(batchIndex, expiryNow).length) postDueExpiries(expiryNow)
  }, [batchIndex, expiryNow, canWriteInventory, postDueExpiries])

  const nextAdjustmentId = useCallback(() => {
    const used = transactions()
      .map((t) => Number(t.links.adjustmentId?.slice(4)))
      .filter((n) => Number.isFinite(n))
    return `ADJ-${String(Math.max(0, ...used) + 1).padStart(5, "0")}`
  }, [])

  const createInventory = useCallback(
    (input: NewInventoryInput & { description?: string }): Result<{ record: InventoryRecord; transaction?: InventoryTransaction }> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to create inventory." }
      const check = validateNewInventory(input, inventoryRef.current)
      if (!check.ok) return check

      const at = new Date().toISOString()
      const record: InventoryRecord = {
        inventoryId: input.inventoryId.trim().toUpperCase(),
        materialId: input.materialId,
        gradeId: input.gradeId,
        locationId: input.locationId,
        quantity: 0,
        uom: input.uom,
        minStock: input.minStock!,
        targetStock: input.targetStock!,
        maxStock: input.maxStock!,
        lotId: input.lotId?.trim().toUpperCase() || undefined,
        batch: input.batch?.trim() || undefined,
        description: input.description?.trim() || undefined,
        active: true,
        createdAt: at,
        createdBy: ACTOR,
        updatedAt: at,
        audit: [{ at, by: ACTOR, action: "Inventory record created" }],
        provenance: "DEMO",
      }
      setInventory([...inventoryRef.current, record])

      // A record starts at zero. An approved opening balance arrives by an
      // ADJUSTMENT transaction carrying its approval reference, like every
      // other change to a quantity.
      if (input.quantity! > 0) {
        const posted = postMovement({
          inventoryId: record.inventoryId,
          type: "ADJUSTMENT",
          quantity: input.quantity!,
          reason: "Approved opening balance",
          reference: input.openingReference?.trim(),
          expiryDate: input.openingExpiry || undefined,
          links: { adjustmentId: nextAdjustmentId() },
        })
        if (!posted.ok) {
          setInventory(inventoryRef.current.filter((r) => r.inventoryId !== record.inventoryId))
          return posted
        }
        return { ok: true, value: { record: recordOf(record.inventoryId)!, transaction: posted.value } }
      }
      return { ok: true, value: { record } }
    },
    [canWriteInventory, setInventory, nextAdjustmentId, postMovement, recordOf],
  )

  /**
   * Increase or decrease a balance directly. An increase is an ADJUSTMENT (+).
   * A decrease records its exact type: an ADJUSTMENT (−), or a WASTE, LOSS or
   * UNACCOUNTED outcome — never hidden inside a generic adjustment.
   */
  const adjustInventory = useCallback(
    (
      inventoryId: string,
      direction: "IN" | "OUT",
      quantity: number | null,
      reason: string,
      reference?: string,
      notes?: string,
      outType: DecreaseType = "ADJUSTMENT",
    ): Result<InventoryTransaction> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to adjust inventory." }
      const check = validateAdjustment(recordOf(inventoryId), direction, quantity, reason)
      if (!check.ok) return check
      const type = direction === "IN" ? "ADJUSTMENT" : outType
      return postMovement({
        inventoryId,
        type,
        quantity: direction === "IN" ? quantity! : -quantity!,
        reason: reason.trim(),
        reference: reference?.trim() || undefined,
        notes: notes?.trim() || undefined,
        links: type === "ADJUSTMENT" ? { adjustmentId: nextAdjustmentId() } : {},
      })
    },
    [canWriteInventory, recordOf, postMovement, nextAdjustmentId],
  )

  /**
   * Edit a record's stock limits and notes. The quantity is never editable
   * here — it moves only by transaction. Every change is written to the
   * record's audit trail with the old and new figures.
   */
  const updateInventoryDetails = useCallback(
    (
      inventoryId: string,
      patch: { minStock: number | null; targetStock: number | null; maxStock: number | null; description: string; notes: string },
    ): Result<true> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to edit inventory." }
      const record = recordOf(inventoryId)
      if (!record) return { ok: false, error: "Inventory record not found." }
      const limits = validateLimits(patch)
      if (!limits.ok) return limits

      const changes: string[] = []
      const fmtN = (n: number) => n.toLocaleString()
      if (patch.minStock !== record.minStock) changes.push(`Min Stock ${fmtN(record.minStock)} → ${fmtN(patch.minStock!)}`)
      if (patch.targetStock !== record.targetStock) changes.push(`Target ${fmtN(record.targetStock)} → ${fmtN(patch.targetStock!)}`)
      if (patch.maxStock !== record.maxStock) changes.push(`Max Stock ${fmtN(record.maxStock)} → ${fmtN(patch.maxStock!)}`)
      if ((patch.description.trim() || undefined) !== record.description) changes.push("Description updated")
      if ((patch.notes.trim() || undefined) !== record.notes) changes.push("Notes updated")
      if (!changes.length) return { ok: false, error: "No changes to save." }

      const at = new Date().toISOString()
      patchRecord(inventoryId, (r) => ({
        ...r,
        minStock: patch.minStock!,
        targetStock: patch.targetStock!,
        maxStock: patch.maxStock!,
        description: patch.description.trim() || undefined,
        notes: patch.notes.trim() || undefined,
        updatedAt: at,
        audit: [...r.audit, { at, by: ACTOR, action: `Details edited — ${changes.join("; ")}` }],
      }))
      return { ok: true, value: true }
    },
    [canWriteInventory, recordOf, patchRecord],
  )

  const archiveInventory = useCallback(
    (inventoryId: string, reason: string): Result<true> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to archive inventory." }
      const check = validateArchive(recordOf(inventoryId), reason)
      if (!check.ok) return check
      const at = new Date().toISOString()
      patchRecord(inventoryId, (r) => ({
        ...r,
        active: false,
        audit: [...r.audit, { at, by: ACTOR, action: `Archived — ${reason.trim()}` }],
      }))
      return { ok: true, value: true }
    },
    [canWriteInventory, recordOf, patchRecord],
  )

  const reactivateInventory = useCallback(
    (inventoryId: string): Result<true> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to reactivate inventory." }
      const record = recordOf(inventoryId)
      if (!record) return { ok: false, error: "Inventory record not found." }
      if (record.active) return { ok: false, error: "This record is already active." }
      const clash = inventoryRef.current.find(
        (r) =>
          r.active &&
          r.inventoryId !== inventoryId &&
          r.materialId === record.materialId &&
          r.gradeId === record.gradeId &&
          r.locationId === record.locationId &&
          (r.batch ?? "") === (record.batch ?? ""),
      )
      if (clash) {
        return { ok: false, error: `${clash.inventoryId} is already the active balance for this material and location.` }
      }
      const at = new Date().toISOString()
      patchRecord(inventoryId, (r) => ({ ...r, active: true, audit: [...r.audit, { at, by: ACTOR, action: "Reactivated" }] }))
      return { ok: true, value: true }
    },
    [canWriteInventory, recordOf, patchRecord],
  )

  const togglePanel = useCallback(
    (key: PanelKey, open?: boolean) => setPanels((prev) => ({ ...prev, [key]: open ?? !prev[key] })),
    [],
  )

  return {
    piles: PILES,
    equipment: EQUIPMENT,
    inventory,
    records,
    silos,
    byId,
    selected,
    selectedPile,
    selectedSilo,
    selectedEquipment,
    selectedId,
    panels,
    togglePanel,
    select: setSelectedId,
    query,
    setQuery,
    inventoryTab,
    setInventoryTab,
    live,
    setLive,
    lastUpdated,
    mode,
    setMode,
    ledger,
    canWriteInventory,
    balanceOf,
    recordOf,
    postMovement,
    createInventory,
    adjustInventory,
    batchIndex,
    expiryOf,
    expiryNow,
    postDueExpiries,
    updateInventoryDetails,
    archiveInventory,
    reactivateInventory,
  }
}

const Ctx = createContext<ReturnType<typeof useStore> | null>(null)

export function PileProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useStore()}>{children}</Ctx.Provider>
}

export function usePiles() {
  const v = useContext(Ctx)
  if (!v) throw new Error("usePiles must be used inside <PileProvider>")
  return v
}

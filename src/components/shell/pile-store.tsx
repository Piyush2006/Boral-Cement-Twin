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
 * modules, the two Master sections, and Reports & Insights.
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
        expiryDate: input.expiryDate || undefined,
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
   * Write off stock that has passed its expiry date.
   *
   * Expiry is its own term in the real-time balance — previous + inward −
   * expired − net consumed — so it posts as its own EXPIRY transaction rather
   * than hiding inside a manual adjustment or being counted as consumption.
   */
  const writeOffExpired = useCallback(
    (inventoryId: string, quantity: number | null, reason: string): Result<InventoryTransaction> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to write off stock." }
      const record = recordOf(inventoryId)
      if (!record) return { ok: false, error: "Inventory record not found." }
      if (!record.active) return { ok: false, error: `${record.inventoryId} is archived and cannot take movements.` }
      if (!record.expiryDate) {
        return { ok: false, error: `${record.inventoryId} carries no expiry date, so there is nothing to write off as expired.` }
      }
      if (new Date(record.expiryDate).getTime() > Date.now()) {
        return {
          ok: false,
          error: `${record.inventoryId} does not expire until ${new Date(record.expiryDate).toLocaleDateString("en-AU")}. Stock is written off only once it has expired.`,
        }
      }
      if (quantity === null || quantity <= 0) return { ok: false, error: "Quantity must be a number greater than zero." }
      if (!reason.trim()) return { ok: false, error: "Enter a reason." }
      return postMovement({
        inventoryId,
        type: "EXPIRY",
        quantity: -quantity,
        reason: reason.trim(),
        links: { lotId: record.lotId },
      })
    },
    [canWriteInventory, recordOf, postMovement],
  )

  /**
   * Set or correct a record's expiry date. Only for materials where expiry
   * applies; the quantity never changes here, and the old date, the new date
   * and the reason go into the record's audit trail.
   */
  const setExpiryDate = useCallback(
    (inventoryId: string, expiryDate: string | null, reason: string): Result<true> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to change expiry dates." }
      const record = recordOf(inventoryId)
      if (!record) return { ok: false, error: "Inventory record not found." }
      if (!record.active) return { ok: false, error: `${record.inventoryId} is archived.` }
      const material = materialEntry(record.materialId)
      if (!material?.expiryApplicable) return { ok: false, error: `Expiry does not apply to ${material?.name ?? "this material"}.` }
      if (!expiryDate || !Number.isFinite(new Date(expiryDate).getTime())) return { ok: false, error: "Enter a valid expiry date." }
      if (!reason.trim()) return { ok: false, error: "Enter a reason for the expiry date." }
      const next = new Date(expiryDate).toISOString()
      if (record.expiryDate && new Date(record.expiryDate).toISOString() === next) return { ok: false, error: "That is already the expiry date." }
      const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
      const at = new Date().toISOString()
      patchRecord(inventoryId, (r) => ({
        ...r,
        expiryDate: next,
        updatedAt: at,
        audit: [
          ...r.audit,
          {
            at,
            by: ACTOR,
            action: `${r.expiryDate ? `Expiry date changed ${day(r.expiryDate)} → ${day(next)}` : `Expiry date set to ${day(next)}`} — ${reason.trim()}`,
          },
        ],
      }))
      return { ok: true, value: true }
    },
    [canWriteInventory, recordOf, patchRecord],
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
    writeOffExpired,
    setExpiryDate,
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

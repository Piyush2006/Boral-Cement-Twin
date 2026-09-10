"use client"

/**
 * Plant Map state: selection, live pile inventory, search.
 * One store above the map, the table and the detail panel, so all three always
 * agree and a selection made in any of them shows in the others.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { PILES } from "@/lib/assets/piles"
import { EQUIPMENT, getEquipment } from "@/lib/assets/equipment"
import {
  advance,
  openingRecords,
  statusFor,
  SEED_TIMESTAMP,
  type PileRecord,
} from "@/lib/inventory/pile-inventory"
import { advanceSilos, openingSilos, type SiloRecord } from "@/lib/inventory/silo-inventory"
import {
  recordTransaction,
  subscribeLedger,
  transactions,
  type InventoryTransaction,
} from "@/lib/inventory/ledger"
import { inventoryProvider } from "@/lib/inventory/provider"
import { materialEntry } from "@/lib/inventory/catalog"

/** Satellite imagery, the 3D twin, and the process flow diagram. */
export type MapMode = "satellite" | "twin" | "flow" | "inventory" | "incoming"

/** Every floating panel can be dismissed and brought back. */
export type PanelKey = "inventory" | "details" | "kpis" | "legend" | "note"

export const PANEL_LABEL: Record<PanelKey, string> = {
  inventory: "Live Inventory",
  details: "Asset Details",
  kpis: "Plant KPIs",
  legend: "Legend",
  note: "Note",
}

function useStore() {
  const [mode, setMode] = useState<MapMode>("twin")
  /** Selection is by pile id (PILE-RM-0n) or equipment tag (KLN-01, SL-02…). */
  const [selectedId, setSelectedId] = useState<string>("PILE-RM-01")
  // Everything starts closed so the plant is unobstructed; the user opens the
  // panels they want from the chips at the bottom-right.
  const [panels, setPanels] = useState<Record<PanelKey, boolean>>({
    inventory: false,
    details: false,
    kpis: false,
    legend: false,
    note: false,
  })
  const [query, setQuery] = useState("")
  const [live, setLive] = useState(true)
  const [records, setRecords] = useState<PileRecord[]>(() => openingRecords())
  const [silos, setSilos] = useState<SiloRecord[]>(() => openingSilos(SEED_TIMESTAMP))
  // Null until mounted — a server-rendered clock would not match the client's.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [recordStockOpen, setRecordStockOpen] = useState(false)
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

  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  // Real-time feed. A real IMS subscription replaces `advance` here.
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      setRecords((prev) => advance(prev))
      setSilos((prev) => advanceSilos(prev))
      setLastUpdated(new Date())
    }, 4000)
    return () => clearInterval(t)
  }, [live])

  const byId = useMemo(() => new Map(records.map((r) => [r.pileId, r])), [records])

  /** One list for the Live Inventory table: piles first, then cement silos. */
  const inventoryRows = useMemo(
    () => [
      ...records.map((r) => ({
        key: r.pileId,
        id: r.id,
        material: r.materialName,
        materialId: r.materialId,
        quantityMt: r.quantityMt,
        status: r.status,
      })),
      ...silos.map((s) => ({
        key: s.id,
        id: s.id,
        material: s.name,
        materialId: "MAT-CEMENT",
        quantityMt: s.quantityMt,
        status: s.status,
      })),
    ],
    [records, silos],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return inventoryRows
    return inventoryRows.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.material.toLowerCase().includes(q),
    )
  }, [inventoryRows, query])

  const selected = byId.get(selectedId) ?? null
  const selectedSilo = silos.find((s) => s.id === selectedId) ?? null
  const selectedEquipment = getEquipment(selectedId) ?? null
  const selectedPile = PILES.find((p) => p.pileId === selectedId) ?? null

  /** Live plant KPIs, derived from the feed so they always agree with the table. */
  const kpis = useMemo(() => {
    const rawTotal = records.reduce((sum, r) => sum + r.quantityMt, 0)
    const cementTotal = silos.reduce((sum, s) => sum + s.quantityMt, 0)
    const alerts =
      records.filter((r) => r.status !== "HEALTHY").length +
      silos.filter((s) => s.status !== "HEALTHY").length
    return { rawTotal, cementTotal, alerts, throughputTpd: 3450, equipmentUp: 12, equipmentTotal: 14 }
  }, [records, silos])

  /**
   * Add inventory.
   *
   * Writes an inventory transaction first, then moves the balance by the
   * recorded quantity. The on-hand figure is never set directly, so the ledger
   * and the balance cannot disagree.
   */
  const addStock = useCallback(
    (input: {
      locationId: string
      materialId: string
      quantity: number
      reference: string
      actor?: string
    }): InventoryTransaction | { error: string } => {
      if (!canWriteInventory) return { error: "You do not have permission to add inventory." }
      if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
        return { error: "Enter a quantity greater than zero." }
      }

      const uom = materialEntry(input.materialId)?.uom ?? "MT"

      const pile = records.find((r) => r.pileId === input.locationId)
      const silo = silos.find((sl) => sl.id === input.locationId)
      if (!pile && !silo) return { error: `Unknown inventory location ${input.locationId}.` }

      const before = pile ? pile.quantityMt : silo!.quantityMt
      const after = before + input.quantity

      const txn = recordTransaction({
        type: "RECEIPT",
        locationId: input.locationId,
        materialId: input.materialId,
        quantity: input.quantity,
        uom,
        balanceBefore: before,
        balanceAfter: after,
        reference: input.reference,
        actor: input.actor ?? "demo.operator",
        provenance: "DEMO",
      })

      const stamp = txn.at
      if (pile) {
        setRecords((prev) =>
          prev.map((r) =>
            r.pileId === input.locationId
              ? {
                  ...r,
                  // Move by the transaction's delta, not to a supplied figure.
                  quantityMt: r.quantityMt + input.quantity,
                  status: statusFor(r.quantityMt + input.quantity, r.capacityMt),
                  lastUpdatedAt: stamp,
                }
              : r,
          ),
        )
      } else {
        setSilos((prev) =>
          prev.map((sl) =>
            sl.id === input.locationId
              ? { ...sl, quantityMt: sl.quantityMt + input.quantity, lastUpdatedAt: stamp }
              : sl,
          ),
        )
      }
      setLastUpdated(new Date())
      return txn
    },
    [canWriteInventory, records, silos],
  )

  /** Record a physical count. Never a silent overwrite — see RecordStock. */
  const applyCount = useCallback((pileId: string, quantityMt: number) => {
    const existing = records.find((r) => r.pileId === pileId)
    if (existing) {
      // Counts and receipts share one history rather than two.
      recordTransaction({
        type: "COUNT_ADJUSTMENT",
        locationId: pileId,
        materialId: existing.materialId,
        quantity: quantityMt - existing.quantityMt,
        uom: "MT",
        balanceBefore: existing.quantityMt,
        balanceAfter: quantityMt,
        reference: "Physical count",
        actor: "demo.operator",
        provenance: "DEMO",
      })
    }
    setRecords((prev) =>
      prev.map((r) =>
        r.pileId === pileId
          ? {
              ...r,
              quantityMt,
              lastUpdatedAt: new Date().toISOString(),
              status:
                quantityMt / r.capacityMt < 0.15
                  ? "CRITICAL"
                  : quantityMt / r.capacityMt < 0.6
                    ? "MODERATE"
                    : "HEALTHY",
            }
          : r,
      ),
    )
    setLastUpdated(new Date())
  }, [])

  const togglePanel = useCallback(
    (key: PanelKey, open?: boolean) =>
      setPanels((prev) => ({ ...prev, [key]: open ?? !prev[key] })),
    [],
  )

  return {
    piles: PILES,
    equipment: EQUIPMENT,
    records,
    silos,
    inventoryRows,
    filtered,
    byId,
    kpis,
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
    live,
    setLive,
    lastUpdated,
    mode,
    setMode,
    recordStockOpen,
    setRecordStockOpen,
    applyCount,
    addStock,
    ledger,
    canWriteInventory,
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

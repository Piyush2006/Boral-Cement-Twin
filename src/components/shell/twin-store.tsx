"use client"

/**
 * Shared twin state (spec §16, §21).
 *
 * Selection lives here, above all three views, keyed by `assetId`. That is what
 * makes "the selected asset must remain selected when changing views" structural
 * rather than something each view has to remember.
 *
 * It is also the wire between the functional blocks (§21): a QR count updates
 * inventory here, and the map, the 3D scene and the asset card all re-read it.
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

import { FLOW_LINKS, TWIN_ASSETS } from "@/lib/assets/registry"
import { DEFAULT_LAYERS, getAsset, type LayerId, type LayerState } from "@/lib/assets/selectors"
import { inventoryProvider } from "@/lib/inventory/provider"
import type { Adjustment, InventoryRecord } from "@/lib/inventory/types"

export type ViewMode = "satellite" | "twin" | "hybrid"

type Ctx = ReturnType<typeof useTwinState>

function useTwinState() {
  const [view, setView] = useState<ViewMode>("satellite")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  /** Bumped to ask the active view to re-centre on the selection. */
  const [focusNonce, setFocusNonce] = useState(0)
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS)
  const [inventory, setInventory] = useState<Map<string, InventoryRecord>>(new Map())
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const refreshInventory = useCallback(async () => {
    const records = await inventoryProvider().list()
    setInventory(new Map(records.map((r) => [r.inventoryLocationId, r])))
    setAdjustments(await inventoryProvider().adjustments())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refreshInventory()
  }, [refreshInventory])

  // Live feed: the provider pushes, the whole twin re-reads. A real IMS
  // subscription replaces the demo simulation with no change here.
  const [live, setLive] = useState(true)
  useEffect(() => {
    if (!live) return
    const provider = inventoryProvider()
    if (!provider.subscribe) return
    return provider.subscribe((records) => {
      setInventory(new Map(records.map((r) => [r.inventoryLocationId, r])))
      setLastTick(Date.now())
    })
  }, [live])
  const [lastTick, setLastTick] = useState<number | null>(null)

  const select = useCallback((assetId: string | null) => setSelectedId(assetId), [])

  /** Select AND ask the view to fly to it (§17.6, §22 step 4). */
  const focus = useCallback((assetId: string) => {
    setSelectedId(assetId)
    setFocusNonce((n) => n + 1)
  }, [])

  const changeView = useCallback((next: ViewMode) => {
    setView(next)
    // Re-assert focus so the incoming view lands on the same asset.
    setFocusNonce((n) => n + 1)
  }, [])

  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const selected = useMemo(() => getAsset(selectedId), [selectedId])

  const recordFor = useCallback(
    (locationId?: string) => (locationId ? (inventory.get(locationId) ?? null) : null),
    [inventory],
  )

  return {
    assets: TWIN_ASSETS,
    links: FLOW_LINKS,
    view,
    setView: changeView,
    selectedId,
    selected,
    select,
    focus,
    focusNonce,
    hoveredId,
    setHoveredId,
    layers,
    toggleLayer,
    inventory,
    recordFor,
    adjustments,
    refreshInventory,
    loaded,
    scannerOpen,
    setScannerOpen,
    live,
    setLive,
    lastTick,
  }
}

const TwinContext = createContext<Ctx | null>(null)

export function TwinProvider({ children }: { children: ReactNode }) {
  return <TwinContext.Provider value={useTwinState()}>{children}</TwinContext.Provider>
}

export function useTwin(): Ctx {
  const ctx = useContext(TwinContext)
  if (!ctx) throw new Error("useTwin must be used inside <TwinProvider>")
  return ctx
}

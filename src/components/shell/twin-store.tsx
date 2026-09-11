"use client"

/**
 * Shared twin state (spec §16, §21).
 *
 * Selection lives here, above all three views, keyed by `assetId`. That is what
 * makes "the selected asset must remain selected when changing views" structural
 * rather than something each view has to remember.
 *
 * It holds NO inventory. Stock is read from the one inventory store
 * (pile-store → ledger) by every view; an earlier copy of the demo stock table
 * lived here and ticked on its own, which would have been a second source of
 * truth (§19), so it was removed.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import { FLOW_LINKS, TWIN_ASSETS } from "@/lib/assets/registry"
import { DEFAULT_LAYERS, getAsset, type LayerId, type LayerState } from "@/lib/assets/selectors"

export type ViewMode = "satellite" | "twin" | "hybrid"

type Ctx = ReturnType<typeof useTwinState>

function useTwinState() {
  const [view, setView] = useState<ViewMode>("satellite")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  /** Bumped to ask the active view to re-centre on the selection. */
  const [focusNonce, setFocusNonce] = useState(0)
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS)
  const [scannerOpen, setScannerOpen] = useState(false)

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
    scannerOpen,
    setScannerOpen,
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

"use client"

import dynamic from "next/dynamic"

import { RecordStock } from "@/components/inventory/RecordStock"
import {
  ApproximateNote,
  AssetTypeLegend,
  LiveInventoryCard,
  MapChrome,
} from "@/components/map/SatelliteChrome"
import { PileProvider, usePiles } from "./pile-store"
import { TopBar } from "./TopBar"
import { TwinProvider } from "./twin-store"

// Browser-only: Leaflet touches `window` at import, and the 3D scene should not
// be in the initial bundle for a user who only opens the map.
const PlantMap = dynamic(() => import("@/components/map/PlantMap").then((m) => m.PlantMap), {
  ssr: false,
  loading: () => <Loading label="Loading site map…" />,
})

const IncomingScreen = dynamic(
  () => import("@/components/incoming/IncomingScreen").then((m) => m.IncomingScreen),
  { ssr: false, loading: () => <Loading label="Loading incoming materials…" /> },
)

const InventoryScreen = dynamic(
  () => import("@/components/inventory/InventoryScreen").then((m) => m.InventoryScreen),
  { ssr: false, loading: () => <Loading label="Loading inventory…" /> },
)

const PlantFlowView = dynamic(
  () => import("@/components/twin/PlantFlowView").then((m) => m.PlantFlowView),
  { ssr: false, loading: () => <Loading label="Loading plant flow…" /> },
)

const DigitalTwinView = dynamic(
  () => import("@/components/twin/DigitalTwinView").then((m) => m.DigitalTwinView),
  { ssr: false, loading: () => <Loading label="Loading digital twin…" /> },
)

export function AppShell() {
  return (
    <PileProvider>
      {/* The 3D view renders the full plant asset model, which has its own store. */}
      <TwinProvider>
        <Shell />
      </TwinProvider>
    </PileProvider>
  )
}

function Shell() {
  const { mode } = usePiles()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <main className="relative flex-1 overflow-hidden">
        <TopBar />

        {/* Both views stay mounted so switching is instant and selection holds. */}
        <div
          className="absolute inset-0"
          style={{ display: mode === "satellite" ? "block" : "none" }}
          aria-hidden={mode !== "satellite"}
        >
          <PlantMap />
        </div>

        <div
          className="absolute inset-0"
          style={{ display: mode === "twin" ? "block" : "none" }}
          aria-hidden={mode !== "twin"}
        >
          <DigitalTwinView />
        </div>

        {mode === "incoming" && (
          <div className="absolute inset-0">
            <IncomingScreen />
          </div>
        )}

        {mode === "inventory" && (
          <div className="absolute inset-0">
            <InventoryScreen />
          </div>
        )}

        {mode === "flow" && (
          <div className="absolute inset-0">
            <PlantFlowView />
          </div>
        )}

        {mode === "satellite" && (
          <>
            <AssetTypeLegend />
            <LiveInventoryCard />
            <ApproximateNote />
            <MapChrome />
          </>
        )}

        <RecordStock />
      </main>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-4 py-1.5 text-[11px] text-ink-3">
        <span className="font-semibold text-ink-2">Boral</span>
        <span>|</span>
        <span>Digital Twin</span>
        <span>|</span>
        <span>Berrima Cement Works</span>
        <span className="ml-auto text-right">
          3D model for visualization purposes. Asset positions are approximate and not
          survey-verified.
        </span>
      </footer>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">{label}</div>
  )
}

"use client"

import dynamic from "next/dynamic"

import { IncomingProvider } from "@/components/incoming/incoming-store"
import { IssueProvider } from "@/components/issues/issue-store"
import { LiveInventoryCard, MapChrome } from "@/components/map/SatelliteChrome"
import { PileProvider, masterSection, usePiles } from "./pile-store"
import { Sidebar } from "./Sidebar"
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

const IssueScreen = dynamic(
  () => import("@/components/issues/IssueScreen").then((m) => m.IssueScreen),
  { ssr: false, loading: () => <Loading label="Loading issue & consumption…" /> },
)

const InventoryScreen = dynamic(
  () => import("@/components/inventory/InventoryScreen").then((m) => m.InventoryScreen),
  { ssr: false, loading: () => <Loading label="Loading inventory…" /> },
)

const MasterScreen = dynamic(
  () => import("@/components/masters/MasterScreen").then((m) => m.MasterScreen),
  { ssr: false, loading: () => <Loading label="Loading master data…" /> },
)

const ReportsScreen = dynamic(
  () => import("@/components/reports/ReportsScreen").then((m) => m.ReportsScreen),
  { ssr: false, loading: () => <Loading label="Loading reports & insights…" /> },
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
        {/* Operational records live above the screens, so switching modules
            never discards them and traceability can follow a receipt into the
            issues that drew on it. */}
        <IncomingProvider>
          <IssueProvider>
            <Shell />
          </IssueProvider>
        </IncomingProvider>
      </TwinProvider>
    </PileProvider>
  )
}

function Shell() {
  const { mode } = usePiles()
  const master = masterSection(mode)

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="relative flex-1 overflow-hidden">
          <TopBar />

          {/* Both twin views stay mounted so switching is instant and selection holds. */}
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

          {mode === "issues" && (
            <div className="absolute inset-0">
              <IssueScreen />
            </div>
          )}

          {mode === "inventory" && (
            <div className="absolute inset-0">
              <InventoryScreen />
            </div>
          )}

          {mode === "reports" && (
            <div className="absolute inset-0">
              <ReportsScreen />
            </div>
          )}

          {master && (
            <div className="absolute inset-0">
              <MasterScreen section={master} />
            </div>
          )}

          {mode === "satellite" && (
            <>
              <LiveInventoryCard />
              <MapChrome />
            </>
          )}
        </main>

        <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-4 py-1.5 text-[11px] text-ink-3">
          <span className="font-semibold text-ink-2">Boral</span>
          <span>|</span>
          <span>Digital Twin</span>
          <span>|</span>
          <span>Berrima Cement Works</span>
          <span className="ml-auto text-right">
            3D model for visualization purposes. Asset positions are approximate and not survey-verified.
          </span>
        </footer>
      </div>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">{label}</div>
}

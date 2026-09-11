"use client"

/**
 * Dashboard (Reports & Insights) — readiness, cost, quality, expiry, maintenance and
 * utilisation, for plant users and management.
 *
 *   What came in?          Material Inward, Quality
 *   Can we produce?        Production Readiness, Days of Inventory
 *   Where did it go?       Net Consumption (gross outward − returned), losses
 *   What did it cost?      Inventory Value, Maintenance Material Cost by asset
 *   What needs attention?  Critical stock, pending quality, expiry, critical spares
 *
 * Every figure is derived live from the inventory records, the transaction
 * ledger, the incoming deliveries and the issues. Nothing is stored twice, and a
 * figure with no basis (no unit cost, no capacity) is shown as such rather than
 * filled in. Each headline figure drills down to the rows behind it.
 */

import { useMemo, useState } from "react"

import { useIncoming } from "@/components/incoming/incoming-store"
import { StatusBadge } from "@/components/inventory/StatusBadge"
import { ExpiryPill, expiryDay } from "@/components/inventory/Expiry"
import { batchStatus, daysToExpiry as batchDays, type ExpiryBatch } from "@/lib/inventory/expiry"
import { UtilBar } from "@/components/inventory/LocationsView"
import { Empty, LinkButton, Row, Table, Td, Th } from "@/components/inventory/Table"
import { useIssues } from "@/components/issues/issue-store"
import { INPUT } from "@/components/shell/Modal"
import { usePiles } from "@/components/shell/pile-store"
import { Dashboard } from "./Dashboard"
import { plantAsset } from "@/lib/assets/plant-assets"
import { gradeEntry, locationEntry, locationName, materialEntry } from "@/lib/inventory/catalog"
import type { InventoryRecord } from "@/lib/inventory/model"
import { recordStatus, utilisation } from "@/lib/inventory/status"
import { CONSUMPTION_CATEGORIES, CONSUMPTION_CATEGORY_META } from "@/lib/issues/consumption"
import { returnedQty } from "@/lib/issues/types"
import { holdsStock } from "@/lib/masters/types"
import { useMasters } from "@/lib/masters/useMasters"
import { PRODUCTION_PLANS, planDaysOfInventory, planReadiness } from "@/lib/production/plan"
import {
  PERIOD_LABEL,
  balanceIdentity,
  costBy,
  inventoryValueBy,
  locationStock,
  maintenanceConsumption,
  pendingQuality,
  periodRange,
  qualityKpis,
  within,
  type Period,
} from "@/lib/reports/insights"

type Section = "dashboard" | "critical" | "readiness" | "quality" | "expiry" | "spares" | "value" | "utilisation" | "movements"

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "critical", label: "Critical Stock" },
  { id: "readiness", label: "Production Readiness" },
  { id: "quality", label: "Quality" },
  { id: "expiry", label: "Expiry" },
  { id: "spares", label: "Spares & Maintenance" },
  { id: "value", label: "Inventory Value" },
  { id: "utilisation", label: "Location Utilisation" },
  { id: "movements", label: "Inward & Consumption" },
]

const fmt = (n: number) => Math.round(n).toLocaleString()

/** No signed-in identity exists, so the greeting names the time of day, not a person. */
function greeting(now: Date): string {
  const h = now.getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}
const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function ReportsScreen() {
  const { inventory, ledger, setMode, expiryOf } = usePiles()
  const { records: incoming, setOpenId: openIncoming } = useIncoming()
  const { records: issues, setOpenId: openIssue } = useIssues()
  const masters = useMasters()

  const [section, setSection] = useState<Section>("dashboard")
  const [period, setPeriod] = useState<Period>("7D")
  // "Now" moves with the data: any posting — including a write-off made from
  // this screen — re-dates the window, so a movement is never newer than the
  // period that should contain it.
  const now = useMemo(() => new Date(), [ledger, inventory, incoming, issues])
  const [custom, setCustom] = useState(() => {
    const t = new Date()
    return { from: toInput(new Date(t.getTime() - 14 * 86_400_000)), to: toInput(t) }
  })
  const range = useMemo(() => periodRange(period, now, custom), [period, now, custom])

  const active = useMemo(() => inventory.filter((r) => r.active), [inventory])

  /* ── derived figures ──────────────────────────────────────────────────── */
  const critical = useMemo(() => active.filter((r) => recordStatus(r) === "CRITICAL"), [active])

  /** Usable inventory: active balances less any quantity past its expiry date. */
  const usableOf = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of active) {
      const expiredDue = materialEntry(r.materialId)?.expiryApplicable ? expiryOf(r.inventoryId, now).duePendingQty : 0
      totals.set(r.materialId, (totals.get(r.materialId) ?? 0) + r.quantity - expiredDue)
    }
    return (materialId: string) => totals.get(materialId) ?? 0
  }, [active, now, expiryOf])

  const readiness = useMemo(() => PRODUCTION_PLANS.map((p) => planReadiness(p, usableOf)), [usableOf])
  const quality = useMemo(() => qualityKpis(incoming, range), [incoming, range])
  const pending = useMemo(() => pendingQuality(incoming), [incoming])

  /** Dated batches in stock, for materials where expiry applies — soonest first. */
  const expiryRows: ExpiryBatch[] = useMemo(
    () =>
      active
        .filter((r) => materialEntry(r.materialId)?.expiryApplicable)
        .flatMap((r) => expiryOf(r.inventoryId, now).open)
        .sort((a, b) => (a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity) - (b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity)),
    [active, now, expiryOf],
  )

  const spares = useMemo(
    () =>
      masters.materials
        .filter((m) => m.group === "Spare" && m.criticalSpare && m.active)
        .map((m) => {
          const held = active.filter((r) => r.materialId === m.materialId)
          const qty = held.reduce((s, r) => s + r.quantity, 0)
          const min = held.reduce((s, r) => s + r.minStock, 0)
          return { material: m, held, qty, min, available: held.length > 0 && qty > min }
        }),
    [masters.materials, active],
  )

  const maintenance = useMemo(() => maintenanceConsumption(issues, range), [issues, range])

  const utilRows = useMemo(
    () =>
      masters.locations
        .filter((l) => holdsStock(l) && l.active && l.capacity)
        .map((l) => {
          const s = locationStock(l.locationId, ledger, range)
          return { location: l, ...s, pct: utilisation(s.current, l.capacity)!, peakPct: utilisation(s.peak, l.capacity)!, avgPct: utilisation(s.average, l.capacity)! }
        })
        .sort((a, b) => b.pct - a.pct),
    [masters.locations, ledger, range],
  )
  const unconfigured = masters.locations.filter((l) => holdsStock(l) && l.active && !l.capacity).length

  const identity = useMemo(() => balanceIdentity(ledger, range), [ledger, range])
  const adjustments = useMemo(() => ledger.filter((t) => t.type === "ADJUSTMENT" && within(t.at, range) && t.reason !== "Opening balance"), [ledger, range])

  const go = (s: Section) => {
    setSection(s)
    document.getElementById("reports-top")?.scrollIntoView({ block: "start" })
  }
  const toIncoming = (incomingId: string) => {
    openIncoming(incomingId)
    setMode("incoming")
  }
  const toIssue = (issueId: string) => {
    openIssue(issueId)
    setMode("issues")
  }

  const periodNote = period === "CUSTOM" ? `${day(new Date(range.from).toISOString())} – ${day(new Date(range.to).toISOString())}` : PERIOD_LABEL[period]

  return (
    <div className="absolute inset-0 overflow-auto bg-bg pt-[86px]">
      <div id="reports-top" className="mx-auto max-w-[1400px] px-6 pb-10">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          {section === "dashboard" ? (
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">Dashboard</div>
              <h1 className="text-[22px] font-bold text-ink">{greeting(now)}</h1>
              <p className="max-w-[760px] text-[12.5px] text-ink-3">
                Here&rsquo;s the latest view of your inventory at Berrima Cement Works. Figures are Demo / Simulated until the plant systems
                are connected.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">Dashboard</div>
              <h1 className="text-[20px] font-bold text-ink">Reports &amp; Insights</h1>
              <p className="max-w-[760px] text-[12px] text-ink-3">
                Readiness, cost, quality, expiry, maintenance and utilisation — derived live from inventory, incoming and issue records.
                Figures are Demo / Simulated until the plant systems are connected.
              </p>
            </div>
          )}

          {/* Period — applies to flows: inward, consumption, adjustments, quality, maintenance cost, utilisation. */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Report period">
            <div className="flex gap-1 rounded-lg bg-panel p-1 ring-1 ring-line">
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-semibold ${
                    period === p ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  {p === "CUSTOM" ? "Custom" : PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
            {period === "CUSTOM" && (
              <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={`${INPUT} w-auto py-1.5`} />
                to
                <input type="date" aria-label="To" value={custom.to} min={custom.from} max={toInput(now)} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={`${INPUT} w-auto py-1.5`} />
              </span>
            )}
          </div>
        </header>

        <div role="tablist" aria-label="Report sections" className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={section === s.id}
              onClick={() => setSection(s.id)}
              className={`-mb-px border-b-2 px-1 pb-2.5 text-[13px] font-semibold transition-colors ${
                section === s.id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === "dashboard" && <Dashboard range={range} periodNote={periodNote} now={now} onDrill={(t) => go(t)} />}

        {section === "critical" && (
          <Panel title="Critical Inventory Items" note="Balances at or below their own Min Stock. Days of inventory use the planned daily consumption from plan + BOM.">
            <Table
              head={
                <>
                  <Th>Material</Th>
                  <Th>Inventory ID</Th>
                  <Th>Location</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th className="text-right">Min Stock</Th>
                  <Th className="text-right">Days of Inventory</Th>
                  <Th>Status</Th>
                </>
              }
              empty={critical.length === 0 ? <Empty>Nothing is critical. Every balance is above its Min Stock.</Empty> : undefined}
            >
              {critical.map((r) => {
                const days = planDaysOfInventory(r.quantity, r.materialId)
                return (
                  <Row key={r.inventoryId}>
                    <Td>
                      <span className="block text-ink">{materialEntry(r.materialId)?.name}</span>
                      <span className="block text-[11px] text-ink-3">{gradeEntry(r.gradeId)?.name}</span>
                    </Td>
                    <Td className="font-mono text-ink">{r.inventoryId}</Td>
                    <Td className="text-ink-2">{locationName(r.locationId)}</Td>
                    <Td className="text-right font-mono text-ink">
                      {fmt(r.quantity)} {r.uom}
                    </Td>
                    <Td className="text-right font-mono text-ink-2">{fmt(r.minStock)}</Td>
                    <Td className="text-right font-mono text-ink-2">{days === null ? <span className="font-sans text-ink-3">Not in plan</span> : days.toFixed(1)}</Td>
                    <Td>
                      <StatusBadge status="CRITICAL" />
                    </Td>
                  </Row>
                )
              })}
            </Table>
          </Panel>
        )}

        {section === "readiness" && (
          <Panel
            title="Production Readiness"
            note="Is the plant ready to produce the planned cement? Plan quantity × bill of materials against usable inventory (active, not expired). Days of inventory = usable inventory ÷ expected daily consumption from plan + BOM. Plans and recipes are configured demo data."
          >
            {readiness.map((r) => (
              <div key={r.plan.planId} className="mb-5 last:mb-0">
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[12.5px] text-ink">{r.plan.planId}</span>
                  <span className="text-[13px] font-semibold text-ink">
                    {materialEntry(r.plan.productId)?.name ?? r.plan.productId} · {fmt(r.plan.quantity)} {r.plan.uom}
                  </span>
                  <span className="text-[11.5px] text-ink-3">
                    {day(r.plan.from)} – {day(r.plan.to)}
                  </span>
                  <span className="ml-auto">
                    <Pill ok={r.ready}>{r.ready ? "READY" : `SHORT — covers ${Math.round(r.coverage * 100)}%`}</Pill>
                  </span>
                </div>
                <Table
                  head={
                    <>
                      <Th>Required Material</Th>
                      <Th className="text-right">Required</Th>
                      <Th className="text-right">Available Inventory</Th>
                      <Th className="text-right">Shortfall</Th>
                      <Th className="text-right">Days of Inventory</Th>
                      <Th>Readiness</Th>
                    </>
                  }
                >
                  {r.requirements.map((q) => (
                    <Row key={q.materialId}>
                      <Td className="text-ink">{materialEntry(q.materialId)?.name ?? q.materialId}</Td>
                      <Td className="text-right font-mono text-ink-2">{fmt(q.required)}</Td>
                      <Td className="text-right font-mono text-ink-2">{fmt(q.available)}</Td>
                      <Td className={`text-right font-mono ${q.ready ? "text-ink-3" : "font-semibold text-ink"}`}>{q.ready ? "—" : fmt(-q.shortfall)}</Td>
                      <Td className="text-right font-mono text-ink-2">{q.daysOfInventory === null ? "—" : q.daysOfInventory.toFixed(1)}</Td>
                      <Td>
                        <Pill ok={q.ready}>{q.ready ? "COVERED" : "SHORT"}</Pill>
                      </Td>
                    </Row>
                  ))}
                </Table>
              </div>
            ))}
          </Panel>
        )}

        {section === "quality" && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-quality-kpis>
              <Kpi label="Incoming Lots / Batches" value={String(quality.deliveries)} note={periodNote} />
              <Kpi label="Testing Required" value={String(quality.testingRequired)} note="Selected by each grade's sampling frequency" />
              <Kpi label="Testing Completed" value={String(quality.testingCompleted)} note="Result recorded" />
              <Kpi label="Testing Pending" value={String(quality.testingPending)} note="Sample or result outstanding" alert={quality.testingPending > 0} />
              <Kpi label="Passed" value={String(quality.passed)} note="Accepted" />
              <Kpi label="Failed" value={String(quality.failed)} note="Held — not received into inventory" alert={quality.failed > 0} />
            </div>
            <Panel title="Pending Quality" note="Material that has entered Incoming and is still awaiting its test. It is not quality-approved and is not in inventory.">
              <Table
                head={
                  <>
                    <Th>Material</Th>
                    <Th>Grade</Th>
                    <Th>PO</Th>
                    <Th>Gate Entry</Th>
                    <Th>GRN</Th>
                    <Th>Incoming ID</Th>
                    <Th>Sample</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </>
                }
                empty={pending.length === 0 ? <Empty>No delivery is waiting for a test.</Empty> : undefined}
              >
                {pending.map((r) => (
                  <Row key={r.incomingId}>
                    <Td className="text-ink">{materialEntry(r.materialId)?.name}</Td>
                    <Td className="text-ink-2">{gradeEntry(r.gradeId)?.name ?? "—"}</Td>
                    <Td className="font-mono text-ink-2">{r.poNumber}</Td>
                    <Td className="font-mono text-ink-2">{r.gateEntryNo ?? "—"}</Td>
                    <Td className="font-mono text-ink-2">{r.grnNo ?? "—"}</Td>
                    <Td className="font-mono text-ink-2">{r.incomingId}</Td>
                    <Td className="text-ink-2">{r.sample ? `${r.sample.sampleId} collected` : "Not collected"}</Td>
                    <Td>
                      <span className="rounded-full bg-panel-2 px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide text-ink ring-1 ring-line">◷ Test Pending</span>
                    </Td>
                    <Td className="text-right">
                      <LinkButton onClick={() => toIncoming(r.incomingId)}>Open</LinkButton>
                    </Td>
                  </Row>
                ))}
              </Table>
            </Panel>
          </>
        )}

        {section === "expiry" && (
          <Panel
            title="Expiry"
            note="Only materials where expiry applies. Each batch's date comes from its PO; a batch that reaches it leaves by an EXPIRY transaction, counted as a loss, never as consumption."
          >
            <Table
              head={
                <>
                  <Th>Material</Th>
                  <Th>Inventory ID</Th>
                  <Th>PO / GRN</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th>Expiry Date</Th>
                  <Th className="text-right">Days to Expiry</Th>
                  <Th>Status</Th>
                </>
              }
              empty={expiryRows.length === 0 ? <Empty>No stock of an expiry-tracked material is held.</Empty> : undefined}
            >
              {expiryRows.map((b) => (
                <Row key={b.batchId}>
                  <Td>
                    <span className="block text-ink">{materialEntry(b.materialId)?.name}</span>
                    <span className="block text-[11px] text-ink-3">{locationName(b.locationId)}</span>
                  </Td>
                  <Td className="font-mono text-ink">{b.inventoryId}</Td>
                  <Td className="font-mono text-ink-2">
                    {b.poNumber ?? (b.source === "OPENING" ? "Opening balance" : "—")}
                    {b.grnNo && <span className="block text-[11px] text-ink-3">{b.grnNo}</span>}
                  </Td>
                  <Td className="text-right font-mono text-ink">
                    {fmt(b.remaining)} {b.uom}
                  </Td>
                  <Td className="text-ink-2">{b.expiryDate ? expiryDay(b.expiryDate) : "Not on PO"}</Td>
                  <Td className="text-right font-mono text-ink-2">{b.expiryDate ? batchDays(b.expiryDate, now) : "—"}</Td>
                  <Td>
                    <ExpiryPill status={batchStatus(b, now)} />
                  </Td>
                </Row>
              ))}
            </Table>
          </Panel>
        )}

        {section === "spares" && (
          <SparesSection spares={spares} maintenance={maintenance} periodNote={periodNote} onOpenIssue={toIssue} />
        )}

        {section === "value" && <ValueSection records={active} />}

        {section === "utilisation" && (
          <Panel
            title="Location Utilisation"
            note={`Utilisation = stock ÷ capacity × 100, for locations with a registered capacity. Current is now; average and peak are over ${periodNote}, replayed from the ledger.${unconfigured ? ` ${unconfigured} holding locations have no capacity registered and are not shown — capacity is never invented.` : ""}`}
          >
            <Table
              head={
                <>
                  <Th>Location</Th>
                  <Th className="text-right">Capacity</Th>
                  <Th className="text-right">Current Stock</Th>
                  <Th className="text-right">Average Stock</Th>
                  <Th className="text-right">Peak Stock</Th>
                  <Th>Utilisation %</Th>
                  <Th className="text-right">Peak %</Th>
                </>
              }
              empty={utilRows.length === 0 ? <Empty>No holding location has a capacity registered.</Empty> : undefined}
            >
              {utilRows.map((u) => (
                <Row key={u.location.locationId}>
                  <Td>
                    <span className="block text-ink">{u.location.name}</span>
                    <span className="block font-mono text-[11px] text-ink-3">{u.location.locationId}</span>
                  </Td>
                  <Td className="text-right font-mono text-ink-2">
                    {fmt(u.location.capacity!)} {u.location.uom ?? ""}
                  </Td>
                  <Td className="text-right font-mono text-ink">{fmt(u.current)}</Td>
                  <Td className="text-right font-mono text-ink-2">{fmt(u.average)}</Td>
                  <Td className="text-right font-mono text-ink-2">{fmt(u.peak)}</Td>
                  <Td>
                    <UtilBar pct={u.pct} />
                  </Td>
                  <Td className="text-right font-mono text-ink-2">{Math.round(u.peakPct)}%</Td>
                </Row>
              ))}
            </Table>
          </Panel>
        )}

        {section === "movements" && <MovementsSection identity={identity} issues={issues} range={range} periodNote={periodNote} adjustments={adjustments} />}
      </div>

    </div>
  )
}

/* ── sections ────────────────────────────────────────────────────────────── */

function SparesSection({
  spares,
  maintenance,
  periodNote,
  onOpenIssue,
}: {
  spares: Array<{ material: { materialId: string; name: string; uom: string }; held: InventoryRecord[]; qty: number; min: number; available: boolean }>
  maintenance: ReturnType<typeof maintenanceConsumption>
  periodNote: string
  onOpenIssue: (issueId: string) => void
}) {
  const [by, setBy] = useState<"asset" | "reference" | "material">("asset")
  const lines = useMemo(
    () =>
      costBy(maintenance, (r) =>
        by === "asset"
          ? r.assetId ?? "No asset"
          : by === "reference"
            ? r.maintenanceRef ?? "No reference"
            : materialEntry(r.materialId)?.name ?? r.materialId,
      ),
    [maintenance, by],
  )
  const top = lines[0]?.cost ?? 0
  return (
    <>
      <Panel title="Critical Spares" note="Spares flagged Critical Spare = Yes in Materials + Grades, against their Min Stock.">
        <Table
          head={
            <>
              <Th>Critical Spare</Th>
              <Th>Material</Th>
              <Th className="text-right">Current Quantity</Th>
              <Th className="text-right">Minimum Stock</Th>
              <Th>Location</Th>
              <Th>Status</Th>
            </>
          }
          empty={spares.length === 0 ? <Empty>No material is flagged as a critical spare.</Empty> : undefined}
        >
          {spares.map((s) => (
            <Row key={s.material.materialId}>
              <Td className="font-semibold text-ink">Yes</Td>
              <Td className="text-ink">{s.material.name}</Td>
              <Td className="text-right font-mono text-ink">
                {fmt(s.qty)} {s.material.uom}
              </Td>
              <Td className="text-right font-mono text-ink-2">{fmt(s.min)}</Td>
              <Td className="text-ink-2">{s.held.map((r) => locationName(r.locationId)).join(", ") || "Not held"}</Td>
              <Td>
                <StatusBadge status={s.available ? "HEALTHY" : "CRITICAL"} />
              </Td>
            </Row>
          ))}
        </Table>
      </Panel>

      <Panel
        title={`Maintenance Material Cost — ${periodNote}`}
        note="Material cost = consumed quantity (net of returns) × the unit cost captured at consumption. Spare consumption is costed to the asset it was drawn for. Costs are demo standard costs."
        action={
          <div className="flex gap-1 rounded-lg bg-panel p-1 ring-1 ring-line" role="group" aria-label="Group maintenance cost by">
            {(
              [
                ["asset", "By Asset"],
                ["reference", "By Maintenance Ref"],
                ["material", "By Material"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setBy(id)}
                aria-pressed={by === id}
                className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${by === id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <Table
          head={
            <>
              <Th>{by === "asset" ? "Asset" : by === "reference" ? "Maintenance Reference" : "Material"}</Th>
              <Th className="text-right">Quantity</Th>
              <Th className="text-right">Material Cost</Th>
              <Th>Share</Th>
              <Th>Issues</Th>
            </>
          }
          empty={lines.length === 0 ? <Empty>No maintenance consumption in this period.</Empty> : undefined}
        >
          {lines.map((l) => (
            <Row key={l.key}>
              <Td className="text-ink">
                {by === "asset" ? (
                  <>
                    <span className="block">{plantAsset(l.key)?.name ?? l.key}</span>
                    <span className="block font-mono text-[11px] text-ink-3">{l.key}</span>
                  </>
                ) : (
                  <span className={by === "reference" ? "font-mono" : ""}>{l.key}</span>
                )}
              </Td>
              <Td className="text-right font-mono text-ink-2">
                {fmt(l.quantity)} {l.uom}
              </Td>
              <Td className="text-right font-mono font-semibold text-ink">
                {money(l.cost)}
                {l.uncosted > 0 && <span className="block font-sans text-[10.5px] font-normal text-ink-3">{l.uncosted} without a unit cost</span>}
              </Td>
              <Td>
                <Meter pct={top > 0 ? (l.cost / top) * 100 : 0} label={`${Math.round(top > 0 ? (l.cost / top) * 100 : 0)}% of highest`} />
              </Td>
              <Td className="text-ink-2">
                {l.records.map((r, i) => (
                  <span key={r.issueId}>
                    {i > 0 && ", "}
                    <button onClick={() => onOpenIssue(r.issueId)} className="font-mono text-[11.5px] text-accent hover:underline">
                      {r.issueId}
                    </button>
                  </span>
                ))}
              </Td>
            </Row>
          ))}
        </Table>
      </Panel>
    </>
  )
}

function ValueSection({ records }: { records: InventoryRecord[] }) {
  const [by, setBy] = useState<"material" | "grade" | "location" | "group">("material")
  const lines = useMemo(
    () =>
      inventoryValueBy(
        records,
        (r) => materialEntry(r.materialId)?.unitCost,
        (r) => {
          const m = materialEntry(r.materialId)
          if (by === "material") return m?.name ?? r.materialId
          if (by === "grade") return `${m?.name ?? r.materialId} — ${gradeEntry(r.gradeId)?.name ?? "—"}`
          if (by === "location") return locationEntry(r.locationId)?.name ?? r.locationId
          return m?.group ?? "Not set"
        },
      ),
    [records, by],
  )
  const total = lines.reduce((s, l) => s + l.value, 0)
  return (
    <Panel
      title="Inventory Value"
      note="Live value = inventory quantity × applicable unit cost (the material's standard cost). The valuation method and cost source are the business's to define; these are demo standard costs."
      action={
        <div className="flex gap-1 rounded-lg bg-panel p-1 ring-1 ring-line" role="group" aria-label="Analyse value by">
          {(
            [
              ["material", "Material"],
              ["grade", "Grade"],
              ["location", "Location"],
              ["group", "Material Group"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setBy(id)}
              aria-pressed={by === id}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${by === id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <Table
        head={
          <>
            <Th>{by === "group" ? "Material Group" : by[0].toUpperCase() + by.slice(1)}</Th>
            <Th className="text-right">Quantity</Th>
            <Th className="text-right">Inventory Value</Th>
            <Th>Share of Total</Th>
          </>
        }
      >
        {lines.map((l) => (
          <Row key={l.key}>
            <Td className="text-ink">
              {l.key}
              {l.unvalued > 0 && <span className="block text-[10.5px] text-ink-3">{l.unvalued} record(s) without a unit cost — not valued</span>}
            </Td>
            <Td className="text-right font-mono text-ink-2">
              {l.uom === "mixed" ? "Mixed units" : `${fmt(l.quantity)} ${l.uom}`}
            </Td>
            <Td className="text-right font-mono font-semibold text-ink">{money(l.value)}</Td>
            <Td>
              <Meter pct={total > 0 ? (l.value / total) * 100 : 0} label={`${(total > 0 ? (l.value / total) * 100 : 0).toFixed(1)}%`} />
            </Td>
          </Row>
        ))}
        <tr className="border-t-2 border-line bg-panel-2">
          <td className="px-3 py-2.5 font-semibold text-ink">Total</td>
          <td />
          <td className="px-3 py-2.5 text-right font-mono font-bold text-ink">{money(total)}</td>
          <td />
        </tr>
      </Table>
    </Panel>
  )
}

function MovementsSection({
  identity,
  issues,
  range,
  periodNote,
  adjustments,
}: {
  identity: ReturnType<typeof balanceIdentity>
  issues: ReturnType<typeof useIssues>["records"]
  range: { from: number; to: number }
  periodNote: string
  adjustments: ReturnType<typeof usePiles>["ledger"]
}) {
  const m = identity.movements
  const byCategory = useMemo(() => {
    const rows = new Map<string, { gross: number; returned: number; uom: string }>()
    for (const r of issues) {
      if (!r.consumption || !within(r.consumption.at, range)) continue
      const key = `${r.consumption.category}|${r.uom}`
      const row = rows.get(key) ?? { gross: 0, returned: 0, uom: r.uom }
      row.gross += r.consumption.consumedQty
      row.returned += returnedQty(r)
      rows.set(key, row)
    }
    return CONSUMPTION_CATEGORIES.flatMap((c) =>
      [...rows.entries()].filter(([k]) => k.startsWith(`${c}|`)).map(([, v]) => ({ category: c, ...v })),
    )
  }, [issues, range])
  const agrees = Math.abs(identity.computed - identity.closing) < 0.5

  return (
    <>
      <Panel title={`Inventory Balance — bulk materials (MT), ${periodNote}`} note="Current Inventory = Previous Closing + Material Inward − Expired − Net Consumed ± Approved Adjustments, with other losses shown on their own lines.">
        <div className="overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full min-w-[520px] border-collapse text-[12.5px]" data-balance>
            <tbody>
              <BalanceLine label="Previous Closing Inventory" value={identity.opening} />
              <BalanceLine label="Material Inward" value={m.inward} sign="+" />
              <BalanceLine label="Gross Outward" value={m.grossOutward} sign="−" sub />
              <BalanceLine label="Returned Material" value={m.returned} sign="+" sub />
              <BalanceLine label="Net Consumed (gross outward − returned)" value={m.netConsumed} sign="−" />
              <BalanceLine label="Expired" value={m.losses.EXPIRY} sign="−" />
              <BalanceLine label="Waste" value={m.losses.WASTE} sign="−" />
              <BalanceLine label="Loss" value={m.losses.LOSS} sign="−" />
              <BalanceLine label="Unaccounted" value={m.losses.UNACCOUNTED} sign="−" />
              <BalanceLine label="Adjustments (+)" value={m.adjustmentsIn} sign="+" />
              <BalanceLine label="Adjustments (−)" value={m.adjustmentsOut} sign="−" />
              <tr className="border-t-2 border-line bg-panel-2">
                <td className="px-3 py-2.5 font-semibold text-ink">Current Inventory</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-ink">{fmt(identity.computed)} MT</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-2">
          {agrees ? "✓ Agrees with the ledger's closing balance" : "✕ Differs from the ledger's closing balance"} of {fmt(identity.closing)} MT.
        </p>
      </Panel>

      <Panel title="Net Consumption by Category" note="RM, IM, FG and SPARE are consumption; EXPIRED, WASTED, LOST and UNACCOUNTED are exception outcomes, counted as loss. Returns net off the gross outward.">
        <Table
          head={
            <>
              <Th>Category</Th>
              <Th className="text-right">Gross Outward</Th>
              <Th className="text-right">Returned</Th>
              <Th className="text-right">Net Consumed</Th>
              <Th>Kind</Th>
            </>
          }
          empty={byCategory.length === 0 ? <Empty>No consumption recorded in this period.</Empty> : undefined}
        >
          {byCategory.map((c) => {
            const meta = CONSUMPTION_CATEGORY_META[c.category]
            return (
              <Row key={`${c.category}-${c.uom}`}>
                <Td className="font-semibold text-ink">{meta.label}</Td>
                <Td className="text-right font-mono text-ink-2">
                  {fmt(c.gross)} {c.uom}
                </Td>
                <Td className="text-right font-mono text-ink-2">{fmt(c.returned)}</Td>
                <Td className="text-right font-mono font-semibold text-ink">
                  {fmt(c.gross - c.returned)} {c.uom}
                </Td>
                <Td className="text-ink-2">{meta.productive ? "Consumption" : "Loss"}</Td>
              </Row>
            )
          })}
        </Table>
      </Panel>

      <Panel title="Inventory Adjustments" note="Approved corrections posted directly against a balance, each with its reason. Opening balances are excluded.">
        <Table
          head={
            <>
              <Th>Transaction</Th>
              <Th>Inventory ID</Th>
              <Th className="text-right">Quantity</Th>
              <Th>Reason / Reference</Th>
              <Th>User</Th>
            </>
          }
          empty={adjustments.length === 0 ? <Empty>No adjustments in this period.</Empty> : undefined}
        >
          {adjustments.map((t) => (
            <Row key={t.txnId}>
              <Td className="font-mono text-ink">{t.txnId}</Td>
              <Td className="font-mono text-ink-2">{t.inventoryId}</Td>
              <Td className="text-right font-mono text-ink">
                {t.quantity > 0 ? "+" : ""}
                {fmt(t.quantity)} {t.uom}
              </Td>
              <Td className="text-ink-2">
                {t.reason ?? "—"}
                {t.reference && <span className="block text-[11px] text-ink-3">{t.reference}</span>}
              </Td>
              <Td className="font-mono text-[11px] text-ink-3">{t.actor}</Td>
            </Row>
          ))}
        </Table>
      </Panel>
    </>
  )
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

/** A stat tile. The value stays in ink; attention is an icon plus words, never colour alone. */
function Kpi({ label, value, note, alert, onOpen }: { label: string; value: string; note: string; alert?: boolean; onOpen?: () => void }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">{label}</span>
        {alert && (
          <span className="flex items-center gap-1 rounded-full bg-crit/15 px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wide text-ink ring-1 ring-crit/40">
            <span aria-hidden>!</span> Attention
          </span>
        )}
      </span>
      <span className="mt-1 block font-mono text-[22px] font-bold leading-tight text-ink">{value}</span>
      <span className="mt-1 block text-[11px] text-ink-3">{note}</span>
      {onOpen && <span className="mt-1.5 block text-[11px] font-medium text-accent">View detail →</span>}
    </>
  )
  return onOpen ? (
    <button onClick={onOpen} className="rounded-xl bg-panel p-3.5 text-left ring-1 ring-line transition-colors hover:bg-panel-2 hover:ring-line-2" data-kpi={label}>
      {body}
    </button>
  ) : (
    <div className="rounded-xl bg-panel p-3.5 ring-1 ring-line" data-kpi={label}>
      {body}
    </div>
  )
}

function Panel({ title, note, action, children }: { title: string; note: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-bold text-ink">{title}</h2>
          <p className="max-w-[900px] text-[11.5px] text-ink-3">{note}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide text-ink ring-1 ${
        ok ? "bg-ok/15 ring-ok/40" : "bg-crit/15 ring-crit/40"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : "✕"}</span>
      {children}
    </span>
  )
}

/** A single-hue meter with its figure in words beside it. */
function Meter({ pct, label }: { pct: number; label: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-[6px] w-[96px] overflow-hidden rounded-full bg-panel-2 ring-1 ring-line">
        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: "var(--color-accent)" }} />
      </span>
      <span className="font-mono text-[11.5px] text-ink-2">{label}</span>
    </span>
  )
}

function BalanceLine({ label, value, sign, sub }: { label: string; value: number; sign?: "+" | "−"; sub?: boolean }) {
  return (
    <tr className="border-t border-line bg-panel/60">
      <td className={`px-3 py-2 ${sub ? "pl-8 text-ink-3" : "text-ink-2"}`}>{label}</td>
      <td className={`px-3 py-2 text-right font-mono ${sub ? "text-ink-3" : "text-ink"}`}>
        {sign ? `${sign} ` : ""}
        {fmt(value)} MT
      </td>
    </tr>
  )
}

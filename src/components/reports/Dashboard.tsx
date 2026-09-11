"use client"

/**
 * Inventory dashboard — the first view of Reports & Insights.
 *
 *   KPI row            total inventory, value, materials, locations,
 *                      critical items, pending test lots
 *   Charts             inventory by material, inventory status, days of
 *                      inventory against the production plan
 *   Attention          low stock / critical, pending quality, upcoming expiry
 *   Recent activity    the latest inventory transactions
 *
 * Every figure is derived from the live records. Stock status is HEALTHY or
 * CRITICAL only — there is no third state. Tonnages cover bulk materials in MT;
 * spares are counted in their own units and never added to tonnes.
 */

import { useMemo, useState } from "react"

import { useIncoming } from "@/components/incoming/incoming-store"
import { StatusBadge } from "@/components/inventory/StatusBadge"
import { useIssues } from "@/components/issues/issue-store"
import { usePiles } from "@/components/shell/pile-store"
import { gradeEntry, locationName, materialEntry } from "@/lib/inventory/catalog"
import { transactionLabel, type InventoryTransaction } from "@/lib/inventory/ledger"
import { STOCK_STATUS_META, type InventoryRecord } from "@/lib/inventory/model"
import { recordStatus } from "@/lib/inventory/status"
import { consumingArea } from "@/lib/issues/catalog"
import { holdsStock } from "@/lib/masters/types"
import { useMasters } from "@/lib/masters/useMasters"
import { PRODUCTION_PLANS, planDays, planReadiness } from "@/lib/production/plan"
import { MATERIAL_CHART_ORDER, OTHER_COLOUR } from "@/lib/reports/palette"
import {
  EXPIRING_SOON_DAYS,
  daysToExpiry,
  pctChange,
  pendingQuality,
  snapshotAt,
  snapshotTotals,
  within,
  type Range,
} from "@/lib/reports/insights"

export type DashboardTarget = "critical" | "quality" | "expiry" | "readiness" | "value"

const fmt = (n: number) => Math.round(n).toLocaleString()
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })

/** Compact money: $6.52M, $845K. */
function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`
  return `$${Math.round(n)}`
}

export function Dashboard({
  range,
  periodNote,
  now,
  onDrill,
}: {
  range: Range
  periodNote: string
  now: Date
  onDrill: (target: DashboardTarget) => void
}) {
  const { inventory, ledger, setMode, setInventoryTab } = usePiles()
  const { records: incoming, setOpenId: openIncoming } = useIncoming()
  const { records: issues } = useIssues()
  const masters = useMasters()

  const active = useMemo(() => inventory.filter((r) => r.active), [inventory])
  const cost = (materialId: string) => materialEntry(materialId)?.unitCost

  /* ── KPIs, with the week-on-week change replayed from the ledger ───────── */
  const kpi = useMemo(() => {
    const t = now.getTime()
    const current = snapshotTotals(snapshotAt(ledger, t), cost)
    const weekAgo = snapshotTotals(snapshotAt(ledger, t - 7 * 86_400_000), cost)
    return {
      total: current.quantity,
      totalDelta: pctChange(current.quantity, weekAgo.quantity),
      value: current.value,
      valueDelta: pctChange(current.value, weekAgo.value),
      materials: masters.materials.filter((m) => m.active).length,
      locations: masters.locations.filter((l) => l.active && holdsStock(l)).length,
      critical: active.filter((r) => recordStatus(r) === "CRITICAL").length,
    }
  }, [ledger, now, masters, active])

  const pending = useMemo(() => pendingQuality(incoming), [incoming])

  /* ── inventory by material (MT) ─────────────────────────────────────────── */
  const byMaterial = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of active) if (r.uom === "MT") totals.set(r.materialId, (totals.get(r.materialId) ?? 0) + r.quantity)
    const known = new Set(MATERIAL_CHART_ORDER.map((m) => m.materialId))
    const slices = MATERIAL_CHART_ORDER.filter((m) => (totals.get(m.materialId) ?? 0) > 0).map((m) => ({
      key: m.materialId,
      label: materialEntry(m.materialId)?.name ?? m.materialId,
      value: totals.get(m.materialId)!,
      colour: m.colour,
    }))
    const other = [...totals.entries()].filter(([id]) => !known.has(id)).reduce((s, [, v]) => s + v, 0)
    if (other > 0) slices.push({ key: "OTHER", label: "Other", value: other, colour: OTHER_COLOUR })
    return slices
  }, [active])

  /* ── inventory status (records) ─────────────────────────────────────────── */
  const status = useMemo(() => {
    const healthy = active.filter((r) => recordStatus(r) === "HEALTHY").length
    return [
      { key: "HEALTHY", label: "Healthy", value: healthy, colour: STOCK_STATUS_META.HEALTHY.colour },
      { key: "CRITICAL", label: "Critical", value: active.length - healthy, colour: STOCK_STATUS_META.CRITICAL.colour },
    ]
  }, [active])

  /* ── days of inventory vs the production plan ───────────────────────────── */
  const days = useMemo(() => {
    const usable = new Map<string, number>()
    for (const r of active) {
      if (r.expiryDate && new Date(r.expiryDate).getTime() < now.getTime()) continue
      usable.set(r.materialId, (usable.get(r.materialId) ?? 0) + r.quantity)
    }
    const rows = new Map<string, { materialId: string; days: number; horizon: number }>()
    for (const plan of PRODUCTION_PLANS) {
      for (const q of planReadiness(plan, (id) => usable.get(id) ?? 0).requirements) {
        if (q.daysOfInventory === null || rows.has(q.materialId)) continue
        rows.set(q.materialId, { materialId: q.materialId, days: q.daysOfInventory, horizon: planDays(plan) })
      }
    }
    return [...rows.values()].sort((a, b) => b.days - a.days)
  }, [active, now])

  /* ── attention tables ───────────────────────────────────────────────────── */
  const lowStock = useMemo(
    () =>
      [...active]
        .filter((r) => r.minStock > 0)
        .sort((a, b) => a.quantity / a.minStock - b.quantity / b.minStock)
        .slice(0, 5),
    [active],
  )

  const expiring = useMemo(
    () =>
      active
        .filter((r) => r.expiryDate && materialEntry(r.materialId)?.expiryApplicable && r.quantity > 0)
        .map((r) => ({ record: r, days: daysToExpiry(r.expiryDate!, now) }))
        .filter((e) => e.days <= EXPIRING_SOON_DAYS)
        .sort((a, b) => a.days - b.days),
    [active, now],
  )

  const recent = useMemo(() => ledger.filter((t) => within(t.at, range)).slice(0, 6), [ledger, range])

  const toTransactions = () => {
    setInventoryTab("transactions")
    setMode("inventory")
  }

  return (
    <div className="grid gap-4" data-dashboard>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon="stack" tint="#2563eb" label="Total Inventory" value={`${fmt(kpi.total)} MT`} delta={kpi.totalDelta} note="vs last week" />
        <Stat icon="coins" tint="#c2860a" label="Inventory Value" value={money(kpi.value)} delta={kpi.valueDelta} note="vs last week" />
        <Stat icon="box" tint="#8b5cf6" label="Materials" value={String(kpi.materials)} note="Active materials" />
        <Stat icon="pin" tint="#16a34a" label="Locations" value={String(kpi.locations)} note="Storage locations" />
        <Stat icon="alert" tint="#dc2626" label="Critical Items" value={String(kpi.critical)} note="At or below minimum" onClick={() => onDrill("critical")} />
        <Stat icon="flask" tint="#ea580c" label="Pending Test Lots" value={String(pending.length)} note="Awaiting quality" onClick={() => onDrill("quality")} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr_1.1fr]">
        <Card title="Inventory by Material" action={<ViewAll onClick={() => onDrill("value")} />}>
          <DonutWithTable
            slices={byMaterial}
            unit="MT"
            centreLabel="Total"
            note="Bulk materials, in MT. Spares are held in their own units and are not added to tonnes."
          />
        </Card>
        <Card title="Inventory Status" action={<ViewAll onClick={() => onDrill("critical")} />}>
          <DonutWithTable slices={status} centreLabel="Records" note="HEALTHY above Min Stock, CRITICAL at or below it." compact />
        </Card>
        <Card title="Days of Inventory (vs Production Plan)" action={<ViewAll onClick={() => onDrill("readiness")} />}>
          <DaysBars rows={days} />
        </Card>
      </div>

      {/* Attention */}
      {/* Three across on wide screens; below that Low Stock takes the full width. */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1.2fr_1fr_1fr]">
        <Card title="Low Stock / Critical Items" wide action={<ViewAll onClick={() => onDrill("critical")} />}>
          <MiniTable
            head={["Material (Grade)", "Location", "Current", "Min", "Status"]}
            align={["l", "l", "r", "r", "l"]}
            empty="No inventory has a minimum set."
            rows={lowStock.map((r) => [
              <MaterialCell key="m" record={r} />,
              <span key="l" className="text-ink-2">{shortLocation(r.locationId)}</span>,
              <span key="c" className="whitespace-nowrap font-mono text-ink">{fmt(r.quantity)} {r.uom}</span>,
              <span key="n" className="whitespace-nowrap font-mono text-ink-2">{fmt(r.minStock)}</span>,
              <StatusBadge key="s" status={recordStatus(r)} />,
            ])}
          />
        </Card>
        <Card title="Pending Quality" action={<ViewAll onClick={() => onDrill("quality")} />}>
          <MiniTable
            head={["Material (Grade)", "Received", "Lot / GRN", "Days"]}
            align={["l", "r", "l", "r"]}
            empty="No delivery is waiting for a test."
            rows={pending.slice(0, 5).map((r) => {
              const qty = r.weighing?.netMt ?? r.expectedMt
              const age = Math.max(0, Math.floor((now.getTime() - new Date(r.audit[0]?.at ?? r.expectedArrival).getTime()) / 86_400_000))
              return [
                <button key="m" onClick={() => { openIncoming(r.incomingId); setMode("incoming") }} className="text-left hover:underline">
                  <MaterialGrade materialId={r.materialId} gradeId={r.gradeId} />
                </button>,
                <span key="q" className="whitespace-nowrap font-mono text-ink">
                  {fmt(qty)} MT{!r.weighing && <span className="font-sans text-[10.5px] text-ink-3"> exp.</span>}
                </span>,
                <span key="g" className="whitespace-nowrap font-mono text-ink-2">{r.grnNo ?? r.incomingId}</span>,
                <span key="d" className="font-mono text-ink-2">{age}</span>,
              ]
            })}
          />
        </Card>
        <Card title={`Upcoming Expiry (Next ${EXPIRING_SOON_DAYS} Days)`} action={<ViewAll onClick={() => onDrill("expiry")} />}>
          <MiniTable
            head={["Material (Grade)", "Location", "Qty", "Expires"]}
            align={["l", "l", "r", "l"]}
            empty="Nothing expires in the next 30 days."
            rows={expiring.map(({ record: r, days: d }) => [
              <MaterialCell key="m" record={r} />,
              <span key="l" className="text-ink-2">{shortLocation(r.locationId)}</span>,
              <span key="q" className="whitespace-nowrap font-mono text-ink">{fmt(r.quantity)} {r.uom}</span>,
              <span key="e" className={d < 0 ? "font-semibold text-ink" : "text-ink-2"}>
                <span className="block whitespace-nowrap">
                  {new Date(r.expiryDate!).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                {d < 0 ? (
                  <span className="mt-0.5 inline-block rounded bg-crit/15 px-1 text-[10px] font-bold uppercase text-ink ring-1 ring-crit/40">✕ Expired</span>
                ) : (
                  <span className="block text-[11px] text-ink-3">{d} days</span>
                )}
              </span>,
            ])}
          />
        </Card>
      </div>

      {/* Recent transactions */}
      <Card title={`Recent Transactions — ${periodNote}`} action={<ViewAll onClick={toTransactions} />}>
        <MiniTable
          head={["Date & Time", "Type", "Material (Grade)", "Qty", "From", "To", "Reference"]}
          align={["l", "l", "l", "r", "l", "l", "l"]}
          empty="No inventory transactions in this period."
          rows={recent.map((t) => {
            const { from, to, reference } = route(t, incoming, issues)
            const inward = t.quantity >= 0
            return [
              <span key="d" className="whitespace-nowrap text-ink-2">{stamp(t.at)}</span>,
              <span key="t" className="flex items-center gap-1.5 whitespace-nowrap text-ink">
                <span aria-hidden className={`font-bold ${inward ? "text-ok" : "text-crit"}`}>{inward ? "↓" : "↑"}</span>
                {transactionLabel(t.type, t.quantity)}
              </span>,
              <span key="m" className="flex items-center gap-2 whitespace-nowrap text-ink">
                <Dot colour={chartColour(t.materialId)} />
                {materialEntry(t.materialId)?.name}
                <span className="text-ink-3">({gradeEntry(t.gradeId)?.name ?? "—"})</span>
              </span>,
              <span key="q" className="whitespace-nowrap font-mono text-ink">{fmt(Math.abs(t.quantity))} {t.uom}</span>,
              <span key="f" className="text-ink-2">{from}</span>,
              <span key="o" className="text-ink-2">{to}</span>,
              <span key="r" className="font-mono text-[11.5px] text-ink-2">{reference}</span>,
            ]
          })}
        />
      </Card>
    </div>
  )
}

/* ── where a movement came from and went to ──────────────────────────────── */

function route(t: InventoryTransaction, incoming: ReturnType<typeof useIncoming>["records"], issues: ReturnType<typeof useIssues>["records"]) {
  const here = shortLocation(t.locationId)
  const areaId = t.links.consumingAreaId ?? issues.find((i) => i.issueId === t.links.issueId)?.consumingAreaId
  const areaName = areaId ? (consumingArea(areaId)?.name ?? areaId) : "—"
  switch (t.type) {
    case "INCOMING": {
      const r = incoming.find((x) => x.incomingId === t.links.incomingId)
      return { from: r ? `Gate Entry · ${r.supplier}` : "Gate Entry", to: here, reference: t.links.grnNo ?? t.links.incomingId ?? "—" }
    }
    case "RETURN":
      return { from: areaName, to: here, reference: t.links.returnId ?? "—" }
    case "CONSUMPTION":
    case "ISSUE":
      return { from: here, to: areaName, reference: t.links.consumptionId ?? t.links.issueId ?? "—" }
    case "ADJUSTMENT":
      return t.quantity >= 0
        ? { from: "Adjustment", to: here, reference: t.links.adjustmentId ?? "—" }
        : { from: here, to: "Adjustment", reference: t.links.adjustmentId ?? "—" }
    default:
      // Expiry, waste, loss and unaccounted leave stock with no destination.
      return { from: here, to: transactionLabel(t.type), reference: t.links.consumptionId ?? t.links.lotId ?? t.reason ?? "—" }
  }
}

function shortLocation(locationId: string): string {
  // "Limestone Pile — PILE-RM-01" reads as "Limestone Pile" in a compact table.
  return locationName(locationId).split(" — ")[0]
}

function chartColour(materialId: string): string {
  return MATERIAL_CHART_ORDER.find((m) => m.materialId === materialId)?.colour ?? OTHER_COLOUR
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function Card({ title, action, wide, children }: { title: string; action?: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`min-w-0 rounded-xl bg-panel p-4 ring-1 ring-line ${wide ? "lg:col-span-2 2xl:col-span-1" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13.5px] font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function ViewAll({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 text-[12px] font-semibold text-accent hover:underline">
      View All
    </button>
  )
}

function Dot({ colour }: { colour: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} />
}

function MaterialCell({ record: r }: { record: InventoryRecord }) {
  return <MaterialGrade materialId={r.materialId} gradeId={r.gradeId} />
}

/** Material with its grade underneath — compact enough for a narrow card. */
function MaterialGrade({ materialId, gradeId }: { materialId: string; gradeId?: string }) {
  return (
    <span className="flex items-start gap-2 text-ink">
      <span className="mt-[4px] flex shrink-0">
        <Dot colour={chartColour(materialId)} />
      </span>
      <span className="leading-tight">
        <span className="block">{materialEntry(materialId)?.name}</span>
        <span className="block text-[11px] text-ink-3">{gradeEntry(gradeId)?.name ?? "—"}</span>
      </span>
    </span>
  )
}

const ICONS: Record<string, string> = {
  stack: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></g>`,
  coins: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><ellipse cx="15" cy="14" rx="5" ry="2.5"/><path d="M10 14v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4"/></g>`,
  box: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/></g>`,
  pin: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></g>`,
  alert: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17v.5"/></g>`,
  flask: `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/></g>`,
}

/** A stat tile: the value in ink; the change carries an arrow and words, never colour alone. */
function Stat({
  icon,
  tint,
  label,
  value,
  note,
  delta,
  onClick,
}: {
  icon: keyof typeof ICONS
  tint: string
  label: string
  value: string
  note: string
  delta?: number | null
  onClick?: () => void
}) {
  const body = (
    <span className="flex items-start gap-3">
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
        style={{ background: `${tint}1f`, color: tint }}
        dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="20" height="20">${ICONS[icon]}</svg>` }}
      />
      <span className="min-w-0">
        <span className="block text-[11.5px] font-medium text-ink-2">{label}</span>
        <span className="block font-mono text-[20px] font-bold leading-tight text-ink">{value}</span>
        <span className="block text-[11px] text-ink-3">
          {delta !== undefined && delta !== null && (
            <span className="mr-1 font-semibold text-ink-2">
              <span aria-hidden className={delta >= 0 ? "text-ok" : "text-crit"}>
                {delta >= 0 ? "↑" : "↓"}
              </span>{" "}
              {Math.abs(delta).toFixed(1)}%{" "}
            </span>
          )}
          {delta === null ? "No figure a week ago" : note}
        </span>
      </span>
    </span>
  )
  return onClick ? (
    <button onClick={onClick} className="rounded-xl bg-panel p-3.5 text-left ring-1 ring-line transition-colors hover:bg-panel-2" data-stat={label}>
      {body}
    </button>
  ) : (
    <div className="rounded-xl bg-panel p-3.5 ring-1 ring-line" data-stat={label}>
      {body}
    </div>
  )
}

/**
 * Donut + legend table. The table carries every value and percentage, so no
 * reading depends on colour; hovering a slice or a row highlights both.
 */
function DonutWithTable({
  slices,
  unit,
  centreLabel,
  note,
  compact,
}: {
  slices: Array<{ key: string; label: string; value: number; colour: string }>
  unit?: string
  centreLabel: string
  note: string
  compact?: boolean
}) {
  const [hover, setHover] = useState<string | null>(null)
  const total = slices.reduce((s, x) => s + x.value, 0)
  const R = 54
  const W = 18
  const C = 2 * Math.PI * R
  // A 2px surface gap between segments, as a fraction of the circumference.
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 2.5 : 0
  let offset = 0
  const arcs = slices.map((s) => {
    const len = total > 0 ? (s.value / total) * C : 0
    const arc = { ...s, dash: Math.max(0, len - gap), offset }
    offset += len
    return arc
  })
  const shown = hover ? slices.find((s) => s.key === hover) : null
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0)

  return (
    <div className={`flex flex-wrap items-center gap-4 ${compact ? "" : "sm:flex-nowrap"}`}>
      <svg viewBox="0 0 140 140" width="148" height="148" className="shrink-0" role="img" aria-label={`${centreLabel}: ${fmt(total)}${unit ? ` ${unit}` : ""}`}>
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-panel-2)" strokeWidth={W} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={a.colour}
              strokeWidth={hover === a.key ? W + 4 : W}
              strokeDasharray={`${a.dash} ${C - a.dash}`}
              strokeDashoffset={-a.offset}
              opacity={hover && hover !== a.key ? 0.35 : 1}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: "opacity 120ms, stroke-width 120ms", cursor: "default" }}
            >
              <title>{`${a.label}: ${fmt(a.value)}${unit ? ` ${unit}` : ""} (${pct(a.value)}%)`}</title>
            </circle>
          ))}
        </g>
        <text x="70" y="66" textAnchor="middle" className="fill-[var(--color-ink)] font-mono" fontSize="16" fontWeight="700">
          {fmt(shown ? shown.value : total)}
        </text>
        <text x="70" y="84" textAnchor="middle" className="fill-[var(--color-ink-3)]" fontSize="10">
          {shown ? `${shown.label.split(" ")[0]} · ${pct(shown.value)}%` : `${centreLabel}${unit ? ` · ${unit}` : ""}`}
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {slices.map((s) => (
              <tr
                key={s.key}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                className={hover === s.key ? "bg-panel-2" : ""}
              >
                <td className="py-[3px] pr-2">
                  <span className="flex items-center gap-2 text-ink">
                    <Dot colour={s.colour} />
                    {s.label}
                  </span>
                </td>
                <td className="whitespace-nowrap py-[3px] pr-2 text-right font-mono text-ink-2">
                  {fmt(s.value)}
                  {unit ? ` ${unit}` : ""}
                </td>
                <td className="w-[40px] py-[3px] text-right font-mono text-ink-3">{pct(s.value)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10.5px] text-ink-3">{note}</p>
      </div>
    </div>
  )
}

/**
 * Days of inventory per planned material, as bars. A bar is SHORT (with a
 * cross and the word) when stock runs out before the plan window ends,
 * otherwise COVERED — the same two outcomes as Production Readiness.
 */
function DaysBars({ rows }: { rows: Array<{ materialId: string; days: number; horizon: number }> }) {
  if (rows.length === 0) return <p className="text-[12px] text-ink-3">No production plan consumes stock.</p>
  const max = Math.max(...rows.map((r) => r.days), ...rows.map((r) => r.horizon)) * 1.1
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => {
        const short = r.days < r.horizon
        return (
          <div key={r.materialId} className="grid grid-cols-[132px_1fr_64px] items-center gap-2 text-[12px]" title={`${r.days.toFixed(1)} days of usable stock at the planned rate; plan window ${r.horizon} days`}>
            <span className="truncate text-ink">{materialEntry(r.materialId)?.name}</span>
            <span className="relative h-[12px] rounded-full bg-panel-2">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.min(100, (r.days / max) * 100)}%`, background: short ? STOCK_STATUS_META.CRITICAL.colour : STOCK_STATUS_META.HEALTHY.colour }}
              />
              {/* The plan window, as a marker. */}
              <span aria-hidden className="absolute -inset-y-[3px] w-[2px] bg-ink-2" style={{ left: `${(r.horizon / max) * 100}%` }} />
            </span>
            <span className="whitespace-nowrap text-right font-mono text-ink">
              {r.days.toFixed(1)} d{short && <span className="ml-1 font-sans text-[10px] font-bold text-ink">✕</span>}
            </span>
          </div>
        )
      })}
      <p className="mt-1 text-[10.5px] text-ink-3">
        Usable stock ÷ expected daily consumption from plan + BOM. The tick marks the {rows[0].horizon}-day plan window; a ✕ means stock runs
        out before it ends.
      </p>
    </div>
  )
}

function MiniTable({ head, align, rows, empty }: { head: string[]; align: Array<"l" | "r">; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {head.map((h, i) => (
              <th key={h} className={`whitespace-nowrap border-b border-line px-1.5 pb-2 pt-0 first:pl-0 last:pr-0 ${align[i] === "r" ? "text-right" : "text-left"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b border-line/60 last:border-0">
              {cells.map((c, i) => (
                <td key={i} className={`px-1.5 py-2 align-middle first:pl-0 last:pr-0 ${align[i] === "r" ? "text-right" : "text-left"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-ink-3">{empty}</p>}
    </div>
  )
}

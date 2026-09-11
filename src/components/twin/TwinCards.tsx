"use client"

/**
 * Hover-driven annotation for the Digital Twin.
 *
 * At rest the plant carries only compact numbered tags, so the model stays
 * readable. Hovering a tag (or the unit itself) opens its detail card beside it;
 * clicking pins the card open. This replaced two permanent columns of cards,
 * which crowded the frame and needed fifteen leader lines across the canvas.
 *
 * Pile and silo quantities on the cards are READ from Inventory — the twin
 * keeps no stock figures of its own. Process metrics (throughput, power…) are
 * demo values that drift.
 */

import { useMemo } from "react"

import {
  HEALTH_COLOUR,
  ICONS,
  TWIN_CARDS,
  type CardRow,
  type TwinCard,
} from "@/lib/assets/twin-cards"
import type { PileRecord } from "@/lib/inventory/pile-inventory"
import type { SiloRecord } from "@/lib/inventory/silo-inventory"
import { toneText } from "@/lib/theme/tone"
import type { AnnotationHandles } from "./projection"

const CARD_W = 246

/** Inventory, read by location. Supplied by the view; never stored here. */
export type LiveInventory = {
  pile: (locationId: string) => PileRecord | undefined
  silo: (locationId: string) => SiloRecord | undefined
}

/** Twin pile units → the inventory location they represent. */
const PILE_LOCATION: Record<string, string> = {
  "PILE-RM-01": "PILE-RM-01",
  "PILE-RM-02": "PILE-RM-02",
  "PILE-AF": "PILE-RM-06",
  "PILE-COAL": "PILE-RM-05",
  "PILE-RM-07": "PILE-RM-07",
}

const SILO_IDS = ["SL-01", "SL-02", "SL-03"]

const fmtMt = (n: number) => `${Math.round(n).toLocaleString()} MT`

/**
 * A stock unit's health comes from Inventory (HEALTHY → normal, CRITICAL →
 * critical), never from the card's static definition. Other units keep theirs.
 */
function liveHealth(card: TwinCard, inventory: LiveInventory): TwinCard["health"] {
  const loc = PILE_LOCATION[card.id]
  if (loc) {
    const pile = inventory.pile(loc)
    if (pile) return pile.status === "CRITICAL" ? "CRITICAL" : "NORMAL"
  }
  if (card.silos) {
    const live = SILO_IDS.map((id) => inventory.silo(id)).filter(Boolean)
    if (live.length) return live.some((x) => x!.status === "CRITICAL") ? "CRITICAL" : "NORMAL"
  }
  return card.health
}

export function TwinCards({
  handles,
  metrics,
  inventory,
  query,
  selected,
  onSelect,
  hovered,
  onHover,
}: {
  handles: AnnotationHandles
  metrics: Record<string, string>
  inventory: LiveInventory
  /** Top-bar search: tags that do not match are faded. */
  query: string
  selected: string | null
  onSelect: (id: string) => void
  hovered: string | null
  onHover: (id: string | null) => void
}) {
  const activeId = hovered ?? selected
  const searching = query.trim() !== ""
  const active = useMemo(() => TWIN_CARDS.find((c) => c.id === activeId) ?? null, [activeId])
  handles.activeId = activeId

  return (
    <div className="pointer-events-none absolute inset-0 z-[600]">
      {/* Compact tags on every unit — enough to read the plant at a glance. */}
      {TWIN_CARDS.map((card) => {
        const isActive = activeId === card.id
        const tone = HEALTH_COLOUR[liveHealth(card, inventory)]
        return (
          <button
            key={card.id}
            ref={(el) => {
              handles.tags[card.id] = el
            }}
            onMouseEnter={() => onHover(card.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(selected === card.id ? "" : card.id)}
            className="pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 rounded-full py-[3px] pl-[3px] pr-2.5 backdrop-blur-sm"
            style={{
              // Position is written by the render loop, not by React — see
              // ProjectionDriver. Only appearance is React-controlled here.
              willChange: "transform",
              background: isActive ? tone : "var(--surface-float-solid)",
              border: `1.5px solid ${tone}`,
              boxShadow: isActive
                ? `0 0 0 6px ${tone}2e, 0 4px 14px var(--surface-shadow)`
                : "0 2px 8px var(--surface-shadow)",
              // De-emphasised, not hidden. Measured against the live scene: 0.35
              // put the label at 2.1:1 and 0.6 still left some at 4.0:1, so 0.7
              // is the lowest fade that keeps every tag at AA in both themes.
              opacity: (searching && !tagMatches(card, query)) || (activeId && !isActive) ? 0.7 : 1,
              zIndex: isActive ? 20 : 10,
              // Background swaps instantly, in step with the label colour — fading
              // it alone leaves dark text on a dark tag mid-transition.
              transition: "opacity 120ms, box-shadow 120ms",
            }}
          >
            <span
              className="grid h-[17px] w-[17px] place-items-center rounded-full text-[9.5px] font-bold"
              style={{
                background: isActive ? "rgba(255,255,255,.45)" : `${tone}33`,
                color: isActive ? "#08131f" : "var(--surface-ink)",
              }}
            >
              {card.no}
            </span>
            <span
              className="text-[10.5px] font-semibold"
              style={{ color: isActive ? "#08131f" : "var(--surface-ink)" }}
            >
              {shortTitle(card)}
            </span>
          </button>
        )
      })}

      {/* Detail for the unit under the pointer, or the pinned one. */}
      {active && (
        <DetailCard
          key={active.id}
          card={active}
          metric={metrics[active.id]}
          inventory={inventory}
          handles={handles}
          pinned={selected === active.id}
          onHover={onHover}
          onClose={() => onSelect("")}
        />
      )}
    </div>
  )
}

/** Whether the search matches this unit: its number, title, tag or short name. */
function tagMatches(card: TwinCard, query: string): boolean {
  const q = query.trim().toLowerCase()
  return [card.id, card.no, card.title, card.tag, card.subtitle, shortTitle(card)].some((v) => v?.toLowerCase().includes(q))
}

/** Tag text: short enough to sit on the plant without covering it. */
function shortTitle(card: TwinCard): string {
  return (
    {
      "PILE-RM-01": "Limestone",
      "PILE-RM-02": "Clay / Shale",
      "PILE-AF": "Alt Fuel",
      "PILE-COAL": "Coal",
      "PILE-RM-07": "Raw Mix",
      "GEO-01": "Geocycle",
      "SL-GRP": "Cement Silos",
      "BYPASS-DUST": "Bypass Dust",
      "ADMIN-01": "Admin & Labs",
      "UT-01": "Utilities",
    }[card.id] ?? card.title
  )
}

function DetailCard({
  card,
  metric,
  inventory,
  handles,
  pinned,
  onHover,
  onClose,
}: {
  card: TwinCard
  metric?: string
  inventory: LiveInventory
  handles: AnnotationHandles
  pinned: boolean
  onHover: (id: string | null) => void
  onClose: () => void
}) {
  // Stock figures come from Inventory; the card's static values are replaced.
  const pile = PILE_LOCATION[card.id] ? inventory.pile(PILE_LOCATION[card.id]) : undefined
  const tone = HEALTH_COLOUR[liveHealth(card, inventory)]
  const headline = pile && card.headline ? fmtMt(pile.quantityMt) : card.headline
  const silos = card.silos
    ? SILO_IDS.map((id, i) => {
        const live = inventory.silo(id)
        return live
          ? { name: `Silo ${i + 1}`, qty: live.quantityMt, dot: live.status === "CRITICAL" ? ("CRITICAL" as const) : undefined }
          : card.silos![i]
      })
    : undefined
  // A pile card's rows come from Inventory: quantity, its minimum, and the
  // HEALTHY / CRITICAL rule. The alarm counts they used to show had no source.
  const rows: CardRow[] = pile
    ? [
        ...(card.headline ? [] : [{ label: "Qty", value: fmtMt(pile.quantityMt) }]),
        { label: "Min", value: fmtMt(pile.minStock) },
        {
          label: "Stock",
          value: pile.status,
          dot: pile.status === "CRITICAL" ? ("CRITICAL" as const) : ("NORMAL" as const),
        },
      ]
    : card.rows

  return (
    <div
      ref={(el) => {
        handles.card = el
      }}
      className="pointer-events-auto absolute left-0 top-0 overflow-hidden rounded-xl backdrop-blur-md"
      style={{
        // Positioned by the render loop alongside the tags, so the card tracks
        // its unit exactly while the view is orbited.
        width: CARD_W,
        willChange: "transform",
        background: "var(--surface-solid)",
        border: `1px solid ${tone}`,
        boxShadow: `0 0 0 1px ${tone}33, 0 14px 38px var(--surface-shadow)`,
        zIndex: 30,
      }}
      onMouseEnter={() => onHover(card.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className="flex items-start gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--surface-border)" }}
      >
        <span
          className="mt-[1px] grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full text-[10px] font-bold"
          style={{
            background: `${tone}26`,
            color: "var(--surface-ink)",
            border: `1px solid ${tone}`,
          }}
        >
          {card.no}
        </span>
        <span
          className="mt-[2px] shrink-0"
          style={{ color: tone }}
          aria-hidden
          dangerouslySetInnerHTML={{
            __html: `<svg viewBox="0 0 24 24" width="15" height="15">${ICONS[card.icon]}</svg>`,
          }}
        />
        <span className="min-w-0 flex-1 leading-[1.3]">
          <span className="block text-[13px] font-semibold text-ink">{card.title}</span>
          {card.subtitle && <span className="block text-[11px] text-ink-3">{card.subtitle}</span>}
          {card.tag && <span className="block text-[11px] text-ink-3">{card.tag}</span>}
          {headline && (
            <span className="mt-0.5 block text-[14px] font-bold text-ink">{headline}</span>
          )}
        </span>
        {pinned && (
          <button
            onClick={onClose}
            aria-label="Unpin"
            className="shrink-0 text-[15px] leading-none text-ink-3 hover:text-ink"
          >
            ×
          </button>
        )}
      </div>

      {silos && (
        <div className="flex gap-1 p-1.5">
          {silos.map((s) => (
            <div
              key={s.name}
              className="flex-1 rounded-md px-1.5 py-2 text-center"
              style={{ background: "var(--surface-tint)" }}
            >
              <span className="flex items-center justify-center gap-1 text-[10px] text-ink-2">
                {s.name}
                {s.dot && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: HEALTH_COLOUR[s.dot] }}
                  />
                )}
              </span>
              <span className="block text-[12px] font-bold text-ink">
                {s.qty.toLocaleString()} MT
              </span>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="px-3 py-1.5">
          {rows.map((row, i) => (
            <Row
              key={row.label + i}
              row={row}
              override={metric && i === metricRow(card) ? metric : undefined}
            />
          ))}
        </div>
      )}

      <div className="px-3 pb-2 pt-0.5 text-[9.5px] text-ink-3">
        {pinned ? "Pinned — click the tag again to release" : "Click to pin"}
      </div>
    </div>
  )
}

function metricRow(card: TwinCard): number {
  return card.id === "CC-01" ? 2 : 1
}

function Row({ row, override }: { row: CardRow; override?: string }) {
  const value = override ?? row.value
  return (
    <div className="flex items-center gap-1.5 py-[1.5px] text-[11px] leading-[1.45]">
      {row.dot && (
        <span
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: HEALTH_COLOUR[row.dot] }}
          aria-hidden
        />
      )}
      <span className="text-ink-2">
        {row.label}
        {row.label && ":"}
      </span>
      <span
        className="ml-auto font-medium"
        style={{ color: row.tone ? toneText(HEALTH_COLOUR[row.tone]) : "var(--surface-ink)" }}
      >
        {value}
      </span>
    </div>
  )
}

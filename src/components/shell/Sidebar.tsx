"use client"

/**
 * Left sidebar — the application's primary navigation.
 *
 *   Digital Twin          (Satellite · 3D, switched inside the module)
 *   Inventory
 *   Master                Locations · Materials + Grades
 *   Incoming
 *   Issue & Consumption
 *   Reports & Insights
 *
 * Grades, transactions, quality, lots, gate entry, GRN, weighing, returns,
 * expiry and spares are workflow details inside these modules, never menus of
 * their own. The sidebar collapses to an icon rail, remembered per browser.
 */

import { useEffect, useState } from "react"

import { BERRIMA_SITE } from "@/config/site"
import { BoralLogo } from "./BoralLogo"
import { TWIN_MODES, usePiles, type MapMode } from "./pile-store"

type Leaf = { label: string; mode: MapMode }
type Item = {
  id: string
  label: string
  icon: keyof typeof ICON
  mode?: MapMode
  /** Modes that belong to this item without being sidebar entries of their own. */
  owns?: MapMode[]
  children?: Leaf[]
}

export const NAV: Item[] = [
  { id: "twin", label: "Digital Twin", icon: "map", mode: "twin", owns: TWIN_MODES },
  { id: "inventory", label: "Inventory", icon: "box", mode: "inventory" },
  {
    id: "master",
    label: "Master",
    icon: "cog",
    children: [
      { label: "Locations", mode: "master-locations" },
      { label: "Materials + Grades", mode: "master-materials" },
    ],
  },
  { id: "incoming", label: "Incoming", icon: "truck", mode: "incoming" },
  { id: "issues", label: "Issue & Consumption", icon: "arrow", mode: "issues" },
  { id: "reports", label: "Reports & Insights", icon: "chart", mode: "reports" },
]

const S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'
const ICON = {
  map: `<g ${S}><path d="M3 6.5 9 4l6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v15M15 6.5v15"/></g>`,
  box: `<g ${S}><path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/></g>`,
  cog: `<g ${S}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></g>`,
  truck: `<g ${S}><path d="M2 16V7h11v9"/><path d="M13 10h4l4 3.5V16"/><circle cx="7" cy="18" r="1.9"/><circle cx="17" cy="18" r="1.9"/></g>`,
  arrow: `<g ${S}><path d="M4 7h11"/><path d="m12 4 3 3-3 3"/><path d="M20 17H9"/><path d="m12 14-3 3 3 3"/></g>`,
  chart: `<g ${S}><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/></g>`,
  chevron: `<g ${S}><path d="m9 6 6 6-6 6"/></g>`,
  collapse: `<g ${S}><path d="m15 6-6 6 6 6"/><path d="M4 4v16"/></g>`,
}

const KEY = "berrima:sidebar"

export function Sidebar() {
  const { mode, setMode } = usePiles()
  const [collapsed, setCollapsed] = useState(false)
  // Which section of each group was last used, so the group button returns there.
  const [lastIn, setLastIn] = useState<Record<string, MapMode>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(KEY) === "collapsed")
    } catch {
      /* storage unavailable */
    }
  }, [])

  useEffect(() => {
    const group = NAV.find((i) => i.children?.some((c) => c.mode === mode))
    if (group) {
      setLastIn((prev) => (prev[group.id] === mode ? prev : { ...prev, [group.id]: mode }))
      setOpen((prev) => (prev[group.id] ? prev : { ...prev, [group.id]: true }))
    }
    // Remember the Digital Twin view last used, so returning to the module goes back to it.
    const owner = NAV.find((i) => i.owns?.includes(mode))
    if (owner) setLastIn((prev) => (prev[owner.id] === mode ? prev : { ...prev, [owner.id]: mode }))
  }, [mode])

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(KEY, v ? "expanded" : "collapsed")
      } catch {
        /* not fatal */
      }
      return !v
    })
  }

  const go = (item: Item) => {
    if (item.children) {
      const target = lastIn[item.id] ?? item.children[0].mode
      const active = item.children.some((c) => c.mode === mode)
      // On an active group the button only folds/unfolds; otherwise it navigates.
      if (active && !collapsed) setOpen((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
      else {
        setMode(target)
        setOpen((prev) => ({ ...prev, [item.id]: true }))
      }
    } else if (item.owns?.includes(mode)) {
      // Already in this module: stay on the current view.
      return
    } else if (item.mode) {
      setMode(lastIn[item.id] ?? item.mode)
    }
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-150 ${collapsed ? "w-[64px]" : "w-[236px]"}`}
      data-collapsed={collapsed ? "1" : "0"}
    >
      {/* Site identity */}
      <div className={`flex items-center gap-2.5 border-b border-line px-3 py-3 ${collapsed ? "justify-center" : ""}`}>
        {/* A hairline keeps the logo's black frame distinct on the dark theme. */}
        <BoralLogo size={40} className="shrink-0 outline outline-1 outline-line" />
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            {/* Sized so the site name fits the rail on one line — measured at
                165px available, 10.5px/0.03em renders 160px. It is the
                application's identity: it must never truncate to "CEMENT W…",
                and a longer name configured later wraps rather than clips. */}
            <span className="block text-[10.5px] font-bold uppercase tracking-[0.03em] text-ink">{BERRIMA_SITE.name}</span>
            <span className="block text-[11px] text-ink-3">Digital Twin · Berrima, NSW</span>
          </span>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const groupActive = item.children
              ? item.children.some((c) => c.mode === mode)
              : mode === item.mode || Boolean(item.owns?.includes(mode))
            const expanded = Boolean(item.children && open[item.id] && !collapsed)
            return (
              <li key={item.id}>
                <button
                  onClick={() => go(item)}
                  data-nav={item.children ? `group:${item.id}` : item.mode}
                  aria-current={!item.children && groupActive ? "page" : undefined}
                  aria-expanded={item.children ? expanded : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
                    groupActive ? "bg-accent-dim text-ink" : "text-ink-2 hover:bg-panel-2 hover:text-ink"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`shrink-0 ${groupActive ? "text-accent" : "text-ink-3"}`}
                    dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="18" height="18">${ICON[item.icon]}</svg>` }}
                  />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.children && (
                    <span
                      aria-hidden
                      className="shrink-0 text-ink-3 transition-transform"
                      style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                      dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="14" height="14">${ICON.chevron}</svg>` }}
                    />
                  )}
                </button>
                {expanded && item.children && (
                  <ul className="ml-[22px] mt-0.5 space-y-0.5 border-l border-line pl-2.5">
                    {item.children.map((c) => (
                      <li key={c.mode}>
                        <button
                          onClick={() => setMode(c.mode)}
                          data-nav={c.mode}
                          aria-current={mode === c.mode ? "page" : undefined}
                          className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                            mode === c.mode ? "bg-accent text-accent-ink font-semibold" : "text-ink-2 hover:bg-panel-2 hover:text-ink"
                          }`}
                        >
                          {c.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        title={collapsed ? "Expand" : "Collapse"}
        className={`flex items-center gap-2 border-t border-line px-3 py-2.5 text-[12px] text-ink-3 hover:text-ink ${collapsed ? "justify-center" : ""}`}
      >
        <span
          aria-hidden
          style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 24 24" width="16" height="16">${ICON.collapse}</svg>` }}
        />
        {!collapsed && "Collapse"}
      </button>
    </aside>
  )
}

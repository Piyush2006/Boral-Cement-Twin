"use client"

import { BERRIMA_SITE } from "@/config/site"
import { usePiles } from "./pile-store"
import { ThemeToggle } from "./theme"

const VIEWS = [
  { id: "satellite", label: "Satellite View", icon: "sat" },
  { id: "twin", label: "3D View", icon: "cube" },
  { id: "flow", label: "Plant Flow", icon: "flow" },
  { id: "inventory", label: "Inventory", icon: "inventory" },
  { id: "incoming", label: "Incoming Materials", icon: "incoming" },
] as const

const VIEW_ICON: Record<string, string> = {
  sat: `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7.5a4.5 4.5 0 1 0 4.5 4.5"/><path d="M15 3.6 20.4 9"/></g>`,
  cube: `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></g>`,
  incoming: `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M3 16V8l9-4 9 4v8l-9 4z"/><path d="M3 8l9 4 9-4M12 12v8"/><path d="M12 2v4"/></g>`,
  inventory: `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 3v2h8V3"/><path d="M8 10h8M8 14h8M8 18h4"/></g>`,
  flow: `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h4a3 3 0 0 1 3 3v4"/></g>`,
}

export function TopBar() {
  const { query, setQuery, live, setLive, lastUpdated, mode, setMode } = usePiles()

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[800] flex items-start gap-3 p-3">
      {/* Site identity */}
      <div
        className="pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2.5 backdrop-blur-md"
        style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
      >
        <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden>
          <path d="M4 18c6-1 9-5 10-13 4 3 6 7 6 11 0 5-4 8-9 8-3 0-6-2-7-6z" fill="#22c55e" />
        </svg>
        <span className="leading-tight">
          <span className="block text-[16px] font-bold text-ink">{BERRIMA_SITE.name}</span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden className="text-[#4da3ff]">
              <path d="M12 22s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12z" fill="currentColor" />
            </svg>
            Berrima, NSW ({BERRIMA_SITE.center.lat}, {BERRIMA_SITE.center.lng})
          </span>
        </span>
      </div>

      {/* Search */}
      <div className="pointer-events-auto relative hidden w-full max-w-[380px] lg:block">
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          aria-hidden
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
        >
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </g>
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search assets"
          placeholder="Search assets (e.g. Kiln, Pile, Silo...)"
          className="w-full rounded-full py-2.5 pl-10 pr-3 text-[12.5px] text-ink outline-none backdrop-blur-md placeholder:text-ink-3"
          style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
        />
      </div>

      <div className="flex-1" />

      {/* View switch */}
      <div
        role="tablist"
        aria-label="View"
        className="pointer-events-auto flex shrink-0 gap-1 rounded-xl p-1 backdrop-blur-md"
        style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={mode === v.id}
            onClick={() => setMode(v.id)}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-medium transition-colors ${
              mode === v.id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            <span
              aria-hidden
              dangerouslySetInnerHTML={{
                __html: `<svg viewBox="0 0 24 24" width="15" height="15">${VIEW_ICON[v.icon]}</svg>`,
              }}
            />
            {v.label}
          </button>
        ))}
      </div>

      <ThemeToggle />

      {/* Conditions + feed clock */}
      <button
        onClick={() => setLive(!live)}
        title={live ? "Pause the live feed" : "Resume the live feed"}
        className="pointer-events-auto flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2 backdrop-blur-md"
        style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="text-[#f5b301]">
          <circle cx="12" cy="12" r="4.6" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M5 12H2.8M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" />
          </g>
        </svg>
        <span className="leading-tight text-left">
          <span className="block text-[14px] font-bold text-ink">18°C</span>
          <span className="block text-[10px] text-ink-3">Berrima, NSW</span>
          <span className="flex items-center gap-1 text-[10px] text-ink-3">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-[#22c55e]" : "bg-ink-3"}`} />
            {lastUpdated
              ? lastUpdated.toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
              : "—"}
          </span>
        </span>
      </button>
    </header>
  )
}

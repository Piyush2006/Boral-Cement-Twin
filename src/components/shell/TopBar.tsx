"use client"

/**
 * Top bar — search, the Digital Twin view switch (in that module only), theme
 * and site conditions, floating over the current screen. Navigation between
 * modules lives in the sidebar.
 */

import { TWIN_MODES, usePiles, type MapMode } from "./pile-store"
import { ThemeToggle } from "./theme"

/** The Digital Twin module's views. The selected asset stays selected across them. */
const TWIN_VIEWS: Array<{ mode: MapMode; label: string }> = [
  { mode: "satellite", label: "Satellite" },
  { mode: "twin", label: "3D View" },
]

export function TopBar() {
  const { query, setQuery, live, setLive, lastUpdated, mode, setMode } = usePiles()
  const inTwin = TWIN_MODES.includes(mode)

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[800] flex items-start gap-3 p-3">
      {/* Search */}
      <div className="pointer-events-auto relative min-w-[180px] max-w-[420px] flex-1">
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-ink-3"
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
          className="w-full rounded-full py-2.5 pl-10 pr-9 text-[12.5px] text-ink outline-none backdrop-blur-md placeholder:text-ink-3"
          style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-[14px] leading-none text-ink-3 hover:text-ink"
          >
            ×
          </button>
        )}
      </div>

      {inTwin && (
        <div
          role="tablist"
          aria-label="Digital Twin view"
          className="pointer-events-auto flex shrink-0 gap-1 rounded-full p-1 backdrop-blur-md"
          style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
        >
          {TWIN_VIEWS.map((v) => (
            <button
              key={v.mode}
              role="tab"
              aria-selected={mode === v.mode}
              data-view={v.mode}
              onClick={() => setMode(v.mode)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                mode === v.mode ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1" />

      <ThemeToggle />

      {/* Conditions + feed clock */}
      <button
        onClick={() => setLive(!live)}
        title={live ? "Pause the live feed" : "Resume the live feed"}
        className="pointer-events-auto hidden shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2 backdrop-blur-md lg:flex"
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

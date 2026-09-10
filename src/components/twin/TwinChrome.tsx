"use client"

/** Bottom chrome for the twin: view toggle, status legend, compass and zoom. */

import { HEALTH_COLOUR, HEALTH_LABEL, type Health } from "@/lib/assets/twin-cards"
import { usePiles } from "@/components/shell/pile-store"

const ORDER: Health[] = ["NORMAL", "WARNING", "CRITICAL", "OFFLINE"]

export function ViewToggle() {
  const { mode, setMode } = usePiles()
  return (
    <div
      role="tablist"
      aria-label="View"
      className="absolute bottom-4 left-4 z-[700] flex gap-1 rounded-lg p-1 backdrop-blur-md"
      style={{ background: "rgba(9,14,24,.85)", border: "1px solid var(--surface-border)" }}
    >
      {(
        [
          { id: "twin", label: "3D View" },
          { id: "satellite", label: "Satellite View" },
        ] as const
      ).map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={mode === v.id}
          onClick={() => setMode(v.id)}
          className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-medium transition-colors ${
            mode === v.id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {v.id === "twin" && (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
              <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" />
                <path d="M3 7.5 12 12l9-4.5M12 12v9" />
              </g>
            </svg>
          )}
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function StatusLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-1/2 z-[700] flex -translate-x-1/2 gap-4 rounded-lg px-4 py-2 backdrop-blur-md"
      style={{ background: "rgba(9,14,24,.85)", border: "1px solid var(--surface-border)" }}
    >
      {ORDER.map((h) => (
        <span key={h} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_COLOUR[h] }} />
          {HEALTH_LABEL[h]}
        </span>
      ))}
    </div>
  )
}

export function MapControls({
  onZoom,
  onFullscreen,
}: {
  onZoom: (delta: number) => void
  onFullscreen: () => void
}) {
  return (
    <div className="absolute bottom-4 right-4 z-[700] flex items-end gap-2">
      <Compass />
      <div
        className="flex flex-col overflow-hidden rounded-lg backdrop-blur-md"
        style={{ background: "rgba(9,14,24,.85)", border: "1px solid var(--surface-border)" }}
      >
        <button
          onClick={() => onZoom(-1)}
          aria-label="Zoom in"
          className="px-2.5 py-1.5 text-[15px] leading-none text-ink-2 hover:bg-white/10"
        >
          +
        </button>
        <span className="h-px bg-white/15" />
        <button
          onClick={() => onZoom(1)}
          aria-label="Zoom out"
          className="px-2.5 py-1.5 text-[15px] leading-none text-ink-2 hover:bg-white/10"
        >
          −
        </button>
      </div>
      <button
        onClick={onFullscreen}
        aria-label="Fullscreen"
        className="rounded-lg px-2.5 py-2 text-ink-2 backdrop-blur-md hover:bg-white/10"
        style={{ background: "rgba(9,14,24,.85)", border: "1px solid var(--surface-border)" }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
          <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </g>
        </svg>
      </button>
    </div>
  )
}

function Compass() {
  return (
    <div
      className="grid h-[46px] w-[46px] place-items-center rounded-full backdrop-blur-md"
      style={{ background: "rgba(9,14,24,.85)", border: "1px solid var(--surface-border)" }}
      aria-hidden
    >
      <svg viewBox="0 0 44 44" width="34" height="34">
        <text x="22" y="10" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.75)">
          N
        </text>
        <path d="M22 14 27 32 22 28 17 32z" fill="#ffffff" opacity="0.9" />
      </svg>
    </div>
  )
}

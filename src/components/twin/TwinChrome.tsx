"use client"

/** Bottom chrome for the twin: compass and zoom. The view switch lives in the top bar. */

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
        style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
      >
        <button
          onClick={() => onZoom(-1)}
          aria-label="Zoom in"
          className="px-2.5 py-1.5 text-[15px] leading-none text-ink-2 hover:bg-[var(--surface-hover)]"
        >
          +
        </button>
        <span className="h-px bg-[var(--surface-border)]" />
        <button
          onClick={() => onZoom(1)}
          aria-label="Zoom out"
          className="px-2.5 py-1.5 text-[15px] leading-none text-ink-2 hover:bg-[var(--surface-hover)]"
        >
          −
        </button>
      </div>
      <button
        onClick={onFullscreen}
        aria-label="Fullscreen"
        className="rounded-lg px-2.5 py-2 text-ink-2 backdrop-blur-md hover:bg-[var(--surface-hover)]"
        style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
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
      style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
      aria-hidden
    >
      <svg viewBox="0 0 44 44" width="34" height="34">
        <text x="22" y="10" textAnchor="middle" fontSize="9" fill="var(--surface-ink-dim)">
          N
        </text>
        <path d="M22 14 27 32 22 28 17 32z" fill="var(--surface-ink)" opacity="0.9" />
      </svg>
    </div>
  )
}

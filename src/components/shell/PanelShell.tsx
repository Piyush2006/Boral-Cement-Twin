"use client"

import type { ReactNode } from "react"

/** Floating panel with a title bar and a close control. Every panel uses it, so
 *  nothing on screen is permanently stuck open. */
export function PanelShell({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`pointer-events-auto overflow-hidden rounded-xl bg-panel/95 shadow-2xl ring-1 ring-white/12 backdrop-blur ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-bold text-white">{title}</h2>
        <button
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="grid h-6 w-6 place-items-center rounded text-[16px] leading-none text-ink-3 hover:bg-panel-2 hover:text-ink"
        >
          ×
        </button>
      </header>
      {children}
    </section>
  )
}

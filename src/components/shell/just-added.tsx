"use client"

/**
 * "Just added" — one behaviour for every add form.
 *
 * An add form is a modal. On save it closes, and the list it belongs to shows
 * the new row: filters that would hide it are cleared by the screen, the row is
 * scrolled into view and highlighted, and a short banner says what was added.
 *
 *   const added = useJustAdded()
 *   added.mark(id, "RM-LS-002 created")      // after a successful save
 *   <tr data-added-key={id} className={added.rowClass(id)}>
 *   <AddedBanner added={added} />
 */

import { useCallback, useEffect, useState } from "react"

const HOLD_MS = 8000

export type JustAdded = ReturnType<typeof useJustAdded>

export function useJustAdded() {
  const [state, setState] = useState<{ id: string; message: string; n: number } | null>(null)

  const mark = useCallback((id: string, message: string) => {
    setState((prev) => ({ id, message, n: (prev?.n ?? 0) + 1 }))
  }, [])
  const clear = useCallback(() => setState(null), [])

  // Bring the new row into view once it has rendered, then let the highlight fade.
  useEffect(() => {
    if (!state) return
    const key = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(state.id) : state.id.replace(/["\\]/g, "\\$&")
    const find = () => document.querySelector(`[data-added-key="${key}"]`)
    // The row may render a frame or two later (a list clears its filter first),
    // so look for it over a few frames before scrolling.
    let raf = 0
    let tries = 0
    const seek = () => {
      const el = find()
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" })
      else if (tries++ < 30) raf = requestAnimationFrame(seek)
    }
    raf = requestAnimationFrame(seek)
    const t = setTimeout(() => setState((s) => (s && s.n === state.n ? null : s)), HOLD_MS)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [state])

  return {
    id: state?.id ?? null,
    message: state?.message ?? null,
    mark,
    clear,
    /** Highlight for the newly added row. */
    rowClass: (id: string) => (state?.id === id ? "added-row" : ""),
    is: (id: string) => state?.id === id,
  }
}

/** The confirmation above the list. Words and an icon, not colour alone. */
export function AddedBanner({ added }: { added: JustAdded }) {
  if (!added.message) return null
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2 rounded-lg bg-ok/10 px-3 py-2 text-[12.5px] text-ink ring-1 ring-ok/50"
    >
      <span aria-hidden className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-ok text-[11px] font-bold text-panel">
        ✓
      </span>
      <span className="flex-1">{added.message}</span>
      <button onClick={added.clear} aria-label="Dismiss" className="px-1 text-[15px] leading-none text-ink-3 hover:text-ink">
        ×
      </button>
    </div>
  )
}

"use client"

/**
 * Theme.
 *
 * Dark by default; the choice is written to `data-theme` on <html> and
 * remembered per browser. Only token VALUES change, so no component needs to
 * know which theme is active.
 */

import { useCallback, useEffect, useState } from "react"

export type Theme = "dark" | "light"

const KEY = "berrima:theme"

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme)
}

export function useTheme() {
  // Start dark to match the server render; the stored choice is applied on mount.
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    let initial: Theme = "dark"
    try {
      const stored = window.localStorage.getItem(KEY)
      if (stored === "light" || stored === "dark") initial = stored
      else if (window.matchMedia("(prefers-color-scheme: light)").matches) initial = "light"
    } catch {
      /* storage unavailable — dark it is */
    }
    setTheme(initial)
    apply(initial)
  }, [])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark"
      apply(next)
      try {
        window.localStorage.setItem(KEY, next)
      } catch {
        /* not fatal */
      }
      return next
    })
  }, [])

  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === "dark"

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="pointer-events-auto grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl text-ink-2 backdrop-blur-md transition-colors hover:text-ink"
      style={{ background: "var(--surface-float)", border: "1px solid var(--surface-border)" }}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.6v2.4M12 19v2.4M21.4 12H19M5 12H2.6M18.6 5.4 16.9 7.1M7.1 16.9 5.4 18.6M18.6 18.6 16.9 16.9M7.1 7.1 5.4 5.4" />
          </g>
        </svg>
      )}
    </button>
  )
}

"use client"

/**
 * Expiry pieces shared by Inventory, Expiry Monitoring and Reports.
 *
 * There is no manual expiry entry: a batch's date comes from the PO at receipt
 * (or from the opening balance), and a batch that reaches it leaves by an
 * EXPIRY transaction posted by the expiry run. These are display pieces only.
 */

import { EXPIRY_STATUS_LABEL, type ExpiryStatus } from "@/lib/inventory/expiry"

const TONE: Record<ExpiryStatus, string> = {
  EXPIRED: "bg-crit/15 ring-crit/40",
  APPROACHING: "bg-warn/15 ring-warn/40",
  WITHIN_SHELF_LIFE: "bg-ok/15 ring-ok/40",
  NO_EXPIRY_DATE: "bg-panel-2 ring-line",
}

const ICON: Record<ExpiryStatus, string> = {
  EXPIRED: "✕",
  APPROACHING: "◷",
  WITHIN_SHELF_LIFE: "✓",
  NO_EXPIRY_DATE: "?",
}

/** Status in words and an icon — never colour alone. */
export function ExpiryPill({ status }: { status: ExpiryStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide text-ink ring-1 ${TONE[status]}`}
    >
      <span aria-hidden>{ICON[status]}</span>
      {EXPIRY_STATUS_LABEL[status]}
    </span>
  )
}

export const expiryDay = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })

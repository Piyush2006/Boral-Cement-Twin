"use client"

/**
 * Expiry pieces shared by Inventory › Expiry and Reports › Expiry.
 *
 *   ShelfLifePill        Expired / Expiring Soon / Healthy Shelf Life — icon + words, never colour alone
 *   ExpiryWriteOffModal  write off expired stock as its own EXPIRY (−) transaction
 *   SetExpiryModal       set or correct a record's expiry date, with a reason in its audit trail
 *
 * Expiry exists only for materials where it applies (`expiryApplicable`).
 */

import { useState } from "react"

import { Actions, Err, Field, INPUT, Modal, Readonly } from "@/components/shell/Modal"
import { usePiles } from "@/components/shell/pile-store"
import { locationName, materialEntry } from "@/lib/inventory/catalog"
import type { InventoryRecord } from "@/lib/inventory/model"
import { parsePositive } from "@/lib/inventory/rules"
import { SHELF_LIFE_LABEL, type ShelfLife } from "@/lib/reports/insights"

const fmt = (n: number) => Math.round(n).toLocaleString()
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
/** yyyy-mm-dd for a date input, in local time. */
const toInput = (iso?: string) => {
  if (!iso) return ""
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function ShelfLifePill({ state }: { state: ShelfLife }) {
  const tone = state === "EXPIRED" ? "bg-crit/15 ring-crit/40" : state === "EXPIRING_SOON" ? "bg-warn/15 ring-warn/40" : "bg-ok/15 ring-ok/40"
  const icon = state === "EXPIRED" ? "✕" : state === "EXPIRING_SOON" ? "◷" : "✓"
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide text-ink ring-1 ${tone}`}>
      <span aria-hidden>{icon}</span>
      {SHELF_LIFE_LABEL[state]}
    </span>
  )
}

/**
 * Write off expired stock. Expiry is its own term in the balance, so it posts
 * as an EXPIRY transaction — never a manual adjustment, never consumption.
 */
export function ExpiryWriteOffModal({ record, onClose }: { record: InventoryRecord; onClose: () => void }) {
  const { writeOffExpired } = usePiles()
  const [qty, setQty] = useState(String(record.quantity))
  const [reason, setReason] = useState("Past expiry date")
  const [error, setError] = useState<string | null>(null)
  const quantity = parsePositive(qty)
  const after = quantity !== null ? record.quantity - quantity : null

  const submit = () => {
    setError(null)
    const res = writeOffExpired(record.inventoryId, quantity, reason)
    if (!res.ok) return setError(res.error)
    onClose()
  }

  return (
    <Modal title="Write Off Expired Stock" subtitle={record.inventoryId} onClose={onClose} width={500}>
      <p className="mb-3 rounded-lg bg-panel-2 px-3 py-2.5 text-[11.5px] text-ink-2 ring-1 ring-line">
        {materialEntry(record.materialId)?.name} at {locationName(record.locationId)}
        {record.lotId || record.batch ? ` · lot ${record.lotId ?? record.batch}` : ""} · on hand {fmt(record.quantity)} {record.uom} · expired{" "}
        {day(record.expiryDate as string)}.
      </p>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label={`Expiry Quantity (${record.uom})`} required>
          <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Reason" required>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} />
        </Field>
      </div>
      <Field label="Inventory Impact">
        <Readonly mono value={after !== null ? `${fmt(record.quantity)} → ${fmt(after)} ${record.uom}` : undefined} />
      </Field>
      <p className="text-[11px] text-ink-3">
        Recorded as an EXPIRY transaction with the user, date/time, previous and new quantity. It counts as a loss, never as consumption.
      </p>
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Write Off" disabled={!quantity || !reason.trim() || (after !== null && after < 0)} />
    </Modal>
  )
}

/** Set or correct an expiry date. The change and its reason go into the record's audit trail. */
export function SetExpiryModal({ record, onClose }: { record: InventoryRecord; onClose: () => void }) {
  const { setExpiryDate } = usePiles()
  const [date, setDate] = useState(toInput(record.expiryDate))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const changing = Boolean(record.expiryDate)

  const submit = () => {
    setError(null)
    const res = setExpiryDate(record.inventoryId, date ? new Date(`${date}T00:00:00`).toISOString() : null, reason)
    if (!res.ok) return setError(res.error)
    onClose()
  }

  return (
    <Modal title={changing ? "Change Expiry Date" : "Set Expiry Date"} subtitle={record.inventoryId} onClose={onClose} width={480}>
      <p className="mb-3 rounded-lg bg-panel-2 px-3 py-2.5 text-[11.5px] text-ink-2 ring-1 ring-line">
        {materialEntry(record.materialId)?.name} at {locationName(record.locationId)} · {fmt(record.quantity)} {record.uom}
        {changing ? ` · currently expires ${day(record.expiryDate!)}` : " · no expiry date recorded"}
      </p>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Expiry Date" required>
          <input autoFocus type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Reason" required>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={changing ? "e.g. Supplier certificate corrected" : "e.g. From the drum label"} className={INPUT} />
        </Field>
      </div>
      <p className="text-[11px] text-ink-3">The quantity does not change. The old and new dates, the reason and the user are kept in the record&rsquo;s history.</p>
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel={changing ? "Change Date" : "Set Date"} disabled={!date || !reason.trim()} />
    </Modal>
  )
}

"use client"

/**
 * Add Inventory.
 *
 * Material Group, Material Description and UOM are populated from the selected
 * material — this form cannot create a new material, only move stock against an
 * existing one. Submitting writes an inventory transaction; the balance then
 * moves by that quantity.
 */

import { useEffect, useMemo, useState } from "react"

import {
  MATERIAL_CATALOG,
  locationsForMaterial,
  materialEntry,
} from "@/lib/inventory/catalog"
import { usePiles } from "@/components/shell/pile-store"

export function AddInventoryModal({ onClose }: { onClose: () => void }) {
  const { addStock, canWriteInventory } = usePiles()

  const [materialId, setMaterialId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [reference, setReference] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ before: number; after: number; qty: number; uom: string } | null>(
    null,
  )

  const material = useMemo(() => materialEntry(materialId), [materialId])
  const locations = useMemo(
    () => (materialId ? locationsForMaterial(materialId) : []),
    [materialId],
  )

  // Selecting a material re-scopes the locations, so clear a stale choice.
  useEffect(() => {
    setLocationId((prev) => (locations.some((l) => l.locationId === prev) ? prev : ""))
  }, [locations])

  const submit = () => {
    setError(null)
    const qty = Number(quantity)
    if (!materialId) return setError("Select a material.")
    if (!locationId) return setError("Select a location.")
    if (!Number.isFinite(qty) || qty <= 0) return setError("Enter a quantity greater than zero.")
    if (!reference.trim()) return setError("Enter a reference or reason.")

    const result = addStock({ locationId, materialId, quantity: qty, reference: reference.trim() })
    if ("error" in result) return setError(result.error)
    setDone({
      before: result.balanceBefore,
      after: result.balanceAfter,
      qty: result.quantity,
      uom: result.uom,
    })
  }

  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Inventory"
        className="w-full max-w-[480px] overflow-hidden rounded-xl bg-panel ring-1 ring-line-2"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-ink">Add Inventory</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[20px] leading-none text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </header>

        {done ? (
          <div className="p-5">
            <div className="rounded-lg bg-ok/10 p-3.5 ring-1 ring-ok/40">
              <div className="text-[13.5px] font-semibold text-ok">Inventory transaction recorded</div>
              <div className="mt-2 space-y-1 text-[12.5px] text-ink-2">
                <Line label="Before" value={`${Math.round(done.before).toLocaleString()} ${done.uom}`} />
                <Line label="Transaction" value={`+${done.qty.toLocaleString()} ${done.uom}`} tone="#22c55e" />
                <Line label="After" value={`${Math.round(done.after).toLocaleString()} ${done.uom}`} strong />
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5">
            {!canWriteInventory && (
              <p className="mb-4 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-[12px] text-ink-2">
                You have read-only access to inventory. This form is disabled.
              </p>
            )}

            <Field label="Material">
              <select
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                disabled={!canWriteInventory}
                className="w-full rounded-lg bg-panel-2 px-3 py-2.5 text-[13px] text-ink outline-none ring-1 ring-line focus:ring-accent disabled:opacity-50"
              >
                <option value="">Select existing material</option>
                {MATERIAL_CATALOG.map((m) => (
                  <option key={m.materialId} value={m.materialId}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Material Group">
                <Readonly value={material?.group} />
              </Field>
              <Field label="UOM">
                <Readonly value={material?.uom} />
              </Field>
            </div>

            <Field label="Material Description">
              <Readonly value={material?.description} />
            </Field>

            <Field label="Location">
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={!canWriteInventory || !materialId}
                className="w-full rounded-lg bg-panel-2 px-3 py-2.5 text-[13px] text-ink outline-none ring-1 ring-line focus:ring-accent disabled:opacity-50"
              >
                <option value="">
                  {materialId ? "Select location" : "Select a material first"}
                </option>
                {locations.map((l) => (
                  <option key={l.locationId} value={l.locationId}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity">
                <input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={!canWriteInventory}
                  placeholder="0"
                  className="w-full rounded-lg bg-panel-2 px-3 py-2.5 font-mono text-[14px] text-ink outline-none ring-1 ring-line focus:ring-accent disabled:opacity-50"
                />
              </Field>
              <Field label="Reference / Reason">
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  disabled={!canWriteInventory}
                  placeholder="e.g. GRN-10482"
                  className="w-full rounded-lg bg-panel-2 px-3 py-2.5 text-[13px] text-ink outline-none ring-1 ring-line focus:ring-accent disabled:opacity-50"
                />
              </Field>
            </div>

            {error && (
              <p className="mt-1 rounded-md border border-crit/40 bg-crit/10 p-2 text-[12px] text-crit">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2.5">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!canWriteInventory}
                className="flex-1 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
              >
                Add Inventory
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}

/** Populated from the selected material — not user-editable. */
function Readonly({ value }: { value?: string }) {
  return (
    <div className="rounded-lg bg-panel-2/60 px-3 py-2.5 text-[13px] text-ink-2 ring-1 ring-line">
      {value ?? <span className="text-ink-3">—</span>}
    </div>
  )
}

function Line({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: string
  strong?: boolean
}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span
        className={`font-mono ${strong ? "font-bold text-ink" : ""}`}
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

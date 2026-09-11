"use client"

/**
 * Create Inventory — map an EXISTING Material + Grade to an EXISTING Location.
 *
 *   Material + Grade *   from Master → Materials + Grades
 *   Location *           from Master → Locations (Inventory or Both)
 *   Inventory ID *       auto-generated, never reused
 *   Opening Quantity     0 unless an approved opening balance is loaded
 *   UOM                  from the material
 *   Min Stock * · Target * · Max Stock *
 *
 * Nothing about the material or grade is entered or edited here. An opening
 * balance above zero arrives by an ADJUSTMENT transaction carrying its approval
 * reference, so no quantity ever exists without a transaction behind it.
 */

import { useMemo, useState } from "react"

import { Actions, Err, Field, INPUT, Modal, Readonly } from "@/components/shell/Modal"
import { usePiles } from "@/components/shell/pile-store"
import { materialEntry } from "@/lib/inventory/catalog"
import type { InventoryTransaction } from "@/lib/inventory/ledger"
import type { InventoryRecord } from "@/lib/inventory/model"
import { nextInventoryId, parseNonNegative } from "@/lib/inventory/rules"
import { holdsStock } from "@/lib/masters/types"
import { useMasters } from "@/lib/masters/useMasters"
import { StatusBadge } from "./StatusBadge"

export function CreateInventoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** Called once the record exists; the modal then closes and the list shows it. */
  onCreated?: (record: InventoryRecord, transaction?: InventoryTransaction) => void
}) {
  const { createInventory, canWriteInventory, inventory } = usePiles()
  const masters = useMasters()

  const [pair, setPair] = useState("")
  const [locationId, setLocationId] = useState("")
  const [opening, setOpening] = useState("0")
  const [openingRef, setOpeningRef] = useState("")
  const [minStock, setMinStock] = useState("")
  const [targetStock, setTargetStock] = useState("")
  const [maxStock, setMaxStock] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [lotId, setLotId] = useState("")
  const [error, setError] = useState<string | null>(null)

  // One option per active Material + Grade — the master is the only source.
  const pairs = useMemo(() => {
    const out: Array<{ key: string; materialId: string; gradeId: string; label: string }> = []
    for (const m of masters.materials) {
      if (!m.active) continue
      for (const g of masters.grades) {
        if (g.materialId === m.materialId && g.active) out.push({ key: `${m.materialId}|${g.gradeId}`, materialId: m.materialId, gradeId: g.gradeId, label: `${m.name} — ${g.name}` })
      }
    }
    return out
  }, [masters.materials, masters.grades])
  const selected = pairs.find((p) => p.key === pair)
  const material = materialEntry(selected?.materialId)
  const locations = useMemo(() => masters.locations.filter((l) => holdsStock(l) && l.active), [masters.locations])

  const inventoryId = material ? nextInventoryId(material.code, inventory) : ""
  const qty = parseNonNegative(opening)
  const min = minStock.trim() === "" ? null : parseNonNegative(minStock)
  const target = targetStock.trim() === "" ? null : parseNonNegative(targetStock)
  const max = maxStock.trim() === "" ? null : parseNonNegative(maxStock)
  const needsRef = qty !== null && qty > 0
  const ready = Boolean(selected && locationId && qty !== null && min !== null && target !== null && max !== null && (!needsRef || openingRef.trim()))

  const submit = () => {
    if (!selected || !material) return
    setError(null)
    const result = createInventory({
      materialId: selected.materialId,
      gradeId: selected.gradeId,
      inventoryId,
      locationId,
      quantity: qty,
      openingReference: openingRef,
      uom: material.uom,
      minStock: min,
      targetStock: target,
      maxStock: max,
      lotId: material.lotTracking ? lotId : undefined,
      // Only an opening balance carries a batch — and so an expiry — on creation.
      openingExpiry: material.expiryApplicable && qty !== null && qty > 0 && expiryDate ? new Date(expiryDate).toISOString() : undefined,
    })
    if (!result.ok) return setError(result.error)
    onCreated?.(result.value.record, result.value.transaction)
    onClose()
  }

  return (
    <Modal title="Create Inventory" onClose={onClose} width={560}>
      {!canWriteInventory && <Err>You have read-only access to inventory. This form is disabled.</Err>}

      <Field label="Material + Grade" required hint={pairs.length === 0 ? "Register a material and grade under Master → Materials + Grades first." : undefined}>
        <select value={pair} onChange={(e) => setPair(e.target.value)} disabled={!canWriteInventory} className={INPUT}>
          <option value="">Select Material + Grade…</option>
          {pairs.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Location" required>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!canWriteInventory} className={INPUT}>
          <option value="">Select Location…</option>
          {locations.map((l) => (
            <option key={l.locationId} value={l.locationId}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-[1.2fr_1fr_90px] gap-x-3">
        <Field label="Inventory ID" required hint="Auto-generated">
          <Readonly value={inventoryId || undefined} mono />
        </Field>
        <Field label="Opening Quantity">
          <input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={!canWriteInventory} className={`${INPUT} font-mono`} />
        </Field>
        <Field label="UOM">
          <Readonly value={material?.uom} />
        </Field>
      </div>

      {needsRef && (
        <Field label="Opening Balance Approval" required hint="Inventory starts at 0. A balance above 0 needs the approval it was loaded under.">
          <input value={openingRef} onChange={(e) => setOpeningRef(e.target.value)} placeholder="e.g. Stocktake 31 Aug 2026 — approved J. Smith" className={INPUT} />
        </Field>
      )}

      <div className="grid grid-cols-3 gap-x-3">
        <Field label="Min Stock" required>
          <input inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} disabled={!canWriteInventory} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Target" required>
          <input inputMode="decimal" value={targetStock} onChange={(e) => setTargetStock(e.target.value)} disabled={!canWriteInventory} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Max Stock" required>
          <input inputMode="decimal" value={maxStock} onChange={(e) => setMaxStock(e.target.value)} disabled={!canWriteInventory} placeholder="0" className={`${INPUT} font-mono`} />
        </Field>
      </div>

      {/* Only where the material calls for it — never forced. */}
      {((material?.expiryApplicable && qty !== null && qty > 0) || material?.lotTracking) && (
        <div className="grid grid-cols-2 gap-x-3">
          {/* A new record starts at 0 and receives dated stock through Incoming, where the
              expiry comes from the PO. Only an opening balance brings its own batch date. */}
          {material?.expiryApplicable && qty !== null && qty > 0 && (
            <Field label="Opening Batch Expiry" hint="Expiry applies to this material. The date of the opening stock being loaded.">
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} disabled={!canWriteInventory} className={INPUT} />
            </Field>
          )}
          {material?.lotTracking && (
            <Field label="Lot / Batch Reference" hint="This material is lot-tracked.">
              <input value={lotId} onChange={(e) => setLotId(e.target.value.toUpperCase())} disabled={!canWriteInventory} placeholder="Optional" className={`${INPUT} font-mono`} />
            </Field>
          )}
        </div>
      )}

      {qty !== null && min !== null && (
        <p className="flex items-center gap-2 text-[11.5px] text-ink-2">
          Status on creation: <StatusBadge status={qty <= min ? "CRITICAL" : "HEALTHY"} />
        </p>
      )}

      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Create Inventory" disabled={!canWriteInventory || !ready} />
    </Modal>
  )
}


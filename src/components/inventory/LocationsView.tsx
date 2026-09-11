"use client"

/**
 * Master → Locations — the physical places in the plant.
 *
 *   Location ID *   Location Name *   Location Type *   Used As *
 *   Description, Capacity, UOM, Latitude, Longitude — optional
 *
 * Location Type is what the place physically is: pile, silo, warehouse, store,
 * production area, maintenance area. "Used As" decides what it may do:
 *
 *   Inventory Location     stock is held here
 *   Consumption Location   material is issued to and consumed here
 *   Both                   stock is held here and also used here
 *
 * Capacity is optional and never invented. Where it is set, the location
 * reports utilisation. Coordinates, where given, place the location on the
 * Digital Twin.
 */

import { useMemo, useState } from "react"

import { Actions, Err, Field, INPUT, Modal } from "@/components/shell/Modal"
import { usePiles } from "@/components/shell/pile-store"
import { plantAsset } from "@/lib/assets/plant-assets"
import { utilisation } from "@/lib/inventory/status"
import { setLocations } from "@/lib/masters/registry"
import { parseNonNegativeNumber, parseNumber, validateDeactivate, validateLocation, validateUsageChange } from "@/lib/masters/rules"
import {
  LOCATION_KINDS,
  LOCATION_KIND_LABEL,
  LOCATION_USAGES,
  LOCATION_USAGE_LABEL,
  holdsStock,
  type LocationKind,
  type LocationMaster,
  type LocationUsage,
} from "@/lib/masters/types"
import { useMasters } from "@/lib/masters/useMasters"
import { ActiveTag, Empty, LinkButton, PrimaryButton, Row, Table, Td, Th } from "./Table"
import { AddedBanner, useJustAdded } from "@/components/shell/just-added"

export function LocationsView() {
  const masters = useMasters()
  const { inventory, canWriteInventory } = usePiles()
  const [editing, setEditing] = useState<LocationMaster | "new" | null>(null)
  const [kindFilter, setKindFilter] = useState<"" | LocationKind>("")
  const [usageFilter, setUsageFilter] = useState<"" | LocationUsage>("")
  const [query, setQuery] = useState("")
  const added = useJustAdded()

  const held = useMemo(() => {
    const totals = new Map<string, { qty: number; records: number }>()
    for (const r of inventory) {
      if (!r.active) continue
      const t = totals.get(r.locationId) ?? { qty: 0, records: 0 }
      totals.set(r.locationId, { qty: t.qty + r.quantity, records: t.records + 1 })
    }
    return totals
  }, [inventory])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return masters.locations.filter((l) => {
      if (kindFilter && l.kind !== kindFilter) return false
      if (usageFilter && l.usage !== usageFilter) return false
      if (!q) return true
      return [l.locationId, l.name, l.description, LOCATION_KIND_LABEL[l.kind]].some((v) => v?.toLowerCase().includes(q))
    })
  }, [masters.locations, kindFilter, usageFilter, query])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search locations"
          placeholder="Search Location ID, name or type…"
          className="w-full max-w-[300px] rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
        />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as "" | LocationKind)}
          aria-label="Filter by location type"
          className="rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line focus:ring-accent"
        >
          <option value="">Location Type: All</option>
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {LOCATION_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value as "" | LocationUsage)}
          aria-label="Filter by usage"
          className="rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line focus:ring-accent"
        >
          <option value="">Used As: All</option>
          {LOCATION_USAGES.map((u) => (
            <option key={u} value={u}>
              {LOCATION_USAGE_LABEL[u]}
            </option>
          ))}
        </select>
        <span className="text-[11.5px] text-ink-3">
          {filtered.length} of {masters.locations.length} locations
        </span>
        <span className="ml-auto">
          <PrimaryButton onClick={() => setEditing("new")} disabled={!canWriteInventory}>
            + Add Location
          </PrimaryButton>
        </span>
      </div>

      <AddedBanner added={added} />
      <Table
        head={
          <>
            <Th>Location ID</Th>
            <Th>Location Name</Th>
            <Th>Location Type</Th>
            <Th>Used As</Th>
            <Th>Description</Th>
            <Th className="text-right">Capacity</Th>
            <Th className="text-right">On Hand</Th>
            <Th>Utilisation</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </>
        }
        empty={filtered.length === 0 ? <Empty>No location matches these filters.</Empty> : undefined}
      >
        {filtered.map((l) => {
          const stock = held.get(l.locationId)
          const onHand = stock?.qty ?? 0
          const pct = holdsStock(l) ? utilisation(onHand, l.capacity) : null
          return (
            <Row key={l.locationId} dim={!l.active} addedKey={l.locationId} added={added.is(l.locationId)}>
              <Td className="whitespace-nowrap font-mono text-ink">{l.locationId}</Td>
              <Td>
                <span className="text-ink">{l.name}</span>
                {/* Digital Twin ↔ Location: places the twin shows. */}
                {(plantAsset(l.locationId) || l.latitude !== undefined) && (
                  <span
                    className="ml-2 whitespace-nowrap rounded-full bg-accent-dim px-1.5 py-[1px] text-[10px] font-semibold text-ink"
                    title={plantAsset(l.locationId) ? "Shown on the Digital Twin" : "Has coordinates for the Digital Twin"}
                  >
                    Digital Twin
                  </span>
                )}
              </Td>
              <Td className="text-ink-2">{LOCATION_KIND_LABEL[l.kind]}</Td>
              <Td className="text-ink-2">{LOCATION_USAGE_LABEL[l.usage]}</Td>
              <Td className="text-ink-3">{l.description ?? "—"}</Td>
              <Td className="whitespace-nowrap text-right font-mono text-ink-2">
                {l.capacity ? `${l.capacity.toLocaleString()} ${l.uom ?? ""}`.trim() : <span className="font-sans text-ink-3">Not set</span>}
              </Td>
              <Td className="text-right font-mono text-ink-2">{holdsStock(l) ? Math.round(onHand).toLocaleString() : "—"}</Td>
              <Td>{pct === null ? <span className="text-ink-3">—</span> : <UtilBar pct={pct} />}</Td>
              <Td>
                <ActiveTag active={l.active} />
              </Td>
              <Td className="text-right">
                <LinkButton onClick={() => setEditing(l)}>Edit</LinkButton>
              </Td>
            </Row>
          )
        })}
      </Table>

      <p className="mt-3 text-[11px] text-ink-3">
        Capacity is shown only where the plant has registered one — it is never estimated. Pile and silo coordinates are approximate,
        read from satellite imagery.
      </p>

      {editing && (
        <LocationModal
          location={editing === "new" ? null : editing}
          locations={masters.locations}
          heldRecords={editing === "new" ? 0 : held.get((editing as LocationMaster).locationId)?.records ?? 0}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const isNew = editing === "new"
            const saved = isNew
              ? next.find((l) => !masters.locations.some((x) => x.locationId === l.locationId))
              : next.find((l) => l.locationId === (editing as LocationMaster).locationId)
            setLocations(next)
            setEditing(null)
            if (saved) {
              // Show it in the list: clear anything that would filter it out.
              setQuery("")
              setKindFilter("")
              setUsageFilter("")
              added.mark(
                saved.locationId,
                `Location ${saved.locationId} ${isNew ? "added" : "updated"} — ${saved.name}, ${LOCATION_KIND_LABEL[saved.kind]}, ${LOCATION_USAGE_LABEL[saved.usage]}.`,
              )
            }
          }}
        />
      )}
    </section>
  )
}

export function UtilBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const over = pct > 100
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="h-[6px] w-[64px] overflow-hidden rounded-full bg-panel-2 ring-1 ring-line">
        <span className="block h-full rounded-full" style={{ width: `${clamped}%`, background: over ? "#ef4444" : "var(--color-accent)" }} />
      </span>
      <span className="font-mono text-[11.5px] text-ink-2">{Math.round(pct)}%</span>
    </span>
  )
}

function LocationModal({
  location,
  locations,
  heldRecords,
  onClose,
  onSave,
}: {
  location: LocationMaster | null
  locations: LocationMaster[]
  heldRecords: number
  onClose: () => void
  onSave: (next: LocationMaster[]) => void
}) {
  const editing = Boolean(location)
  const [locationId, setLocationId] = useState(location?.locationId ?? "")
  const [name, setName] = useState(location?.name ?? "")
  const [kind, setKind] = useState<LocationKind | "">(location?.kind ?? "")
  const [usage, setUsage] = useState<LocationUsage | "">(location?.usage ?? "")
  const [description, setDescription] = useState(location?.description ?? "")
  const [capacity, setCapacity] = useState(location?.capacity === undefined ? "" : String(location.capacity))
  const [uom, setUom] = useState(location?.uom ?? "MT")
  const [latitude, setLatitude] = useState(location?.latitude === undefined ? "" : String(location.latitude))
  const [longitude, setLongitude] = useState(location?.longitude === undefined ? "" : String(location.longitude))
  const [active, setActive] = useState(location?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  const consumptionOnly = usage === "CONSUMPTION"

  const submit = () => {
    setError(null)
    const cap = capacity.trim() === "" || consumptionOnly ? null : parseNonNegativeNumber(capacity)
    if (!consumptionOnly && capacity.trim() !== "" && cap === null) return setError("Capacity must be a number, zero or more.")
    const lat = latitude.trim() === "" ? null : parseNumber(latitude)
    const lng = longitude.trim() === "" ? null : parseNumber(longitude)
    if (latitude.trim() !== "" && lat === null) return setError("Latitude must be a number.")
    if (longitude.trim() !== "" && lng === null) return setError("Longitude must be a number.")

    const check = validateLocation({ locationId, name, kind, usage, capacity: cap, latitude: lat, longitude: lng }, locations, location?.locationId)
    if (!check.ok) return setError(check.error)
    if (location) {
      const usageOk = validateUsageChange(heldRecords, usage)
      if (!usageOk.ok) return setError(usageOk.error)
      if (location.active && !active) {
        const usable = validateDeactivate(heldRecords, location.name)
        if (!usable.ok) return setError(usable.error)
      }
    }

    const next: LocationMaster = {
      locationId: locationId.trim().toUpperCase(),
      name: name.trim(),
      kind: kind as LocationKind,
      usage: usage as LocationUsage,
      description: description.trim() || undefined,
      capacity: cap ?? undefined,
      uom: cap !== null ? uom.trim().toUpperCase() || undefined : undefined,
      latitude: lat ?? undefined,
      longitude: lng ?? undefined,
      active,
    }
    onSave(editing ? locations.map((l) => (l.locationId === location!.locationId ? next : l)) : [...locations, next])
  }

  return (
    <Modal title={editing ? "Edit Location" : "Add Location"} subtitle={location?.locationId} onClose={onClose} width={580}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Location ID" required hint={editing ? "Fixed once registered." : "e.g. PILE-RM-08"}>
          <input
            value={locationId}
            onChange={(e) => setLocationId(e.target.value.toUpperCase())}
            disabled={editing}
            placeholder="PILE-RM-08"
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Location Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Limestone Pile — North" className={INPUT} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Location Type" required>
          <select value={kind} onChange={(e) => setKind(e.target.value as LocationKind)} className={INPUT}>
            <option value="">Select type…</option>
            {LOCATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {LOCATION_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Used As" required hint="Whether stock is held here, used here, or both.">
          <select value={usage} onChange={(e) => setUsage(e.target.value as LocationUsage)} className={INPUT}>
            <option value="">Select…</option>
            {LOCATION_USAGES.map((u) => (
              <option key={u} value={u}>
                {LOCATION_USAGE_LABEL[u]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className={INPUT} />
      </Field>

      <div className="grid grid-cols-[1fr_90px] gap-x-3">
        <Field label="Capacity" hint={consumptionOnly ? "A consumption-only location holds no stock." : "Optional. Leave blank if the plant has none on record."}>
          <input
            inputMode="decimal"
            value={consumptionOnly ? "" : capacity}
            onChange={(e) => setCapacity(e.target.value)}
            disabled={consumptionOnly}
            placeholder="Optional"
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="UOM">
          <input value={uom} onChange={(e) => setUom(e.target.value.toUpperCase())} disabled={consumptionOnly} className={INPUT} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Latitude">
          <input inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Optional" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Longitude">
          <input inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Optional" className={`${INPUT} font-mono`} />
        </Field>
      </div>

      {editing && (
        <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-panel-2 p-3 text-[12.5px] text-ink ring-1 ring-line">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-[2px] accent-[var(--color-accent)]" />
          <span>
            Active
            <span className="block text-[11px] text-ink-3">
              {heldRecords > 0
                ? `Holds ${heldRecords} active inventory ${heldRecords === 1 ? "record" : "records"}. Nothing is ever deleted.`
                : "No active inventory is held here."}
            </span>
          </span>
        </label>
      )}

      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel={editing ? "Save Location" : "Add Location"} disabled={!locationId.trim() || !name.trim() || !kind || !usage} />
    </Modal>
  )
}

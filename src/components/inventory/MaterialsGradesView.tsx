"use client"

/**
 * Master → Materials + Grades — one master, managed together.
 *
 *   Material Code *   Material Name *   Category   UOM *   Grade *
 *   Where required: grade-specific parameters, grade version, status
 *
 * e.g. Limestone → Grade A, Limestone → Grade B, Alternate Fuel → SRF.
 *
 * This is the ONLY place material and grade information is maintained.
 * Inventory maps an existing Material + Grade to a Location and never
 * recreates any of it. Stock levels (min / target / max) are not here — they
 * belong to each inventory record.
 */

import { Fragment, useMemo, useState } from "react"

import { Actions, Err, Field, INPUT, Modal } from "@/components/shell/Modal"
import { usePiles } from "@/components/shell/pile-store"
import { setMaterialsAndGrades } from "@/lib/masters/registry"
import {
  gradeIdFor,
  materialIdFor,
  parseNonNegativeNumber,
  parseNumber,
  validateDeactivate,
  validateGrade,
  validateMaterial,
} from "@/lib/masters/rules"
import {
  MATERIAL_GROUPS,
  samplingLabel,
  type GradeMaster,
  type MaterialGroup,
  type MaterialMaster,
  type QualityParameter,
} from "@/lib/masters/types"
import { useMasters } from "@/lib/masters/useMasters"
import { ActiveTag, Empty, LinkButton, PrimaryButton } from "./Table"
import { AddedBanner, useJustAdded } from "@/components/shell/just-added"

type Editing =
  | { kind: "new" }
  | { kind: "material"; material: MaterialMaster }
  | { kind: "grade"; material: MaterialMaster; grade: GradeMaster | null }

export function MaterialsGradesView() {
  const masters = useMasters()
  const { inventory, canWriteInventory } = usePiles()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<"" | MaterialGroup>("")
  const added = useJustAdded()
  /** After a save: clear the filters so the row is in the list, then highlight it. */
  const show = (id: string, message: string) => {
    setQuery("")
    setCategory("")
    added.mark(id, message)
  }

  const gradesOf = useMemo(() => {
    const map = new Map<string, GradeMaster[]>()
    for (const g of masters.grades) map.set(g.materialId, [...(map.get(g.materialId) ?? []), g])
    return map
  }, [masters.grades])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return masters.materials.filter((m) => {
      if (category && m.group !== category) return false
      if (!q) return true
      const grades = gradesOf.get(m.materialId) ?? []
      return [m.code, m.name, m.group, m.uom, ...grades.map((g) => g.name)].some((v) => v?.toLowerCase().includes(q))
    })
  }, [masters.materials, gradesOf, query, category])

  const inUseByMaterial = (materialId: string) => inventory.filter((r) => r.active && r.materialId === materialId).length
  const inUseByGrade = (gradeId: string) => inventory.filter((r) => r.active && r.gradeId === gradeId).length
  const gradeCount = filtered.reduce((n, m) => n + (gradesOf.get(m.materialId)?.length ?? 0), 0)

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search materials and grades"
          placeholder="Search code, material or grade…"
          className="w-full max-w-[320px] rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as "" | MaterialGroup)}
          aria-label="Filter by category"
          className="rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line focus:ring-accent"
        >
          <option value="">Category: All</option>
          {MATERIAL_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <span className="text-[11.5px] text-ink-3">
          {filtered.length} materials · {gradeCount} grades
        </span>
        <span className="ml-auto">
          <PrimaryButton onClick={() => setEditing({ kind: "new" })} disabled={!canWriteInventory}>
            + Add Material + Grade
          </PrimaryButton>
        </span>
      </div>

      <AddedBanner added={added} />
      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[1100px] border-collapse text-[12.5px]">
          <thead className="bg-panel-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-3 py-2.5">Material Code</th>
              <th className="px-3 py-2.5">Material Name</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5">UOM</th>
              <th className="px-3 py-2.5">Grade</th>
              <th className="px-3 py-2.5">Version</th>
              <th className="px-3 py-2.5">Grade Parameters</th>
              <th className="px-3 py-2.5">Sampling</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const grades = gradesOf.get(m.materialId) ?? []
              const rows = Math.max(1, grades.length)
              const materialCells = (
                <>
                  <td rowSpan={rows} data-added-key={m.materialId} className="whitespace-nowrap border-t border-line px-3 py-2.5 align-top font-mono text-ink">
                    {m.code}
                  </td>
                  <td rowSpan={rows} className="border-t border-line px-3 py-2.5 align-top">
                    <span className="block font-semibold text-ink">{m.name}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {m.expiryApplicable && <Tag>Expiry tracked</Tag>}
                      {m.lotTracking && <Tag>Lot / batch tracked</Tag>}
                      {m.criticalSpare && <Tag strong>Critical spare</Tag>}
                      {m.unitCost !== undefined && <Tag>${m.unitCost.toLocaleString()} / {m.uom}</Tag>}
                    </span>
                    <span className="mt-1 flex gap-1">
                      <LinkButton onClick={() => setEditing({ kind: "material", material: m })}>Edit Material</LinkButton>
                      {canWriteInventory && <LinkButton onClick={() => setEditing({ kind: "grade", material: m, grade: null })}>+ Grade</LinkButton>}
                    </span>
                  </td>
                  <td rowSpan={rows} className="border-t border-line px-3 py-2.5 align-top text-ink-2">
                    {m.group ?? <span className="text-ink-3">—</span>}
                  </td>
                  <td rowSpan={rows} className="border-t border-line px-3 py-2.5 align-top text-ink-2">
                    {m.uom}
                  </td>
                </>
              )
              if (grades.length === 0) {
                return (
                  <tr key={m.materialId} className={`bg-panel/60 ${m.active ? "" : "opacity-60"} ${added.is(m.materialId) ? "added-row" : ""}`}>
                    {materialCells}
                    <td colSpan={5} className="border-t border-line px-3 py-2.5 text-ink-3">
                      No grade yet — every material needs at least one before it can hold inventory.
                    </td>
                    <td className="border-t border-line px-3 py-2.5" />
                  </tr>
                )
              }
              return (
                <Fragment key={m.materialId}>
                  {grades.map((g, i) => (
                    <tr
                      key={g.gradeId}
                      className={`bg-panel/60 hover:bg-panel-2 ${m.active && g.active ? "" : "opacity-60"} ${added.is(g.gradeId) || added.is(m.materialId) ? "added-row" : ""}`}
                      data-grade={g.gradeId}
                      data-added-key={g.gradeId}
                    >
                      {i === 0 && materialCells}
                      <td className={`px-3 py-2.5 align-top font-semibold text-ink ${i === 0 ? "border-t border-line" : "border-t border-line/50"}`}>{g.name}</td>
                      <td className={`px-3 py-2.5 align-top text-ink-2 ${i === 0 ? "border-t border-line" : "border-t border-line/50"}`}>{g.version ?? "—"}</td>
                      <td className={`px-3 py-2.5 align-top text-ink-2 ${i === 0 ? "border-t border-line" : "border-t border-line/50"}`}>
                        {g.qualityParameters.length === 0 ? (
                          <span className="text-ink-3">None</span>
                        ) : (
                          g.qualityParameters.map((p) => (p.unit === "%" ? `%${p.name}` : p.name)).join(", ")
                        )}
                      </td>
                      <td className={`px-3 py-2.5 align-top text-ink-2 ${i === 0 ? "border-t border-line" : "border-t border-line/50"}`}>{samplingLabel(g.sampleEvery)}</td>
                      <td className={`px-3 py-2.5 align-top ${i === 0 ? "border-t border-line" : "border-t border-line/50"}`}>
                        <ActiveTag active={m.active && g.active} />
                      </td>
                      <td className={`px-3 py-2.5 text-right align-top ${i === 0 ? "border-t border-line" : "border-t border-line/50"}`}>
                        <LinkButton onClick={() => setEditing({ kind: "grade", material: m, grade: g })}>Edit Grade</LinkButton>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <Empty>No material matches this search.</Empty>}
      </div>

      <p className="mt-3 text-[11px] text-ink-3">
        Material and grade information is maintained here once. Inventory selects an existing Material + Grade and never recreates it;
        minimum, target and maximum stock are set on each inventory record. Masters, costs and sampling plans are configured demo data.
      </p>

      {editing?.kind === "new" && (
        <NewMaterialGradeModal
          materials={masters.materials}
          grades={masters.grades}
          onClose={() => setEditing(null)}
          onSave={(materials, grades) => {
            const grade = grades.find((g) => !masters.grades.some((x) => x.gradeId === g.gradeId))
            const material = materials.find((m) => m.materialId === grade?.materialId)
            const isNewMaterial = Boolean(material && !masters.materials.some((m) => m.materialId === material.materialId))
            setMaterialsAndGrades(materials, grades)
            setEditing(null)
            if (grade && material) {
              show(
                grade.gradeId,
                isNewMaterial
                  ? `Material ${material.code} — ${material.name} added with grade ${grade.name}.`
                  : `Grade ${grade.name} added to ${material.name} (${material.code}).`,
              )
            }
          }}
        />
      )}
      {editing?.kind === "material" && (
        <MaterialModal
          material={editing.material}
          materials={masters.materials}
          inUse={inUseByMaterial(editing.material.materialId)}
          onClose={() => setEditing(null)}
          onSave={(materials) => {
            const material = materials.find((m) => m.materialId === editing.material.materialId)
            setMaterialsAndGrades(materials, masters.grades)
            setEditing(null)
            if (material) show(material.materialId, `Material ${material.code} — ${material.name} updated.`)
          }}
        />
      )}
      {editing?.kind === "grade" && (
        <GradeModal
          material={editing.material}
          grade={editing.grade}
          grades={masters.grades}
          inUse={editing.grade ? inUseByGrade(editing.grade.gradeId) : 0}
          readOnly={!canWriteInventory}
          onClose={() => setEditing(null)}
          onSave={(grades) => {
            const grade = editing.grade
              ? grades.find((g) => g.gradeId === editing.grade!.gradeId)
              : grades.find((g) => !masters.grades.some((x) => x.gradeId === g.gradeId))
            setMaterialsAndGrades(masters.materials, grades)
            setEditing(null)
            if (grade) {
              show(grade.gradeId, `Grade ${grade.name} ${editing.grade ? "updated" : "added"} — ${editing.material.name} (${editing.material.code}).`)
            }
          }}
        />
      )}
    </section>
  )
}

function Tag({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold ${strong ? "bg-crit/15 text-ink ring-1 ring-crit/40" : "bg-panel-2 text-ink-2 ring-1 ring-line"}`}
    >
      {children}
    </span>
  )
}

/* ── material fields, shared by "new" and "edit" ─────────────────────────── */

type MaterialDraft = {
  code: string
  name: string
  group: MaterialGroup | ""
  uom: string
  description: string
  expiryApplicable: boolean
  lotTracking: boolean
  criticalSpare: boolean
  unitCost: string
}

const draftOf = (m?: MaterialMaster): MaterialDraft => ({
  code: m?.code ?? "",
  name: m?.name ?? "",
  group: m?.group ?? "",
  uom: m?.uom ?? "MT",
  description: m?.description ?? "",
  expiryApplicable: m?.expiryApplicable ?? false,
  lotTracking: m?.lotTracking ?? false,
  criticalSpare: m?.criticalSpare ?? false,
  unitCost: m?.unitCost === undefined ? "" : String(m.unitCost),
})

function MaterialFields({
  draft,
  set,
  codeLocked,
  uomLocked,
}: {
  draft: MaterialDraft
  set: (patch: Partial<MaterialDraft>) => void
  codeLocked?: boolean
  uomLocked?: boolean
}) {
  return (
    <>
      <div className="grid grid-cols-[1fr_1.6fr] gap-x-3">
        <Field label="Material Code" required hint={codeLocked ? "Fixed once registered." : "e.g. RM-LS"}>
          <input
            value={draft.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            disabled={codeLocked}
            placeholder="RM-LS"
            className={`${INPUT} font-mono`}
          />
        </Field>
        <Field label="Material Name" required>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Limestone" className={INPUT} />
        </Field>
      </div>
      <div className="grid grid-cols-[1.6fr_1fr] gap-x-3">
        <Field label="Category">
          <select value={draft.group} onChange={(e) => set({ group: e.target.value as MaterialGroup })} className={INPUT}>
            <option value="">Not set</option>
            {MATERIAL_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="UOM" required hint={uomLocked ? "Fixed while stock is held." : "MT, EA, DRUM…"}>
          <input value={draft.uom} onChange={(e) => set({ uom: e.target.value.toUpperCase() })} disabled={uomLocked} placeholder="MT" className={INPUT} />
        </Field>
      </div>
    </>
  )
}

/** Optional material settings — only where the plant needs them. */
function MaterialOptions({ draft, set }: { draft: MaterialDraft; set: (patch: Partial<MaterialDraft>) => void }) {
  return (
    // Open by default: "Expiry applies" and the other settings must be findable without hunting.
    <details className="mb-3 rounded-lg border border-line p-3" open>
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-ink-2">
        Material settings — expiry, lot tracking, critical spare, unit cost
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-x-3">
        <Field label="Standard Unit Cost" hint="Per UOM. Value and material cost show only where set.">
          <input inputMode="decimal" value={draft.unitCost} onChange={(e) => set({ unitCost: e.target.value })} placeholder="Optional" className={`${INPUT} font-mono`} />
        </Field>
        <Field label="Description">
          <input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Optional" className={INPUT} />
        </Field>
      </div>
      <Check
        checked={draft.expiryApplicable}
        onChange={(v) => set({ expiryApplicable: v })}
        label="Expiry applies"
        note="Only these materials ask for an expiry date and appear in expiry reports."
      />
      <Check
        checked={draft.lotTracking}
        onChange={(v) => set({ lotTracking: v })}
        label="Lot / batch tracking"
        note="Accepted deliveries record a lot / batch reference. Leave off where the process does not need one."
      />
      {draft.group === "Spare" && (
        <Check
          checked={draft.criticalSpare}
          onChange={(v) => set({ criticalSpare: v })}
          label="Critical spare"
          note="Watched for availability in Reports & Insights."
        />
      )}
    </details>
  )
}

function Check({ checked, onChange, label, note }: { checked: boolean; onChange: (v: boolean) => void; label: string; note: string }) {
  return (
    <label className="mb-2 flex cursor-pointer items-start gap-2.5 text-[12.5px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[2px] accent-[var(--color-accent)]" />
      <span>
        {label}
        <span className="block text-[11px] text-ink-3">{note}</span>
      </span>
    </label>
  )
}

function buildMaterial(d: MaterialDraft, materialId: string, active: boolean): MaterialMaster {
  const cost = d.unitCost.trim() === "" ? undefined : parseNonNegativeNumber(d.unitCost) ?? undefined
  return {
    materialId,
    code: d.code.trim().toUpperCase(),
    name: d.name.trim(),
    uom: d.uom.trim().toUpperCase(),
    group: (d.group || undefined) as MaterialGroup | undefined,
    description: d.description.trim() || undefined,
    expiryApplicable: d.expiryApplicable,
    lotTracking: d.lotTracking,
    criticalSpare: d.group === "Spare" ? d.criticalSpare : undefined,
    unitCost: cost,
    active,
  }
}

function checkMaterialDraft(d: MaterialDraft, materials: MaterialMaster[], editingId?: string): string | null {
  if (d.unitCost.trim() !== "" && parseNonNegativeNumber(d.unitCost) === null) return "Standard unit cost must be a number, zero or more."
  const check = validateMaterial(
    { code: d.code, name: d.name, uom: d.uom, group: d.group || undefined, unitCost: d.unitCost.trim() === "" ? null : parseNonNegativeNumber(d.unitCost) },
    materials,
    editingId,
  )
  return check.ok ? null : check.error
}

/* ── grade fields ────────────────────────────────────────────────────────── */

type ParamDraft = { parameterId: string; name: string; unit: string; min: string; max: string; target: string }

const blankParam = (): ParamDraft => ({ parameterId: `qp-${Math.random().toString(36).slice(2, 8)}`, name: "", unit: "%", min: "", max: "", target: "" })

const toParamDraft = (p: QualityParameter): ParamDraft => ({
  parameterId: p.parameterId,
  name: p.name,
  unit: p.unit ?? "",
  min: p.min === null ? "" : String(p.min),
  max: p.max === null ? "" : String(p.max),
  target: p.target === null ? "" : String(p.target),
})

type GradeDraft = { name: string; version: string; sampleEvery: string; params: ParamDraft[]; active: boolean }

const gradeDraftOf = (g?: GradeMaster | null): GradeDraft => ({
  name: g?.name ?? "",
  version: g?.version ?? "",
  sampleEvery: String(g?.sampleEvery ?? 1),
  params: g ? g.qualityParameters.map(toParamDraft) : [],
  active: g?.active ?? true,
})

/** Parse a grade draft; returns the parameters or an error. */
function parseParams(params: ParamDraft[]): { ok: true; value: QualityParameter[] } | { ok: false; error: string } {
  const out: QualityParameter[] = []
  for (const p of params) {
    const q: QualityParameter = {
      parameterId: p.parameterId,
      name: p.name.trim(),
      unit: p.unit.trim() || undefined,
      min: p.min.trim() === "" ? null : parseNumber(p.min),
      max: p.max.trim() === "" ? null : parseNumber(p.max),
      target: p.target.trim() === "" ? null : parseNumber(p.target),
    }
    // A typed value that is not a number would silently drop the limit.
    if (p.min.trim() !== "" && q.min === null) return { ok: false, error: `${q.name || "Parameter"}: minimum must be a number.` }
    if (p.max.trim() !== "" && q.max === null) return { ok: false, error: `${q.name || "Parameter"}: maximum must be a number.` }
    if (p.target.trim() !== "" && q.target === null) return { ok: false, error: `${q.name || "Parameter"}: target must be a number.` }
    out.push(q)
  }
  return { ok: true, value: out }
}

const SAMPLING_OPTIONS = [1, 2, 3, 4, 5, 10, 0]

function GradeFields({ draft, set, showStatus, inUse }: { draft: GradeDraft; set: (patch: Partial<GradeDraft>) => void; showStatus?: boolean; inUse?: number }) {
  const setParam = (id: string, patch: Partial<ParamDraft>) => set({ params: draft.params.map((p) => (p.parameterId === id ? { ...p, ...patch } : p)) })
  return (
    <>
      <div className="grid grid-cols-[1.4fr_0.8fr_1.4fr] gap-x-3">
        <Field label="Grade" required hint="e.g. Grade A, SRF, OPC 43">
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Grade A" className={INPUT} />
        </Field>
        <Field label="Grade Version">
          <input value={draft.version} onChange={(e) => set({ version: e.target.value })} placeholder="Optional" className={INPUT} />
        </Field>
        <Field label="Sampling Frequency" hint="How often Incoming samples this grade.">
          <select value={draft.sampleEvery} onChange={(e) => set({ sampleEvery: e.target.value })} className={INPUT}>
            {SAMPLING_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {samplingLabel(n)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="mb-3 rounded-lg border border-line p-3">
        <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">Grade-specific Parameters</legend>
        {draft.params.length === 0 ? (
          <p className="mb-2 text-[11.5px] text-ink-3">
            None yet. Add what this grade is tested on — %C, %Mn, %S, %P, %Si, %Al, moisture, calorific value — each with its own limits.
          </p>
        ) : (
          <div className="mb-1 grid grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_0.8fr_28px] gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            <span>Parameter</span>
            <span>Unit</span>
            <span>Min</span>
            <span>Target</span>
            <span>Max</span>
            <span />
          </div>
        )}
        {draft.params.map((p) => (
          <div key={p.parameterId} className="mb-2 grid grid-cols-[1.4fr_0.6fr_0.8fr_0.8fr_0.8fr_28px] items-center gap-x-2">
            <input value={p.name} onChange={(e) => setParam(p.parameterId, { name: e.target.value })} aria-label="Parameter name" placeholder="e.g. C" className={INPUT} />
            <input value={p.unit} onChange={(e) => setParam(p.parameterId, { unit: e.target.value })} aria-label="Unit" placeholder="%" className={INPUT} />
            <input inputMode="decimal" value={p.min} onChange={(e) => setParam(p.parameterId, { min: e.target.value })} aria-label="Minimum" placeholder="—" className={`${INPUT} font-mono`} />
            <input inputMode="decimal" value={p.target} onChange={(e) => setParam(p.parameterId, { target: e.target.value })} aria-label="Target" placeholder="—" className={`${INPUT} font-mono`} />
            <input inputMode="decimal" value={p.max} onChange={(e) => setParam(p.parameterId, { max: e.target.value })} aria-label="Maximum" placeholder="—" className={`${INPUT} font-mono`} />
            <button
              onClick={() => set({ params: draft.params.filter((x) => x.parameterId !== p.parameterId) })}
              aria-label={`Remove ${p.name || "parameter"}`}
              className="h-[28px] w-[28px] rounded-lg text-[16px] leading-none text-ink-3 ring-1 ring-line hover:text-crit"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => set({ params: [...draft.params, blankParam()] })}
          className="rounded-lg bg-panel-2 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-line"
        >
          + Add Parameter
        </button>
      </fieldset>

      {showStatus && (
        <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-panel-2 p-3 text-[12.5px] text-ink ring-1 ring-line">
          <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} className="mt-[2px] accent-[var(--color-accent)]" />
          <span>
            Active
            <span className="block text-[11px] text-ink-3">
              {inUse ? `Held by ${inUse} active inventory ${inUse === 1 ? "record" : "records"}. Nothing is ever deleted.` : "No active inventory holds this grade."}
            </span>
          </span>
        </label>
      )}
    </>
  )
}

function buildGrade(material: MaterialMaster, d: GradeDraft, params: QualityParameter[], grades: GradeMaster[], existing?: GradeMaster | null): GradeMaster {
  return {
    gradeId: existing?.gradeId ?? gradeIdFor(material.code, d.name, grades),
    materialId: material.materialId,
    name: d.name.trim(),
    version: d.version.trim() || undefined,
    qualityParameters: params,
    sampleEvery: Number(d.sampleEvery) || 0,
    active: d.active,
  }
}

/* ── modals ──────────────────────────────────────────────────────────────── */

function NewMaterialGradeModal({
  materials,
  grades,
  onClose,
  onSave,
}: {
  materials: MaterialMaster[]
  grades: GradeMaster[]
  onClose: () => void
  onSave: (materials: MaterialMaster[], grades: GradeMaster[]) => void
}) {
  const [draft, setDraft] = useState<MaterialDraft>(draftOf())
  const [grade, setGrade] = useState<GradeDraft>(gradeDraftOf())
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<MaterialDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setG = (patch: Partial<GradeDraft>) => setGrade((g) => ({ ...g, ...patch }))

  const submit = () => {
    setError(null)
    const materialError = checkMaterialDraft(draft, materials)
    if (materialError) return setError(materialError)
    const material = buildMaterial(draft, materialIdFor(draft.code), true)
    const params = parseParams(grade.params)
    if (!params.ok) return setError(params.error)
    const check = validateGrade({ materialId: material.materialId, name: grade.name, version: grade.version, sampleEvery: Number(grade.sampleEvery), qualityParameters: params.value }, grades)
    if (!check.ok) return setError(check.error)
    onSave([...materials, material], [...grades, buildGrade(material, grade, params.value, grades)])
  }

  return (
    <Modal title="Add Material + Grade" onClose={onClose} width={700}>
      <MaterialFields draft={draft} set={set} />
      <GradeFields draft={grade} set={setG} />
      <MaterialOptions draft={draft} set={set} />
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Add Material + Grade" disabled={!draft.code.trim() || !draft.name.trim() || !draft.uom.trim() || !grade.name.trim()} />
    </Modal>
  )
}

function MaterialModal({
  material,
  materials,
  inUse,
  onClose,
  onSave,
}: {
  material: MaterialMaster
  materials: MaterialMaster[]
  inUse: number
  onClose: () => void
  onSave: (materials: MaterialMaster[]) => void
}) {
  const { canWriteInventory, inventory } = usePiles()
  const [draft, setDraft] = useState<MaterialDraft>(draftOf(material))
  const [active, setActive] = useState(material.active)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<MaterialDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = () => {
    setError(null)
    const materialError = checkMaterialDraft(draft, materials, material.materialId)
    if (materialError) return setError(materialError)
    if (material.active && !active) {
      const usable = validateDeactivate(inUse, material.name)
      if (!usable.ok) return setError(usable.error)
    }
    // Switching expiry off would hide dated stock from expiry tracking.
    if (material.expiryApplicable && !draft.expiryApplicable) {
      const dated = inventory.filter((r) => r.active && r.materialId === material.materialId && r.quantity > 0 && r.expiryDate)
      if (dated.length) {
        return setError(
          `${dated.map((r) => r.inventoryId).join(", ")} still ${dated.length === 1 ? "holds" : "hold"} dated stock. Write it off or use it before switching expiry off for ${material.name}.`,
        )
      }
    }
    const next = buildMaterial(draft, material.materialId, active)
    onSave(materials.map((m) => (m.materialId === material.materialId ? next : m)))
  }

  return (
    <Modal title="Edit Material" subtitle={material.code} onClose={onClose} width={620}>
      <MaterialFields draft={draft} set={set} codeLocked uomLocked={inUse > 0} />
      <MaterialOptions draft={draft} set={set} />
      <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-panel-2 p-3 text-[12.5px] text-ink ring-1 ring-line">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-[2px] accent-[var(--color-accent)]" />
        <span>
          Active
          <span className="block text-[11px] text-ink-3">
            {inUse > 0 ? `Used by ${inUse} active inventory ${inUse === 1 ? "record" : "records"}. Nothing is ever deleted.` : "No active inventory depends on this material."}
          </span>
        </span>
      </label>
      {!canWriteInventory && <Err>You have read-only access. Changes cannot be saved.</Err>}
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel="Save Material" disabled={!canWriteInventory} />
    </Modal>
  )
}

function GradeModal({
  material,
  grade,
  grades,
  inUse,
  readOnly,
  onClose,
  onSave,
}: {
  material: MaterialMaster
  grade: GradeMaster | null
  grades: GradeMaster[]
  inUse: number
  readOnly: boolean
  onClose: () => void
  onSave: (grades: GradeMaster[]) => void
}) {
  const [draft, setDraft] = useState<GradeDraft>(gradeDraftOf(grade))
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<GradeDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = () => {
    setError(null)
    const params = parseParams(draft.params)
    if (!params.ok) return setError(params.error)
    const check = validateGrade(
      { materialId: material.materialId, name: draft.name, version: draft.version, sampleEvery: Number(draft.sampleEvery), qualityParameters: params.value },
      grades,
      grade?.gradeId,
    )
    if (!check.ok) return setError(check.error)
    if (grade?.active && !draft.active) {
      const usable = validateDeactivate(inUse, `${material.name} — ${grade.name}`)
      if (!usable.ok) return setError(usable.error)
    }
    const next = buildGrade(material, draft, params.value, grades, grade)
    onSave(grade ? grades.map((g) => (g.gradeId === grade.gradeId ? next : g)) : [...grades, next])
  }

  return (
    <Modal title={grade ? "Edit Grade" : "Add Grade"} subtitle={`${material.name} (${material.code})`} onClose={onClose} width={680}>
      <GradeFields draft={draft} set={set} showStatus={Boolean(grade)} inUse={inUse} />
      {readOnly && <Err>You have read-only access. Changes cannot be saved.</Err>}
      {error && <Err>{error}</Err>}
      <Actions onCancel={onClose} onSubmit={submit} submitLabel={grade ? "Save Grade" : "Add Grade"} disabled={readOnly || !draft.name.trim()} />
    </Modal>
  )
}

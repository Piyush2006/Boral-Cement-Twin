/**
 * Consuming areas, material routes and the seeded worklist.
 *
 * Nothing here is new plant data. Consuming areas are units the plant model
 * already has (the twin's process units); routes are walked over the process
 * connections the twin already draws. Where the model has no connection, the
 * route is reported as not modelled rather than invented.
 */

import { ISSUE_PROCESS } from "@/config/issue-process"
import { TWIN_CARDS } from "@/lib/assets/twin-cards"
import { seededRandom } from "@/lib/incoming/catalog"
import type { IncomingRecord } from "@/lib/incoming/types"
import { locationName, materialEntry } from "@/lib/inventory/catalog"
import { seedGradeAt, seedInventoryIdAt, seedMaterialAt } from "@/lib/inventory/seed-records"
import { LINKS } from "@/lib/twin/process-layout"
import { consumptionLocations, locationMaster } from "@/lib/masters/registry"
import { consumesStock } from "@/lib/masters/types"
import { defaultCategory } from "./consumption"
import type { IssueRecord } from "./types"

export type ConsumingArea = {
  areaId: string
  name: string
  /** The unit's node in the process layout. */
  nodeId: string
}

const cardTitle = (id: string, fallback: string) => TWIN_CARDS.find((c) => c.id === id)?.title ?? fallback

/**
 * Consuming areas are LOCATIONS registered as Consumption or Both under
 * Master → Locations — there is no second list. The only thing kept here is
 * where each one sits in the process layout, so a route can be drawn; an area
 * with no node (maintenance, or anything newly registered) reports its route
 * as not modelled rather than inventing one.
 */
const AREA_NODE: Record<string, string> = {
  "RM-01": "RM-01",
  "KLN-01": "KLN-01",
  "GEO-01": "GEO-01",
  "PK-01": "PK-01",
}

/** Active consuming areas, from the Locations master. */
export function consumingAreas(): ConsumingArea[] {
  return consumptionLocations().map((l) => ({ areaId: l.locationId, name: l.name, nodeId: AREA_NODE[l.locationId] ?? l.locationId }))
}

/** A consuming area by ID — including one since deactivated, so history still reads. */
export function consumingArea(areaId: string): ConsumingArea | undefined {
  const l = locationMaster(areaId)
  return l && consumesStock(l) ? { areaId: l.locationId, name: l.name, nodeId: AREA_NODE[l.locationId] ?? l.locationId } : undefined
}

/**
 * Inventory locations as they appear in the process layout. The twin groups
 * the three silos and names two piles by material; everything else matches.
 */
const LOCATION_NODE: Record<string, string> = {
  "PILE-RM-05": "PILE-COAL",
  "PILE-RM-06": "PILE-AF",
  "SL-01": "SL-GRP",
  "SL-02": "SL-GRP",
  "SL-03": "SL-GRP",
}

export type RouteStep = { nodeId: string; name: string }

/**
 * The modelled route from a source location to a consuming area, walked over
 * the process connections. Null when the plant model has no path — the caller
 * must say so, not draw one.
 */
export function materialRoute(sourceLocationId: string, areaId: string): RouteStep[] | null {
  const area = consumingArea(areaId)
  if (!area) return null
  const start = LOCATION_NODE[sourceLocationId] ?? sourceLocationId

  const prev = new Map<string, string | null>([[start, null]])
  const queue = [start]
  while (queue.length) {
    const at = queue.shift()!
    if (at === area.nodeId) break
    for (const link of LINKS) {
      if (link.from === at && !prev.has(link.to)) {
        prev.set(link.to, at)
        queue.push(link.to)
      }
    }
  }
  if (!prev.has(area.nodeId)) return null

  const path: string[] = []
  for (let n: string | null = area.nodeId; n; n = prev.get(n) ?? null) path.unshift(n)
  return path.map((nodeId, i) => ({
    nodeId,
    name:
      i === 0
        ? locationName(sourceLocationId)
        : cardTitle(nodeId, nodeId),
  }))
}

/* ── seeded worklist ─────────────────────────────────────────────────────── */

/** Demo draws: a source, where it is typically consumed, and a draw size in MT. */
const SEED_DRAWS: Array<{ source: string; area: string; range: [number, number] }> = [
  { source: "PILE-RM-01", area: "RM-01", range: [300, 700] },
  { source: "PILE-RM-02", area: "RM-01", range: [120, 320] },
  { source: "PILE-RM-05", area: "KLN-01", range: [80, 220] },
  { source: "PILE-RM-06", area: "GEO-01", range: [40, 150] },
  { source: "PILE-RM-07", area: "RM-01", range: [400, 900] },
  { source: "PILE-RM-03", area: "RM-01", range: [40, 120] },
  { source: "SL-02", area: "PK-01", range: [150, 400] },
]

export const FIRST_ISSUE_NO = 8
export const FIRST_CONSUMPTION_NO = 35
const SEED_COUNT = 24
const SEED_START = Date.UTC(2026, 8, 6, 20) // 7 Sept 2026, 06:00 AEST
const STEP_MIN = 150

/** Stands in for a transaction ID until the inventory seed writes the ledger. */
export const TXN_PLACEHOLDER = "{TXN}"

/**
 * The receipt a demo draw is linked to: the latest receipt into the same
 * inventory record before the draw. Materials that never arrive through
 * Incoming Materials (raw mix, cement) get no origin — no PO is fabricated.
 */
function originReceipt(inventoryId: string, before: number, incoming: IncomingRecord[]): IncomingRecord | undefined {
  return incoming
    .filter((r) => r.receipt && r.receipt.inventoryId === inventoryId && new Date(r.receipt.at).getTime() < before)
    .sort((a, b) => new Date(b.receipt!.at).getTime() - new Date(a.receipt!.at).getTime())[0]
}

/**
 * Twenty-four demo records, oldest consumed, newest still requested.
 *
 * Postings carry TXN_PLACEHOLDER; the inventory seed (seed.ts) writes the
 * matching ledger transactions and substitutes the real IDs.
 */
export function seedIssues(incoming: IncomingRecord[]): IssueRecord[] {
  const { approvalRequired, inventoryPostingPoint: postingPoint } = ISSUE_PROCESS
  const records: IssueRecord[] = []
  let consumptionNo = FIRST_CONSUMPTION_NO

  for (let i = 0; i < SEED_COUNT; i += 1) {
    const issueId = `ISS-${String(FIRST_ISSUE_NO + i).padStart(5, "0")}`
    const rand = seededRandom(issueId)
    const draw = SEED_DRAWS[Math.floor(rand() * SEED_DRAWS.length)]
    const material = materialEntry(seedMaterialAt(draw.source))
    const gradeId = seedGradeAt(draw.source)
    const inventoryId = seedInventoryIdAt(draw.source)!
    const requested = Math.round((draw.range[0] + rand() * (draw.range[1] - draw.range[0])) / 5) * 5

    const created = SEED_START + i * STEP_MIN * 60000
    const at = (min: number) => new Date(created + min * 60000).toISOString()
    // The reference is optional; some draws were raised without one.
    const productionRef = i % 3 === 2 ? "" : `PR-${1001 + Math.floor(i / 2)}`
    const receipt = originReceipt(inventoryId, created, incoming)

    const stage: IssueRecord["status"] =
      i < 15 ? "CONSUMED" : i < 20 ? "ISSUED" : i < 22 && approvalRequired ? "APPROVED" : "REQUESTED"

    const record: IssueRecord = {
      issueId,
      materialId: seedMaterialAt(draw.source) ?? "",
      sourceInventoryId: inventoryId,
      sourceLocationId: draw.source,
      requestedQty: requested,
      uom: material?.uom ?? "MT",
      gradeId,
      consumingAreaId: draw.area,
      productionRef,
      reason: "",
      notes: "",
      batch: receipt?.batch,
      origin: receipt ? { incomingId: receipt.incomingId, poNumber: receipt.poNumber } : undefined,
      approvalRequired,
      postingPoint,
      status: "REQUESTED",
      createdAt: at(0),
      createdBy: "operator.01",
      audit: [{ at: at(0), by: "operator.01", action: `Issue created — ${requested.toLocaleString()} MT requested`, to: "REQUESTED" }],
      provenance: "DEMO",
    }

    let r = record
    if (approvalRequired && stage !== "REQUESTED") {
      r = {
        ...r,
        status: "APPROVED",
        approval: { at: at(5), by: "supervisor.01" },
        audit: [...r.audit, { at: at(5), by: "supervisor.01", action: "Issue approved", from: "REQUESTED", to: "APPROVED" }],
      }
    }
    if (stage === "ISSUED" || stage === "CONSUMED") {
      const txn = postingPoint === "ISSUE" ? TXN_PLACEHOLDER : undefined
      r = {
        ...r,
        status: "ISSUED",
        issue: { issuedQty: requested, at: at(10), by: "operator.01", transactionId: txn },
        audit: [
          ...r.audit,
          {
            at: at(10),
            by: "operator.01",
            action: txn
              ? `Material issued — ${requested.toLocaleString()} MT, inventory transaction ${txn}`
              : `Material issued — ${requested.toLocaleString()} MT`,
            from: r.status,
            to: "ISSUED",
            transactionId: txn,
          },
        ],
      }
    }
    if (stage === "CONSUMED") {
      // Consumption lands at or a little under the issued quantity.
      const consumed = Math.round(requested * (0.95 + rand() * 0.05))
      const consumptionId = `CON-${String(consumptionNo).padStart(5, "0")}`
      consumptionNo += 1
      const txn = postingPoint === "CONSUMPTION" ? TXN_PLACEHOLDER : undefined
      r = {
        ...r,
        status: "CONSUMED",
        consumption: {
          consumptionId,
          consumedQty: consumed,
          category: defaultCategory(material?.group),
          consumingAreaId: draw.area,
          productionRef,
          comments: "",
          at: at(35),
          postedAt: at(36),
          by: "operator.01",
          transactionId: txn,
        },
        audit: [
          ...r.audit,
          {
            at: at(35),
            by: "operator.01",
            action: `Consumption recorded — ${consumed.toLocaleString()} MT (${consumptionId})`,
            from: "ISSUED",
            to: "CONSUMED",
          },
          {
            at: at(36),
            by: "operator.01",
            action: txn ? `Inventory transaction posted — ${txn}` : "Consumption posted — inventory moved at issue",
            transactionId: txn ?? r.issue?.transactionId,
          },
        ],
      }
    }
    records.push(r)
  }

  records.push(...seedMaintenanceDraws(approvalRequired, postingPoint))
  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/**
 * Maintenance draws and one partial return — so asset-wise material cost and
 * net consumption (gross outward − returned) have real records behind them.
 * Assets are units the plant model already has; references are demo work
 * orders.
 */
function seedMaintenanceDraws(approvalRequired: boolean, postingPoint: IssueRecord["postingPoint"]): IssueRecord[] {
  const draws: Array<{
    issueId: string
    consumptionId: string
    source: string
    inventoryId: string
    materialId: string
    gradeId: string
    uom: string
    area: string
    assetId?: string
    maintenanceRef?: string
    issued: number
    consumed: number
    returned?: { returnId: string; qty: number; reason: string }
    day: number
  }> = [
    { issueId: "ISS-00040", consumptionId: "CON-00070", source: "STORE-01", inventoryId: "SP-BRG-001", materialId: "MAT-SPARE-BEARING", gradeId: "GRD-BRG-STD", uom: "EA", area: "MAINT-01", assetId: "KLN-01", maintenanceRef: "WO-2026-0831", issued: 2, consumed: 2, day: 3 },
    { issueId: "ISS-00041", consumptionId: "CON-00071", source: "STORE-01", inventoryId: "SP-SEAL-001", materialId: "MAT-SPARE-SEAL", gradeId: "GRD-SEAL-STD", uom: "EA", area: "MAINT-01", assetId: "KLN-01", maintenanceRef: "WO-2026-0831", issued: 6, consumed: 4, returned: { returnId: "RET-00001", qty: 2, reason: "Two segments not needed on the shutdown" }, day: 3 },
    { issueId: "ISS-00042", consumptionId: "CON-00072", source: "STORE-01", inventoryId: "SP-LUB-001", materialId: "MAT-SPARE-LUBRICANT", gradeId: "GRD-LUB-STD", uom: "DRUM", area: "MAINT-01", assetId: "CEM-01", maintenanceRef: "WO-2026-0844", issued: 2, consumed: 2, day: 5 },
    { issueId: "ISS-00043", consumptionId: "CON-00073", source: "STORE-01", inventoryId: "SP-BRG-001", materialId: "MAT-SPARE-BEARING", gradeId: "GRD-BRG-STD", uom: "EA", area: "MAINT-01", assetId: "RM-01", maintenanceRef: "WO-2026-0852", issued: 1, consumed: 1, day: 7 },
    // Issue 100, return 20, net consumption 80 — the worked example, on limestone.
    { issueId: "ISS-00044", consumptionId: "CON-00074", source: "PILE-RM-01", inventoryId: "RM-LS-001", materialId: "MAT-LIMESTONE", gradeId: "GRD-LS-A", uom: "MT", area: "RM-01", issued: 100, consumed: 80, returned: { returnId: "RET-00002", qty: 20, reason: "Raw mill trip — unused feed returned to the pile" }, day: 8 },
  ]
  return draws.map((d) => {
    const base = Date.UTC(2026, 8, d.day, 22)
    const at = (min: number) => new Date(base + min * 60000).toISOString()
    const material = materialEntry(d.materialId)
    const category = defaultCategory(material?.group)
    const issueTxn = postingPoint === "ISSUE" ? TXN_PLACEHOLDER : undefined
    const conTxn = postingPoint === "CONSUMPTION" ? TXN_PLACEHOLDER : undefined
    const record: IssueRecord = {
      issueId: d.issueId,
      materialId: d.materialId,
      gradeId: d.gradeId,
      sourceInventoryId: d.inventoryId,
      sourceLocationId: d.source,
      requestedQty: d.issued,
      uom: d.uom,
      consumingAreaId: d.area,
      productionRef: "",
      reason: d.maintenanceRef ? "Planned maintenance" : "",
      notes: "",
      assetId: d.assetId,
      maintenanceRef: d.maintenanceRef,
      approvalRequired,
      postingPoint,
      status: "CONSUMED",
      createdAt: at(0),
      createdBy: "maint.planner",
      ...(approvalRequired ? { approval: { at: at(5), by: "supervisor.01" } } : {}),
      issue: { issuedQty: d.issued, at: at(10), by: "store.01", transactionId: issueTxn },
      returns: d.returned
        ? [{ returnId: d.returned.returnId, quantity: d.returned.qty, reason: d.returned.reason, inventoryId: d.inventoryId, at: at(200), by: "store.01", transactionId: TXN_PLACEHOLDER }]
        : undefined,
      consumption: {
        consumptionId: d.consumptionId,
        // Gross outward: what left the store for the job, before returns.
        consumedQty: d.consumed + (d.returned?.qty ?? 0),
        category,
        unitCost: material?.unitCost,
        consumingAreaId: d.area,
        productionRef: "",
        comments: "",
        at: at(180),
        postedAt: at(181),
        by: "maint.tech",
        transactionId: conTxn,
      },
      audit: [
        { at: at(0), by: "maint.planner", action: `Issue created — ${d.issued} ${d.uom} requested`, to: "REQUESTED" },
        { at: at(10), by: "store.01", action: `Material issued — ${d.issued} ${d.uom}`, from: "REQUESTED", to: "ISSUED", transactionId: issueTxn },
        { at: at(180), by: "maint.tech", action: `Consumption recorded — ${d.consumed + (d.returned?.qty ?? 0)} ${d.uom} (${d.consumptionId})`, from: "ISSUED", to: "CONSUMED" },
        { at: at(181), by: "maint.tech", action: conTxn ? `Inventory transaction posted — ${conTxn}` : "Consumption posted — inventory moved at issue", transactionId: conTxn },
        ...(d.returned
          ? [{ at: at(200), by: "store.01", action: `Material returned — ${d.returned.qty} ${d.uom} (${d.returned.returnId}), inventory transaction ${TXN_PLACEHOLDER}`, transactionId: TXN_PLACEHOLDER }]
          : []),
      ],
      provenance: "DEMO",
    }
    return record
  })
}

/** Next sequential number for an ID prefix, after everything already issued. */
export function nextNumber(ids: string[], prefix: string, floor: number): number {
  const used = ids
    .filter((id) => id.startsWith(`${prefix}-`))
    .map((id) => Number(id.slice(prefix.length + 1)))
    .filter(Number.isFinite)
  return Math.max(floor - 1, ...used) + 1
}

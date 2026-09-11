/**
 * Purchase orders, suppliers and quality configuration.
 *
 * NONE of this exists in the application yet — there is no PO system or
 * supplier master to read from. It is therefore CONFIGURED DEMO DATA, flagged
 * `provenance: "DEMO"` on every record it produces, exactly as the inventory
 * figures are. Point this at a real PO feed and the workflow, the screens and
 * the inventory posting are unchanged.
 */

import { MATERIAL_GROUPS } from "@/lib/inventory/catalog"
import { seedGradeAt } from "@/lib/inventory/seed-records"
import { gradeMaster } from "@/lib/masters/registry"
import { seedInventoryIdAt } from "@/lib/inventory/seed-records"
import type { IncomingRecord } from "./types"

export type PurchaseOrder = {
  poNumber: string
  materialId: string
  /** The grade bought. Quality is tested against this grade's parameters. */
  gradeId?: string
  supplier: string
  /** Ordered quantity, in the material's unit of measure (MT for bulk, DRUM / EA for spares). */
  expectedMt: number
  expectedArrival: string
  destinationLocationId: string
}

/**
 * Deterministic pseudo-random source.
 *
 * Seeded from a string so the same PO always produces the same details, and the
 * server and client renders agree — `Math.random()` here would trip React
 * hydration and make the list change on every refresh.
 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SUPPLIER_POOL = [
  "ABC Quarry",
  "XYZ Fuels",
  "ABC Minerals",
  "Southern Clays",
  "Geocycle",
  "Marulan South Lime",
  "Highlands Aggregates",
  "Illawarra Coal Co.",
  "Southern Gypsum Pty",
  "Wollondilly Sands",
]

/** Materials that actually arrive by delivery, with their receiving locations. */
const INBOUND_MATERIALS: Array<{ materialId: string; destination: string }> = [
  { materialId: "MAT-LIMESTONE", destination: "PILE-RM-01" },
  { materialId: "MAT-CLAY-SHALE", destination: "PILE-RM-02" },
  { materialId: "MAT-SAND", destination: "PILE-RM-03" },
  { materialId: "MAT-GYPSUM", destination: "PILE-RM-04" },
  { materialId: "MAT-COAL", destination: "PILE-RM-05" },
  { materialId: "MAT-ALT-FUEL", destination: "PILE-RM-06" },
]

/** Typical delivered load size per material, in MT. */
const LOAD_RANGE: Record<string, [number, number]> = {
  "MAT-LIMESTONE": [1800, 3000],
  "MAT-CLAY-SHALE": [900, 1800],
  "MAT-SAND": [400, 900],
  "MAT-GYPSUM": [600, 1400],
  "MAT-COAL": [500, 1200],
  "MAT-ALT-FUEL": [60, 300],
}

const FIRST_PO = 10245
const PO_COUNT = 60
const BASE_DAY = Date.UTC(2026, 8, 3) // 3 Sept 2026

/** Build a purchase order deterministically from its number. */
function buildPurchaseOrder(poNumber: string, index: number): PurchaseOrder {
  const rand = seededRandom(poNumber)
  const inbound = INBOUND_MATERIALS[Math.floor(rand() * INBOUND_MATERIALS.length)]
  const [lo, hi] = LOAD_RANGE[inbound.materialId] ?? [500, 1500]
  const qty = Math.round((lo + rand() * (hi - lo)) / 5) * 5

  // Spread arrivals across working hours over roughly a fortnight.
  const day = index >= 0 ? Math.floor(index / 3) : Math.floor(rand() * 14)
  const hour = 7 + Math.floor(rand() * 11)
  const minute = Math.floor(rand() * 4) * 15

  return {
    poNumber,
    materialId: inbound.materialId,
    // The grade is the one held at the destination — a delivery is bought to
    // the specification of the stock it joins.
    gradeId: seedGradeAt(inbound.destination),
    supplier: SUPPLIER_POOL[Math.floor(rand() * SUPPLIER_POOL.length)],
    expectedMt: qty,
    expectedArrival: new Date(BASE_DAY + day * 86400000 + hour * 3600000 + minute * 60000).toISOString(),
    destinationLocationId: inbound.destination,
  }
}

/**
 * Spare-parts POs — configured demo data, like the rest of this file. They are
 * counted, not weighed, and the lubricant is expiry-tracked, so its receipt
 * asks for an expiry date. Kept apart from the generated POs so adding them
 * changes no seeded delivery.
 */
const SPARE_POS: PurchaseOrder[] = [
  {
    poNumber: "PO-10305",
    materialId: "MAT-SPARE-LUBRICANT",
    gradeId: "GRD-LUB-STD",
    supplier: "Illawarra Industrial Supplies",
    expectedMt: 12,
    expectedArrival: "2026-09-15T01:30:00.000Z",
    destinationLocationId: "STORE-01",
  },
  {
    poNumber: "PO-10306",
    materialId: "MAT-SPARE-BEARING",
    gradeId: "GRD-BRG-STD",
    supplier: "Illawarra Industrial Supplies",
    expectedMt: 4,
    expectedArrival: "2026-09-16T03:00:00.000Z",
    destinationLocationId: "STORE-01",
  },
]

/** The purchase orders available to identify: 60 bulk (the first 34 have seeded deliveries) and the spares. */
export const PURCHASE_ORDERS: PurchaseOrder[] = [
  ...Array.from({ length: PO_COUNT }, (_, i) => buildPurchaseOrder(`PO-${FIRST_PO + i}`, i)),
  ...SPARE_POS,
]

export function findPurchaseOrder(poNumber: string): PurchaseOrder | undefined {
  const key = poNumber.trim().toUpperCase()
  return PURCHASE_ORDERS.find((p) => p.poNumber.toUpperCase() === key)
}

/**
 * Resolve any PO number the operator supplies.
 *
 * There is no PO system to validate against, so an unrecognised number is
 * accepted and its details are generated deterministically instead of blocking
 * the operator at the gate. Such records are flagged `adHoc` so the screen can
 * say the PO was not found in the catalogue.
 */
export function resolvePurchaseOrder(poNumber: string): (PurchaseOrder & { adHoc: boolean }) | undefined {
  const key = poNumber.trim().toUpperCase()
  if (!/^PO-\d{3,8}$/.test(key)) return undefined
  const known = findPurchaseOrder(key)
  if (known) return { ...known, adHoc: false }
  return { ...buildPurchaseOrder(key, -1), adHoc: true }
}

/** QR payload for a PO tag. Scanning and typing resolve to the same record. */
export const PO_QR_PREFIX = "berrima:po:"

export function poQrPayload(poNumber: string): string {
  return `${PO_QR_PREFIX}${poNumber}`
}

/** Accepts a scanned tag (`berrima:po:PO-10250`) or a bare PO number. */
export function parsePoQr(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const candidate = value.toLowerCase().startsWith(PO_QR_PREFIX) ? value.slice(PO_QR_PREFIX.length) : value
  return /^PO-\d{3,8}$/i.test(candidate.trim()) ? candidate.trim().toUpperCase() : null
}

export type QualitySpec = { parameterId: string; parameter: string; unit?: string; min: number | null; max: number | null; target: number | null }

/**
 * The parameters a delivery is tested on come from the GRADE it was bought to,
 * registered under Master → Materials + Grades. Nothing is hard-coded here: register a
 * parameter on the grade and the quality step asks for it; register none and
 * quality stays a PASS / FAIL with notes.
 */
export function qualityParameters(gradeId: string | undefined): QualitySpec[] {
  return (gradeMaster(gradeId)?.qualityParameters ?? []).map((p) => ({
    parameterId: p.parameterId,
    parameter: p.name,
    unit: p.unit,
    min: p.min,
    max: p.max,
    target: p.target,
  }))
}

export const SUPPLIERS = SUPPLIER_POOL.slice().sort()

/**
 * Whether the n-th delivery (1-based) of a grade must be sampled, from the
 * grade's sampling frequency: every delivery, every n-th, or none.
 */
export function sampleRequiredFor(gradeId: string | undefined, nth: number): boolean {
  const every = gradeMaster(gradeId)?.sampleEvery ?? 0
  return every > 0 && (nth - 1) % every === 0
}

/** Gate entry and GRN numbers, formatted as the plant documents show them. */
export const formatGateEntry = (n: number) => `GE-${String(n).padStart(5, "0")}`
export const formatGrn = (n: number) => `GRN-${String(n).padStart(5, "0")}`

/** The next number after every one already used with a prefix. */
export function nextDocNumber(used: Array<string | undefined>, prefix: string, floor: number): number {
  const nums = used
    .filter((v): v is string => Boolean(v) && (v as string).startsWith(`${prefix}-`))
    .map((v) => Number(v.slice(prefix.length + 1)))
    .filter((n) => Number.isFinite(n))
  return Math.max(floor, ...nums) + 1
}

/**
 * Seeded worklist.
 *
 * Thirty-four deliveries across the four stages, generated deterministically
 * from their PO numbers. RECEIVED records are completed by the inventory seed
 * (seed.ts), which writes their INCOMING transactions into the ledger and fills
 * in `receipt.transactionId` — seeded receipts are real, traceable ledger
 * entries, not placeholders.
 */
export function seedIncoming(): IncomingRecord[] {
  const SEED_COUNT = 34
  const records: IncomingRecord[] = []

  // Sampling follows each grade's plan, counted over that grade's deliveries.
  const nthOfGrade = new Map<string, number>()
  const required = PURCHASE_ORDERS.slice(0, SEED_COUNT).map((po) => {
    const n = (nthOfGrade.get(po.gradeId ?? "") ?? 0) + 1
    nthOfGrade.set(po.gradeId ?? "", n)
    return sampleRequiredFor(po.gradeId, n)
  })
  // One tested delivery at the Quality stage fails and is held.
  const failedIndex = required.findIndex((r, i) => r && i >= 16 && i < 24)

  for (let i = 0; i < SEED_COUNT; i += 1) {
    const po = PURCHASE_ORDERS[i]
    const rand = seededRandom(`seed-${po.poNumber}`)
    const status: IncomingRecord["status"] =
      i < 16 ? "RECEIVED" : i < 24 ? "QUALITY" : i < 30 ? "WEIGHING" : "IDENTIFIED"

    const arrival = new Date(po.expectedArrival)
    const at = (offsetMin: number) => new Date(arrival.getTime() + offsetMin * 60000).toISOString()
    const byRail = po.materialId === "MAT-LIMESTONE"

    const record: IncomingRecord = {
      incomingId: `IN-${String(42 + i).padStart(5, "0")}`,
      poNumber: po.poNumber,
      gateEntryNo: formatGateEntry(500 + i),
      grnNo: formatGrn(400 + i),
      identifiedBy: rand() > 0.3 ? "QR" : "MANUAL",
      materialId: po.materialId,
      gradeId: po.gradeId,
      supplier: po.supplier,
      expectedMt: po.expectedMt,
      expectedArrival: po.expectedArrival,
      destinationLocationId: po.destinationLocationId,
      receivingInventoryId: seedInventoryIdAt(po.destinationLocationId) ?? "",
      vehicleRef: byRail ? `RAIL-${4100 + i}` : `TRK-${String(210 + i * 7).padStart(4, "0")}`,
      batch: rand() > 0.45 ? `B-${100 + i}` : undefined,
      origin: byRail ? "Marulan South Limestone Mine" : undefined,
      status: "IDENTIFIED",
      sampleRequired: required[i],
      audit: [{ at: at(0), by: "operator.01", action: "Delivery identified", to: "IDENTIFIED" }],
      provenance: "DEMO",
    }
    if (status === "IDENTIFIED") {
      records.push(record)
      continue
    }

    // Weighed loads land within a few per cent of the ordered quantity.
    const net = Math.round(po.expectedMt * (0.96 + rand() * 0.07))
    const tare = 20 + Math.round(rand() * 15)
    const weighed: IncomingRecord = {
      ...record,
      status: "WEIGHING",
      weighing: { grossMt: net + tare, tareMt: tare, netMt: net, at: at(25), by: "operator.01" },
      audit: [...record.audit, { at: at(25), by: "operator.01", action: "Weight recorded", from: "IDENTIFIED", to: "WEIGHING" }],
    }
    // A sample is drawn at the weighbridge where the plan requires one. Some of
    // the newest weighed loads are still waiting for it.
    const sampled: IncomingRecord =
      weighed.sampleRequired && (status !== "WEIGHING" || i < 27)
        ? {
            ...weighed,
            sample: { sampleId: `SMP-${String(300 + i).padStart(5, "0")}`, collectedAt: at(35), collectedBy: "lab.02" },
            audit: [...weighed.audit, { at: at(35), by: "lab.02", action: `Sample collected — SMP-${String(300 + i).padStart(5, "0")}` }],
          }
        : weighed
    if (status === "WEIGHING") {
      records.push(sampled)
      continue
    }

    const failed = i === failedIndex
    const tested = sampled.sampleRequired
    const checked: IncomingRecord = {
      ...sampled,
      status: "QUALITY",
      quality: {
        result: failed ? "FAIL" : "PASS",
        notes: failed
          ? "Moisture visibly high on sampling. Held for supplier review."
          : tested
            ? ""
            : "No sample required for this delivery under the grade's sampling plan.",
        tested,
        readings: [],
        at: at(75),
        by: rand() > 0.5 ? "lab.02" : "lab.03",
      },
      audit: [
        ...sampled.audit,
        {
          at: at(75),
          by: "lab.02",
          action: failed ? "Test result recorded — FAIL" : tested ? "Test result recorded — PASS" : "Accepted — no sample required",
          from: "WEIGHING",
          to: "QUALITY",
        },
      ],
    }
    if (status === "QUALITY") {
      records.push(checked)
      continue
    }

    records.push({
      ...checked,
      status: "RECEIVED",
      receipt: {
        receivedMt: net,
        varianceMt: net - po.expectedMt,
        inventoryId: checked.receivingInventoryId,
        locationId: po.destinationLocationId,
        transactionId: "",
        at: at(110),
        by: "operator.01",
      },
      audit: [...checked.audit, { at: at(110), by: "operator.01", action: "Receipt confirmed", from: "QUALITY", to: "RECEIVED" }],
    })
  }

  // Newest arrivals first.
  return records.sort((a, b) => new Date(b.expectedArrival).getTime() - new Date(a.expectedArrival).getTime())
}

/** Material groups a delivery can be filtered by. */
export const MATERIAL_GROUP_OPTIONS: string[] = [...MATERIAL_GROUPS]

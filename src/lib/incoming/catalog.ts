/**
 * Purchase orders, suppliers and quality parameters.
 *
 * NONE of this exists in the application yet — there is no PO system, supplier
 * master or quality module to read from. It is therefore CONFIGURED DEMO DATA,
 * flagged `provenance: "DEMO"` on every record it produces, exactly as the
 * inventory figures are. Point this at a real PO feed and the workflow, the
 * screens and the inventory posting are unchanged.
 */

import { MATERIAL_CATALOG, materialEntry } from "@/lib/inventory/catalog"
import type { IncomingRecord } from "./types"

export type PurchaseOrder = {
  poNumber: string
  materialId: string
  supplier: string
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
function seededRandom(seed: string): () => number {
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
  "MAT-ALT-FUEL": [300, 800],
}

const FIRST_PO = 10245
const PO_COUNT = 40
const BASE_DAY = Date.UTC(2026, 8, 3) // 3 Sept 2026

/** Build a purchase order deterministically from its number. */
function buildPurchaseOrder(poNumber: string, index: number): PurchaseOrder {
  const rand = seededRandom(poNumber)
  const inbound = INBOUND_MATERIALS[Math.floor(rand() * INBOUND_MATERIALS.length)]
  const [lo, hi] = LOAD_RANGE[inbound.materialId] ?? [500, 1500]
  const qty = Math.round((lo + rand() * (hi - lo)) / 10) * 10

  // Spread arrivals across working hours over roughly a fortnight.
  const day = index >= 0 ? Math.floor(index / 3) : Math.floor(rand() * 14)
  const hour = 7 + Math.floor(rand() * 11)
  const minute = Math.floor(rand() * 4) * 15

  return {
    poNumber,
    materialId: inbound.materialId,
    supplier: SUPPLIER_POOL[Math.floor(rand() * SUPPLIER_POOL.length)],
    expectedMt: qty,
    expectedArrival: new Date(BASE_DAY + day * 86400000 + hour * 3600000 + minute * 60000).toISOString(),
    destinationLocationId: inbound.destination,
  }
}

/** The 40 purchase orders available to identify. */
export const PURCHASE_ORDERS: PurchaseOrder[] = Array.from({ length: PO_COUNT }, (_, i) =>
  buildPurchaseOrder(`PO-${FIRST_PO + i}`, i),
)

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
export function resolvePurchaseOrder(
  poNumber: string,
): (PurchaseOrder & { adHoc: boolean }) | undefined {
  const key = poNumber.trim().toUpperCase()
  if (!/^PO-\d{3,8}$/.test(key)) return undefined
  const known = findPurchaseOrder(key)
  if (known) return { ...known, adHoc: false }
  return { ...buildPurchaseOrder(key, -1), adHoc: true }
}

/** QR payload for a PO tag. Scanning and typing resolve to the same record. */
export const PO_QR_PREFIX = "berrima:po:"

export function parsePoQr(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const candidate = value.startsWith(PO_QR_PREFIX) ? value.slice(PO_QR_PREFIX.length) : value
  return /^PO-\d{3,8}$/i.test(candidate.trim()) ? candidate.trim().toUpperCase() : null
}

export type QualitySpec = { parameter: string; unit?: string; spec?: string }

/**
 * Quality parameters per material. The application has no quality module, so
 * these are configuration; a real material master replaces this map.
 */
const QUALITY_BY_MATERIAL: Record<string, QualitySpec[]> = {
  "MAT-LIMESTONE": [
    { parameter: "CaO", unit: "%", spec: "≥ 50.0" },
    { parameter: "MgO", unit: "%", spec: "≤ 3.0" },
    { parameter: "Moisture", unit: "%", spec: "≤ 5.0" },
  ],
  "MAT-CLAY-SHALE": [
    { parameter: "SiO₂", unit: "%", spec: "55 – 65" },
    { parameter: "Al₂O₃", unit: "%", spec: "15 – 22" },
    { parameter: "Moisture", unit: "%", spec: "≤ 12.0" },
  ],
  "MAT-COAL": [
    { parameter: "Calorific Value", unit: "kcal/kg", spec: "≥ 5,500" },
    { parameter: "Ash", unit: "%", spec: "≤ 18.0" },
    { parameter: "Total Moisture", unit: "%", spec: "≤ 10.0" },
  ],
  "MAT-GYPSUM": [
    { parameter: "SO₃", unit: "%", spec: "≥ 38.0" },
    { parameter: "Purity", unit: "%", spec: "≥ 85.0" },
    { parameter: "Free Moisture", unit: "%", spec: "≤ 8.0" },
  ],
  "MAT-ALT-FUEL": [
    { parameter: "Calorific Value", unit: "kcal/kg", spec: "≥ 3,800" },
    { parameter: "Chlorine", unit: "%", spec: "≤ 1.0" },
    { parameter: "Moisture", unit: "%", spec: "≤ 20.0" },
  ],
  "MAT-SAND": [
    { parameter: "SiO₂", unit: "%", spec: "≥ 85.0" },
    { parameter: "Moisture", unit: "%", spec: "≤ 6.0" },
  ],
}

export function qualitySpecs(materialId: string): QualitySpec[] {
  return (
    QUALITY_BY_MATERIAL[materialId] ?? [
      { parameter: "Visual inspection" },
      { parameter: "Moisture", unit: "%" },
    ]
  )
}

export const SUPPLIERS = SUPPLIER_POOL.slice().sort()

/**
 * Seeded worklist.
 *
 * Thirty-four incoming loads spread across the four stages, generated
 * deterministically from their PO numbers so the list is stable across renders.
 *
 * Seeded RECEIVED records reference a HISTORICAL transaction (TXN-HIST-…): they
 * predate this session, so their receipts are not in the live ledger and did not
 * move today's balances. Receipts confirmed in the app post for real.
 */
export function seedIncoming(): IncomingRecord[] {
  const SEED_COUNT = 34
  const records: IncomingRecord[] = []

  for (let i = 0; i < SEED_COUNT; i += 1) {
    const po = PURCHASE_ORDERS[i]
    const rand = seededRandom(`seed-${po.poNumber}`)
    const material = materialEntry(po.materialId)

    // Older loads are further through the process than recent arrivals.
    const progress = rand()
    const status: IncomingRecord["status"] =
      i < 16 ? "RECEIVED" : i < 24 ? "QUALITY_CHECKED" : i < 30 ? "WEIGHED" : "REGISTERED"

    const arrival = new Date(po.expectedArrival)
    const at = (offsetMin: number) =>
      new Date(arrival.getTime() + offsetMin * 60000).toISOString()

    const record: IncomingRecord = {
      incomingId: `IN-${String(42 + i).padStart(5, "0")}`,
      poNumber: po.poNumber,
      materialId: po.materialId,
      supplier: po.supplier,
      expectedMt: po.expectedMt,
      expectedArrival: po.expectedArrival,
      destinationLocationId: po.destinationLocationId,
      status: "REGISTERED",
      audit: [
        { at: at(0), by: "operator.01", action: "Incoming material registered", to: "REGISTERED" },
      ],
      provenance: "DEMO",
    }
    if (status === "REGISTERED") {
      records.push(record)
      continue
    }

    // Weighed loads land within a few per cent of the ordered quantity.
    const net = Math.round(po.expectedMt * (0.96 + progress * 0.07))
    const tare = 600 + Math.round(rand() * 400)
    const weighed: IncomingRecord = {
      ...record,
      status: "WEIGHED",
      weighing: {
        grossMt: net + tare,
        tareMt: tare,
        netMt: net,
        weighbridgeRef: `WB-${String(40 + i).padStart(5, "0")}`,
        at: at(25),
        by: "operator.01",
      },
      audit: [
        ...record.audit,
        { at: at(25), by: "operator.01", action: "Weighing completed", from: "REGISTERED", to: "WEIGHED" },
      ],
    }
    if (status === "WEIGHED") {
      records.push(weighed)
      continue
    }

    const deviation = rand() > 0.86
    const specs = qualitySpecs(po.materialId)
    const checked: IncomingRecord = {
      ...weighed,
      status: "QUALITY_CHECKED",
      quality: {
        readings: specs.map((spec, j) => ({
          parameter: spec.parameter,
          value: sampleReading(spec.parameter, seededRandom(`${po.poNumber}-${j}`)),
          unit: spec.unit,
          spec: spec.spec,
        })),
        result: deviation ? "ACCEPTED_WITH_DEVIATION" : "ACCEPTED",
        comments: deviation
          ? "Marginal on one parameter. Accepted for blending."
          : `Sampled on arrival. ${material?.name ?? ""} within specification.`.trim(),
        at: at(75),
        by: rand() > 0.5 ? "lab.02" : "lab.03",
      },
      audit: [
        ...weighed.audit,
        { at: at(75), by: "lab.02", action: "Quality check completed", from: "WEIGHED", to: "QUALITY_CHECKED" },
      ],
    }
    if (status === "QUALITY_CHECKED") {
      records.push(checked)
      continue
    }

    records.push({
      ...checked,
      status: "RECEIVED",
      receipt: {
        receivedMt: net,
        varianceMt: net - po.expectedMt,
        destinationLocationId: po.destinationLocationId,
        transactionId: `TXN-HIST-${String(1000 + i)}`,
        at: at(110),
        by: "operator.01",
      },
      audit: [
        ...checked.audit,
        {
          at: at(110),
          by: "operator.01",
          action: "Receipt confirmed — historical transaction TXN-HIST-" + String(1000 + i),
          from: "QUALITY_CHECKED",
          to: "RECEIVED",
        },
      ],
    })
  }

  // Newest arrivals first.
  return records.sort(
    (a, b) => new Date(b.expectedArrival).getTime() - new Date(a.expectedArrival).getTime(),
  )
}

/** A plausible reading for a parameter, within or near its specification. */
function sampleReading(parameter: string, rand: () => number): string {
  const round = (v: number, dp = 1) => v.toFixed(dp)
  switch (parameter) {
    case "CaO":
      return round(50.5 + rand() * 3.5)
    case "MgO":
      return round(1.2 + rand() * 1.6)
    case "SO₃":
      return round(38.5 + rand() * 4)
    case "Purity":
      return round(86 + rand() * 8)
    case "SiO₂":
      return round(56 + rand() * 8)
    case "Al₂O₃":
      return round(16 + rand() * 5)
    case "Chlorine":
      return round(0.3 + rand() * 0.6, 2)
    case "Ash":
      return round(12 + rand() * 5)
    case "Calorific Value":
      return String(Math.round(4200 + rand() * 1800))
    case "Visual inspection":
      return "Satisfactory"
    default:
      return round(3 + rand() * 8)
  }
}

export const MATERIAL_GROUP_OPTIONS = Array.from(
  new Set(MATERIAL_CATALOG.map((m) => m.group)),
)

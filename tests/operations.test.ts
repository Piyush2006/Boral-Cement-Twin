import { describe, expect, it } from "vitest"

import { sampleRequiredFor } from "@/lib/incoming/catalog"
import { nextAction, qualityState, type IncomingRecord } from "@/lib/incoming/types"
import { LOSS_TYPES, TRANSACTION_TYPES, transactionLabel, type InventoryTransaction } from "@/lib/inventory/ledger"
import { formatLotId } from "@/lib/inventory/lots"
import { seedBundle } from "@/lib/inventory/seed"
import { utilisation } from "@/lib/inventory/status"
import {
  CONSUMPTION_CATEGORIES,
  CONSUMPTION_CATEGORY_META,
  consumptionTotals,
  consumptionTransactionType,
  defaultCategory,
  isLoss,
} from "@/lib/issues/consumption"
import { materialCost, netConsumedQty, returnedQty, unconsumedQty, type IssueRecord } from "@/lib/issues/types"
import { gradeMaster, materialMaster } from "@/lib/masters/registry"
import { readingPasses } from "@/lib/masters/types"
import { BOMS, PRODUCTION_PLANS, expectedDailyConsumption, planDays, planDaysOfInventory, planReadiness } from "@/lib/production/plan"
import {
  balanceIdentity,
  costBy,
  locationStock,
  maintenanceConsumption,
  movementTotals,
  periodRange,
  qualityKpis,
  shelfLife,
  stockAt,
} from "@/lib/reports/insights"

const bundle = seedBundle()
const ALL: { from: number; to: number } = { from: 0, to: Date.UTC(2027, 0, 1) }

/* ── transaction types ───────────────────────────────────────────────────── */

describe("transaction types", () => {
  it("records exactly the spec's movement types, plus ISSUE for plants that post at issue", () => {
    expect(TRANSACTION_TYPES).toEqual(["INCOMING", "RETURN", "ADJUSTMENT", "CONSUMPTION", "ISSUE", "EXPIRY", "WASTE", "LOSS", "UNACCOUNTED"])
    expect(LOSS_TYPES).toEqual(["EXPIRY", "WASTE", "LOSS", "UNACCOUNTED"])
  })

  it("labels an adjustment with its direction", () => {
    expect(transactionLabel("ADJUSTMENT", 5)).toBe("Adjustment (+)")
    expect(transactionLabel("ADJUSTMENT", -5)).toBe("Adjustment (−)")
    expect(transactionLabel("WASTE")).toBe("Waste")
  })

  it("loads opening balances as approved adjustments, never as a bare quantity", () => {
    const opening = bundle.ledger.filter((t) => t.reason === "Opening balance")
    expect(opening.length).toBeGreaterThan(0)
    for (const t of opening) {
      expect(t.type).toBe("ADJUSTMENT")
      expect(t.quantity).toBeGreaterThan(0)
      expect(t.links.adjustmentId).toMatch(/^ADJ-\d{5}$/)
    }
  })
})

/* ── incoming: gate entry, GRN, sampling, lots ───────────────────────────── */

describe("incoming deliveries", () => {
  it("carries PO, Gate Entry and GRN on every seeded delivery", () => {
    for (const r of bundle.incoming) {
      expect(r.poNumber).toMatch(/^PO-\d+$/)
      expect(r.gateEntryNo).toMatch(/^GE-\d{5}$/)
      expect(r.grnNo).toMatch(/^GRN-\d{5}$/)
    }
    expect(new Set(bundle.incoming.map((r) => r.grnNo)).size).toBe(bundle.incoming.length)
  })

  it("samples by each grade's frequency: every delivery, every n-th, or never", () => {
    expect(sampleRequiredFor("GRD-AF-SRF", 1)).toBe(true)
    expect(sampleRequiredFor("GRD-AF-SRF", 2)).toBe(true)
    expect(sampleRequiredFor("GRD-LS-A", 1)).toBe(true)
    expect(sampleRequiredFor("GRD-LS-A", 2)).toBe(false)
    expect(sampleRequiredFor("GRD-LS-A", 3)).toBe(true)
    expect(sampleRequiredFor("GRD-OPC-43", 1)).toBe(false)
    expect(sampleRequiredFor(undefined, 1)).toBe(false)
  })

  it("never accepts a sampled delivery without a sample and a tested result", () => {
    for (const r of bundle.incoming) {
      if (r.sampleRequired && r.quality) {
        expect(r.sample).toBeDefined()
        expect(r.quality.tested).toBe(true)
      }
      if (!r.sampleRequired && r.quality) expect(r.quality.tested).toBe(false)
    }
  })

  it("shows TEST PENDING until a sampled delivery's result is in", () => {
    const pending = bundle.incoming.filter((r) => qualityState(r) === "TEST_PENDING")
    expect(pending.length).toBeGreaterThan(0)
    for (const r of pending) {
      expect(r.sampleRequired).toBe(true)
      expect(r.receipt).toBeUndefined()
    }
    const waiting = pending.find((r) => r.status === "WEIGHING" && !r.sample)
    expect(waiting && nextAction(waiting)).toBe("Collect Sample")
    const sampled = pending.find((r) => r.status === "WEIGHING" && r.sample)
    expect(sampled && nextAction(sampled)).toBe("Record Test Result")
  })

  it("holds a failed delivery out of inventory", () => {
    const failed = bundle.incoming.filter((r) => r.quality?.result === "FAIL")
    expect(failed.length).toBe(1)
    expect(failed[0].receipt).toBeUndefined()
    expect(nextAction(failed[0])).toBeNull()
  })

  it("carries PO, Gate Entry, GRN and the quality reference on every receipt transaction", () => {
    const receipts = bundle.ledger.filter((t) => t.type === "INCOMING")
    expect(receipts.length).toBeGreaterThan(0)
    for (const t of receipts) {
      expect(t.links.poNumber).toBeTruthy()
      expect(t.links.gateEntryNo).toBeTruthy()
      expect(t.links.grnNo).toBeTruthy()
      expect(t.links.incomingId).toBeTruthy()
      expect(t.links.qualityRef).toMatch(/PASS$/)
    }
  })
})

describe("lot / batch references", () => {
  it("records a lot only for lot-tracked materials", () => {
    const received = bundle.incoming.filter((r) => r.receipt)
    for (const r of received) {
      const tracked = materialMaster(r.materialId)?.lotTracking
      if (tracked) expect(r.receipt!.lotId).toMatch(/^LOT-2026-\d{5}$/)
      else expect(r.receipt!.lotId).toBeUndefined()
    }
    expect(bundle.lots.length).toBe(received.filter((r) => materialMaster(r.materialId)?.lotTracking).length)
    expect(bundle.lots.length).toBeGreaterThan(0)
  })

  it("formats lot references as the plant's documents do", () => {
    expect(formatLotId(421)).toBe("LOT-2026-00421")
  })

  it("tests each lot against its own grade's parameters", () => {
    for (const l of bundle.lots) {
      const expected = gradeMaster(l.gradeId)?.qualityParameters ?? []
      expect(l.quality.map((q) => q.name)).toEqual(expected.map((p) => p.name))
      for (const q of l.quality) expect(q.pass).toBe(readingPasses(q.value, q.min, q.max))
    }
  })

  it("does not tag a blended stockpile balance with a single lot", () => {
    expect(bundle.inventory.find((r) => r.locationId === "PILE-RM-06")!.lotId).toBeUndefined()
  })
})

/* ── consumption, outcomes and returns ───────────────────────────────────── */

describe("consumption classes and outcomes", () => {
  it("offers RM, IM, FG and SPARE, then the exception outcomes", () => {
    expect(CONSUMPTION_CATEGORIES.map((c) => CONSUMPTION_CATEGORY_META[c].code)).toEqual([
      "RM",
      "IM",
      "FG",
      "SPARE",
      "EXPIRED",
      "WASTED",
      "LOST",
      "UNACCOUNTED",
    ])
    expect(CONSUMPTION_CATEGORIES.filter(isLoss)).toEqual(["EXPIRED", "WASTED", "LOST", "UNACCOUNTED"])
  })

  it("posts an outcome under its own transaction type, never inside CONSUMPTION", () => {
    expect(consumptionTransactionType("RAW_MATERIAL")).toBe("CONSUMPTION")
    expect(consumptionTransactionType("SPARE")).toBe("CONSUMPTION")
    expect(consumptionTransactionType("EXPIRED")).toBe("EXPIRY")
    expect(consumptionTransactionType("WASTED")).toBe("WASTE")
    expect(consumptionTransactionType("LOST")).toBe("LOSS")
    expect(consumptionTransactionType("UNACCOUNTED")).toBe("UNACCOUNTED")
  })

  it("suggests a class from the material category without forcing it", () => {
    expect(defaultCategory("Spare")).toBe("SPARE")
    expect(defaultCategory("Intermediate")).toBe("INTERMEDIATE")
    expect(defaultCategory("Finished Product")).toBe("FINISHED_GOODS")
    expect(defaultCategory(undefined)).toBe("RAW_MATERIAL")
  })

  it("computes net consumption as gross outward minus returned", () => {
    expect(consumptionTotals(100, 20)).toEqual({ grossOutward: 100, returned: 20, net: 80 })
  })
})

const issue = (overrides: Partial<IssueRecord> = {}): IssueRecord => ({
  issueId: "ISS-00099",
  materialId: "MAT-LIMESTONE",
  sourceInventoryId: "RM-LS-001",
  sourceLocationId: "PILE-RM-01",
  requestedQty: 500,
  uom: "MT",
  consumingAreaId: "RM-01",
  productionRef: "",
  reason: "",
  notes: "",
  approvalRequired: false,
  postingPoint: "CONSUMPTION",
  status: "CONSUMED",
  createdAt: "2026-09-10T00:00:00.000Z",
  createdBy: "t",
  issue: { issuedQty: 500, at: "2026-09-10T01:00:00.000Z", by: "t" },
  consumption: {
    consumptionId: "CON-00099",
    consumedQty: 460,
    category: "RAW_MATERIAL",
    consumingAreaId: "RM-01",
    productionRef: "",
    comments: "",
    at: "2026-09-10T02:00:00.000Z",
    postedAt: "2026-09-10T02:01:00.000Z",
    by: "t",
  },
  audit: [],
  provenance: "DEMO",
  ...overrides,
})

describe("returns", () => {
  it("nets returns off the gross outward on the record", () => {
    const r = issue({
      returns: [
        { returnId: "RET-00001", quantity: 30, reason: "Not required", inventoryId: "RM-LS-001", at: "2026-09-10T03:00:00.000Z", by: "t" },
        { returnId: "RET-00002", quantity: 10, reason: "Spare", inventoryId: "RM-LS-001", at: "2026-09-10T04:00:00.000Z", by: "t" },
      ],
    })
    expect(returnedQty(r)).toBe(40)
    expect(netConsumedQty(r)).toBe(420)
    // Issued 500, drawn 460 — returns are part of what was drawn, not of the undrawn remainder.
    expect(unconsumedQty(r)).toBe(40)
  })

  it("reproduces the worked example end to end: issue 100, return 20, net 80, stock down 80", () => {
    const r = bundle.issues.find((i) => i.issueId === "ISS-00044")!
    expect(r.issue!.issuedQty).toBe(100)
    expect(returnedQty(r)).toBe(20)
    expect(netConsumedQty(r)).toBe(80)
    const moves = bundle.ledger.filter((t) => t.links.issueId === "ISS-00044")
    expect(moves.map((t) => t.type).sort()).toEqual(["CONSUMPTION", "RETURN"])
    expect(moves.reduce((s, t) => s + t.quantity, 0)).toBe(-80)
    for (const t of moves) expect(t.links.returnId ?? t.links.consumptionId).toBeTruthy()
  })

  it("costs a maintenance consumption at quantity × unit cost, net of returns", () => {
    const seal = bundle.issues.find((i) => i.issueId === "ISS-00041")!
    expect(netConsumedQty(seal)).toBe(4)
    expect(materialCost(seal)).toBe(4 * materialMaster("MAT-SPARE-SEAL")!.unitCost!)
    expect(materialCost(issue())).toBeNull()
  })
})

/* ── production readiness and days of inventory ──────────────────────────── */

describe("production readiness", () => {
  it("keeps every bill of materials and plan pointing at real records", () => {
    for (const b of BOMS) {
      expect(materialMaster(b.productId)).toBeDefined()
      for (const l of b.lines) expect(materialMaster(l.materialId)).toBeDefined()
    }
    for (const p of PRODUCTION_PLANS) expect(BOMS.some((b) => b.bomId === p.bomId)).toBe(true)
  })

  it("multiplies the plan by the recipe and reports the shortfall of the tightest material", () => {
    const plan = PRODUCTION_PLANS.find((p) => p.bomId === "BOM-RAWMIX")!
    expect(planReadiness(plan, () => 1_000_000).ready).toBe(true)
    const short = planReadiness(plan, (id) => (id === "MAT-LIMESTONE" ? plan.quantity * 0.41 : 1_000_000))
    expect(short.ready).toBe(false)
    expect(short.coverage).toBeCloseTo(0.5)
  })

  it("derives expected daily consumption from plan + BOM", () => {
    const plan = PRODUCTION_PLANS.find((p) => p.bomId === "BOM-RAWMIX")!
    expect(expectedDailyConsumption("MAT-LIMESTONE")).toBeCloseTo((plan.quantity * 0.82) / planDays(plan))
    expect(expectedDailyConsumption("MAT-SPARE-SEAL")).toBe(0)
  })

  it("gives days of inventory = usable inventory ÷ expected daily consumption, and none where nothing is planned", () => {
    const daily = expectedDailyConsumption("MAT-COAL")
    expect(planDaysOfInventory(daily * 5, "MAT-COAL")).toBeCloseTo(5)
    expect(planDaysOfInventory(10, "MAT-SPARE-SEAL")).toBeNull()
  })
})

/* ── expiry ──────────────────────────────────────────────────────────────── */

describe("expiry", () => {
  it("holds dated stock only for materials where expiry applies", () => {
    const dated = bundle.inventory.filter((r) => r.expiryDate)
    expect(dated.length).toBeGreaterThanOrEqual(2)
    for (const r of dated) expect(materialMaster(r.materialId)?.expiryApplicable).toBe(true)
  })

  it("classifies shelf life as Expired, Expiring Soon or Healthy", () => {
    const now = new Date("2026-09-11T00:00:00.000Z")
    expect(shelfLife("2026-09-01T00:00:00.000Z", now)).toBe("EXPIRED")
    expect(shelfLife("2026-09-25T00:00:00.000Z", now)).toBe("EXPIRING_SOON")
    expect(shelfLife("2026-12-25T00:00:00.000Z", now)).toBe("HEALTHY_SHELF_LIFE")
  })
})

/* ── reports ─────────────────────────────────────────────────────────────── */

const tx = (n: number, at: string, inventoryId: string, quantity: number, after: number, type: InventoryTransaction["type"] = "INCOMING"): InventoryTransaction => ({
  txnId: `TX-${String(n).padStart(5, "0")}`,
  type,
  inventoryId,
  locationId: "PILE-X",
  materialId: "MAT-X",
  gradeId: "GRD-X",
  quantity,
  uom: "MT",
  balanceBefore: after - quantity,
  balanceAfter: after,
  links: {},
  actor: "t",
  at,
  provenance: "DEMO",
})

describe("reports", () => {
  it("windows a period to today, 7 days, 30 days or a custom range", () => {
    const now = new Date("2026-09-11T10:00:00")
    expect(periodRange("7D", now).to - periodRange("7D", now).from).toBe(7 * 86_400_000)
    expect(new Date(periodRange("TODAY", now).from).getHours()).toBe(0)
    const custom = periodRange("CUSTOM", now, { from: "2026-09-01", to: "2026-09-05" })
    expect(new Date(custom.from).getDate()).toBe(1)
    expect(new Date(custom.to).getDate()).toBe(5)
  })

  it("replays a location's current, time-weighted average and peak stock from the ledger", () => {
    const ledger = [
      tx(1, "2026-09-01T00:00:00.000Z", "A", 100, 100),
      tx(2, "2026-09-02T00:00:00.000Z", "A", 300, 400),
      tx(3, "2026-09-03T00:00:00.000Z", "A", -200, 200, "CONSUMPTION"),
    ]
    const range = { from: Date.UTC(2026, 8, 1), to: Date.UTC(2026, 8, 4) }
    const s = locationStock("PILE-X", ledger, range)
    expect(s.current).toBe(200)
    expect(s.peak).toBe(400)
    expect(s.average).toBeCloseTo((100 + 400 + 200) / 3)
    expect(utilisation(s.peak, 500)).toBe(80)
  })

  it("keeps the balance identity: previous + inward − net consumed − losses ± adjustments = current", () => {
    const range = { from: Date.UTC(2026, 8, 5), to: Date.UTC(2026, 8, 12) }
    const id = balanceIdentity(bundle.ledger, range)
    expect(id.movements.count).toBeGreaterThan(0)
    expect(id.computed).toBeCloseTo(id.closing, 6)
    expect(stockAt(bundle.ledger, ALL.to)).toBeCloseTo(bundle.inventory.filter((r) => r.uom === "MT").reduce((s, r) => s + r.quantity, 0), 6)
  })

  it("separates inward, gross outward, returns, losses and adjustments", () => {
    const ledger = [
      tx(1, "2026-09-01T00:00:00.000Z", "A", 500, 500),
      tx(2, "2026-09-01T01:00:00.000Z", "A", -100, 400, "CONSUMPTION"),
      tx(3, "2026-09-01T02:00:00.000Z", "A", 20, 420, "RETURN"),
      tx(4, "2026-09-01T03:00:00.000Z", "A", -5, 415, "WASTE"),
      tx(5, "2026-09-01T04:00:00.000Z", "A", -3, 412, "ADJUSTMENT"),
    ]
    const m = movementTotals(ledger, ALL)
    expect(m).toMatchObject({ inward: 500, grossOutward: 100, returned: 20, netConsumed: 80, adjustmentsOut: 3 })
    expect(m.losses.WASTE).toBe(5)
  })

  it("counts quality KPIs over deliveries in the period", () => {
    const k = qualityKpis(bundle.incoming, ALL)
    expect(k.deliveries).toBe(bundle.incoming.length)
    expect(k.testingRequired).toBe(bundle.incoming.filter((r) => r.sampleRequired).length)
    expect(k.testingCompleted + k.testingPending).toBe(k.testingRequired)
    expect(k.failed).toBe(1)
  })

  it("aggregates maintenance material cost by asset, highest first", () => {
    const lines = costBy(maintenanceConsumption(bundle.issues, ALL), (r) => r.assetId ?? "—")
    expect(lines[0].key).toBe("KLN-01")
    const kiln = lines[0]
    const expected = 2 * materialMaster("MAT-SPARE-BEARING")!.unitCost! + 4 * materialMaster("MAT-SPARE-SEAL")!.unitCost!
    expect(kiln.cost).toBe(expected)
  })
})

/* helper so the unused-type import stays honest */
export type _Incoming = IncomingRecord

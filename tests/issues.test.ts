import { describe, expect, it } from "vitest"

import { seedBundle } from "@/lib/inventory/seed"
import { materialRoute, nextNumber } from "@/lib/issues/catalog"
import {
  availability,
  committedAt,
  parseQuantity,
  validateConsumption,
  validateIssue,
  validateIssueDraft,
} from "@/lib/issues/rules"
import { resolveTrace, traceBack, type TraceContext } from "@/lib/issues/trace"
import { inventoryTransactionId, unconsumedQty, type IssueRecord } from "@/lib/issues/types"

const bundle = seedBundle()
const { incoming, issues, ledger, inventory } = bundle
const limestone = inventory.find((r) => r.inventoryId === "RM-LS-001")!

function issued(overrides: Partial<IssueRecord> = {}): IssueRecord {
  return {
    issueId: "ISS-00900",
    materialId: "MAT-LIMESTONE",
    sourceInventoryId: "RM-LS-001",
    sourceLocationId: "PILE-RM-01",
    requestedQty: 500,
    uom: "MT",
    consumingAreaId: "RM-01",
    productionRef: "PR-1024",
    reason: "",
    notes: "",
    approvalRequired: false,
    postingPoint: "CONSUMPTION",
    status: "ISSUED",
    createdAt: "2026-09-10T04:10:00.000Z",
    createdBy: "operator.01",
    issue: { issuedQty: 500, at: "2026-09-10T04:15:00.000Z", by: "operator.01" },
    audit: [],
    provenance: "DEMO",
    ...overrides,
  }
}

const ctx = (records: IssueRecord[]): TraceContext => ({ issues: records, incoming, ledger, inventory })

describe("quantity validation", () => {
  it("accepts only numeric quantities greater than zero", () => {
    expect(parseQuantity("485")).toBe(485)
    expect(parseQuantity("12.5")).toBe(12.5)
    for (const bad of ["", "0", "-5", "abc", "5e3", "1,000"]) expect(parseQuantity(bad)).toBeNull()
  })
})

describe("inventory check", () => {
  const draft = {
    materialId: "MAT-LIMESTONE",
    sourceInventoryId: "RM-LS-001",
    quantity: 500,
    uom: "MT",
    consumingAreaId: "RM-01",
  }
  const stock = availability(limestone.quantity, "RM-LS-001", [])

  it("allows an issue within available stock", () => {
    expect(validateIssueDraft(draft, limestone, stock).ok).toBe(true)
  })

  it("does not require a production / process reference", () => {
    expect(validateIssueDraft({ ...draft }, limestone, stock).ok).toBe(true)
  })

  it("refuses an issue beyond available stock instead of going negative", () => {
    const res = validateIssueDraft({ ...draft, quantity: limestone.quantity + 1 }, limestone, stock)
    expect(res).toMatchObject({ ok: false })
    if (!res.ok) expect(res.error).toMatch(/Insufficient stock/)
  })

  it("refuses a source record that does not hold the material", () => {
    const coal = inventory.find((r) => r.inventoryId === "RM-CO-005")!
    expect(validateIssueDraft({ ...draft, sourceInventoryId: coal.inventoryId }, coal, stock).ok).toBe(false)
  })

  it("refuses an archived source record", () => {
    expect(validateIssueDraft(draft, { ...limestone, active: false }, stock).ok).toBe(false)
  })

  it("refuses a UOM that does not match the material", () => {
    expect(validateIssueDraft({ ...draft, uom: "KG" }, limestone, stock).ok).toBe(false)
  })

  it("commits open issues when inventory posts at consumption", () => {
    const open = [issued()]
    expect(committedAt("RM-LS-001", open)).toBe(500)
    expect(availability(18450, "RM-LS-001", open).available).toBe(17950)
  })

  it("commits nothing when inventory already moved at issue", () => {
    expect(committedAt("RM-LS-001", [issued({ postingPoint: "ISSUE" })])).toBe(0)
  })
})

describe("approval", () => {
  const stock = availability(18450, "RM-LS-001", [])

  it("is not forced when the process does not require it", () => {
    const requested = issued({ status: "REQUESTED", issue: undefined })
    expect(validateIssue(requested, 500, stock).ok).toBe(true)
  })

  it("blocks release until approved when the process requires it", () => {
    const requested = issued({ status: "REQUESTED", issue: undefined, approvalRequired: true })
    expect(validateIssue(requested, 500, stock).ok).toBe(false)
    expect(validateIssue({ ...requested, status: "APPROVED" }, 500, stock).ok).toBe(true)
  })
})

describe("consumption", () => {
  const now = new Date("2026-09-10T05:00:00.000Z")
  const opts = { allowOverConsumption: false, postingPoint: "CONSUMPTION" as const, onHand: 18450, at: "2026-09-10T04:35:00.000Z", now }

  it("accepts consumption below the issued quantity", () => {
    expect(validateConsumption(issued(), 485, opts).ok).toBe(true)
  })

  it("rejects consumption above the issued quantity unless a rule permits it", () => {
    expect(validateConsumption(issued(), 600, opts).ok).toBe(false)
    expect(validateConsumption(issued(), 600, { ...opts, allowOverConsumption: true }).ok).toBe(true)
  })

  it("requires a date and time, not in the future and not before the issue", () => {
    expect(validateConsumption(issued(), 485, { ...opts, at: null }).ok).toBe(false)
    expect(validateConsumption(issued(), 485, { ...opts, at: "2026-09-11T00:00:00.000Z" }).ok).toBe(false)
    expect(validateConsumption(issued(), 485, { ...opts, at: "2026-09-10T04:00:00.000Z" }).ok).toBe(false)
  })

  it("will not post a consumption that would take stock negative", () => {
    expect(validateConsumption(issued(), 485, { ...opts, onHand: 300 }).ok).toBe(false)
  })

  it("keeps the not-yet-consumed difference rather than treating it as consumed", () => {
    const r = issued({
      status: "CONSUMED",
      consumption: {
        consumptionId: "CON-00058",
        consumedQty: 485,
        category: "RAW_MATERIAL",
        consumingAreaId: "RM-01",
        productionRef: "PR-1024",
        comments: "",
        at: "2026-09-10T04:35:00.000Z",
        postedAt: "2026-09-10T04:36:00.000Z",
        by: "operator.01",
        transactionId: "TX-00891",
      },
    })
    expect(unconsumedQty(r)).toBe(15)
    expect(inventoryTransactionId(r)).toBe("TX-00891")
  })
})

describe("material routes", () => {
  it("walks the modelled process connections", () => {
    expect(materialRoute("PILE-RM-01", "RM-01")?.map((s) => s.nodeId)).toEqual(["PILE-RM-01", "CR-01", "RM-01"])
    expect(materialRoute("PILE-RM-05", "KLN-01")?.map((s) => s.nodeId)).toEqual(["PILE-COAL", "KLN-01"])
  })

  it("reports no route rather than inventing one", () => {
    expect(materialRoute("PILE-RM-04", "RM-01")).toBeNull()
  })
})

describe("seeded worklist", () => {
  it("has unique issue and consumption IDs", () => {
    const ids = issues.map((i) => i.issueId)
    expect(new Set(ids).size).toBe(ids.length)
    const cons = issues.flatMap((i) => (i.consumption ? [i.consumption.consumptionId] : []))
    expect(new Set(cons).size).toBe(cons.length)
  })

  it("is all demo data, and every consumed record has a real ledger transaction", () => {
    for (const i of issues) {
      expect(i.provenance).toBe("DEMO")
      if (i.status === "CONSUMED") {
        const txnId = inventoryTransactionId(i)
        const txn = ledger.find((t) => t.txnId === txnId)
        expect(txn, `${i.issueId} transaction`).toBeDefined()
        expect(txn!.type).toBe("CONSUMPTION")
        expect(txn!.links.consumptionId).toBe(i.consumption!.consumptionId)
        expect(-txn!.quantity).toBe(i.consumption!.consumedQty)
        expect(i.consumption!.consumedQty).toBeLessThanOrEqual(i.issue!.issuedQty)
      }
    }
  })

  it("leaves the production reference empty where none was given, never invents one", () => {
    expect(issues.some((i) => i.productionRef === "")).toBe(true)
  })

  it("never fabricates a PO for material that is not received through Incoming Materials", () => {
    for (const i of issues.filter((x) => x.sourceLocationId === "PILE-RM-07" || x.sourceLocationId.startsWith("SL-"))) {
      expect(i.origin).toBeUndefined()
    }
  })

  it("links origins only to real receipts into the same inventory record, before the draw", () => {
    for (const i of issues.filter((x) => x.origin)) {
      const r = incoming.find((x) => x.incomingId === i.origin!.incomingId)
      expect(r?.receipt?.inventoryId).toBe(i.sourceInventoryId)
      expect(r?.poNumber).toBe(i.origin!.poNumber)
      expect(new Date(r!.receipt!.at).getTime()).toBeLessThan(new Date(i.createdAt).getTime())
    }
  })

  it("continues numbering after the highest ID in use", () => {
    expect(nextNumber(["ISS-00008", "ISS-00031"], "ISS", 8)).toBe(32)
    expect(nextNumber([], "CON", 35)).toBe(35)
  })
})

describe("traceability", () => {
  it("traces a consumption back to its PO when an origin was recorded", () => {
    const linked = issues.find((i) => i.origin && i.consumption)!
    const res = resolveTrace(linked.consumption!.consumptionId, ctx(issues))
    expect(res.kind).toBe("backward")
    if (res.kind !== "backward") return
    expect(res.issue.issueId).toBe(linked.issueId)
    expect(res.steps.find((s) => s.key === "po")).toMatchObject({ value: linked.origin!.poNumber, state: "linked" })
    expect(res.steps.find((s) => s.key === "inventory")).toMatchObject({ value: linked.sourceInventoryId, state: "linked" })
    expect(res.steps.find((s) => s.key === "transaction")?.state).toBe("linked")
    expect(["linked", "not-recorded"]).toContain(res.steps.find((s) => s.key === "batch")?.state)
  })

  it("marks an unrecorded origin as not linked instead of guessing", () => {
    const r = issued({ origin: undefined })
    const po = traceBack(r, ctx([r])).find((s) => s.key === "po")!
    expect(["not-linked", "not-applicable"]).toContain(po.state)
    expect(po.value).not.toMatch(/^PO-/)
  })

  it("omits the production reference step when none was given", () => {
    const r = issued({ productionRef: "" })
    expect(traceBack(r, ctx([r])).some((s) => s.key === "production")).toBe(false)
  })

  it("traces a PO forward to the issues that drew on its receipt", () => {
    const linked = issues.find((i) => i.origin)!
    const res = resolveTrace(linked.origin!.poNumber, ctx(issues))
    expect(res.kind).toBe("forward")
    if (res.kind !== "forward") return
    expect(res.receipts.flatMap((r) => r.linked.map((i) => i.issueId))).toContain(linked.issueId)
  })

  it("traces an Inventory ID in both directions", () => {
    const res = resolveTrace("rm-ls-001", ctx(issues))
    expect(res.kind).toBe("inventory")
    if (res.kind !== "inventory") return
    expect(res.trace.record.inventoryId).toBe("RM-LS-001")
    expect(res.trace.receipts.length).toBeGreaterThan(0)
    expect(res.trace.issues.length).toBeGreaterThan(0)
    for (const r of res.trace.receipts) expect(r.receipt!.inventoryId).toBe("RM-LS-001")
    for (const i of res.trace.issues) expect(i.sourceInventoryId).toBe("RM-LS-001")
  })

  it("resolves a transaction ID to the record that explains it", () => {
    const consumed = issues.find((i) => i.consumption)!
    const res = resolveTrace(inventoryTransactionId(consumed)!, ctx(issues))
    expect(res.kind).toBe("backward")
    if (res.kind === "backward") expect(res.issue.issueId).toBe(consumed.issueId)
    const receipt = incoming.find((r) => r.receipt)!
    const fwd = resolveTrace(receipt.receipt!.transactionId, ctx(issues))
    expect(fwd.kind).toBe("forward")
  })

  it("says so when nothing matches", () => {
    expect(resolveTrace("ZZZ-1", ctx(issues)).kind).toBe("none")
  })
})

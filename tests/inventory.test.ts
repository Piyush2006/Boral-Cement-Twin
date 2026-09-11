import { beforeEach, describe, expect, it } from "vitest"

import {
  TRANSACTION_TYPES,
  installLedger,
  recordTransaction,
  resetLedger,
  transactionReference,
  transactions,
  type InventoryTransaction,
} from "@/lib/inventory/ledger"
import { STOCK_STATUSES, stockStatus, type InventoryRecord } from "@/lib/inventory/model"
import { recordLimits, recordStatus } from "@/lib/inventory/status"
import {
  nextInventoryId,
  parseNonNegative,
  parsePositive,
  validateAdjustment,
  validateArchive,
  validateLimits,
  validateNewInventory,
} from "@/lib/inventory/rules"
import { seedBundle } from "@/lib/inventory/seed"

const bundle = seedBundle()
const { inventory, ledger, incoming } = bundle

function record(overrides: Partial<InventoryRecord> = {}): InventoryRecord {
  return {
    inventoryId: "RM-LS-001",
    materialId: "MAT-LIMESTONE",
    gradeId: "GRD-LS-A",
    locationId: "PILE-RM-01",
    quantity: 18450,
    uom: "MT",
    minStock: 10000,
    targetStock: 20000,
    maxStock: 30000,
    active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "inventory.admin",
    updatedAt: "2026-09-01T00:00:00.000Z",
    audit: [],
    provenance: "DEMO",
    ...overrides,
  }
}

describe("stock health", () => {
  it("has exactly two states", () => {
    expect(STOCK_STATUSES).toEqual(["HEALTHY", "CRITICAL"])
  })

  it("is HEALTHY above the minimum and CRITICAL at or below it", () => {
    expect(stockStatus(18450, 10000)).toBe("HEALTHY")
    expect(stockStatus(10001, 10000)).toBe("HEALTHY")
    expect(stockStatus(10000, 10000)).toBe("CRITICAL")
    expect(stockStatus(8500, 10000)).toBe("CRITICAL")
    expect(stockStatus(0, 0)).toBe("CRITICAL")
  })

  it("reads the minimum from the record itself, so two balances of one grade can differ", () => {
    expect(recordStatus(record({ quantity: 15000, minStock: 10000 }))).toBe("HEALTHY")
    expect(recordStatus(record({ quantity: 15000, minStock: 16000 }))).toBe("CRITICAL")
    expect(recordLimits(record())).toEqual({ minStock: 10000, targetStock: 20000, maxStock: 30000 })
  })

  it("never produces a third status, whatever the maximum", () => {
    for (const q of [0, 5, 9999, 10000, 25000, 30000, 40000]) {
      expect(["HEALTHY", "CRITICAL"]).toContain(recordStatus({ quantity: q, minStock: 10000 }))
    }
  })
})

describe("quantity parsing", () => {
  it("accepts zero or more for balances and limits, and only positive for movements", () => {
    expect(parseNonNegative("0")).toBe(0)
    expect(parseNonNegative("18450")).toBe(18450)
    expect(parseNonNegative("-1")).toBeNull()
    expect(parseNonNegative("abc")).toBeNull()
    expect(parsePositive("0")).toBeNull()
    expect(parsePositive("500")).toBe(500)
  })
})

describe("create inventory", () => {
  const input = {
    materialId: "MAT-LIMESTONE",
    inventoryId: "RM-LS-002",
    gradeId: "GRD-LS-B",
    locationId: "PILE-RM-01",
    quantity: 0,
    uom: "MT",
    minStock: 1000 as number | null,
    targetStock: 2000 as number | null,
    maxStock: 3000 as number | null,
  }

  it("maps an existing Material + Grade to an existing Location, starting at zero", () => {
    expect(validateNewInventory(input, inventory).ok).toBe(true)
  })

  it("generates the next Inventory ID from the material code, never reusing one", () => {
    expect(nextInventoryId("RM-LS", inventory)).toBe("RM-LS-002")
    expect(nextInventoryId("RM-LS", [...inventory, record({ inventoryId: "RM-LS-007", active: false })])).toBe("RM-LS-008")
    expect(nextInventoryId("SP-NEW", inventory)).toBe("SP-NEW-001")
  })

  it("requires Min ≤ Target ≤ Max on the record", () => {
    expect(validateNewInventory({ ...input, minStock: null }, inventory).ok).toBe(false)
    expect(validateNewInventory({ ...input, maxStock: 500 }, inventory).ok).toBe(false)
    expect(validateNewInventory({ ...input, targetStock: 5000 }, inventory).ok).toBe(false)
    expect(validateLimits({ minStock: 0, targetStock: 0, maxStock: 0 }).ok).toBe(true)
  })

  it("needs an approval reference for an opening balance above zero", () => {
    expect(validateNewInventory({ ...input, quantity: 500 }, inventory).ok).toBe(false)
    expect(validateNewInventory({ ...input, quantity: 500, openingReference: "Stocktake 31 Aug — approved" }, inventory).ok).toBe(true)
  })

  it("takes a lot reference only for a lot-tracked material", () => {
    expect(validateNewInventory({ ...input, lotId: "LOT-2026-00999" }, inventory).ok).toBe(false)
    const coal = { ...input, materialId: "MAT-COAL", gradeId: "GRD-CO-B", locationId: "PILE-RM-05", inventoryId: "RM-CO-009", lotId: "LOT-2026-00999" }
    expect(validateNewInventory(coal, inventory).ok).toBe(true)
  })

  it("accepts a location used as Both, and refuses a consumption-only one", () => {
    expect(validateNewInventory({ ...input, locationId: "KLN-01" }, inventory).ok).toBe(false)
    expect(validateNewInventory({ ...input, locationId: "STORE-01" }, inventory).ok).toBe(true)
  })

  it("requires a unique Inventory ID, case-insensitively", () => {
    expect(validateNewInventory({ ...input, inventoryId: "RM-LS-001" }, inventory).ok).toBe(false)
    expect(validateNewInventory({ ...input, inventoryId: "rm-ls-001" }, inventory).ok).toBe(false)
  })

  it("refuses a negative or non-numeric opening quantity", () => {
    expect(validateNewInventory({ ...input, quantity: null }, inventory).ok).toBe(false)
  })

  it("requires a grade, and one that belongs to the material", () => {
    expect(validateNewInventory({ ...input, gradeId: "" }, inventory).ok).toBe(false)
    // GRD-CO-B is a coal grade, not a limestone grade.
    expect(validateNewInventory({ ...input, gradeId: "GRD-CO-B" }, inventory).ok).toBe(false)
  })

  it("refuses an expiry date on a material where expiry does not apply", () => {
    expect(validateNewInventory({ ...input, quantity: 100, openingReference: "APP-1", openingExpiry: "2027-01-01T00:00:00.000Z" }, inventory).ok).toBe(false)
  })

  it("keeps one active balance per material, grade, location and lot", () => {
    // RM-LS-001 already holds GRD-LS-A limestone at PILE-RM-01 with no lot.
    expect(validateNewInventory({ ...input, gradeId: "GRD-LS-A", batch: "" }, inventory).ok).toBe(false)
    expect(validateNewInventory({ ...input, gradeId: "GRD-LS-A", batch: "B-900" }, inventory).ok).toBe(true)
  })
})

describe("stock adjustments", () => {
  it("requires a positive quantity and a reason", () => {
    expect(validateAdjustment(record(), "IN", null, "Correction").ok).toBe(false)
    expect(validateAdjustment(record(), "IN", 500, "").ok).toBe(false)
    expect(validateAdjustment(record(), "IN", 500, "Correction").ok).toBe(true)
  })

  it("never lets a removal take the balance negative", () => {
    expect(validateAdjustment(record({ quantity: 400 }), "OUT", 500, "Spillage").ok).toBe(false)
    expect(validateAdjustment(record({ quantity: 500 }), "OUT", 500, "Spillage").ok).toBe(true)
  })

  it("refuses movements on an archived record", () => {
    expect(validateAdjustment(record({ active: false }), "IN", 5, "x").ok).toBe(false)
  })
})

describe("archive", () => {
  it("only archives an empty record, with a reason, and never deletes", () => {
    expect(validateArchive(record(), "Created in error").ok).toBe(false)
    expect(validateArchive(record({ quantity: 0 }), "").ok).toBe(false)
    expect(validateArchive(record({ quantity: 0 }), "Created in error").ok).toBe(true)
    expect(validateArchive(record({ quantity: 0, active: false }), "x").ok).toBe(false)
  })
})

describe("ledger", () => {
  beforeEach(() => resetLedger())

  it("numbers transactions sequentially and keeps the newest first", () => {
    const base = { inventoryId: "X", locationId: "L", materialId: "M", gradeId: "G", uom: "MT", links: {}, actor: "t", provenance: "DEMO" as const }
    const a = recordTransaction({ ...base, type: "ADJUSTMENT", quantity: 10, balanceBefore: 0, balanceAfter: 10 })
    const b = recordTransaction({ ...base, type: "ADJUSTMENT", quantity: -4, balanceBefore: 10, balanceAfter: 6 })
    expect(a.txnId).toBe("TX-00001")
    expect(b.txnId).toBe("TX-00002")
    expect(transactions().map((t) => t.txnId)).toEqual(["TX-00002", "TX-00001"])
    expect(transactions("X")).toHaveLength(2)
  })

  it("installs the seeded history once and continues numbering after it", () => {
    installLedger(ledger)
    installLedger(ledger)
    expect(transactions()).toHaveLength(ledger.length)
    const next = recordTransaction({
      inventoryId: "X",
      locationId: "L",
      materialId: "M",
      gradeId: "G",
      uom: "MT",
      links: {},
      actor: "t",
      provenance: "DEMO",
      type: "ADJUSTMENT",
      quantity: 1,
      balanceBefore: 0,
      balanceAfter: 1,
    })
    expect(Number(next.txnId.slice(3))).toBe(ledger.length + 1)
  })

  it("describes a transaction by the references that explain it", () => {
    const t = {
      links: { poNumber: "PO-10250", incomingId: "IN-00047" },
      reference: "TRK-0231",
    } as unknown as InventoryTransaction
    expect(transactionReference(t)).toBe("PO-10250 · IN-00047 · TRK-0231")
    expect(transactionReference({ links: {} } as InventoryTransaction)).toBe("—")
  })
})

describe("seeded history", () => {
  it("uses only transaction types that correspond to application actions", () => {
    const allowed = new Set(TRANSACTION_TYPES)
    for (const t of ledger) expect(allowed.has(t.type)).toBe(true)
    expect(TRANSACTION_TYPES).toEqual(["INCOMING", "RETURN", "ADJUSTMENT", "CONSUMPTION", "ISSUE", "EXPIRY", "WASTE", "LOSS", "UNACCOUNTED"])
  })

  it("explains every balance: opening + movements equals the quantity, and never dips below zero", () => {
    for (const r of inventory) {
      const own = ledger.filter((t) => t.inventoryId === r.inventoryId)
      let running = 0
      for (const t of own) {
        expect(t.balanceBefore, `${t.txnId} before`).toBe(running)
        running += t.quantity
        expect(t.balanceAfter, `${t.txnId} after`).toBe(running)
        expect(running).toBeGreaterThanOrEqual(0)
      }
      expect(running, r.inventoryId).toBe(r.quantity)
    }
  })

  it("has unique transaction IDs in time order", () => {
    const ids = ledger.map((t) => t.txnId)
    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < ledger.length; i++) expect(ledger[i].at >= ledger[i - 1].at).toBe(true)
  })

  it("posts every RECEIVED delivery as an INCOMING transaction with its PO and Incoming ID", () => {
    const received = incoming.filter((r) => r.status === "RECEIVED")
    expect(received.length).toBeGreaterThan(0)
    for (const r of received) {
      const txn = ledger.find((t) => t.txnId === r.receipt!.transactionId)
      expect(txn, r.incomingId).toBeDefined()
      expect(txn!.type).toBe("INCOMING")
      expect(txn!.quantity).toBe(r.receipt!.receivedMt)
      expect(txn!.inventoryId).toBe(r.receipt!.inventoryId)
      expect(txn!.links).toMatchObject({ poNumber: r.poNumber, incomingId: r.incomingId })
    }
  })

  it("holds a failed-quality delivery at Quality with no inventory posting", () => {
    const failed = incoming.filter((r) => r.quality?.result === "FAIL")
    expect(failed.length).toBeGreaterThan(0)
    for (const r of failed) {
      expect(r.status).toBe("QUALITY")
      expect(r.receipt).toBeUndefined()
      expect(ledger.some((t) => t.links.incomingId === r.incomingId)).toBe(false)
    }
  })

  it("flags every record as demo and gives each a HEALTHY or CRITICAL status", () => {
    for (const r of inventory) {
      expect(r.provenance).toBe("DEMO")
      expect(["HEALTHY", "CRITICAL"]).toContain(recordStatus(r))
      const limits = recordLimits(r)
      expect(limits.maxStock).toBeGreaterThanOrEqual(limits.minStock)
      expect(limits.targetStock).toBeGreaterThanOrEqual(limits.minStock)
      expect(limits.targetStock).toBeLessThanOrEqual(limits.maxStock)
    }
    expect(inventory.some((r) => recordStatus(r) === "CRITICAL")).toBe(true)
    expect(inventory.some((r) => recordStatus(r) === "HEALTHY")).toBe(true)
  })
})

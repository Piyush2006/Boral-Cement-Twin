import { describe, expect, it } from "vitest"

import { DEMO_INVENTORY } from "@/lib/inventory/demo-source"
import { buildAdjustment, inventoryProvider, isDemoProvider } from "@/lib/inventory/provider"
import { availableCapacity, fillPercent } from "@/lib/inventory/types"
import { encodeAssetQr, parseAssetQr } from "@/lib/qr/payload"
import { TWIN_ASSETS } from "@/lib/assets/registry"

/** §20: no invented Berrima stock may be presented as real. */
describe("demo inventory provenance", () => {
  it("stamps every seeded record as DEMO", () => {
    for (const r of DEMO_INVENTORY) expect(r.provenance).toBe("DEMO")
  })

  it("runs on the demo provider until a real IMS is registered", () => {
    expect(isDemoProvider()).toBe(true)
  })

  it("uses only HEALTHY and CRITICAL — there is no LOW status", async () => {
    for (const r of await inventoryProvider().list()) {
      expect(["HEALTHY", "CRITICAL"]).toContain(r.status)
    }
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/inventory/types.ts", "utf8"),
    )
    expect(src).not.toMatch(/["']LOW["']/)
  })

  it("points every record at an asset that exists", async () => {
    const locations = new Set(TWIN_ASSETS.map((a) => a.inventoryLocationId).filter(Boolean))
    for (const r of await inventoryProvider().list()) {
      expect(locations.has(r.inventoryLocationId), `orphan ${r.inventoryLocationId}`).toBe(true)
    }
  })
})

describe("fill and capacity", () => {
  it("computes fill and free space from capacity", () => {
    const r = { ...DEMO_INVENTORY[0], bookStock: 2500, capacity: 5000 }
    expect(fillPercent(r)).toBeCloseTo(50)
    expect(availableCapacity(r)).toBe(2500)
  })

  it("returns null rather than a fake percentage with no capacity", () => {
    const r = { ...DEMO_INVENTORY[0], capacity: undefined }
    expect(fillPercent(r)).toBeNull()
    expect(availableCapacity(r)).toBeNull()
  })
})

/** §18: a count raises an adjustment; it never overwrites the book quantity. */
describe("physical count and variance", () => {
  const record = DEMO_INVENTORY.find((r) => r.inventoryLocationId === "LOC-PILE-RM-001")!

  const submission = (physicalCount: number) => ({
    inventoryLocationId: record.inventoryLocationId,
    assetId: "PILE-RM-001",
    physicalCount,
    countedBy: "test",
    countedAt: "2026-09-09T00:00:00.000Z",
  })

  it("computes a shortfall as a negative variance", () => {
    const adj = buildAdjustment(record, submission(record.bookStock - 550))
    expect(adj.variance).toBe(-550)
    expect(adj.variancePercent).toBeCloseTo((-550 / record.bookStock) * 100, 6)
  })

  it("computes a surplus as a positive variance", () => {
    expect(buildAdjustment(record, submission(record.bookStock + 120)).variance).toBe(120)
  })

  it("computes zero variance when the count matches", () => {
    expect(buildAdjustment(record, submission(record.bookStock)).variance).toBe(0)
  })

  it("raises an adjustment for reconciliation rather than an overwrite", () => {
    const adj = buildAdjustment(record, submission(1))
    expect(adj.status).toBe("PENDING_RECONCILIATION")
    expect(adj.bookStock).toBe(record.bookStock)
    expect(adj.provenance).toBe("DEMO")
    expect(adj.adjustmentId).toMatch(/^ADJ-/)
  })

  it("records the count through the provider and logs the adjustment", async () => {
    const provider = inventoryProvider()
    const before = await provider.get("LOC-SILO-CEM-001")
    const adj = await provider.submitCount({
      inventoryLocationId: "LOC-SILO-CEM-001",
      assetId: "SILO-CEM-001",
      physicalCount: 2000,
      countedBy: "test",
      countedAt: new Date().toISOString(),
    })
    expect(adj.bookStock).toBe(before!.bookStock)
    expect(adj.physicalCount).toBe(2000)
    expect((await provider.adjustments()).some((a) => a.adjustmentId === adj.adjustmentId)).toBe(true)
    // The twin then reflects the reconciled state (§22 step 8).
    expect((await provider.get("LOC-SILO-CEM-001"))!.bookStock).toBe(2000)
  })

  it("refuses a count against an unknown location", async () => {
    await expect(
      inventoryProvider().submitCount({
        inventoryLocationId: "LOC-DOES-NOT-EXIST",
        assetId: "NOPE",
        physicalCount: 1,
        countedBy: "test",
        countedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow()
  })
})

/** §18: a tag identifies an asset and carries nothing else. */
describe("QR payloads", () => {
  it("round-trips an asset id", () => {
    expect(parseAssetQr(encodeAssetQr("PILE-RM-001"))).toBe("PILE-RM-001")
  })

  it("accepts a bare id typed in by hand", () => {
    expect(parseAssetQr("  silo-cem-002 ")).toBe("SILO-CEM-002")
  })

  it.each(["", "   ", "https://example.com", "berrima-twin:asset:", "'; DROP TABLE--", "{}"])(
    "rejects %p rather than coercing it to a match",
    (raw) => {
      expect(parseAssetQr(raw)).toBeNull()
    },
  )

  it("encodes every QR-enabled asset to a parseable tag", () => {
    for (const a of TWIN_ASSETS.filter((x) => x.qrEnabled)) {
      expect(parseAssetQr(encodeAssetQr(a.assetId))).toBe(a.assetId)
    }
  })
})

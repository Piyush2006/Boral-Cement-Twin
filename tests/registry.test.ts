import { describe, expect, it } from "vitest"

import { FLOW_LINKS, TWIN_ASSETS } from "@/lib/assets/registry"
import { canHoldInventory, getAsset, searchAssets } from "@/lib/assets/selectors"
import { isValidLatLng } from "@/lib/map/projection"

describe("asset registry", () => {
  it("has unique, stable asset ids", () => {
    const ids = TWIN_ASSETS.map((a) => a.assetId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("gives every asset a valid real-world position", () => {
    for (const a of TWIN_ASSETS) {
      expect(isValidLatLng(a.position), `${a.assetId} has a bad position`).toBe(true)
    }
  })

  it("places every asset inside the site bounds", () => {
    for (const a of TWIN_ASSETS) {
      expect(a.position.lat).toBeLessThan(-34.5)
      expect(a.position.lat).toBeGreaterThan(-34.52)
      expect(a.position.lng).toBeGreaterThan(150.32)
      expect(a.position.lng).toBeLessThan(150.35)
    }
  })

  /** §30: nothing may be presented as verified when it is not. */
  it("marks NOTHING as verified — there is no survey or client CAD data", () => {
    for (const a of TWIN_ASSETS) {
      expect(a.verified, `${a.assetId} claims to be verified`).toBe(false)
    }
  })

  it("records how every asset was positioned and identified", () => {
    for (const a of TWIN_ASSETS) {
      expect(["IMAGERY", "DEMO", "SURVEY", "PLANT_LAYOUT"]).toContain(a.positionSource)
      expect(["IDENTIFIED", "DOCUMENTED", "DEMO_OBJECT"]).toContain(a.identitySource)
    }
  })

  /** §13: Berrima operates one kiln, No. 6. */
  it("models exactly one kiln, Kiln 6", () => {
    const kilns = TWIN_ASSETS.filter((a) => a.type === "KILN")
    expect(kilns).toHaveLength(1)
    expect(kilns[0].assetId).toBe("KILN-06")
    expect(kilns[0].name).toBe("Kiln 6")
  })

  it("models exactly two cement mills, 6 and 7", () => {
    const mills = TWIN_ASSETS.filter((a) => a.assetId.startsWith("CEMENT-MILL"))
    expect(mills.map((m) => m.assetId).sort()).toEqual(["CEMENT-MILL-06", "CEMENT-MILL-07"])
  })

  it("derives the kiln's length and bearing from its traced shell", () => {
    const kiln = getAsset("KILN-06")!
    expect(kiln.lengthMetres).toBeGreaterThan(60)
    expect(kiln.lengthMetres).toBeLessThan(110)
    expect(kiln.bearingDegrees).toBeGreaterThan(60)
    expect(kiln.bearingDegrees).toBeLessThan(100)
  })

  /** §12: the three silos are configuration, not a Boral-supplied fact. */
  it("ships Cement Silos 1-3 as demo objects", () => {
    const silos = TWIN_ASSETS.filter((a) => a.assetId.startsWith("SILO-CEM"))
    expect(silos).toHaveLength(3)
    for (const s of silos) {
      expect(s.positionSource).toBe("DEMO")
      expect(s.identitySource).toBe("DEMO_OBJECT")
      expect(s.verified).toBe(false)
    }
  })

  it("declares no stock quantities in the spatial configuration", () => {
    for (const a of TWIN_ASSETS) {
      const loose = a as unknown as Record<string, unknown>
      for (const key of ["bookStock", "quantity", "capacity", "stock", "fill"]) {
        expect(loose[key], `${a.assetId} declares ${key}`).toBeUndefined()
      }
    }
  })

  it("treats the quarry as a source, never as a stock location", () => {
    const quarry = getAsset("QUARRY-01")!
    expect(canHoldInventory(quarry)).toBe(false)
    expect(quarry.inventoryLocationId).toBeUndefined()
  })

  it("gives every inventory-linked asset a QR tag", () => {
    for (const a of TWIN_ASSETS.filter((x) => x.inventoryLocationId)) {
      expect(a.qrEnabled, `${a.assetId} has inventory but no QR tag`).toBe(true)
    }
  })
})

describe("process flow", () => {
  it("references only known assets", () => {
    const ids = new Set(TWIN_ASSETS.map((a) => a.assetId))
    for (const l of FLOW_LINKS) {
      expect(ids.has(l.from), `unknown ${l.from}`).toBe(true)
      expect(ids.has(l.to), `unknown ${l.to}`).toBe(true)
    }
  })

  /** §25: conveyors are indicative, never claimed as surveyed routes. */
  it("marks every route as unverified", () => {
    for (const l of FLOW_LINKS) expect(l.routeVerified).toBe(false)
  })

  it("connects the plant end to end, quarry through to dispatch", () => {
    const out = new Map<string, string[]>()
    for (const l of FLOW_LINKS) out.set(l.from, [...(out.get(l.from) ?? []), l.to])

    const seen = new Set<string>()
    const queue = ["QUARRY-01"]
    while (queue.length) {
      const id = queue.shift()!
      if (seen.has(id)) continue
      seen.add(id)
      queue.push(...(out.get(id) ?? []))
    }
    // The chain must actually reach the far end — this is what makes it a
    // connected plant system rather than unrelated objects.
    for (const id of ["CRUSHER-01", "RAW-MILL-01", "KILN-06", "CEMENT-MILL-06", "DISPATCH-01"]) {
      expect(seen.has(id), `${id} is not reachable from the quarry`).toBe(true)
    }
  })
})

describe("search", () => {
  it("finds assets by name and by id", () => {
    expect(searchAssets("kiln").map((a) => a.assetId)).toContain("KILN-06")
    expect(searchAssets("PILE-RM-001").map((a) => a.assetId)).toContain("PILE-RM-001")
  })

  it("returns nothing for an empty query", () => {
    expect(searchAssets("   ")).toEqual([])
  })
})

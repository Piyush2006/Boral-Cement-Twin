import { beforeEach, describe, expect, it } from "vitest"

import {
  activeMaterials,
  consumptionLocations,
  gradesFor,
  inventoryLocations,
  locationMaster,
  materialGradeOptions,
  materialMaster,
  resetMasters,
} from "@/lib/masters/registry"
import { GRADE_SEED_LIST, LOCATION_SEED, MATERIAL_SEED } from "@/lib/masters/seed"
import {
  gradeIdFor,
  materialIdFor,
  validateDeactivate,
  validateGrade,
  validateLocation,
  validateMaterial,
  validateUsageChange,
} from "@/lib/masters/rules"
import {
  LOCATION_KINDS,
  LOCATION_KIND_LABEL,
  LOCATION_USAGES,
  consumesStock,
  holdsStock,
  readingPasses,
  samplingLabel,
  type QualityParameter,
} from "@/lib/masters/types"

beforeEach(() => resetMasters())

/* ── Materials + Grades ──────────────────────────────────────────────────── */

describe("Materials + Grades master", () => {
  it("gives every material a unique ID and code", () => {
    const ids = MATERIAL_SEED.map((m) => m.materialId)
    const codes = MATERIAL_SEED.map((m) => m.code)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("puts every grade under a material that exists, and every material has a grade", () => {
    for (const g of GRADE_SEED_LIST) expect(materialMaster(g.materialId)).toBeDefined()
    for (const m of MATERIAL_SEED) expect(GRADE_SEED_LIST.some((g) => g.materialId === m.materialId)).toBe(true)
  })

  it("carries no stock limits on a grade — they belong to the inventory record", () => {
    for (const g of GRADE_SEED_LIST) {
      expect(g).not.toHaveProperty("minStock")
      expect(g).not.toHaveProperty("maxStock")
      expect(g).not.toHaveProperty("targetStock")
    }
  })

  it("seeds the examples the plant uses: Limestone → Grade A / Grade B, Alternate Fuel → SRF", () => {
    expect(gradesFor("MAT-LIMESTONE").map((g) => g.name)).toEqual(["Grade A", "Grade B"])
    expect(gradesFor("MAT-ALT-FUEL").map((g) => g.name)).toEqual(["SRF"])
  })

  it("offers one Material + Grade option per active pair, labelled as the plant says it", () => {
    const options = materialGradeOptions()
    expect(options.find((o) => o.gradeId === "GRD-LS-A")?.label).toBe("Limestone — Grade A")
    expect(options.find((o) => o.gradeId === "GRD-AF-SRF")?.label).toBe("Alternate Fuel (AF) — SRF")
    expect(options.length).toBe(GRADE_SEED_LIST.filter((g) => g.active).length)
  })

  it("exposes only active materials as options", () => {
    expect(activeMaterials().every((m) => m.active)).toBe(true)
  })

  it("tracks lots only where traceability of received material needs one", () => {
    const tracked = MATERIAL_SEED.filter((m) => m.lotTracking).map((m) => m.materialId)
    expect(tracked).toContain("MAT-ALT-FUEL")
    expect(tracked).not.toContain("MAT-LIMESTONE")
  })

  it("flags critical spares only on spares", () => {
    for (const m of MATERIAL_SEED) if (m.criticalSpare) expect(m.group).toBe("Spare")
    expect(MATERIAL_SEED.filter((m) => m.criticalSpare).length).toBeGreaterThan(0)
  })

  it("describes the sampling frequency in words", () => {
    expect(samplingLabel(0)).toBe("No sample required")
    expect(samplingLabel(1)).toBe("Every delivery")
    expect(samplingLabel(2)).toBe("Every 2nd delivery")
    expect(samplingLabel(3)).toBe("Every 3rd delivery")
    expect(samplingLabel(11)).toBe("Every 11th delivery")
  })
})

/* ── registration rules ──────────────────────────────────────────────────── */

const materialInput = { code: "NEW", name: "New Material", uom: "MT", group: "Raw Material", unitCost: 10 }

describe("material registration", () => {
  it("accepts a well-formed material and derives its internal ID from the code", () => {
    expect(validateMaterial(materialInput, MATERIAL_SEED).ok).toBe(true)
    expect(materialIdFor("rm-new")).toBe("MAT-RM-NEW")
  })

  it("requires only code, name and UOM — category is optional", () => {
    expect(validateMaterial({ ...materialInput, group: undefined }, MATERIAL_SEED).ok).toBe(true)
    expect(validateMaterial({ ...materialInput, code: "" }, MATERIAL_SEED).ok).toBe(false)
    expect(validateMaterial({ ...materialInput, name: "  " }, MATERIAL_SEED).ok).toBe(false)
    expect(validateMaterial({ ...materialInput, uom: "" }, MATERIAL_SEED).ok).toBe(false)
  })

  it("refuses a duplicate code or name, case-insensitively", () => {
    expect(validateMaterial({ ...materialInput, code: MATERIAL_SEED[0].code.toLowerCase() }, MATERIAL_SEED).ok).toBe(false)
    expect(validateMaterial({ ...materialInput, name: "limestone" }, MATERIAL_SEED).ok).toBe(false)
    // Editing a material keeps its own code and name.
    const own = MATERIAL_SEED[0]
    expect(validateMaterial({ ...materialInput, code: own.code, name: own.name }, MATERIAL_SEED, own.materialId).ok).toBe(true)
  })

  it("refuses a negative standard cost", () => {
    expect(validateMaterial({ ...materialInput, unitCost: -1 }, MATERIAL_SEED).ok).toBe(false)
  })
})

const param = (name: string, min: number | null, max: number | null, target: number | null): QualityParameter => ({
  parameterId: name.toLowerCase(),
  name,
  min,
  max,
  target,
})

const gradeInput = { materialId: "MAT-LIMESTONE", name: "Grade C", version: "v1", sampleEvery: 1, qualityParameters: [] as QualityParameter[] }

describe("grade registration", () => {
  it("accepts a well-formed grade", () => {
    expect(validateGrade(gradeInput, GRADE_SEED_LIST).ok).toBe(true)
  })

  it("generates a unique internal grade ID", () => {
    expect(gradeIdFor("RM-LS", "Grade C", GRADE_SEED_LIST)).toBe("GRD-RM-LS-GRADE-C")
    const clash = [...GRADE_SEED_LIST, { ...GRADE_SEED_LIST[0], gradeId: "GRD-RM-LS-GRADE-C" }]
    expect(gradeIdFor("RM-LS", "Grade C", clash)).not.toBe("GRD-RM-LS-GRADE-C")
  })

  it("accepts any grade-specific parameter the plant names — %C, %Mn, %S, %P, %Si, %Al or anything else", () => {
    const dual = ["C", "Mn", "S", "P", "Si", "Al"].map((n) => param(n, 0, 1, 0.5))
    expect(validateGrade({ ...gradeInput, qualityParameters: dual }, GRADE_SEED_LIST).ok).toBe(true)
    const unusual = [param("Whiteness Index", 70, 100, 88), param("Blaine", 300, 360, 330)]
    expect(validateGrade({ ...gradeInput, qualityParameters: unusual }, GRADE_SEED_LIST).ok).toBe(true)
  })

  it("refuses a nameless, duplicated or contradictory parameter", () => {
    expect(validateGrade({ ...gradeInput, qualityParameters: [param("", 1, 2, 1.5)] }, GRADE_SEED_LIST).ok).toBe(false)
    expect(validateGrade({ ...gradeInput, qualityParameters: [param("CaO", 1, 2, 1.5), param("cao", 1, 2, 1.5)] }, GRADE_SEED_LIST).ok).toBe(false)
    expect(validateGrade({ ...gradeInput, qualityParameters: [param("CaO", 5, 1, 3)] }, GRADE_SEED_LIST).ok).toBe(false)
    expect(validateGrade({ ...gradeInput, qualityParameters: [param("CaO", 1, 5, 9)] }, GRADE_SEED_LIST).ok).toBe(false)
    expect(validateGrade({ ...gradeInput, qualityParameters: [param("CaO", null, null, null)] }, GRADE_SEED_LIST).ok).toBe(false)
  })

  it("allows a one-sided specification", () => {
    expect(validateGrade({ ...gradeInput, qualityParameters: [param("CaO", 50, null, null)] }, GRADE_SEED_LIST).ok).toBe(true)
  })

  it("refuses a second grade of the same name under one material, but not under another", () => {
    expect(validateGrade({ ...gradeInput, name: "Grade A" }, GRADE_SEED_LIST).ok).toBe(false)
    expect(validateGrade({ ...gradeInput, materialId: "MAT-COAL", name: "Grade A" }, GRADE_SEED_LIST).ok).toBe(true)
  })

  it("requires a sampling frequency of whole deliveries", () => {
    expect(validateGrade({ ...gradeInput, sampleEvery: 0 }, GRADE_SEED_LIST).ok).toBe(true)
    expect(validateGrade({ ...gradeInput, sampleEvery: -1 }, GRADE_SEED_LIST).ok).toBe(false)
    expect(validateGrade({ ...gradeInput, sampleEvery: 1.5 }, GRADE_SEED_LIST).ok).toBe(false)
  })
})

/* ── Locations ───────────────────────────────────────────────────────────── */

const locationInput = {
  locationId: "PILE-NEW",
  name: "New Pile",
  kind: "PILE",
  usage: "INVENTORY",
  capacity: 1000,
  latitude: null as number | null,
  longitude: null as number | null,
}

describe("Locations master", () => {
  it("offers the plant's location types and all three usages", () => {
    expect(LOCATION_KINDS).toEqual(["PILE", "SILO", "WAREHOUSE", "STORE", "PRODUCTION_AREA", "MAINTENANCE_AREA", "OTHER"])
    for (const k of LOCATION_KINDS) expect(LOCATION_KIND_LABEL[k]).toBeTruthy()
    expect(LOCATION_USAGES).toEqual(["INVENTORY", "CONSUMPTION", "BOTH"])
  })

  it("lets a BOTH location hold stock and consume it", () => {
    expect(holdsStock({ usage: "BOTH" })).toBe(true)
    expect(consumesStock({ usage: "BOTH" })).toBe(true)
    expect(holdsStock({ usage: "CONSUMPTION" })).toBe(false)
    expect(consumesStock({ usage: "INVENTORY" })).toBe(false)
  })

  it("lists holding and consuming locations by usage", () => {
    expect(inventoryLocations().every((l) => l.usage !== "CONSUMPTION")).toBe(true)
    expect(consumptionLocations().every((l) => l.usage !== "INVENTORY")).toBe(true)
    expect(consumptionLocations().map((l) => l.locationId)).toContain("MAINT-01")
  })

  it("seeds each location with the type it physically is", () => {
    const byId = new Map(LOCATION_SEED.map((l) => [l.locationId, l]))
    expect(byId.get("STORE-01")?.kind).toBe("STORE")
    expect(byId.get("MAINT-01")?.kind).toBe("MAINTENANCE_AREA")
    expect(byId.get("KLN-01")?.kind).toBe("PRODUCTION_AREA")
    expect(LOCATION_SEED.filter((l) => l.kind === "SILO")).toHaveLength(3)
    for (const l of LOCATION_SEED) if (l.locationId.startsWith("PILE-")) expect(l.kind).toBe("PILE")
  })

  it("never invents a capacity for a place that holds no stock", () => {
    for (const l of LOCATION_SEED) if (l.usage === "CONSUMPTION") expect(l.capacity).toBeUndefined()
  })

  it("places piles and silos on the Digital Twin with approximate coordinates", () => {
    for (const l of LOCATION_SEED.filter((x) => x.kind === "PILE" || x.kind === "SILO")) {
      expect(l.latitude).toBeTypeOf("number")
      expect(l.longitude).toBeTypeOf("number")
    }
  })

  it("resolves a location by ID and nothing for an unknown one", () => {
    expect(locationMaster("STORE-01")?.name).toBe("Maintenance Store")
    expect(locationMaster("NOPE")).toBeUndefined()
  })
})

describe("location registration", () => {
  it("accepts a well-formed location and refuses a duplicate ID", () => {
    expect(validateLocation(locationInput, LOCATION_SEED).ok).toBe(true)
    expect(validateLocation({ ...locationInput, locationId: "STORE-01" }, LOCATION_SEED).ok).toBe(false)
  })

  it("requires ID, name, location type and usage", () => {
    expect(validateLocation({ ...locationInput, locationId: "" }, LOCATION_SEED).ok).toBe(false)
    expect(validateLocation({ ...locationInput, name: "" }, LOCATION_SEED).ok).toBe(false)
    expect(validateLocation({ ...locationInput, kind: "" }, LOCATION_SEED).ok).toBe(false)
    expect(validateLocation({ ...locationInput, kind: "QUARRY" }, LOCATION_SEED).ok).toBe(false)
    expect(validateLocation({ ...locationInput, usage: "" }, LOCATION_SEED).ok).toBe(false)
    for (const u of LOCATION_USAGES) {
      expect(validateLocation({ ...locationInput, usage: u, capacity: u === "CONSUMPTION" ? null : 1000 }, LOCATION_SEED).ok).toBe(true)
    }
  })

  it("keeps capacity optional, never negative, and absent on consumption-only locations", () => {
    expect(validateLocation({ ...locationInput, capacity: null }, LOCATION_SEED).ok).toBe(true)
    expect(validateLocation({ ...locationInput, capacity: -5 }, LOCATION_SEED).ok).toBe(false)
    expect(validateLocation({ ...locationInput, usage: "CONSUMPTION", capacity: 100 }, LOCATION_SEED).ok).toBe(false)
  })

  it("takes coordinates as a pair, within range", () => {
    expect(validateLocation({ ...locationInput, latitude: -34.51, longitude: 150.33 }, LOCATION_SEED).ok).toBe(true)
    expect(validateLocation({ ...locationInput, latitude: -34.51, longitude: null }, LOCATION_SEED).ok).toBe(false)
    expect(validateLocation({ ...locationInput, latitude: -134, longitude: 150 }, LOCATION_SEED).ok).toBe(false)
  })

  it("refuses to make a location that holds stock consumption-only", () => {
    expect(validateUsageChange(2, "CONSUMPTION").ok).toBe(false)
    expect(validateUsageChange(2, "BOTH").ok).toBe(true)
    expect(validateUsageChange(0, "CONSUMPTION").ok).toBe(true)
  })
})

describe("deactivation", () => {
  it("archives rather than deletes, and only once nothing depends on it", () => {
    expect(validateDeactivate(3, "Limestone").ok).toBe(false)
    expect(validateDeactivate(0, "Limestone").ok).toBe(true)
  })
})

describe("quality readings", () => {
  it("passes only inside the parameter's limits, and never without a reading", () => {
    expect(readingPasses(52, 50, null)).toBe(true)
    expect(readingPasses(49, 50, null)).toBe(false)
    expect(readingPasses(3.5, null, 3)).toBe(false)
    expect(readingPasses(null, 1, 3)).toBe(false)
  })
})

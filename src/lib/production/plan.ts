/**
 * Production Readiness — Production Plan + Bill of Materials vs stock on hand.
 *
 *   plan quantity × BOM ratio = REQUIRED
 *   required vs available     = READY / SHORT
 *
 * Nothing here invents a plan or a recipe. Both are CONFIGURED DEMO DATA and
 * are labelled as such: Boral has supplied neither, and a cement recipe read off
 * a textbook would be a fabricated Berrima fact. The calculation is real; the
 * inputs are declared.
 */

export type BomLine = {
  materialId: string
  /** Quantity of this material per one unit of the product. */
  ratio: number
}

export type Bom = {
  bomId: string
  /** The material produced. */
  productId: string
  name: string
  lines: BomLine[]
  provenance: "DEMO" | "LIVE"
}

export type ProductionPlan = {
  planId: string
  productId: string
  bomId: string
  /** Quantity to produce, in the product's UOM. */
  quantity: number
  uom: string
  /** Planned window. */
  from: string
  to: string
  notes?: string
  provenance: "DEMO" | "LIVE"
}

/** Demo recipes — plant configuration, not a Boral-supplied specification. */
export const BOMS: Bom[] = [
  {
    bomId: "BOM-RAWMIX",
    productId: "MAT-RAW-MIX",
    name: "Raw Mix",
    provenance: "DEMO",
    lines: [
      { materialId: "MAT-LIMESTONE", ratio: 0.82 },
      { materialId: "MAT-CLAY-SHALE", ratio: 0.13 },
      { materialId: "MAT-SAND", ratio: 0.05 },
    ],
  },
  {
    bomId: "BOM-OPC43",
    productId: "MAT-CEMENT",
    name: "Ordinary Portland Cement 43",
    provenance: "DEMO",
    lines: [
      { materialId: "MAT-RAW-MIX", ratio: 1.55 },
      { materialId: "MAT-GYPSUM", ratio: 0.05 },
      { materialId: "MAT-COAL", ratio: 0.11 },
      { materialId: "MAT-ALT-FUEL", ratio: 0.06 },
    ],
  },
]

/** Demo plan for the week. */
export const PRODUCTION_PLANS: ProductionPlan[] = [
  {
    planId: "PP-2026-37-A",
    productId: "MAT-CEMENT",
    bomId: "BOM-OPC43",
    quantity: 9000,
    uom: "MT",
    from: "2026-09-11T00:00:00.000Z",
    to: "2026-09-17T00:00:00.000Z",
    notes: "Kiln No. 6 continuous run",
    provenance: "DEMO",
  },
  {
    planId: "PP-2026-37-B",
    productId: "MAT-RAW-MIX",
    bomId: "BOM-RAWMIX",
    quantity: 14000,
    uom: "MT",
    from: "2026-09-11T00:00:00.000Z",
    to: "2026-09-17T00:00:00.000Z",
    notes: "Raw mill campaign",
    provenance: "DEMO",
  },
]

export function bom(bomId: string): Bom | undefined {
  return BOMS.find((b) => b.bomId === bomId)
}

export type Requirement = {
  materialId: string
  required: number
  available: number
  /** available − required. Negative means short. */
  shortfall: number
  /** Available ÷ expected daily consumption from every plan. Null where nothing is planned. */
  daysOfInventory: number | null
  ready: boolean
}

/** Length of a plan's window in days. */
export function planDays(plan: ProductionPlan): number {
  return Math.max(1, (new Date(plan.to).getTime() - new Date(plan.from).getTime()) / 86_400_000)
}

/**
 * Expected daily consumption of a material, derived from the production plans
 * and their bills of materials: Σ (plan quantity × BOM ratio ÷ plan days).
 */
export function expectedDailyConsumption(materialId: string, plans: ProductionPlan[] = PRODUCTION_PLANS): number {
  let daily = 0
  for (const plan of plans) {
    const line = bom(plan.bomId)?.lines.find((l) => l.materialId === materialId)
    if (line) daily += (plan.quantity * line.ratio) / planDays(plan)
  }
  return daily
}

/**
 * Days of inventory = available usable inventory ÷ expected daily consumption
 * (from plan + BOM). Null where the plans consume none of the material.
 */
export function planDaysOfInventory(available: number, materialId: string, plans: ProductionPlan[] = PRODUCTION_PLANS): number | null {
  const daily = expectedDailyConsumption(materialId, plans)
  return daily > 0 ? available / daily : null
}

export type PlanReadiness = {
  plan: ProductionPlan
  requirements: Requirement[]
  /** Every requirement met. */
  ready: boolean
  /** Fraction of the plan the tightest material supports, 0..1. */
  coverage: number
}

/**
 * What a plan needs, and whether stock covers it.
 * `availableOf` returns the total on hand for a material.
 */
export function planReadiness(plan: ProductionPlan, availableOf: (materialId: string) => number): PlanReadiness {
  const recipe = bom(plan.bomId)
  const lines = recipe?.lines ?? []
  const requirements: Requirement[] = lines.map((l) => {
    const required = plan.quantity * l.ratio
    const available = availableOf(l.materialId)
    return {
      materialId: l.materialId,
      required,
      available,
      shortfall: available - required,
      daysOfInventory: planDaysOfInventory(available, l.materialId),
      ready: available >= required,
    }
  })
  const coverage = requirements.length
    ? Math.min(...requirements.map((r) => (r.required > 0 ? r.available / r.required : 1)))
    : 1
  return { plan, requirements, ready: requirements.every((r) => r.ready), coverage: Math.max(0, Math.min(1, coverage)) }
}

/**
 * Days of inventory: how long the current balance lasts at the observed
 * consumption rate. Null where nothing has been consumed — a rate of zero
 * gives no answer, and "infinite" would be a false one.
 */
export function daysOfInventory(quantity: number, consumedInWindow: number, windowDays: number): number | null {
  if (consumedInWindow <= 0 || windowDays <= 0) return null
  return quantity / (consumedInWindow / windowDays)
}

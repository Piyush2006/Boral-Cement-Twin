/**
 * Consumption categories, exception outcomes, returns and net consumption.
 *
 * ISSUE is not CONSUMPTION. Material leaves the store on an issue; what the
 * plant actually used is recorded separately, and part of an issue can come
 * back. So:
 *
 *   NET CONSUMPTION = GROSS OUTWARD − RETURNED
 *
 * Every consumption is classified, because "how much did we use" and "what did
 * we use it for" are different questions and the plant needs both.
 */

export type ConsumptionCategory =
  | "RAW_MATERIAL"
  | "INTERMEDIATE"
  | "FINISHED_GOODS"
  | "SPARE"
  | "EXPIRED"
  | "WASTED"
  | "LOST"
  | "UNACCOUNTED"

/** Consumption classes (RM, IM, FG, SPARE), then the exception outcomes. */
export const CONSUMPTION_CATEGORIES: ConsumptionCategory[] = [
  "RAW_MATERIAL",
  "INTERMEDIATE",
  "FINISHED_GOODS",
  "SPARE",
  "EXPIRED",
  "WASTED",
  "LOST",
  "UNACCOUNTED",
]

export const CONSUMPTION_CATEGORY_META: Record<
  ConsumptionCategory,
  { code: string; label: string; description: string; colour: string; productive: boolean }
> = {
  RAW_MATERIAL: {
    code: "RM",
    label: "RM — Raw Material",
    description: "Consumed into the process as raw material",
    colour: "#60a5fa",
    productive: true,
  },
  INTERMEDIATE: {
    code: "IM",
    label: "IM — Intermediate",
    description: "Consumed as a part-processed material, e.g. raw mix or clinker",
    colour: "#a855f7",
    productive: true,
  },
  FINISHED_GOODS: {
    code: "FG",
    label: "FG — Finished Goods",
    description: "Drawn from finished product, e.g. packing or despatch",
    colour: "#14b8a6",
    productive: true,
  },
  SPARE: {
    code: "SPARE",
    label: "SPARE — Maintenance",
    description: "Consumed on maintenance work, costed to a plant asset",
    colour: "#f59e0b",
    productive: true,
  },
  EXPIRED: {
    code: "EXPIRED",
    label: "EXPIRED",
    description: "Material that passed its expiry date",
    colour: "#ef4444",
    productive: false,
  },
  WASTED: {
    code: "WASTED",
    label: "WASTED",
    description: "Spillage, contamination or damage — a known, recorded loss",
    colour: "#f97316",
    productive: false,
  },
  LOST: {
    code: "LOST",
    label: "LOST",
    description: "Material lost in handling or transit",
    colour: "#e11d48",
    productive: false,
  },
  UNACCOUNTED: {
    code: "UNACCOUNTED",
    label: "UNACCOUNTED",
    description: "Difference found on reconciliation with no identified cause",
    colour: "#94a3b8",
    productive: false,
  },
}

/** Exception outcomes: loss rather than production. */
export const LOSS_CATEGORIES: ConsumptionCategory[] = ["EXPIRED", "WASTED", "LOST", "UNACCOUNTED"]

export function isLoss(category: ConsumptionCategory): boolean {
  return !CONSUMPTION_CATEGORY_META[category].productive
}

/**
 * The inventory transaction a consumption posts as. The exact type is recorded
 * with every movement, so an outcome is never hidden inside CONSUMPTION.
 */
export function consumptionTransactionType(
  category: ConsumptionCategory,
): "CONSUMPTION" | "EXPIRY" | "WASTE" | "LOSS" | "UNACCOUNTED" {
  switch (category) {
    case "EXPIRED":
      return "EXPIRY"
    case "WASTED":
      return "WASTE"
    case "LOST":
      return "LOSS"
    case "UNACCOUNTED":
      return "UNACCOUNTED"
    default:
      return "CONSUMPTION"
  }
}

/** Material returned unused from an issue. Returned stock goes back to source. */
export type MaterialReturn = {
  returnId: string
  quantity: number
  reason: string
  /** The inventory record the material went back into. */
  inventoryId: string
  at: string
  by: string
  transactionId?: string
}

export type ConsumptionTotals = {
  grossOutward: number
  returned: number
  /** Gross outward − returned. What the plant actually used. */
  net: number
}

export function consumptionTotals(grossOutward: number, returned: number): ConsumptionTotals {
  return { grossOutward, returned, net: grossOutward - returned }
}

/** The category a material's group implies, as the default the operator can change. */
export function defaultCategory(group: string | undefined): ConsumptionCategory {
  switch (group) {
    case "Finished Product":
      return "FINISHED_GOODS"
    case "Intermediate":
      return "INTERMEDIATE"
    case "Spare":
      return "SPARE"
    case "Fuel":
    case "Additive":
    case "Raw Material":
    default:
      return "RAW_MATERIAL"
  }
}

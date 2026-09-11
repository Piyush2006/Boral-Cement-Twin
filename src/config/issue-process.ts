/**
 * Issue & Consumption — plant process configuration.
 *
 * These are Berrima's decisions, not the application's. None of them is
 * assumed in the workflow code: the store reads them from here, and each
 * record captures the values in force when it was created, so changing a
 * setting later never rewrites history.
 *
 * Every value below is a PLACEHOLDER to be confirmed with the plant.
 */

export type PostingPoint = "ISSUE" | "CONSUMPTION"

export const ISSUE_PROCESS: {
  /**
   * Whether an issue must be approved before material is released.
   * false: REQUESTED → ISSUED.  true: REQUESTED → APPROVED → ISSUED.
   */
  approvalRequired: boolean
  /**
   * The event at which stock leaves the inventory balance.
   *
   *   CONSUMPTION — the balance moves by the quantity actually consumed
   *                 (18,450 − 485 = 17,965). An open issue commits stock but
   *                 does not move it.
   *   ISSUE       — the balance moves by the quantity issued
   *                 (18,450 − 500 = 17,950). The later consumption record
   *                 explains how much of it was actually used.
   *
   * Either way the issued-but-not-consumed difference stays on the record.
   */
  inventoryPostingPoint: PostingPoint
  /** Whether a consumption may exceed the quantity issued. */
  allowOverConsumption: boolean
  /**
   * Shift names, if the plant records consumption by shift. The application
   * has no shift structure, so none is invented — the field is hidden.
   */
  shifts: string[] | null
} = {
  approvalRequired: false,
  inventoryPostingPoint: "CONSUMPTION",
  allowOverConsumption: false,
  shifts: null,
}

export const POSTING_POINT_LABEL: Record<PostingPoint, string> = {
  ISSUE: "at issue",
  CONSUMPTION: "at consumption",
}

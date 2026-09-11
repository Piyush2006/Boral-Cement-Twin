"use client"

/**
 * Issue & Consumption workflow state.
 *
 * Holds one record per issue and moves it through request, optional approval,
 * issue and consumption. Stock only moves through the shared inventory
 * mechanism (`postMovement` → ledger transaction → record by delta); this
 * module keeps no balance of its own.
 *
 * Every inventory-affecting step posts FIRST and changes the record only if the
 * posting succeeded — a refused posting leaves the status, the record and the
 * inventory exactly as they were.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import { ISSUE_PROCESS } from "@/config/issue-process"
import { useIncoming } from "@/components/incoming/incoming-store"
import { usePiles } from "@/components/shell/pile-store"
import { gradeEntry, materialEntry } from "@/lib/inventory/catalog"
import { seedBundle } from "@/lib/inventory/seed"
import { FIRST_CONSUMPTION_NO, FIRST_ISSUE_NO, nextNumber } from "@/lib/issues/catalog"
import {
  availability,
  validateConsumption,
  validateIssue,
  validateIssueDraft,
  type Availability,
} from "@/lib/issues/rules"
import { CONSUMPTION_CATEGORY_META, consumptionTransactionType, defaultCategory, isLoss, type ConsumptionCategory } from "@/lib/issues/consumption"
import { resolveTrace } from "@/lib/issues/trace"
import { returnableQty, returnedQty, type IssueRecord, type IssueStatus } from "@/lib/issues/types"

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const OPERATOR = "operator.01"
const SUPERVISOR = "supervisor.01"

export type NewIssueInput = {
  materialId: string
  /** From the Material + Grade selection. */
  gradeId?: string
  sourceInventoryId: string
  quantity: number | null
  consumingAreaId: string
  productionRef: string
  reason: string
  notes: string
  originIncomingId?: string
  /** Plant asset the material is consumed against. Required for spares. */
  assetId?: string
  /** Maintenance work order, where the draw is for maintenance. Optional. */
  maintenanceRef?: string
}

function useIssueState() {
  const { postMovement, recordOf, balanceOf, canWriteInventory, ledger, inventory } = usePiles()
  const { records: incoming } = useIncoming()
  const [records, setRecords] = useState<IssueRecord[]>(() => seedBundle().issues)
  const [openId, setOpenId] = useState<string | null>(null)
  /** A request, from any module, to show a trace. The nonce re-triggers the same ID. */
  const [traceRequest, setTraceRequest] = useState<{ id: string; nonce: number } | null>(null)

  const patch = useCallback((issueId: string, apply: (r: IssueRecord) => IssueRecord) => {
    setRecords((prev) => prev.map((r) => (r.issueId === issueId ? apply(r) : r)))
  }, [])

  const stockAt = useCallback(
    (inventoryId: string, excludeIssueId?: string): Availability | null => {
      const onHand = balanceOf(inventoryId)
      return onHand === null ? null : availability(onHand, inventoryId, records, excludeIssueId)
    },
    [balanceOf, records],
  )

  const originLinks = (r: IssueRecord) => {
    const receipt = r.origin ? incoming.find((x) => x.incomingId === r.origin?.incomingId) : undefined
    return {
      poNumber: r.origin?.poNumber,
      grnNo: receipt?.grnNo,
      incomingId: r.origin?.incomingId,
      lotId: r.lotId,
      productionRef: r.productionRef || undefined,
      consumingAreaId: r.consumingAreaId,
      assetId: r.assetId,
      maintenanceRef: r.maintenanceRef,
    }
  }

  /** Release material. Shared by "Issue Material" and "Create & Issue". */
  const release = useCallback(
    (record: IssueRecord, issuedQty: number): Result<IssueRecord> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to issue material." }
      const check = validateIssue(record, issuedQty, stockAt(record.sourceInventoryId, record.issueId))
      if (!check.ok) return check

      let transactionId: string | undefined
      let at = new Date().toISOString()
      if (record.postingPoint === "ISSUE") {
        const posted = postMovement({
          inventoryId: record.sourceInventoryId,
          type: "ISSUE",
          quantity: -issuedQty,
          batch: record.batch,
          links: { ...originLinks(record), issueId: record.issueId },
        })
        if (!posted.ok) return posted
        transactionId = posted.value.txnId
        at = posted.value.at
      }

      return {
        ok: true,
        value: {
          ...record,
          status: "ISSUED",
          issue: { issuedQty, at, by: OPERATOR, transactionId },
          audit: [
            ...record.audit,
            {
              at,
              by: OPERATOR,
              action: transactionId
                ? `Material issued — ${issuedQty.toLocaleString()} ${record.uom}, inventory transaction ${transactionId}`
                : `Material issued — ${issuedQty.toLocaleString()} ${record.uom}, committed until consumption posts`,
              from: record.status,
              to: "ISSUED",
              transactionId,
            },
          ],
        },
      }
    },
    [canWriteInventory, stockAt, postMovement, recordOf],
  )

  const createIssue = useCallback(
    (input: NewIssueInput, issueNow: boolean): Result<IssueRecord> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to create issues." }
      const material = materialEntry(input.materialId)
      const uom = material?.uom ?? "MT"
      const source = recordOf(input.sourceInventoryId)
      const check = validateIssueDraft(
        { materialId: input.materialId, gradeId: input.gradeId, sourceInventoryId: input.sourceInventoryId, quantity: input.quantity, uom, consumingAreaId: input.consumingAreaId },
        source,
        source ? stockAt(source.inventoryId) : null,
      )
      if (!check.ok) return check
      if (issueNow && ISSUE_PROCESS.approvalRequired) {
        return { ok: false, error: "This process requires approval before material is issued." }
      }
      const receipt = input.originIncomingId ? incoming.find((r) => r.incomingId === input.originIncomingId) : undefined
      if (input.originIncomingId && receipt?.receipt?.inventoryId !== input.sourceInventoryId) {
        return { ok: false, error: "The origin receipt must be a receipt into the selected inventory record." }
      }
      // Maintenance and spare draws are costed to an asset, so the plant can
      // see which assets consume the most. Without one, the cost has nowhere
      // to land, so the draw is refused rather than recorded against nothing.
      if (material?.group === "Spare" && !input.assetId?.trim()) {
        return { ok: false, error: "Select the plant asset this spare is consumed against." }
      }

      const at = new Date().toISOString()
      const quantity = input.quantity!
      const created: IssueRecord = {
        issueId: `ISS-${String(nextNumber(records.map((r) => r.issueId), "ISS", FIRST_ISSUE_NO)).padStart(5, "0")}`,
        materialId: input.materialId,
        sourceInventoryId: source!.inventoryId,
        sourceLocationId: source!.locationId,
        requestedQty: quantity,
        uom,
        consumingAreaId: input.consumingAreaId,
        productionRef: input.productionRef.trim().toUpperCase(),
        reason: input.reason.trim(),
        notes: input.notes.trim(),
        gradeId: source!.gradeId,
        batch: receipt?.batch ?? source!.batch,
        lotId: receipt?.receipt?.lotId ?? source!.lotId,
        assetId: input.assetId?.trim() || undefined,
        maintenanceRef: input.maintenanceRef?.trim().toUpperCase() || undefined,
        origin: receipt ? { incomingId: receipt.incomingId, poNumber: receipt.poNumber } : undefined,
        approvalRequired: ISSUE_PROCESS.approvalRequired,
        postingPoint: ISSUE_PROCESS.inventoryPostingPoint,
        status: "REQUESTED",
        createdAt: at,
        createdBy: OPERATOR,
        audit: [{ at, by: OPERATOR, action: `Issue created — ${quantity.toLocaleString()} ${uom} requested`, to: "REQUESTED" }],
        provenance: "DEMO",
      }

      let final = created
      if (issueNow) {
        // Post first; a refusal creates nothing, so the form can be corrected and retried.
        const released = release(created, quantity)
        if (!released.ok) return released
        final = released.value
      }
      setRecords((prev) => [final, ...prev])
      return { ok: true, value: final }
    },
    [canWriteInventory, recordOf, stockAt, incoming, records, release],
  )

  const approveIssue = useCallback(
    (issueId: string): Result<true> => {
      const record = records.find((r) => r.issueId === issueId)
      if (!record) return { ok: false, error: "Issue not found." }
      if (!record.approvalRequired) return { ok: false, error: "This issue does not require approval." }
      if (record.status !== "REQUESTED") return { ok: false, error: "Only a requested issue can be approved." }
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to approve issues." }
      const at = new Date().toISOString()
      patch(issueId, (r) => ({
        ...r,
        status: "APPROVED",
        approval: { at, by: SUPERVISOR },
        audit: [...r.audit, { at, by: SUPERVISOR, action: "Issue approved", from: r.status, to: "APPROVED" }],
      }))
      return { ok: true, value: true }
    },
    [records, canWriteInventory, patch],
  )

  const issueMaterial = useCallback(
    (issueId: string, issuedQty: number | null): Result<IssueRecord> => {
      const record = records.find((r) => r.issueId === issueId)
      if (!record) return { ok: false, error: "Issue not found." }
      if (issuedQty === null) return { ok: false, error: "Quantity must be a number greater than zero." }
      const released = release(record, issuedQty)
      if (!released.ok) return released
      patch(issueId, () => released.value)
      return released
    },
    [records, release, patch],
  )

  const recordConsumption = useCallback(
    (
      issueId: string,
      input: {
        consumedQty: number | null
        at: string | null
        productionRef: string
        comments: string
        category?: ConsumptionCategory
      },
    ): Result<IssueRecord> => {
      const record = records.find((r) => r.issueId === issueId)
      if (!record) return { ok: false, error: "Issue not found." }
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to record consumption." }
      const check = validateConsumption(record, input.consumedQty, {
        allowOverConsumption: ISSUE_PROCESS.allowOverConsumption,
        postingPoint: record.postingPoint,
        onHand: balanceOf(record.sourceInventoryId),
        at: input.at,
      })
      if (!check.ok) return check
      const consumedQty = input.consumedQty!
      const category = input.category ?? defaultCategory(materialEntry(record.materialId)?.group)
      const consumptionId = `CON-${String(
        nextNumber(records.flatMap((r) => (r.consumption ? [r.consumption.consumptionId] : [])), "CON", FIRST_CONSUMPTION_NO),
      ).padStart(5, "0")}`
      const productionRef = input.productionRef.trim().toUpperCase()

      let transactionId: string | undefined
      let postedAt = new Date().toISOString()
      if (record.postingPoint === "CONSUMPTION") {
        const posted = postMovement({
          inventoryId: record.sourceInventoryId,
          // An outcome — wasted, lost, unaccounted, expired — posts as its own type.
          type: consumptionTransactionType(category),
          quantity: -consumedQty,
          batch: record.batch,
          links: { ...originLinks(record), issueId: record.issueId, consumptionId },
          gradeId: record.gradeId,
          lotId: record.lotId,
        })
        // Not posted: nothing is recorded, the issue stays ISSUED.
        if (!posted.ok) return { ok: false, error: `Consumption not posted. ${posted.error}` }
        transactionId = posted.value.txnId
        postedAt = posted.value.at
      }

      const at = new Date(input.at!).toISOString()
      const next: IssueRecord = {
        ...record,
        status: "CONSUMED",
        consumption: {
          consumptionId,
          consumedQty,
          category,
          unitCost: materialEntry(record.materialId)?.unitCost,
          consumingAreaId: record.consumingAreaId,
          productionRef,
          comments: input.comments.trim(),
          at,
          postedAt,
          by: OPERATOR,
          transactionId,
        },
        audit: [
          ...record.audit,
          { at: postedAt, by: OPERATOR, action: `Consumption recorded — ${consumedQty.toLocaleString()} ${record.uom} (${consumptionId})`, from: "ISSUED", to: "CONSUMED" },
          {
            at: postedAt,
            by: OPERATOR,
            action: transactionId
              ? `Inventory transaction posted — ${transactionId}`
              : `Consumption posted — inventory moved at issue (${record.issue?.transactionId ?? "—"})`,
            transactionId: transactionId ?? record.issue?.transactionId,
          },
        ],
      }
      patch(issueId, () => next)
      return { ok: true, value: next }
    },
    [records, canWriteInventory, balanceOf, postMovement, patch],
  )

  /**
   * Return unused material to its source. A return is a real inventory movement
   * of its own — it is never netted off silently — so the balance goes up by a
   * RETURN transaction and net consumption falls by the same amount.
   */
  const returnMaterial = useCallback(
    (issueId: string, quantity: number | null, reason: string): Result<IssueRecord> => {
      const record = records.find((r) => r.issueId === issueId)
      if (!record) return { ok: false, error: "Issue not found." }
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to return material." }
      if (!record.issue) return { ok: false, error: "Nothing has been issued against this record yet." }
      if (quantity === null || quantity <= 0) return { ok: false, error: "Quantity must be a number greater than zero." }
      if (!reason.trim()) return { ok: false, error: "Enter a reason for the return." }

      // A return puts back part of the GROSS OUTWARD — the quantity that has
      // actually left the balance. One rule, shared with the screen.
      const returnable = returnableQty(record)
      if (record.consumption && isLoss(record.consumption.category)) {
        return {
          ok: false,
          error: `This issue was recorded as ${CONSUMPTION_CATEGORY_META[record.consumption.category].label.toLowerCase()}, so nothing can be returned against it. Record stock that is found again as an Adjustment (+) on the inventory record.`,
        }
      }
      if (returnable <= 0 && returnedQty(record) === 0) {
        return { ok: false, error: "Nothing has left inventory for this issue yet, so there is nothing to return. Record the consumption first." }
      }
      if (quantity > returnable) {
        return {
          ok: false,
          error: `Only ${returnable.toLocaleString()} ${record.uom} of this issue's gross outward can be returned.`,
        }
      }

      const returnId = `RET-${String(
        nextNumber(records.flatMap((r) => (r.returns ?? []).map((x) => x.returnId)), "RET", 1),
      ).padStart(5, "0")}`

      // Post first: a refused posting returns nothing and changes nothing.
      const posted = postMovement({
        inventoryId: record.sourceInventoryId,
        type: "RETURN",
        quantity,
        reason: reason.trim(),
        batch: record.batch,
        gradeId: record.gradeId,
        lotId: record.lotId,
        links: { ...originLinks(record), issueId: record.issueId, returnId },
      })
      if (!posted.ok) return { ok: false, error: `Return not posted. ${posted.error}` }

      const at = posted.value.at
      const next: IssueRecord = {
        ...record,
        returns: [
          ...(record.returns ?? []),
          { returnId, quantity, reason: reason.trim(), inventoryId: record.sourceInventoryId, at, by: OPERATOR, transactionId: posted.value.txnId },
        ],
        audit: [
          ...record.audit,
          {
            at,
            by: OPERATOR,
            action: `Material returned — ${quantity.toLocaleString()} ${record.uom} back to ${record.sourceInventoryId} (${returnId}), inventory transaction ${posted.value.txnId}`,
            transactionId: posted.value.txnId,
          },
        ],
      }
      patch(issueId, () => next)
      return { ok: true, value: next }
    },
    [records, canWriteInventory, postMovement, patch],
  )

  const open = useMemo(() => records.find((r) => r.issueId === openId) ?? null, [records, openId])

  const countByStatus = useMemo(() => {
    const counts: Record<IssueStatus, number> = { REQUESTED: 0, APPROVED: 0, ISSUED: 0, CONSUMED: 0 }
    for (const r of records) counts[r.status] += 1
    return counts
  }, [records])

  const traceContext = useMemo(() => ({ issues: records, incoming, ledger, inventory }), [records, incoming, ledger, inventory])
  const trace = useCallback((query: string) => resolveTrace(query, traceContext), [traceContext])
  const openTrace = useCallback((id: string) => setTraceRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 })), [])

  return {
    records,
    incoming,
    ledger,
    inventory,
    open,
    openId,
    setOpenId,
    stockAt,
    balanceOf,
    recordOf,
    createIssue,
    approveIssue,
    issueMaterial,
    recordConsumption,
    returnMaterial,
    countByStatus,
    trace,
    traceContext,
    traceRequest,
    openTrace,
    canWriteInventory,
  }
}

const Ctx = createContext<ReturnType<typeof useIssueState> | null>(null)

export function IssueProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useIssueState()}>{children}</Ctx.Provider>
}

export function useIssues() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useIssues must be used inside <IssueProvider>")
  return v
}

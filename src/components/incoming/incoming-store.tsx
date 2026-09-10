"use client"

/**
 * Incoming Materials workflow state.
 *
 * Holds one record per incoming load and advances it through the four stages.
 * The final stage posts the received quantity through the EXISTING inventory
 * transaction mechanism (`addStock`) — this module performs no inventory
 * arithmetic and never writes a balance directly.
 *
 * If the posting fails the status is left untouched, so a record can never end
 * up RECEIVED without the matching inventory transaction.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import { resolvePurchaseOrder, seedIncoming } from "@/lib/incoming/catalog"
import type {
  IncomingRecord,
  IncomingStatus,
  Quality,
  Weighing,
} from "@/lib/incoming/types"
import { usePiles } from "@/components/shell/pile-store"

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

function useIncomingState() {
  const { addStock, canWriteInventory } = usePiles()
  const [records, setRecords] = useState<IncomingRecord[]>(() => seedIncoming())
  const [openId, setOpenId] = useState<string | null>(null)

  const nextIncomingId = useCallback(
    () => `IN-${String(41 + records.length + 1).padStart(5, "0")}`,
    [records.length],
  )

  const actor = "operator.01"

  const patch = useCallback(
    (incomingId: string, apply: (r: IncomingRecord) => IncomingRecord) => {
      setRecords((prev) => prev.map((r) => (r.incomingId === incomingId ? apply(r) : r)))
    },
    [],
  )

  /** Identify a PO and register it. One record, from here to receipt. */
  const register = useCallback(
    (poNumber: string): Result<IncomingRecord> => {
      const po = resolvePurchaseOrder(poNumber)
      if (!po) return { ok: false, error: `${poNumber} is not a valid PO number.` }
      if (records.some((r) => r.poNumber === po.poNumber && r.status !== "RECEIVED")) {
        return { ok: false, error: `${po.poNumber} is already in progress.` }
      }

      const at = new Date().toISOString()
      const record: IncomingRecord = {
        incomingId: nextIncomingId(),
        poNumber: po.poNumber,
        materialId: po.materialId,
        supplier: po.supplier,
        expectedMt: po.expectedMt,
        expectedArrival: po.expectedArrival,
        destinationLocationId: po.destinationLocationId,
        status: "REGISTERED",
        audit: [
          {
            at,
            by: actor,
            action: po.adHoc
              ? "Incoming material registered — PO not in catalogue, details captured at gate"
              : "Incoming material registered",
            to: "REGISTERED",
          },
        ],
        provenance: "DEMO",
      }
      setRecords((prev) => [record, ...prev])
      return { ok: true, value: record }
    },
    [records, nextIncomingId],
  )

  const recordWeighing = useCallback(
    (incomingId: string, input: Omit<Weighing, "at" | "by" | "netMt">): Result<true> => {
      if (input.grossMt <= 0) return { ok: false, error: "Gross weight must be greater than zero." }
      if (input.tareMt < 0) return { ok: false, error: "Tare weight cannot be negative." }
      const net = input.grossMt - input.tareMt
      if (net <= 0) return { ok: false, error: "Net weight must be greater than zero." }
      if (!input.weighbridgeRef.trim()) {
        return { ok: false, error: "Enter the weighbridge reference." }
      }

      const at = new Date().toISOString()
      patch(incomingId, (r) => ({
        ...r,
        status: "WEIGHED",
        weighing: { ...input, netMt: net, at, by: actor },
        audit: [
          ...r.audit,
          { at, by: actor, action: "Weighing completed", from: r.status, to: "WEIGHED" },
        ],
      }))
      return { ok: true, value: true }
    },
    [patch],
  )

  const recordQuality = useCallback(
    (incomingId: string, input: Omit<Quality, "at" | "by">): Result<true> => {
      if (input.readings.some((r) => !r.value.trim())) {
        return { ok: false, error: "Enter a result for every parameter." }
      }
      const at = new Date().toISOString()
      patch(incomingId, (r) => ({
        ...r,
        status: "QUALITY_CHECKED",
        quality: { ...input, at, by: "lab.02" },
        audit: [
          ...r.audit,
          {
            at,
            by: "lab.02",
            action: `Quality check completed — ${input.result.replace(/_/g, " ").toLowerCase()}`,
            from: r.status,
            to: "QUALITY_CHECKED",
          },
        ],
      }))
      return { ok: true, value: true }
    },
    [patch],
  )

  /**
   * Confirm receipt.
   *
   * Posts through the existing inventory mechanism FIRST. Only if that
   * succeeds does the record advance — a failed posting leaves the record at
   * QUALITY CHECKED with inventory untouched.
   */
  const confirmReceipt = useCallback(
    (
      incomingId: string,
      input: { receivedMt: number; destinationLocationId: string },
    ): Result<{ transactionId: string }> => {
      const record = records.find((r) => r.incomingId === incomingId)
      if (!record) return { ok: false, error: "Incoming record not found." }
      if (record.status !== "QUALITY_CHECKED") {
        return { ok: false, error: "Quality check must be completed before receipt." }
      }
      if (!canWriteInventory) {
        return { ok: false, error: "You do not have permission to post inventory receipts." }
      }
      if (!Number.isFinite(input.receivedMt) || input.receivedMt <= 0) {
        return { ok: false, error: "Enter a received quantity greater than zero." }
      }

      const posted = addStock({
        locationId: input.destinationLocationId,
        materialId: record.materialId,
        quantity: input.receivedMt,
        reference: `${record.poNumber} · ${record.incomingId}`,
        actor,
      })
      if ("error" in posted) return { ok: false, error: posted.error }

      const at = posted.at
      patch(incomingId, (r) => ({
        ...r,
        status: "RECEIVED",
        receipt: {
          receivedMt: input.receivedMt,
          varianceMt: input.receivedMt - r.expectedMt,
          destinationLocationId: input.destinationLocationId,
          transactionId: posted.txnId,
          at,
          by: actor,
        },
        audit: [
          ...r.audit,
          {
            at,
            by: actor,
            action: `Receipt confirmed — inventory transaction ${posted.txnId}`,
            from: r.status,
            to: "RECEIVED",
          },
        ],
      }))
      return { ok: true, value: { transactionId: posted.txnId } }
    },
    [records, addStock, canWriteInventory, patch],
  )

  const open = useMemo(
    () => records.find((r) => r.incomingId === openId) ?? null,
    [records, openId],
  )

  const countByStatus = useMemo(() => {
    const counts: Record<IncomingStatus, number> = {
      REGISTERED: 0,
      WEIGHED: 0,
      QUALITY_CHECKED: 0,
      RECEIVED: 0,
    }
    for (const r of records) counts[r.status] += 1
    return counts
  }, [records])

  return {
    records,
    open,
    openId,
    setOpenId,
    register,
    recordWeighing,
    recordQuality,
    confirmReceipt,
    countByStatus,
    canWriteInventory,
  }
}

const Ctx = createContext<ReturnType<typeof useIncomingState> | null>(null)

export function IncomingProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useIncomingState()}>{children}</Ctx.Provider>
}

export function useIncoming() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useIncoming must be used inside <IncomingProvider>")
  return v
}

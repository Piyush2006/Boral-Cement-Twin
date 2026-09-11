"use client"

/**
 * Incoming Materials workflow state.
 *
 *   QR scan / PO entry → IDENTIFIED → WEIGHING → QUALITY → RECEIVED
 *
 * Receipt posts an INCOMING transaction into an inventory record through the
 * shared inventory mechanism (`postMovement`). This module keeps no quantity of
 * its own. If the posting is refused the record stays where it was and
 * inventory is untouched.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import { usePiles } from "@/components/shell/pile-store"
import { qualityParameters, resolvePurchaseOrder, sampleRequiredFor } from "@/lib/incoming/catalog"
import { gradeEntry, materialEntry } from "@/lib/inventory/catalog"
import { createLot } from "@/lib/inventory/lots"
import { expiryFromPo } from "@/lib/inventory/expiry"
import { readingPasses } from "@/lib/masters/types"
import type { IncomingRecord, IncomingStatus, QualityReading, QualityResult } from "@/lib/incoming/types"
import { seedBundle } from "@/lib/inventory/seed"

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const OPERATOR = "operator.01"

export type IdentifyInput = {
  poNumber: string
  identifiedBy: "QR" | "MANUAL"
  receivingInventoryId: string
  gateEntryNo: string
  grnNo: string
  vehicleRef: string
  batch: string
  origin: string
}

function useIncomingState() {
  const { postMovement, canWriteInventory, recordOf } = usePiles()
  const [records, setRecords] = useState<IncomingRecord[]>(() => seedBundle().incoming)
  const [openId, setOpenId] = useState<string | null>(null)

  const patch = useCallback((incomingId: string, apply: (r: IncomingRecord) => IncomingRecord) => {
    setRecords((prev) => prev.map((r) => (r.incomingId === incomingId ? apply(r) : r)))
  }, [])

  /**
   * A receiving balance must be an active record holding the PO's material AND
   * its grade. Receiving one grade into a balance of another would blend two
   * specifications into a figure that no longer means anything.
   */
  const checkReceiving = useCallback(
    (materialId: string, inventoryId: string, gradeId?: string): string | null => {
      const inv = recordOf(inventoryId)
      if (!inv) return "Select the receiving location."
      if (!inv.active) return `${inv.inventoryId} is archived.`
      if (inv.materialId !== materialId) return `${inv.inventoryId} does not hold this material.`
      if (gradeId && inv.gradeId && inv.gradeId !== gradeId) {
        return `${inv.inventoryId} holds ${gradeEntry(inv.gradeId)?.name ?? inv.gradeId}, not ${gradeEntry(gradeId)?.name ?? gradeId}.`
      }
      return null
    },
    [recordOf],
  )

  /** Identify a delivery (QR or PO number) and open its record. */
  const register = useCallback(
    (input: IdentifyInput): Result<IncomingRecord> => {
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to receive materials." }
      const po = resolvePurchaseOrder(input.poNumber)
      if (!po) return { ok: false, error: `${input.poNumber} is not a valid PO number.` }
      if (records.some((r) => r.poNumber === po.poNumber && r.status !== "RECEIVED")) {
        return { ok: false, error: `${po.poNumber} already has a delivery in progress.` }
      }
      const receivingError = checkReceiving(po.materialId, input.receivingInventoryId, po.gradeId)
      if (receivingError) return { ok: false, error: receivingError }

      const gateEntryNo = input.gateEntryNo.trim().toUpperCase()
      const grnNo = input.grnNo.trim().toUpperCase()
      if (gateEntryNo && records.some((r) => r.gateEntryNo === gateEntryNo)) {
        return { ok: false, error: `Gate Entry ${gateEntryNo} is already used by another delivery.` }
      }
      if (grnNo && records.some((r) => r.grnNo === grnNo)) {
        return { ok: false, error: `GRN ${grnNo} is already used by another delivery.` }
      }

      const at = new Date().toISOString()
      const next = Math.max(41, ...records.map((r) => Number(r.incomingId.slice(3)) || 0)) + 1
      const gradeId = po.gradeId ?? recordOf(input.receivingInventoryId)?.gradeId
      // Sampling follows the grade's plan, counted over that grade's deliveries.
      const nth = records.filter((r) => r.gradeId === gradeId).length + 1
      const sampleRequired = sampleRequiredFor(gradeId, nth)
      const record: IncomingRecord = {
        incomingId: `IN-${String(next).padStart(5, "0")}`,
        poNumber: po.poNumber,
        gateEntryNo: gateEntryNo || undefined,
        grnNo: grnNo || undefined,
        sampleRequired,
        identifiedBy: input.identifiedBy,
        materialId: po.materialId,
        gradeId,
        supplier: po.supplier,
        expectedMt: po.expectedMt,
        expectedArrival: po.expectedArrival,
        poExpiryDate: po.expiryDate,
        poShelfLifeDays: po.shelfLifeDays,
        destinationLocationId: po.destinationLocationId,
        receivingInventoryId: input.receivingInventoryId,
        vehicleRef: input.vehicleRef.trim() || undefined,
        batch: input.batch.trim() || undefined,
        origin: input.origin.trim() || undefined,
        status: "IDENTIFIED",
        adHoc: po.adHoc || undefined,
        audit: [
          {
            at,
            by: OPERATOR,
            action: `Delivery identified by ${input.identifiedBy === "QR" ? "QR scan" : "PO number"}${
              po.adHoc ? " — PO not in catalogue, details generated at the gate" : ""
            }`,
            to: "IDENTIFIED",
          },
        ],
        provenance: "DEMO",
      }
      setRecords((prev) => [record, ...prev])
      return { ok: true, value: record }
    },
    [records, canWriteInventory, checkReceiving, recordOf],
  )

  /** Record that a sample was drawn for testing. Only for deliveries the sampling plan selects. */
  const collectSample = useCallback(
    (incomingId: string): Result<string> => {
      const record = records.find((r) => r.incomingId === incomingId)
      if (!record) return { ok: false, error: "Incoming record not found." }
      if (!record.sampleRequired) return { ok: false, error: "No sample is required for this delivery." }
      if (record.sample) return { ok: false, error: `Sample ${record.sample.sampleId} is already collected.` }
      if (record.status === "QUALITY" || record.status === "RECEIVED") return { ok: false, error: "Quality is already recorded." }
      const used = records.map((r) => Number(r.sample?.sampleId.slice(4)) || 0)
      const sampleId = `SMP-${String(Math.max(333, ...used) + 1).padStart(5, "0")}`
      const at = new Date().toISOString()
      patch(incomingId, (r) => ({
        ...r,
        sample: { sampleId, collectedAt: at, collectedBy: "lab.02" },
        audit: [...r.audit, { at, by: "lab.02", action: `Sample collected — ${sampleId}` }],
      }))
      return { ok: true, value: sampleId }
    },
    [records, patch],
  )

  const recordWeighing = useCallback(
    (incomingId: string, input: { grossMt: number | null; tareMt: number | null }): Result<true> => {
      const record = records.find((r) => r.incomingId === incomingId)
      if (!record || record.status !== "IDENTIFIED") return { ok: false, error: "This delivery is not awaiting weighing." }
      if (input.grossMt === null || input.grossMt <= 0) return { ok: false, error: "Gross weight must be a number greater than zero." }
      if (input.tareMt === null || input.tareMt < 0) return { ok: false, error: "Tare weight must be a number, zero or more." }
      const net = input.grossMt - input.tareMt
      if (net <= 0) return { ok: false, error: "Net weight must be greater than zero — check gross and tare." }

      const at = new Date().toISOString()
      patch(incomingId, (r) => ({
        ...r,
        status: "WEIGHING",
        weighing: { grossMt: input.grossMt!, tareMt: input.tareMt!, netMt: net, at, by: OPERATOR },
        audit: [...r.audit, { at, by: OPERATOR, action: `Weight recorded — net ${net.toLocaleString()} MT`, from: r.status, to: "WEIGHING" }],
      }))
      return { ok: true, value: true }
    },
    [records, patch],
  )

  const recordQuality = useCallback(
    (incomingId: string, input: { result: QualityResult | ""; notes: string; readings: QualityReading[] }): Result<true> => {
      const record = records.find((r) => r.incomingId === incomingId)
      if (!record || record.status !== "WEIGHING") return { ok: false, error: "This delivery is not awaiting quality." }
      if (input.result !== "PASS" && input.result !== "FAIL") return { ok: false, error: "Select PASS or FAIL." }
      // A delivery the plan samples cannot be accepted until its sample is drawn
      // and tested; one the plan skips is accepted on inspection.
      const tested = record.sampleRequired || input.readings.some((r) => r.value.trim())
      if (record.sampleRequired && !record.sample) return { ok: false, error: "Collect the sample before recording the test result." }
      if (record.sampleRequired) {
        const required = qualityParameters(record.gradeId)
        if (required.some((p) => !input.readings.find((r) => r.parameter === p.parameter)?.value.trim())) {
          return { ok: false, error: "Enter a result for every grade parameter." }
        }
      }
      const at = new Date().toISOString()
      const result = input.result
      patch(incomingId, (r) => ({
        ...r,
        status: "QUALITY",
        quality: { result, notes: input.notes.trim(), tested, readings: input.readings, at, by: "lab.02" },
        audit: [
          ...r.audit,
          {
            at,
            by: "lab.02",
            action: tested ? `Test result recorded — ${result}` : `Accepted without test — ${result} (no sample required)`,
            from: r.status,
            to: "QUALITY",
          },
        ],
      }))
      return { ok: true, value: true }
    },
    [records, patch],
  )

  /**
   * Confirm receipt: post INCOMING first; advance to RECEIVED only if it posted.
   */
  const confirmReceipt = useCallback(
    (
      incomingId: string,
      input: { receivedMt: number | null; receivingInventoryId: string; lotId?: string; expiryDate?: string },
    ): Result<{ transactionId: string; lotId?: string }> => {
      const record = records.find((r) => r.incomingId === incomingId)
      if (!record) return { ok: false, error: "Incoming record not found." }
      if (record.status !== "QUALITY") return { ok: false, error: "Quality must be recorded before receipt." }
      if (record.quality?.result !== "PASS") return { ok: false, error: "Quality FAILED — this delivery cannot be received into inventory." }
      if (!canWriteInventory) return { ok: false, error: "You do not have permission to post inventory receipts." }
      if (input.receivedMt === null || input.receivedMt <= 0) {
        return { ok: false, error: "Received quantity must be a number greater than zero." }
      }
      const receivingError = checkReceiving(record.materialId, input.receivingInventoryId, record.gradeId)
      if (receivingError) return { ok: false, error: receivingError }

      // A lot / batch reference is recorded only where the material is
      // lot-tracked. Otherwise the receipt traces on PO, Gate Entry, GRN and
      // Incoming ID, and no lot is created or asked for.
      const balance = recordOf(input.receivingInventoryId)
      const gradeId = record.gradeId ?? balance?.gradeId ?? ""
      const material = materialEntry(record.materialId)
      if (input.lotId?.trim() && !material?.lotTracking) {
        return { ok: false, error: `${material?.name ?? "This material"} is not lot-tracked, so it takes no lot reference.` }
      }

      // Expiry — only where the material says it applies. It comes from the PO
      // (the expiry date it states, or its shelf life counted from today) and
      // travels with the receipt into inventory as a dated batch — nobody types
      // it again. Only where the PO carries neither may the date printed on the
      // delivery docket be recorded here; without either the batch is received
      // and shows as "No Expiry Date" in monitoring.
      const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
      let expiryDate: string | undefined
      if (material?.expiryApplicable) {
        expiryDate = expiryFromPo({ expiryDate: record.poExpiryDate, shelfLifeDays: record.poShelfLifeDays }, new Date())
        if (!expiryDate && input.expiryDate) {
          if (!Number.isFinite(new Date(input.expiryDate).getTime())) return { ok: false, error: "The docket expiry date is not a valid date." }
          expiryDate = new Date(input.expiryDate).toISOString()
        }
        if (expiryDate && new Date(expiryDate).getTime() <= Date.now()) {
          return { ok: false, error: `This batch expired on ${day(expiryDate)}. Expired material is not received into inventory.` }
        }
      } else if (input.expiryDate) {
        return { ok: false, error: `Expiry does not apply to ${material?.name ?? "this material"}.` }
      }
      const at = new Date().toISOString()
      const lot = !material?.lotTracking ? undefined : createLot({
        lotId: input.lotId,
        materialId: record.materialId,
        gradeId,
        receivedQty: input.receivedMt,
        uom: balance?.uom ?? material?.uom ?? "MT",
        locationId: balance?.locationId ?? record.destinationLocationId,
        inventoryId: input.receivingInventoryId,
        poNumber: record.poNumber,
        incomingId: record.incomingId,
        supplier: record.supplier,
        supplierBatch: record.batch,
        quality: (record.quality?.readings ?? []).map((r) => {
          const spec = qualityParameters(gradeId).find((p) => p.parameter === r.parameter)
          const value = Number(r.value)
          const numeric = Number.isFinite(value) ? value : null
          return {
            parameterId: spec?.parameterId ?? r.parameter,
            name: r.parameter,
            unit: r.unit,
            value: numeric,
            min: spec?.min ?? null,
            max: spec?.max ?? null,
            target: spec?.target ?? null,
            pass: readingPasses(numeric, spec?.min ?? null, spec?.max ?? null),
          }
        }),
        qualityResult: "PASS",
        expiryDate,
        receivedAt: at,
        receivedBy: OPERATOR,
        provenance: "DEMO",
      })

      const posted = postMovement({
        inventoryId: input.receivingInventoryId,
        type: "INCOMING",
        quantity: input.receivedMt,
        batch: record.batch,
        reference: record.vehicleRef,
        lotId: lot?.lotId,
        gradeId: gradeId || undefined,
        expiryDate,
        links: {
          poNumber: record.poNumber,
          gateEntryNo: record.gateEntryNo,
          grnNo: record.grnNo,
          incomingId: record.incomingId,
          qualityRef: `${record.incomingId} · ${record.quality?.result ?? "PASS"}`,
          lotId: lot?.lotId,
        },
      })
      if (!posted.ok) return posted

      const txn = posted.value
      patch(incomingId, (r) => ({
        ...r,
        status: "RECEIVED",
        receivingInventoryId: input.receivingInventoryId,
        receipt: {
          receivedMt: input.receivedMt!,
          varianceMt: input.receivedMt! - r.expectedMt,
          inventoryId: txn.inventoryId,
          locationId: txn.locationId,
          lotId: lot?.lotId,
          expiryDate,
          transactionId: txn.txnId,
          at: txn.at,
          by: OPERATOR,
        },
        audit: [
          ...r.audit,
          {
            at: txn.at,
            by: OPERATOR,
            action: lot
              ? `Receipt confirmed — lot ${lot.lotId}, inventory transaction ${txn.txnId}`
              : `Receipt confirmed — inventory transaction ${txn.txnId}`,
            from: r.status,
            to: "RECEIVED",
          },
        ],
      }))
      return { ok: true, value: { transactionId: txn.txnId, lotId: lot?.lotId } }
    },
    [records, canWriteInventory, checkReceiving, postMovement, patch, recordOf],
  )

  const open = useMemo(() => records.find((r) => r.incomingId === openId) ?? null, [records, openId])

  const countByStatus = useMemo(() => {
    const counts: Record<IncomingStatus, number> = { IDENTIFIED: 0, WEIGHING: 0, QUALITY: 0, RECEIVED: 0 }
    for (const r of records) counts[r.status] += 1
    return counts
  }, [records])

  return {
    records,
    open,
    openId,
    setOpenId,
    register,
    collectSample,
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

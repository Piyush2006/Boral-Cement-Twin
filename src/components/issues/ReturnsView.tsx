"use client"

/**
 * Issue & Consumption › Returns — return management.
 *
 *   Gross Outward → Issued Material → Returned Material → Net Consumption
 *   Net Consumption = Gross Outward − Returned
 *
 * Three views of the same records: net consumption by material, the issues
 * that still have something that could come back, and the register of every
 * return with its inventory transaction. A return always keeps its link to
 * the issue, material, grade, inventory record, location and lot / batch.
 */

import { useEffect, useMemo, useState } from "react"

import { Empty, LinkButton, PrimaryButton, Row, Table, Td, Th } from "@/components/inventory/Table"
import { usePiles } from "@/components/shell/pile-store"
import { gradeEntry, locationName, materialEntry } from "@/lib/inventory/catalog"
import { consumingArea } from "@/lib/issues/catalog"
import { isLoss } from "@/lib/issues/consumption"
import { returnableQty, returnedQty, type IssueRecord } from "@/lib/issues/types"
import { useIssues } from "./issue-store"
import type { JustAdded } from "@/components/shell/just-added"

const fmt = (n: number) => Math.round(n).toLocaleString()
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })

/** What actually left stock for an issue — the gross outward that returns net off. */
const grossOutward = (r: IssueRecord) => (r.postingPoint === "ISSUE" ? r.issue?.issuedQty ?? 0 : r.consumption?.consumedQty ?? 0)

export function ReturnsView({
  added,
  onRecordReturn,
  onReturnFor,
  onOpenIssue,
}: {
  /** The return just posted, highlighted in the register. */
  added?: JustAdded
  onRecordReturn: () => void
  onReturnFor: (issueId: string) => void
  onOpenIssue: (issueId: string) => void
}) {
  const { records, canWriteInventory } = useIssues()
  const { ledger } = usePiles()
  const [query, setQuery] = useState("")
  // A return just posted must be visible: drop any register search that would hide it.
  const addedId = added?.id
  useEffect(() => {
    if (addedId?.startsWith("RET-")) setQuery("")
  }, [addedId])

  /* Net consumption by material. Loss outcomes are losses, not consumption, so they are left out here. */
  const byMaterial = useMemo(() => {
    const rows = new Map<string, { materialId: string; uom: string; gross: number; returned: number; returns: number; issues: number }>()
    for (const r of records) {
      if (!r.consumption && r.postingPoint === "CONSUMPTION") continue
      if (!r.issue) continue
      if (r.consumption && isLoss(r.consumption.category)) continue
      const key = `${r.materialId}|${r.uom}`
      const row = rows.get(key) ?? { materialId: r.materialId, uom: r.uom, gross: 0, returned: 0, returns: 0, issues: 0 }
      row.gross += grossOutward(r)
      row.returned += returnedQty(r)
      row.returns += (r.returns ?? []).length
      row.issues += 1
      rows.set(key, row)
    }
    return [...rows.values()].sort((a, b) => b.returned - a.returned || b.gross - a.gross)
  }, [records])

  const open = useMemo(() => records.filter((r) => returnableQty(r) > 0), [records])

  const txnOf = useMemo(() => new Map(ledger.map((t) => [t.txnId, t])), [ledger])
  const register = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records
      .flatMap((r) => (r.returns ?? []).map((x) => ({ issue: r, ret: x, txn: x.transactionId ? txnOf.get(x.transactionId) : undefined })))
      .filter(({ issue, ret }) => {
        if (!q) return true
        const m = materialEntry(issue.materialId)
        return [ret.returnId, issue.issueId, issue.sourceInventoryId, issue.sourceLocationId, m?.name, m?.code, ret.reason, issue.lotId, issue.batch].some((v) =>
          v?.toLowerCase().includes(q),
        )
      })
      .sort((a, b) => b.ret.at.localeCompare(a.ret.at))
  }, [records, txnOf, query])

  const totalReturns = records.reduce((n, r) => n + (r.returns ?? []).length, 0)

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[820px] text-[12px] text-ink-3">
          Material issued for a job and not used comes back to its source balance as a RETURN transaction, never a silent netting-off.
          Net Consumption = Gross Outward − Returned. Only what actually left stock can be returned; material written off as wasted,
          lost, expired or unaccounted cannot.
        </p>
        {canWriteInventory && (
          <PrimaryButton onClick={onRecordReturn} disabled={open.length === 0}>
            + Record Return
          </PrimaryButton>
        )}
      </div>

      <div>
        <h2 className="text-[14px] font-bold text-ink">Net Consumption by Material</h2>
        <p className="mb-2.5 text-[11.5px] text-ink-3">Every issue that has left stock. Losses are reported separately under Reports &amp; Insights.</p>
        <Table
          head={
            <>
              <Th>Material</Th>
              <Th className="w-[64px]">UOM</Th>
              <Th className="text-right">Issues</Th>
              <Th className="text-right">Gross Outward</Th>
              <Th className="text-right">Returned</Th>
              <Th className="text-right">Net Consumed</Th>
              <Th className="text-right">Returns</Th>
            </>
          }
          empty={byMaterial.length === 0 ? <Empty>Nothing has left stock yet.</Empty> : undefined}
        >
          {byMaterial.map((m) => (
            <Row key={`${m.materialId}|${m.uom}`}>
              <Td className="text-ink">{materialEntry(m.materialId)?.name ?? m.materialId}</Td>
              <Td className="text-ink-3">{m.uom}</Td>
              <Td className="text-right font-mono text-ink-2">{m.issues}</Td>
              <Td className="text-right font-mono text-ink-2">{fmt(m.gross)}</Td>
              <Td className="text-right font-mono text-ink-2">{m.returned ? `− ${fmt(m.returned)}` : "0"}</Td>
              <Td className="text-right font-mono font-semibold text-ink">{fmt(m.gross - m.returned)}</Td>
              <Td className="text-right font-mono text-ink-2">{m.returns}</Td>
            </Row>
          ))}
        </Table>
      </div>

      <div>
        <h2 className="text-[14px] font-bold text-ink">Open for Return</h2>
        <p className="mb-2.5 text-[11.5px] text-ink-3">Issues whose material has left stock and could still come back, part or whole.</p>
        <Table
          head={
            <>
              <Th>Issue ID</Th>
              <Th>Material</Th>
              <Th>Source</Th>
              <Th>Consuming Area</Th>
              <Th className="text-right">Gross Outward</Th>
              <Th className="text-right">Returned</Th>
              <Th className="text-right">Available to Return</Th>
              <Th className="text-right">Actions</Th>
            </>
          }
          empty={open.length === 0 ? <Empty>No issue has material that could be returned.</Empty> : undefined}
        >
          {open.map((r) => (
            <Row key={r.issueId}>
              <Td>
                <button onClick={() => onOpenIssue(r.issueId)} className="font-mono text-ink hover:text-accent hover:underline">
                  {r.issueId}
                </button>
              </Td>
              <Td>
                <span className="block text-ink">{materialEntry(r.materialId)?.name}</span>
                <span className="block text-[11px] text-ink-3">{gradeEntry(r.gradeId)?.name}</span>
              </Td>
              <Td className="text-ink-2">
                <span className="block">{locationName(r.sourceLocationId)}</span>
                <span className="block font-mono text-[11px] text-ink-3">{r.sourceInventoryId}</span>
              </Td>
              <Td className="text-ink-2">{consumingArea(r.consumingAreaId)?.name ?? r.consumingAreaId}</Td>
              <Td className="text-right font-mono text-ink-2">
                {fmt(grossOutward(r))} {r.uom}
              </Td>
              <Td className="text-right font-mono text-ink-2">{fmt(returnedQty(r))}</Td>
              <Td className="text-right font-mono font-semibold text-ink">{fmt(returnableQty(r))}</Td>
              <Td className="text-right">
                {canWriteInventory ? <LinkButton onClick={() => onReturnFor(r.issueId)}>Return</LinkButton> : <span className="text-ink-3">—</span>}
              </Td>
            </Row>
          ))}
        </Table>
      </div>

      <div>
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-bold text-ink">Return Register</h2>
            <p className="text-[11.5px] text-ink-3">
              {totalReturns} {totalReturns === 1 ? "return" : "returns"}, newest first — each with the issue it came from and the RETURN
              transaction that put the stock back.
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search returns"
            placeholder="Search Return ID, issue, material, lot…"
            className="w-full max-w-[320px] rounded-lg bg-panel px-3 py-2 text-[12.5px] text-ink outline-none ring-1 ring-line placeholder:text-ink-3 focus:ring-accent"
          />
        </div>
        <Table
          head={
            <>
              <Th>Return ID</Th>
              <Th>Date / Time</Th>
              <Th>Issue ID</Th>
              <Th>Material</Th>
              <Th>Returned To</Th>
              <Th>Lot / Batch</Th>
              <Th className="text-right">Quantity</Th>
              <Th className="text-right">Before → After</Th>
              <Th>Reason</Th>
              <Th>User</Th>
              <Th>Transaction</Th>
            </>
          }
          empty={register.length === 0 ? <Empty>{query ? "No return matches this search." : "No material has been returned yet."}</Empty> : undefined}
        >
          {register.map(({ issue, ret, txn }) => (
            <Row key={ret.returnId} addedKey={ret.returnId} added={added?.is(ret.returnId)}>
              <Td className="font-mono text-ink">{ret.returnId}</Td>
              <Td className="whitespace-nowrap text-ink-2">{stamp(ret.at)}</Td>
              <Td>
                <button onClick={() => onOpenIssue(issue.issueId)} className="font-mono text-ink hover:text-accent hover:underline">
                  {issue.issueId}
                </button>
              </Td>
              <Td>
                <span className="block text-ink">{materialEntry(issue.materialId)?.name}</span>
                <span className="block text-[11px] text-ink-3">{gradeEntry(issue.gradeId)?.name}</span>
              </Td>
              <Td className="text-ink-2">
                <span className="block">{locationName(issue.sourceLocationId)}</span>
                <span className="block font-mono text-[11px] text-ink-3">{ret.inventoryId}</span>
              </Td>
              <Td className="font-mono text-ink-2">{issue.lotId ?? issue.batch ?? "—"}</Td>
              <Td className="text-right font-mono font-semibold text-ink">
                +{fmt(ret.quantity)} {issue.uom}
              </Td>
              <Td className="whitespace-nowrap text-right font-mono text-ink-2">{txn ? `${fmt(txn.balanceBefore)} → ${fmt(txn.balanceAfter)}` : "—"}</Td>
              <Td className="text-ink-2">{ret.reason}</Td>
              <Td className="font-mono text-ink-3">{ret.by}</Td>
              <Td className="font-mono text-ink-2">{ret.transactionId ?? "—"}</Td>
            </Row>
          ))}
        </Table>
      </div>
    </section>
  )
}

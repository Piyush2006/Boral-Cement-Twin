"use client"

/**
 * Inventory detail.
 *
 * Reads the existing balance record and the shared transaction ledger — no
 * inventory maths of its own. Fields the underlying system does not supply
 * (QC Hold, Blocked, Days of Supply) are shown as unavailable rather than
 * filled with a made-up figure.
 */

import { locationEntry, materialEntry } from "@/lib/inventory/catalog"
import { STATUS_META } from "@/lib/inventory/pile-inventory"
import type { PileStatus } from "@/lib/assets/piles"
import { transactionLabel, type InventoryTransaction } from "@/lib/inventory/ledger"
import type { InventoryRow } from "./InventoryScreen"

export function InventoryDetailModal({
  row,
  ledger,
  onClose,
}: {
  row: InventoryRow
  ledger: InventoryTransaction[]
  onClose: () => void
}) {
  const material = materialEntry(row.materialId)
  const location = locationEntry(row.locationId)
  const status = STATUS_META[row.status as PileStatus]
  const history = ledger.filter((t) => t.locationId === row.locationId).slice(0, 8)

  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${row.materialName} inventory detail`}
        className="twin-scroll max-h-[86vh] w-full max-w-[620px] overflow-y-auto rounded-xl bg-panel ring-1 ring-line-2"
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-panel px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{row.materialName}</h2>
            <div className="font-mono text-[11.5px] text-ink-3">
              {row.materialCode} · {row.locationId}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[20px] leading-none text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="p-5">
          <Section title="Material">
            <Grid>
              <Item label="Material ID" value={row.materialCode} mono />
              <Item label="Material Group" value={material?.group ?? "—"} />
              <Item label="UOM" value={row.uom} />
              <Item label="Material Description" value={material?.description ?? "—"} span />
            </Grid>
          </Section>

          <Section title="Location">
            <Grid>
              <Item label="Location" value={location?.name ?? row.locationId} span />
              <Item label="Area" value={location?.area ?? "—"} />
              <Item label="Location ID" value={row.locationId} mono />
            </Grid>
          </Section>

          <Section title="Balance">
            <Grid>
              <Item label="On Hand" value={`${Math.round(row.quantity).toLocaleString()} ${row.uom}`} strong />
              <Item label="Unrestricted" value={`${Math.round(row.quantity).toLocaleString()} ${row.uom}`} />
              {/* Not modelled by the current inventory system — not invented here. */}
              <Item label="QC Hold" value="Not tracked" muted />
              <Item label="Blocked" value="Not tracked" muted />
              <Item label="Capacity" value={`${row.capacity.toLocaleString()} ${row.uom}`} />
              <Item label="Days of Supply" value="Not available" muted />
            </Grid>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-ink-3">Status</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold"
                style={{ color: status.colour, background: `${status.colour}1f` }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: status.colour }} />
                {status.label}
              </span>
              <span className="ml-auto rounded bg-demo px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-[#1a1204]">
                Demo / Simulated
              </span>
            </div>
          </Section>

          <Section title="Recent Inventory Transactions">
            {history.length === 0 ? (
              <p className="text-[12.5px] italic text-ink-3">
                No transactions recorded against this location yet.
              </p>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-3">
                    <th className="border-b border-line py-1.5">Transaction</th>
                    <th className="border-b border-line py-1.5">Type</th>
                    <th className="border-b border-line py-1.5 text-right">Qty</th>
                    <th className="border-b border-line py-1.5 text-right">Balance</th>
                    <th className="border-b border-line py-1.5">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t.txnId}>
                      <td className="border-b border-line py-1.5 font-mono text-[10.5px] text-ink-2">
                        {t.txnId}
                      </td>
                      <td className="border-b border-line py-1.5 text-ink-2">
                        {transactionLabel(t.type)}
                      </td>
                      <td
                        className="border-b border-line py-1.5 text-right font-mono"
                        style={{ color: t.quantity >= 0 ? "#22c55e" : "#f87171" }}
                      >
                        {t.quantity > 0 ? "+" : ""}
                        {Math.round(t.quantity).toLocaleString()}
                      </td>
                      <td className="border-b border-line py-1.5 text-right font-mono text-ink">
                        {Math.round(t.balanceAfter).toLocaleString()}
                      </td>
                      <td className="border-b border-line py-1.5 text-ink-2">{t.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{title}</h3>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">{children}</div>
}

function Item({
  label,
  value,
  mono,
  strong,
  muted,
  span,
}: {
  label: string
  value: string
  mono?: boolean
  strong?: boolean
  muted?: boolean
  span?: boolean
}) {
  return (
    <div className={span ? "col-span-2 sm:col-span-3" : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div
        className={`text-[13px] ${mono ? "font-mono" : ""} ${
          strong ? "font-bold text-ink" : muted ? "italic text-ink-3" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  )
}

"use client"

/** Table chrome shared by the Inventory module's list views. */

export function Table({ head, children, empty }: { head: React.ReactNode; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-line">
      <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
        <thead className="bg-panel-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  )
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 ${className}`}>{children}</th>
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>
}

export function Row({ children, dim, addedKey, added }: { children: React.ReactNode; dim?: boolean; addedKey?: string; added?: boolean }) {
  return (
    <tr data-added-key={addedKey} className={`border-t border-line bg-panel/60 hover:bg-panel-2 ${dim ? "opacity-60" : ""} ${added ? "added-row" : ""}`}>
      {children}
    </tr>
  )
}

export function LinkButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded px-2 py-1 text-[12px] font-medium text-accent hover:underline">
      {children}
    </button>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="bg-panel/60 px-3 py-8 text-center text-[12.5px] text-ink-3">{children}</p>
}

export function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg bg-panel-2 px-3 py-2 text-[12.5px] font-medium text-ink ring-1 ring-line hover:bg-line">
      {children}
    </button>
  )
}

/** A pill for an active / archived state, never colour alone. */
export function ActiveTag({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wide ring-1 ${
        active ? "bg-ok/15 text-ink ring-ok/40" : "bg-panel-2 text-ink-3 ring-line"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  )
}

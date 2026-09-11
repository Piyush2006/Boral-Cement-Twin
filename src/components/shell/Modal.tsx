"use client"

/**
 * Modal chrome shared by every operational module: dialog frame, labelled
 * fields (required ones carry *), read-only values, error banner, actions.
 */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = 520,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  return (
    <div className="fixed inset-0 z-[3200] grid place-items-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="twin-scroll max-h-[90vh] w-full overflow-y-auto rounded-xl bg-panel ring-1 ring-line-2"
        style={{ maxWidth: width }}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-panel px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{title}</h2>
            {subtitle && <div className="font-mono text-[11.5px] text-ink-3">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[20px] leading-none text-ink-2 hover:text-ink">
            ×
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
        {required && (
          <span className="ml-0.5 text-crit" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  )
}

export const INPUT =
  "w-full rounded-lg bg-panel-2 px-3 py-2.5 text-[13px] text-ink outline-none ring-1 ring-line focus:ring-accent disabled:opacity-50"

export function Readonly({ value, mono }: { value?: string; mono?: boolean }) {
  return (
    <div className={`rounded-lg bg-panel-2/60 px-3 py-2.5 text-[13px] text-ink-2 ring-1 ring-line ${mono ? "font-mono" : ""}`}>
      {value ?? <span className="text-ink-3">—</span>}
    </div>
  )
}

export function Err({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 flex gap-2 rounded-md border border-crit/50 bg-crit/10 p-2.5 text-[12px] text-ink">
      <span aria-hidden className="font-bold text-crit">
        !
      </span>
      <span>{children}</span>
    </p>
  )
}

export function Actions({
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = "Cancel",
  disabled,
}: {
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  cancelLabel?: string
  disabled?: boolean
}) {
  return (
    <div className="mt-5 flex gap-2.5">
      <button
        onClick={onCancel}
        className="flex-1 rounded-lg bg-panel-2 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-line-2 hover:bg-line"
      >
        {cancelLabel}
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="flex-1 rounded-lg bg-accent py-2.5 text-[13px] font-semibold text-accent-ink hover:brightness-110 disabled:opacity-40"
      >
        {submitLabel}
      </button>
    </div>
  )
}

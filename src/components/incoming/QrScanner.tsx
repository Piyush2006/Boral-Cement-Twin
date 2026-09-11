"use client"

/**
 * Camera QR scanner, with an image-upload fallback.
 *
 * Uses the rear camera where there is one. Every failure — no camera, access
 * blocked, insecure page — is reported plainly, and the caller always offers
 * manual PO entry alongside, so scanning is never the only way in.
 */

import { useEffect, useId, useRef, useState } from "react"

import QRCode from "qrcode"

type Html5QrcodeInstance = import("html5-qrcode").Html5Qrcode

type ScanState = { kind: "starting" } | { kind: "scanning" } | { kind: "error"; message: string }

function describe(err: unknown): string {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "The camera needs a secure (https) page. Enter the PO number instead."
  }
  if (/NotAllowed|Permission/i.test(text)) return "Camera access was blocked. Allow the camera for this site, or enter the PO number."
  if (/NotFound|no camera|Requested device not found|OverconstrainedError/i.test(text)) {
    return "No camera was found on this device. Upload a QR image, or enter the PO number."
  }
  if (/NotReadable|in use/i.test(text)) return "The camera is in use by another application."
  return "The camera could not be started. Upload a QR image, or enter the PO number."
}

export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const elementId = `qr-reader-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const doneRef = useRef(false)
  const [state, setState] = useState<ScanState>({ kind: "starting" })
  const [fileError, setFileError] = useState<string | null>(null)
  const resultRef = useRef(onResult)
  resultRef.current = onResult

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode")
        if (cancelled) return
        const scanner = new Html5Qrcode(elementId, { verbose: false })
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => {
            if (doneRef.current) return
            doneRef.current = true
            void scanner
              .stop()
              .catch(() => {})
              .finally(() => resultRef.current(text))
          },
          () => {},
        )
        if (!cancelled) setState({ kind: "scanning" })
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: describe(err) })
      }
    })()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      if (scanner?.isScanning) void scanner.stop().catch(() => {})
    }
  }, [elementId])

  const scanFile = async (file: File) => {
    setFileError(null)
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const scanner = scannerRef.current ?? new Html5Qrcode(elementId, { verbose: false })
      scannerRef.current = scanner
      if (scanner.isScanning) await scanner.stop()
      const text = await scanner.scanFile(file, false)
      doneRef.current = true
      resultRef.current(text)
    } catch {
      setFileError("No QR code could be read from that image.")
    }
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-black ring-1 ring-line-2">
        <div id={elementId} className="min-h-[220px] w-full [&_video]:!w-full [&_video]:object-cover" />
        {state.kind === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-[12.5px] text-white/80">Starting camera…</div>
        )}
        {state.kind === "error" && (
          <div className="absolute inset-0 grid place-items-center p-5 text-center text-[12.5px] leading-relaxed text-white/90">
            {state.message}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
        <span>{state.kind === "scanning" ? "Point the camera at the QR code on the delivery docket." : " "}</span>
        <label className="cursor-pointer rounded-md px-2 py-1 font-medium text-accent ring-1 ring-line hover:bg-panel-2">
          Upload QR image
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void scanFile(f)
              e.target.value = ""
            }}
          />
        </label>
      </div>
      {fileError && <p className="mt-1 text-[12px] text-ink">{fileError}</p>}
    </div>
  )
}

/** A PO tag as a scannable QR code. */
export function PoQrCode({ payload, size = 132 }: { payload: string; size?: number }) {
  const [svg, setSvg] = useState<string>("")
  useEffect(() => {
    let alive = true
    void QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => {
      if (alive) setSvg(s)
    })
    return () => {
      alive = false
    }
  }, [payload])
  return (
    <div
      role="img"
      aria-label={`QR code ${payload}`}
      className="rounded-md bg-white p-1.5 [&_svg]:h-full [&_svg]:w-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

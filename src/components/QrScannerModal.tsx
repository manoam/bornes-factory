import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Camera } from 'lucide-react'

/**
 * Reusable QR scanner. Lazy-imports html5-qrcode so the lib (~370 KB) is
 * only fetched when the modal actually opens.
 *
 * Copied verbatim from konitys-stock for the MVP. If we need to evolve the
 * QR parsing later we'll vendor it via a small shared package.
 */

export interface ParsedQr {
  kind: 'product' | 'serial' | 'unknown'
  id: string
  raw: string
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const STRICT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseQr(payload: string): ParsedQr {
  const raw = payload.trim()
  const path = raw.split(/[?#]/, 1)[0] ?? raw
  const productMatch = path.match(new RegExp(`/products/(${UUID_RE.source})`, 'i'))
  if (productMatch) return { kind: 'product', id: productMatch[1].toLowerCase(), raw }
  const serialMatch = path.match(new RegExp(`/serial(?:-items)?/(${UUID_RE.source})`, 'i'))
  if (serialMatch) return { kind: 'serial', id: serialMatch[1].toLowerCase(), raw }
  if (STRICT_UUID_RE.test(raw)) return { kind: 'product', id: raw.toLowerCase(), raw }
  return { kind: 'unknown', id: '', raw }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onScan: (parsed: ParsedQr) => void
  title?: string
  hint?: string
}

const CONTAINER_ID = 'qr-scanner-modal-region'

export default function QrScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scanner un QR code',
  hint,
}: Props) {
  const scannerRef = useRef<unknown>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setError(null)
    setScanning(true)

    ;(async () => {
      try {
        const mod = await import('html5-qrcode')
        if (!active) return
        const { Html5Qrcode } = mod
        const scanner = new Html5Qrcode(CONTAINER_ID)
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => {
            const parsed = parseQr(decoded)
            const finish = () => {
              if (!active) return
              onScanRef.current(parsed)
            }
            try {
              const p = scanner.stop()
              if (p && typeof p.catch === 'function') {
                p.catch(() => {}).finally(finish)
              } else {
                finish()
              }
            } catch {
              finish()
            }
          },
          () => {
            /* ignore per-frame decode errors */
          },
        )
      } catch (err: unknown) {
        if (!active) return
        const message =
          err instanceof Error ? err.message : "Impossible d'accéder à la caméra"
        setError(message)
        setScanning(false)
      }
    })()

    return () => {
      active = false
      const sc = scannerRef.current as
        | { stop?: () => Promise<void>; clear?: () => void; getState?: () => number }
        | null
      scannerRef.current = null
      if (!sc) return
      try {
        const state = typeof sc.getState === 'function' ? sc.getState() : null
        if (state == null || state === 2 || state === 3) {
          const p = sc.stop?.()
          if (p && typeof p.catch === 'function') {
            p.catch(() => {}).finally(() => {
              try {
                sc.clear?.()
              } catch {
                /* ignore */
              }
            })
          } else {
            try {
              sc.clear?.()
            } catch {
              /* ignore */
            }
          }
        } else {
          try {
            sc.clear?.()
          } catch {
            /* ignore */
          }
        }
      } catch {
        try {
          sc.clear?.()
        } catch {
          /* ignore */
        }
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[13px] text-rose-700">
            {error}
          </div>
        ) : (
          <>
            <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-black">
              <div id={CONTAINER_ID} className="absolute inset-0" />
              {scanning && (
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                  <div className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-white">
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Recherche d'un QR…
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-[12px] text-slate-500">
              {hint || 'Pointez la caméra vers le QR code du produit'}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

"use client"

// shadcn/ui dialog (https://ui.shadcn.com/docs/components/dialog), adapted to this app: no Radix,
// the same overlay and panel as the app's other dialogs, colored from our CSS variables. A sheet
// from the bottom on phones, centered from sm up. Escape and the overlay close it unless `busy`.

import * as React from "react"
import { cn } from "@/lib/utils"

const DialogContext = React.createContext<{ titleId: string; descriptionId: string } | null>(null)

function Dialog({
  open,
  onClose,
  busy = false,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  /** While true (a request is running) the dialog can't be dismissed. */
  busy?: boolean
  className?: string
  children: React.ReactNode
}) {
  const titleId = React.useId()
  const descriptionId = React.useId()
  const panel = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const returnFocus = document.activeElement as HTMLElement | null
    // the first control, or the panel itself
    requestAnimationFrame(() => (panel.current?.querySelector<HTMLElement>("button, [href], input, select, textarea") ?? panel.current)?.focus())
    return () => returnFocus?.focus?.()
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, busy, onClose])

  if (!open) return null
  return (
    <DialogContext.Provider value={{ titleId, descriptionId }}>
      <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
        <div data-slot="dialog-overlay" className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => !busy && onClose()} aria-hidden />
        <div
          ref={panel}
          data-slot="dialog-content"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={cn(
            "relative flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-2xl outline-none",
            className,
          )}
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  const ctx = React.useContext(DialogContext)
  return <h2 data-slot="dialog-title" id={ctx?.titleId} className={cn("text-lg font-semibold", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  const ctx = React.useContext(DialogContext)
  return <p data-slot="dialog-description" id={ctx?.descriptionId} className={cn("text-sm text-[var(--color-muted)]", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
}

export { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle }

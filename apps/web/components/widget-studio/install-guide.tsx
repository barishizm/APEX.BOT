"use client"

import { X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

// Step-by-step bubbles over the Install section, started from onboarding's
// "Place widget on your website". Each step points at an element marked with data-tour.

const STEPS: { target: string; title: string; body: string }[] = [
  {
    target: "origins",
    title: "Add your website",
    body: "Type your site's address, e.g. https://www.example.com. The widget only loads on the sites listed here, so add every variant visitors use (with and without www).",
  },
  {
    target: "save",
    title: "Save your changes",
    body: "Click Save changes so your website is allowed. It goes live within a minute.",
  },
  {
    target: "embed",
    title: "Copy the embed code",
    body: "Click Copy to grab this one-line script. It loads the chat on your site.",
  },
  {
    target: "embed",
    title: "Paste it into your site",
    body: "Put it just before the closing </body> tag on every page. On WordPress, Shopify, Webflow or Wix, paste it into the custom code or footer scripts setting.",
  },
  {
    target: "embed",
    title: "Check that it works",
    body: "Open your website. The chat button appears in the corner. Send a test message to see your agent answer.",
  },
]

const GAP = 12
const PAD = 6
const WIDTH = 320

type Box = { top: number; left: number; width: number; height: number }

export function InstallGuide({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [bubbleH, setBubbleH] = useState(200)
  const bubble = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  // Bring the target into view, then follow it every frame while the page scrolls or reflows
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    next.current?.focus({ preventScroll: true })
    let frame = 0
    const track = () => {
      const r = el.getBoundingClientRect()
      setBox((b) =>
        b && b.top === r.top && b.left === r.left && b.width === r.width && b.height === r.height
          ? b
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      )
      frame = requestAnimationFrame(track)
    }
    track()
    return () => cancelAnimationFrame(frame)
  }, [current.target])

  useLayoutEffect(() => {
    if (bubble.current) setBubbleH(bubble.current.offsetHeight)
  }, [step, box])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!box) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(WIDTH, vw - 32)
  const below = vh - (box.top + box.height) >= bubbleH + GAP + PAD || box.top < bubbleH + GAP + PAD
  const top = below ? box.top + box.height + PAD + GAP : box.top - PAD - GAP - bubbleH
  const center = box.left + box.width / 2
  const left = Math.min(Math.max(16, center - width / 2), vw - width - 16)
  const arrow = Math.min(Math.max(16, center - left), width - 16)

  return (
    <>
      {/* spotlight: dims everything except the target, and lets clicks through to it */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-50 rounded-xl transition-all duration-200"
        style={{
          top: box.top - PAD,
          left: box.left - PAD,
          width: box.width + PAD * 2,
          height: box.height + PAD * 2,
          boxShadow: "0 0 0 2px var(--color-secondary), 0 0 0 9999px rgb(0 0 0 / 0.45)",
        }}
      />
      <div
        ref={bubble}
        role="dialog"
        aria-labelledby="install-guide-title"
        aria-describedby="install-guide-body"
        className="fixed z-50 flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] p-4 text-[var(--color-text)] shadow-2xl transition-[top,left] duration-200"
        style={{ top, left, width }}
      >
        <span
          aria-hidden
          className="absolute h-3 w-3 rotate-45 border-[var(--color-line)] bg-[var(--color-raised)]"
          style={{
            left: arrow - 6,
            ...(below ? { top: -7, borderLeftWidth: 1, borderTopWidth: 1 } : { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 }),
          }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--color-secondary)]">
              Step {step + 1} of {STEPS.length}
            </span>
            <h3 id="install-guide-title" className="text-sm font-semibold">
              {current.title}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close guide"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p id="install-guide-body" className="text-sm leading-relaxed text-[var(--color-muted)]">
          {current.body}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span aria-hidden className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-[var(--color-secondary)]" : "bg-[var(--color-line)]"}`} />
            ))}
          </span>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="h-8 cursor-pointer rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)]"
              >
                Back
              </button>
            )}
            <button
              ref={next}
              type="button"
              onClick={() => (last ? onClose() : setStep(step + 1))}
              className="h-8 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-3 text-xs font-semibold text-[var(--color-on-primary)]"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

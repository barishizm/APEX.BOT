"use client"

import { Crosshair, Expand, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Shrink, Undo2, X, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { translateMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"
import { Slider } from "./fields"

// Crop / position editor for the launcher image. The crop is always round. Everything is measured in "frame
// units": the crop circle fits a 1×1 square and the image's longer side is 1 at zoom 1,
// so the same numbers drive both the CSS preview and the canvas that bakes the result.

export type Adjust = { zoom: number; rotate: number; flipX: boolean; flipY: boolean; x: number; y: number }

type Size = { w: number; h: number }

const OUTPUT = 128
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5

/** Normalized image size: the longer side is 1. */
function unitSize(img: HTMLImageElement): Size {
  const long = Math.max(img.naturalWidth, img.naturalHeight)
  return { w: img.naturalWidth / long, h: img.naturalHeight / long }
}

/** Zoom that makes the rotated image fit inside (contain) or cover the frame. */
function zoomFor({ w, h }: Size, rotate: number, mode: "fit" | "fill") {
  const r = (rotate * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  const bw = w * c + h * s
  const bh = w * s + h * c
  return clamp(mode === "fit" ? 1 / Math.max(bw, bh) : 1 / Math.min(bw, bh), MIN_ZOOM, MAX_ZOOM)
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
/** Keeps an angle in (-180, 180]. */
const wrap = (deg: number) => {
  const d = ((deg % 360) + 360) % 360
  return d > 180 ? d - 360 : d
}

export function defaultAdjust(img: HTMLImageElement): Adjust {
  return { zoom: zoomFor(unitSize(img), 0, "fit"), rotate: 0, flipX: false, flipY: false, x: 0, y: 0 }
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error("Couldn't read the image"))
    el.src = src
  })
}

/** Draws the image, clipped to the circle, onto a transparent square and returns a data: URL. */
export function bake(img: HTMLImageElement, a: Adjust, maxLength: number) {
  const { w, h } = unitSize(img)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = OUTPUT
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingQuality = "high"
  ctx.scale(OUTPUT, OUTPUT)
  // the crop is always a circle; outside it stays transparent
  ctx.beginPath()
  ctx.arc(0.5, 0.5, 0.5, 0, Math.PI * 2)
  ctx.clip()
  ctx.translate(0.5 + a.x, 0.5 + a.y)
  ctx.rotate((a.rotate * Math.PI) / 180)
  ctx.scale(a.zoom * (a.flipX ? -1 : 1), a.zoom * (a.flipY ? -1 : 1))
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  let url = canvas.toDataURL("image/webp", 0.9)
  // browsers without WebP encoding fall back to PNG
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/png")
  if (url.length > maxLength) throw new Error("This image is too detailed. Try a simpler one")
  return url
}

/** The image as the frame shows it; the parent decides the frame's size. */
function Framed({ src, size, a }: { src: string; size: Size; a: Adjust }) {
  const style: CSSProperties = {
    width: `${size.w * 100}%`,
    height: `${size.h * 100}%`,
    transform: `translate(-50%, -50%) rotate(${a.rotate}deg) scale(${a.zoom * (a.flipX ? -1 : 1)}, ${a.zoom * (a.flipY ? -1 : 1)})`,
  }
  return (
    // translate on a full-size wrapper so percentages are of the frame, not the image
    <div className="pointer-events-none absolute inset-0" style={{ transform: `translate(${a.x * 100}%, ${a.y * 100}%)` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="absolute left-1/2 top-1/2 max-w-none select-none" style={style} />
    </div>
  )
}

function ToolButton({ icon: Icon, label, onClick, pressed }: { icon: LucideIcon; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "grid h-9 w-9 cursor-pointer place-items-center rounded-lg border transition-colors",
        pressed
          ? "border-[var(--color-secondary)] bg-[var(--color-bubble)] text-[var(--color-text)]"
          : "border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-muted)] hover:text-[var(--color-text)]",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

export function ImageEditor({
  src,
  initial,
  background,
  onApply,
  onCancel,
}: {
  src: string
  /** Last settings for this image, to continue where the user left off. */
  initial?: Adjust
  /** The launcher color, shown behind the image. */
  background?: string
  onApply: (img: HTMLImageElement, a: Adjust) => void
  onCancel: () => void
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.studio.editor
  const dialog = useRef<HTMLDialogElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [a, setA] = useState<Adjust | null>(initial ?? null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    dialog.current?.showModal()
    let live = true
    loadImage(src).then(
      (el) => {
        if (!live) return
        setImg(el)
        setA((cur) => cur ?? defaultAdjust(el))
      },
      (e: Error) => live && setProblem(e.message),
    )
    return () => {
      live = false
    }
  }, [src])

  const size = img ? unitSize(img) : { w: 1, h: 1 }
  const update = (patch: Partial<Adjust>) => setA((cur) => (cur ? { ...cur, ...patch } : cur))
  const nudge = (dx: number, dy: number) => setA((cur) => cur && { ...cur, x: clamp(cur.x + dx, -1, 1), y: clamp(cur.y + dy, -1, 1) })
  const zoomBy = (f: number) => setA((cur) => cur && { ...cur, zoom: clamp(cur.zoom * f, MIN_ZOOM, MAX_ZOOM) })
  const bg = background ?? "var(--color-bubble)"

  return (
    <dialog
      ref={dialog}
      aria-labelledby="image-editor-title"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-[var(--shadow-modal)] backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="image-editor-title" className="text-base font-semibold">
              {t.title}
            </h2>
            <p className="text-sm text-[var(--color-muted)]">{t.hint}</p>
          </div>
          <button
            type="button"
            aria-label={t.close}
            onClick={onCancel}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {problem ? (
          <p className="text-sm text-[var(--color-danger)]">{translateMessage(problem, locale)}</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-6">
            <div
              ref={stage}
              role="application"
              aria-label={t.stage}
              tabIndex={0}
              onPointerDown={(e) => {
                if (!a) return
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = { x: e.clientX, y: e.clientY, ax: a.x, ay: a.y }
              }}
              onPointerMove={(e) => {
                const d = drag.current
                const box = stage.current?.clientWidth
                if (!d || !box) return
                update({ x: clamp(d.ax + (e.clientX - d.x) / box, -1, 1), y: clamp(d.ay + (e.clientY - d.y) / box, -1, 1) })
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.05 : 0.01
                const keys: Record<string, () => void> = {
                  ArrowLeft: () => nudge(-step, 0),
                  ArrowRight: () => nudge(step, 0),
                  ArrowUp: () => nudge(0, -step),
                  ArrowDown: () => nudge(0, step),
                  "+": () => zoomBy(1.1),
                  "=": () => zoomBy(1.1),
                  "-": () => zoomBy(1 / 1.1),
                }
                if (keys[e.key]) {
                  e.preventDefault()
                  keys[e.key]()
                }
              }}
              className="relative aspect-square w-[min(16rem,70vw)] cursor-grab touch-none overflow-hidden rounded-full active:cursor-grabbing"
              style={{ background: bg }}
            >
              {img && a && <Framed src={src} size={size} a={a} />}
              {/* rule-of-thirds guides plus the frame edge */}
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-dashed border-white/70" />
              <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/3 right-1/3 border-x border-white/20" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 bottom-1/3 border-y border-white/20" />
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="grid h-16 w-16 place-items-center rounded-full shadow-lg" style={{ background: bg }}>
                {/* the widget draws the image at 60% of the button */}
                <span className="relative h-[60%] w-[60%] overflow-hidden rounded-full">{img && a && <Framed src={src} size={size} a={a} />}</span>
              </span>
              <span className="text-xs text-[var(--color-muted)]">{t.preview}</span>
            </div>
          </div>
        )}

        {a && img && (
          <>
            <div className="flex flex-wrap gap-2" role="toolbar" aria-label={t.tools}>
              <ToolButton icon={RotateCcw} label={t.rotateLeft} onClick={() => update({ rotate: wrap(a.rotate - 90) })} />
              <ToolButton icon={RotateCw} label={t.rotateRight} onClick={() => update({ rotate: wrap(a.rotate + 90) })} />
              <ToolButton icon={FlipHorizontal2} label={t.flipX} pressed={a.flipX} onClick={() => update({ flipX: !a.flipX })} />
              <ToolButton icon={FlipVertical2} label={t.flipY} pressed={a.flipY} onClick={() => update({ flipY: !a.flipY })} />
              <ToolButton icon={Crosshair} label={t.center} onClick={() => update({ x: 0, y: 0 })} />
              <ToolButton icon={Shrink} label={t.fit} onClick={() => update({ zoom: zoomFor(size, a.rotate, "fit"), x: 0, y: 0 })} />
              <ToolButton icon={Expand} label={t.fill} onClick={() => update({ zoom: zoomFor(size, a.rotate, "fill"), x: 0, y: 0 })} />
              <ToolButton icon={Undo2} label={t.reset} onClick={() => setA(defaultAdjust(img))} />
            </div>
            <Slider label={t.zoom} value={a.zoom} min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} onChange={(zoom) => update({ zoom })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label={t.rotation} value={a.rotate} min={-180} max={180} step={1} onChange={(rotate) => update({ rotate })} unit="°" />
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 cursor-pointer rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)]"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={!img || !a}
            onClick={() => img && a && onApply(img, a)}
            className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.apply}
          </button>
        </div>
      </div>
    </dialog>
  )
}

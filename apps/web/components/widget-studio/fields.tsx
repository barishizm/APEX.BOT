"use client"

import { CircleAlert, Crop, Plus, X } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format } from "@/lib/i18n"
import { translateMessage } from "@/lib/i18n/messages"
import { cn } from "@/lib/utils"
import { bake, ImageEditor, type Adjust } from "./image-editor"

// Form building blocks for the widget studio. Global CSS zeroes margins on p/h/ul,
// so spacing here comes from flex gaps, never margin utilities.

export const inputClass =
  "w-full rounded-lg border bg-[var(--color-raised)] px-3 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/70 disabled:cursor-not-allowed disabled:opacity-60"
const borderFor = (error?: string) =>
  error ? "border-red-500" : "border-[var(--color-line)] hover:border-[var(--color-muted)]/60 focus:border-[var(--color-secondary)]"

export function Group({ title, description, children, aside }: { title: string; description?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-[var(--color-muted)]">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  counter,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  htmlFor?: string
  counter?: { value: number; max: number }
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {counter && (
          <span className={cn("text-xs tabular-nums", counter.value > counter.max ? "text-red-500" : "text-[var(--color-muted)]")}>
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children}
      {error ? <ErrorText>{error}</ErrorText> : hint ? <p className="text-xs leading-relaxed text-[var(--color-muted)]">{hint}</p> : null}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-1.5 text-xs text-red-500">
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

export function TextInput({
  label,
  value,
  onChange,
  hint,
  error,
  max,
  placeholder,
  type = "text",
  disabled,
  mono,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  error?: string
  max?: number
  placeholder?: string
  type?: "text" | "email" | "url"
  disabled?: boolean
  mono?: boolean
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} counter={max && value.length > max * 0.7 ? { value: value.length, max } : undefined}>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={type === "text"}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-10", borderFor(error), mono && "font-mono text-[0.8125rem]")}
      />
    </Field>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  error,
  max,
  placeholder,
  rows = 3,
  disabled,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  error?: string
  max: number
  placeholder?: string
  rows?: number
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} counter={{ value: value.length, max }}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "resize-y py-2.5 leading-relaxed", borderFor(error))}
      />
    </Field>
  )
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-xs leading-relaxed text-[var(--color-muted)]">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 cursor-pointer rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-[var(--color-secondary)]" : "bg-[var(--color-line)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]",
            checked ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  hint?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Field label={<span id={id}>{label}</span>} hint={hint}>
      <div role="radiogroup" aria-labelledby={id} className="flex w-full flex-wrap gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border-0 px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              value === o.value
                ? "bg-[var(--color-bubble)] font-semibold text-[var(--color-text)]"
                : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  )
}

/** Larger radio cards, for choices that need a sentence of explanation. */
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
}: {
  label: ReactNode
  value: T
  options: { value: T; title: ReactNode; description?: ReactNode; icon?: ReactNode }[]
  onChange: (v: T) => void
  columns?: 2 | 3 | 4 | 5
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className={cn(
          "grid gap-2",
          columns === 2 ? "sm:grid-cols-2" : columns === 3 ? "sm:grid-cols-3" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
        )}
      >
        {options.map((o) => {
          const on = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-1 rounded-xl border bg-[var(--color-raised)] p-3 text-left transition-colors",
                on ? "border-[var(--color-secondary)] ring-1 ring-[var(--color-secondary)]" : "border-[var(--color-line)] hover:border-[var(--color-muted)]/60",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                {o.icon}
                {o.title}
              </span>
              {o.description && <span className="text-xs leading-relaxed text-[var(--color-muted)]">{o.description}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
  error,
  disabled,
  format,
}: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  hint?: ReactNode
  error?: string
  disabled?: boolean
  format?: (v: number) => string
}) {
  const id = useId()
  return (
    <Field
      label={
        <span className="flex w-full items-center justify-between gap-3">
          {label}
        </span>
      }
      htmlFor={id}
      hint={hint}
      error={error}
    >
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer accent-[var(--color-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="w-20 shrink-0 text-right text-sm tabular-nums text-[var(--color-muted)]">
          {format ? format(value) : value}
          {unit}
        </span>
      </div>
    </Field>
  )
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
  error,
}: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  hint?: ReactNode
  error?: string
}) {
  const id = useId()
  // keep the raw text while typing so "1" on the way to "1000" isn't rejected
  const [text, setText] = useState<string | null>(null)
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={text ?? String(value)}
          aria-invalid={!!error}
          onChange={(e) => {
            setText(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value !== "" && Number.isFinite(n)) onChange(n)
          }}
          onBlur={() => setText(null)}
          className={cn(inputClass, "h-10 tabular-nums", borderFor(error))}
        />
        {unit && <span className="shrink-0 text-sm text-[var(--color-muted)]">{unit}</span>}
      </div>
    </Field>
  )
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  disabled,
}: {
  label: ReactNode
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; group?: string }[]
  hint?: ReactNode
  error?: string
  disabled?: boolean
}) {
  const id = useId()
  const groups = [...new Set(options.map((o) => o.group ?? ""))]
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(inputClass, "h-10 cursor-pointer", borderFor(error))}
      >
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {options.filter((o) => o.group === g).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            options.filter((o) => !o.group).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
    </Field>
  )
}

/** An editable list of short strings, shown as removable chips. */
export function ListEditor({
  label,
  items,
  onChange,
  max,
  maxLength,
  placeholder,
  hint,
  errors,
  mono,
}: {
  label: ReactNode
  items: string[]
  onChange: (v: string[]) => void
  max: number
  maxLength: number
  placeholder: string
  hint?: ReactNode
  /** Issues keyed by item index, plus "" for the list itself. */
  errors?: Record<string, string>
  mono?: boolean
}) {
  const t = useAppI18n().t.studio.fields
  const id = useId()
  const [text, setText] = useState("")
  const full = items.length >= max
  const add = () => {
    const v = text.trim()
    if (!v || full || items.includes(v)) return setText("")
    onChange([...items, v])
    setText("")
  }
  const listError = errors?.[""]
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      error={listError}
      counter={{ value: items.length, max }}
    >
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={item} className="flex flex-col gap-1">
              <span
                className={cn(
                  "flex max-w-full items-center gap-1 rounded-full border bg-[var(--color-raised)] py-1 pl-3 pr-1 text-sm",
                  errors?.[String(i)] ? "border-red-500" : "border-[var(--color-line)]",
                  mono && "font-mono text-[0.8125rem]",
                )}
                title={errors?.[String(i)]}
              >
                <span className="truncate">{item}</span>
                <button
                  type="button"
                  aria-label={format(t.remove, { item })}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-bubble)] hover:text-[var(--color-text)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {Object.entries(errors ?? {})
        .filter(([k]) => k !== "")
        .map(([k, msg]) => (
          <ErrorText key={k}>
            {items[Number(k)]}: {msg}
          </ErrorText>
        ))}
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          maxLength={maxLength}
          disabled={full}
          placeholder={full ? format(t.limitReached, { n: max }) : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          className={cn(inputClass, "h-10", borderFor(), mono && "font-mono text-[0.8125rem]")}
        />
        <button
          type="button"
          onClick={add}
          disabled={full || !text.trim()}
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t.add}
        </button>
      </div>
    </Field>
  )
}

const SWATCHES = ["#0c0c09", "#312c85", "#1f6feb", "#0f766e", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed"]

export function ColorField({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: ReactNode
}) {
  const t = useAppI18n().t.studio.fields
  const id = useId()
  const [text, setText] = useState<string | null>(null)
  const valid = /^#[0-9a-f]{6}$/i.test(value)
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label={t.pickColor}
          value={valid ? value : "#000000"}
          onChange={(e) => {
            setText(null)
            onChange(e.target.value)
          }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-1"
        />
        <input
          id={id}
          value={text ?? value}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!!error}
          onChange={(e) => {
            const v = e.target.value.trim()
            setText(v)
            onChange(v.startsWith("#") ? v : `#${v}`)
          }}
          onBlur={() => setText(null)}
          className={cn(inputClass, "h-10 w-28 font-mono uppercase", borderFor(error))}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.presets}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={format(t.useColor, { color: c })}
              aria-pressed={value.toLowerCase() === c}
              onClick={() => {
                setText(null)
                onChange(c)
              }}
              className={cn(
                "h-7 w-7 cursor-pointer rounded-full border-2 transition-transform hover:scale-110",
                value.toLowerCase() === c ? "border-[var(--color-text)]" : "border-[var(--color-surface)]",
              )}
              style={{ background: c, boxShadow: "0 0 0 1px var(--color-line)" }}
            />
          ))}
        </div>
      </div>
    </Field>
  )
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const MAX_DATA_URL = 120_000

async function readFile(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image")
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Couldn't read the file"))
    reader.readAsDataURL(file)
  })
}

/** Upload (cropped and resized in the browser) or paste an https URL. */
export function ImageField({
  label,
  value,
  onChange,
  hint,
  error,
  background,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  error?: string
  /** Shown behind the thumbnail, e.g. the launcher color. */
  background?: string
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.studio.fields
  const id = useId()
  const [problem, setProblem] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState<{ src: string; initial?: Adjust } | null>(null)
  // the full-size original behind the current value, so re-adjusting doesn't lose quality
  const [last, setLast] = useState<{ src: string; adjust: Adjust; out: string } | null>(null)
  const uploaded = value.startsWith("data:")
  // GIFs would lose their animation on a canvas, and remote URLs can't be read back from one
  const adjustable = uploaded && !value.startsWith("data:image/gif")
  const take = async (file?: File) => {
    if (!file) return
    try {
      setProblem(null)
      const original = await readFile(file)
      if (file.type !== "image/gif") return setEditing({ src: original })
      if (original.length > MAX_DATA_URL) throw new Error("This GIF is too large. Keep it under 85 KB")
      onChange(original)
    } catch (e) {
      setProblem(e instanceof Error ? translateMessage(e.message, locale) : t.imageFailed)
    }
  }
  const apply = (img: HTMLImageElement, adjust: Adjust) => {
    const src = editing!.src
    setEditing(null)
    try {
      const out = bake(img, adjust, MAX_DATA_URL)
      setLast({ src, adjust, out })
      setProblem(null)
      onChange(out)
    } catch (e) {
      setProblem(e instanceof Error ? translateMessage(e.message, locale) : t.imageFailed)
    }
  }
  return (
    <Field label={label} htmlFor={id} hint={hint} error={problem ?? error}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void take(e.dataTransfer.files[0])
        }}
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 transition-colors",
          dragging ? "border-[var(--color-secondary)] bg-[var(--color-bubble)]" : "border-[var(--color-line)] bg-[var(--color-raised)]",
        )}
      >
        <span
          className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full"
          style={{ background: background ?? "var(--color-bubble)" }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={t.imagePreview} className="h-3/5 w-3/5 object-contain" />
          ) : (
            <Plus className="h-5 w-5 text-[var(--color-muted)]" aria-hidden />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={id}
              className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)]"
            >
              {value ? t.replaceImage : t.uploadImage}
            </label>
            <input
              id={id}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => {
                void take(e.target.files?.[0])
                e.target.value = ""
              }}
            />
            {adjustable && (
              <button
                type="button"
                onClick={() => setEditing(last?.out === value ? { src: last.src, initial: last.adjust } : { src: value })}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)]"
              >
                <Crop className="h-4 w-4" aria-hidden />
                {t.adjust}
              </button>
            )}
            {value && (
              <button
                type="button"
                onClick={() => {
                  setProblem(null)
                  onChange("")
                }}
                className="h-9 cursor-pointer rounded-lg border-0 bg-transparent px-3 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                {t.removeImage}
              </button>
            )}
          </div>
          <input
            type="url"
            aria-label={t.imageUrl}
            placeholder={t.imageUrlPlaceholder}
            value={uploaded ? "" : value}
            onChange={(e) => {
              setProblem(null)
              onChange(e.target.value.trim())
            }}
            className={cn(inputClass, "h-9 font-mono text-[0.8125rem]", borderFor(error))}
          />
        </div>
      </div>
      {editing && (
        <ImageEditor src={editing.src} initial={editing.initial} background={background} onApply={apply} onCancel={() => setEditing(null)} />
      )}
    </Field>
  )
}

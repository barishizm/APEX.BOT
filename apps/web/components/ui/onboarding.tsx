"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowUp, CircleAlert, CircleCheck, Circle, LoaderCircle, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type Source = { id: string; status: "pending" | "syncing" | "ready" | "failed"; pages: number; chunks: number; error: string | null }
type Phase = "form" | "reading" | "ready" | "failed"

// Accepts "example.com", "www.example.com/path" or a full http(s) URL
function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return url.hostname.includes(".") && !url.hostname.endsWith(".") ? url.href : null
  } catch {
    return null
  }
}

function Progress({ state, children }: { state: "done" | "active" | "todo" | "failed"; children: React.ReactNode }) {
  const Icon = state === "done" ? CircleCheck : state === "active" ? LoaderCircle : state === "failed" ? CircleAlert : Circle
  return (
    <li className={cn("flex items-center gap-2.5", state === "todo" && "text-[var(--color-muted)]")}>
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          state === "done" && "text-green-600",
          state === "active" && "animate-spin",
          state === "failed" && "text-red-500",
          state === "todo" && "opacity-50",
        )}
        aria-hidden="true"
      />
      {children}
    </li>
  )
}

export default function Onboarding() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [touched, setTouched] = useState(false)
  const [phase, setPhase] = useState<Phase>("form")
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [source, setSource] = useState<Source | null>(null)
  const [host, setHost] = useState("")
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined)

  const normalized = normalizeUrl(url)
  const error =
    serverError ??
    (touched && !normalized ? (url.trim() ? "Enter a valid website URL, like www.example.com" : "Enter your website URL to customize your setup") : null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setServerError(null)
    if (!normalized || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "website", url: normalized, allowOrigin: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) return router.replace("/login")
      if (!res.ok) {
        setServerError(data.message ?? "Couldn't add this website. Try again")
        return
      }
      setHost(new URL(normalized).hostname)
      setSource(data.source)
      setPhase(data.source.status === "ready" ? "ready" : data.source.status === "syncing" ? "reading" : "failed")
    } catch {
      setServerError("Couldn't reach the server. Check your connection and try again")
    } finally {
      setSubmitting(false)
    }
  }

  // Follow the crawl until it finishes
  useEffect(() => {
    if (phase !== "reading" || !source) return
    poll.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/knowledge")
        const data = await res.json()
        const next: Source | undefined = data.sources?.find((s: Source) => s.id === source.id)
        if (!next) return setPhase("failed")
        setSource(next)
        if (next.status === "ready") setPhase("ready")
        else if (next.status === "failed") setPhase("failed")
      } catch {
        setSource({ ...source }) // retry on the next tick
      }
    }, 2000)
    return () => clearTimeout(poll.current)
  }, [phase, source])

  useEffect(() => {
    if (phase !== "ready") return
    const t = setTimeout(() => router.push("/dashboard?welcome=1"), 2200)
    return () => clearTimeout(t)
  }, [phase, router])

  const busy = phase === "reading" || phase === "ready"

  return (
    <main
      id="main"
      className="grid min-h-screen gap-3 bg-[var(--color-surface)] p-3 text-[var(--color-text)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <section className="relative flex min-h-[calc(100vh-24px)] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] px-6 py-8 sm:px-10 lg:px-12">
        <Link href="/" className="logo" aria-label="Apex Bot home">
          <span className="logo__mark" />
        </Link>

        <div className="flex flex-1 items-center">
          <motion.form
            onSubmit={submit}
            noValidate
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto w-full max-w-[30rem] py-12"
          >
            <h1 className="text-[clamp(2rem,3.2vw,2.75rem)] font-semibold leading-[1.1] tracking-tight">
              {phase === "form" ? (
                <>
                  Confirm your website
                  <br />
                  for a quick start
                </>
              ) : phase === "failed" ? (
                "We couldn't read that site"
              ) : (
                "Learning your website"
              )}
            </h1>
            <p style={{ marginTop: 20 }} className="text-lg leading-relaxed text-[var(--color-muted)]">
              {phase === "failed"
                ? "You can try another address, or continue and add your content as text in the dashboard."
                : "Apex reads your pages to learn your products, policies and tone. Your assistant stays private until you add it to your site."}
            </p>

            {phase === "form" || phase === "failed" ? (
              <>
                <label htmlFor="website-url" className="mt-10 block text-sm font-medium">
                  Your website URL
                </label>
                <input
                  id="website-url"
                  name="url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  autoFocus
                  spellCheck={false}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setServerError(null)
                  }}
                  onBlur={() => setTouched(true)}
                  placeholder="www.example-website.com"
                  aria-invalid={!!error}
                  aria-describedby={error ? "website-url-error" : undefined}
                  className={cn(
                    "mt-2 h-14 w-full rounded-lg border bg-transparent px-4 text-base text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)]/70",
                    error ? "border-red-500" : "border-[var(--color-line)] focus:border-[var(--color-secondary)]",
                  )}
                />
                {(error || (phase === "failed" && source?.error)) && (
                  <p id="website-url-error" role="alert" style={{ marginTop: 8 }} className="flex items-center gap-2 text-sm text-red-500">
                    <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {error ?? source?.error}
                  </p>
                )}
              </>
            ) : (
              <ul role="status" aria-live="polite" style={{ marginTop: 32 }} className="flex flex-col gap-3 text-[0.9375rem]">
                <Progress state="done">Created your assistant</Progress>
                <Progress state="done">Allowed {host} to show the widget</Progress>
                <Progress state={phase === "ready" ? "done" : "active"}>
                  {phase === "ready"
                    ? `Read ${source?.pages ?? 0} page${source?.pages === 1 ? "" : "s"} from your website`
                    : "Reading your pages… this usually takes under a minute"}
                </Progress>
                <Progress state={phase === "ready" ? "done" : "todo"}>{phase === "ready" ? "All set. Opening your dashboard…" : "Ready to answer"}</Progress>
              </ul>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {phase === "ready" ? (
                <button
                  type="button"
                  onClick={() => router.push("/dashboard?welcome=1")}
                  className="h-12 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85"
                >
                  Go to dashboard
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!normalized || busy || submitting}
                  className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-7 text-[0.9375rem] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:bg-[var(--color-bubble)] disabled:text-[var(--color-muted)] disabled:opacity-100"
                >
                  {(submitting || busy) && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {busy ? "Setting up…" : phase === "failed" ? "Try again" : "Continue"}
                </button>
              )}
              {phase !== "ready" && (
              <button
                type="button"
                onClick={() => router.push(phase === "reading" ? "/dashboard/knowledge" : "/dashboard")}
                className="h-12 cursor-pointer rounded-lg border-0 bg-transparent px-5 text-[0.9375rem] font-semibold text-[var(--color-text)] transition-opacity hover:opacity-70"
              >
                {phase === "reading" ? "Continue in the background" : phase === "failed" ? "Continue anyway" : "Skip for now"}
              </button>
              )}
            </div>
          </motion.form>
        </div>
      </section>

      <WidgetPreview />
    </main>
  )
}

export function WidgetPreview() {
  return (
    <aside
      aria-label="Widget preview"
      className="relative hidden flex-col items-center justify-center gap-10 overflow-hidden rounded-2xl bg-[var(--color-secondary)] p-8 lg:flex"
    >
      {/* soft light blobs, same indigo family as the brand accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 45% at 25% 20%, color-mix(in srgb, var(--color-on-primary) 18%, transparent), transparent 70%), radial-gradient(55% 40% at 80% 85%, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 70%)",
        }}
      />

      <span className="relative rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-[0.9375rem] text-[var(--color-on-primary)]">
        Website widget preview
      </span>

      <div className="relative flex w-full max-w-[24rem] flex-col rounded-[28px] bg-[var(--color-surface)] p-5 shadow-2xl">
        <div className="mx-auto flex items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] py-1.5 pl-1.5 pr-4">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-[var(--color-on-primary)]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-raised)] bg-green-500" />
          </span>
          <span className="text-sm font-semibold">Apex Assistant</span>
        </div>

        <div className="mt-5 space-y-3">
          <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--color-bubble)] px-4 py-3 text-sm leading-snug">
            Yes. If the bag is unopened, you can return it free of charge within 14 days of delivery.
          </p>
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--color-primary)] px-4 py-3 text-sm leading-snug text-[var(--color-on-primary)]">
            It looks great. Thanks!
          </p>
          <p className="text-right text-xs text-[var(--color-muted)]">Read</p>
        </div>

        <div className="mt-10 flex items-center gap-3 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] p-1.5 pl-2">
          <span className="flex h-9 w-9 items-center justify-center text-[var(--color-muted)]">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm text-[var(--color-muted)]">Write a message...</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bubble)] text-[var(--color-muted)]">
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </aside>
  )
}

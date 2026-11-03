import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { DatabaseZap } from "lucide-react"
import { schemaMissing } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).account.database.title, robots: { index: false } }
}

// Shown instead of a crashing dashboard when the code is newer than the database schema
export default async function DatabaseUpdatePage() {
  const missing = await schemaMissing()
  if (!missing.length) redirect("/dashboard")
  const t = getAppDictionary(await requestLocale()).account.database
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-4 text-[var(--color-text)]">
      <section className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] p-8">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-200" aria-hidden>
          <DatabaseZap className="h-5 w-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
        <p className="text-[var(--color-muted)]">
          {t.text}
        </p>
        <pre className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 font-mono text-sm">npm run db:migrate</pre>
        <p className="text-sm text-[var(--color-muted)]">
          {t.pending} <span className="font-mono">{missing.join(", ")}</span>
        </p>
        <a href="/dashboard" className="inline-flex h-10 w-fit items-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] no-underline">
          {t.retry}
        </a>
      </section>
    </main>
  )
}

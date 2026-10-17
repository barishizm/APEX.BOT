import type { Metadata } from "next"
import Link from "next/link"
import { ADMIN_NAV } from "@/components/admin/nav"
import { requirePlatformAdmin } from "@/lib/auth"
import { getAdminDictionary, getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).overview.title }
}

export default async function AdminOverviewPage() {
  const { user } = await requirePlatformAdmin()
  const locale = await requestLocale()
  const t = getAdminDictionary(locale)
  const role = getAppDictionary(locale).shell.profile[user.platformRole]
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.overview.title}</h1>
        <p className="mt-1 max-w-2xl text-[var(--color-muted)]">{t.overview.lede}</p>
        <p className="mt-3 inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
          {t.overview.signedInAs.replace("{role}", role)}
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_NAV.filter((s) => s.key !== "overview").map(({ key, href, icon: Icon }) => (
          <li key={key}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] px-4 py-3 text-[var(--color-text)] no-underline transition-colors hover:border-amber-500/50 hover:bg-amber-500/5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="font-medium">{t.nav[key]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

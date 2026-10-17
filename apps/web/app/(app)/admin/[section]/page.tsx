import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ADMIN_NAV } from "@/components/admin/nav"
import { requirePlatformAdmin } from "@/lib/auth"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

// Stand-in for the sections not built yet, so the rail has no dead links. A section's own folder
// (like admin/users) takes precedence over this route as soon as it exists.
const section = (slug: string) => ADMIN_NAV.find((s) => s.key !== "overview" && s.href === `/admin/${slug}`)

export async function generateMetadata({ params }: PageProps<"/admin/[section]">): Promise<Metadata> {
  const found = section((await params).section)
  return found ? { title: getAdminDictionary(await requestLocale()).nav[found.key] } : {}
}

export default async function AdminSectionPlaceholder({ params }: PageProps<"/admin/[section]">) {
  await requirePlatformAdmin()
  const found = section((await params).section)
  if (!found) notFound()
  const t = getAdminDictionary(await requestLocale())
  const Icon = found.icon
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t.nav[found.key]}</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--color-line)] px-6 py-16 text-center">
        <Icon className="h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden />
        <p className="text-[var(--color-muted)]">{t.placeholder.soon}</p>
        <Link href="/admin" className="text-sm font-medium text-[var(--color-text)]">
          {t.placeholder.back}
        </Link>
      </div>
    </div>
  )
}

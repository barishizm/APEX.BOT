import type { Metadata } from "next"
import { AppI18nProvider } from "@/components/i18n/app-provider"
import { I18nProvider } from "@/components/i18n/provider"
import { ImpersonationBanner, StaleImpersonation } from "@/components/impersonation-banner"
import { RootDocument } from "@/components/root-document"
import { currentSession, hasImpersonationCookie } from "@/lib/auth"
import { getAppDictionary } from "@/lib/i18n/app"
import { getDictionary, requestLocale } from "@/lib/i18n/server"
import { siteUrl } from "@/lib/site"
import { viewport as sharedViewport } from "@/lib/viewport"
import "../globals.css"

// The signed-in app (dashboard, onboarding, account flows). Its URLs carry no language: it
// follows the visitor's choice or the language they last browsed the site in (lib/i18n/server).
// Nothing here is meant for search engines.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Apex Bot", template: "%s — Apex Bot" },
  robots: { index: false, follow: false },
}

export const viewport = sharedViewport

// Platform staff also get the admin area's strings, and so does a superadmin viewing the app as a
// user (for the bar); a database hiccup just leaves them out
async function viewer() {
  try {
    const session = await currentSession()
    // a view that ended elsewhere or ran out still has its cookie, which keeps the browser read-only
    const stale = !session?.impersonation && (await hasImpersonationCookie())
    return { staff: !!session?.user.platformRole || !!session?.impersonation, impersonation: session?.impersonation && { session, ...session.impersonation }, stale }
  } catch {
    return { staff: false, impersonation: undefined, stale: false }
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [locale, { staff, impersonation, stale }] = await Promise.all([requestLocale(), viewer()])
  const viewed = impersonation?.session.user
  return (
    <RootDocument locale={locale}>
      <I18nProvider locale={locale} dict={getDictionary(locale)}>
        <AppI18nProvider dict={getAppDictionary(locale, { admin: staff })}>
          {viewed && impersonation && (
            <ImpersonationBanner name={viewed.displayName ?? viewed.username} email={viewed.email} expiresAt={impersonation.expiresAt.toISOString()} />
          )}
          {stale && <StaleImpersonation />}
          {children}
        </AppI18nProvider>
      </I18nProvider>
    </RootDocument>
  )
}

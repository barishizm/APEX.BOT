import type { Metadata } from "next"
import { AppI18nProvider } from "@/components/i18n/app-provider"
import { I18nProvider } from "@/components/i18n/provider"
import { RootDocument } from "@/components/root-document"
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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale()
  return (
    <RootDocument locale={locale}>
      <I18nProvider locale={locale} dict={getDictionary(locale)}>
        <AppI18nProvider dict={getAppDictionary(locale)}>{children}</AppI18nProvider>
      </I18nProvider>
    </RootDocument>
  )
}

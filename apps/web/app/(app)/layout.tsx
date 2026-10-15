import type { Metadata } from "next"
import { I18nProvider } from "@/components/i18n/provider"
import { RootDocument } from "@/components/root-document"
import { DEFAULT_LOCALE } from "@/lib/i18n"
import { getDictionary } from "@/lib/i18n/server"
import { siteUrl } from "@/lib/site"
import { viewport as sharedViewport } from "@/lib/viewport"
import "../globals.css"

// The signed-in app (dashboard, onboarding, account flows). It is not translated yet, so it
// renders in the default language; nothing here is meant for search engines.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Apex Bot", template: "%s — Apex Bot" },
  robots: { index: false, follow: false },
}

export const viewport = sharedViewport

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootDocument locale={DEFAULT_LOCALE}>
      <I18nProvider locale={DEFAULT_LOCALE} dict={getDictionary(DEFAULT_LOCALE)}>
        {children}
      </I18nProvider>
    </RootDocument>
  )
}

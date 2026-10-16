import type { Metadata } from "next"
import { I18nProvider } from "@/components/i18n/provider"
import { RootDocument } from "@/components/root-document"
import { generateLocaleParams, getDictionary, resolveLocale } from "@/lib/i18n/server"
import { siteUrl } from "@/lib/site"
import { viewport as sharedViewport } from "@/lib/viewport"
import "../globals.css"

// Every public page, once per language: /pricing (English), /tr/pricing (Turkish), /lt/pricing and so on.
// The proxy maps unprefixed URLs onto the default language.
export const generateStaticParams = generateLocaleParams

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const t = getDictionary(await resolveLocale(params))
  return {
    metadataBase: new URL(siteUrl()),
    applicationName: t.meta.siteName,
    title: { default: t.meta.defaultTitle, template: t.meta.titleTemplate },
    description: t.meta.description,
    keywords: t.meta.keywords,
    formatDetection: { telephone: false, email: false, address: false },
  }
}

export const viewport = sharedViewport

export default async function LocaleLayout({ children, params }: LayoutProps<"/[lang]">) {
  const locale = await resolveLocale(params)
  return (
    <RootDocument locale={locale}>
      <I18nProvider locale={locale} dict={getDictionary(locale)}>
        {children}
      </I18nProvider>
    </RootDocument>
  )
}

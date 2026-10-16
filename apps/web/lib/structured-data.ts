// Schema.org nodes shared by several pages. Server-side only.
import type { Metadata } from "next"
import { CONTACT_EMAIL } from "@/components/site-nav"
import { PUBLIC_PAGES } from "@/content"
import type { MarketingContent } from "@/content/types"
import { LOCALE_META, type Locale } from "@/lib/i18n"
import { absoluteUrl, getDictionary, pageMetadata } from "@/lib/i18n/server"
import { siteUrl } from "@/lib/site"

// Official profiles (LinkedIn, GitHub, X...). They tell search engines these accounts are the same company.
const SAME_AS: string[] = []

const FOUNDER = { "@type": "Person", name: "Mahmut Barış Akıntı", jobTitle: "Founder & CEO" }

export const organizationId = () => `${siteUrl()}/#organization`

export function organization(locale: Locale) {
  const t = getDictionary(locale)
  return {
    "@type": "Organization",
    "@id": organizationId(),
    name: t.meta.siteName,
    url: siteUrl(),
    logo: { "@type": "ImageObject", url: `${siteUrl()}/icon.png`, width: 512, height: 512 },
    description: t.footer.tagline,
    email: CONTACT_EMAIL,
    founder: FOUNDER,
    ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
  }
}

export function marketingMetadata(locale: Locale, path: string, content: MarketingContent): Metadata {
  return pageMetadata({ locale, path, title: content.meta.title, description: content.meta.description })
}

// The page itself: an AboutPage, an Article (guides) or a plain WebPage, with its publisher and last edit
export function marketingSchema(locale: Locale, path: string, content: MarketingContent, type: "AboutPage" | "TechArticle" | "WebPage") {
  const url = absoluteUrl(path, locale)
  const page: Record<string, unknown> = {
    "@type": type,
    "@id": `${url}#page`,
    url,
    name: content.meta.title,
    description: content.meta.description,
    inLanguage: LOCALE_META[locale].hreflang,
    publisher: { "@id": organizationId() },
    dateModified: PUBLIC_PAGES[path],
  }
  if (type === "TechArticle") Object.assign(page, { headline: content.title, author: { "@id": organizationId() } })
  if (type === "AboutPage") page.about = { "@id": organizationId() }
  return [organization(locale), page]
}

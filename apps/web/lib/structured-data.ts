// Schema.org nodes shared by several pages. Server-side only.
import type { Metadata } from "next"
import { PLANS, PLAN_PRICES } from "@apex/db/plans"
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

// Schema.org prices are plain decimals: "29", "24.50"
const price = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0)

/**
 * Every plan as an Offer, priced from @apex/db/plans (the only source of prices, ADR 0003), monthly
 * and yearly. `onSale`: plans can be bought (lib/billing/live.ts); until then the paid ones are a
 * pre-order and Free is limited to the closed beta.
 */
export function planOffers(locale: Locale, onSale: boolean) {
  const t = getDictionary(locale).pricing.plans
  const url = absoluteUrl("/pricing", locale)
  return PLANS.map((plan) => {
    const { monthly, annual } = PLAN_PRICES[plan]
    const unit = (cents: number, unitCode: "MON" | "ANN") => ({
      "@type": "UnitPriceSpecification",
      price: price(cents),
      priceCurrency: "USD",
      referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode },
    })
    return {
      "@type": "Offer",
      name: t[plan].name,
      description: t[plan].blurb,
      url,
      price: price(monthly),
      priceCurrency: "USD",
      availability: onSale ? "https://schema.org/InStock" : monthly ? "https://schema.org/PreOrder" : "https://schema.org/LimitedAvailability",
      ...(monthly ? { priceSpecification: [unit(monthly, "MON"), unit(annual, "ANN")] } : {}),
    }
  })
}

/** The product, with its plans; the same node (by @id) on the home and pricing pages. */
export function softwareApplication(locale: Locale, onSale: boolean, extra: Record<string, unknown> = {}) {
  const t = getDictionary(locale)
  const url = absoluteUrl("/", locale)
  return {
    "@type": "SoftwareApplication",
    "@id": `${url}/#software`,
    name: t.meta.siteName,
    url,
    description: t.meta.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: LOCALE_META[locale].hreflang,
    offers: planOffers(locale, onSale),
    publisher: { "@id": organizationId() },
    ...extra,
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

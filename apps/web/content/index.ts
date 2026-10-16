import type { Locale } from "@/lib/i18n"
import { about as aboutEn } from "./about/en"
import { about as aboutTr } from "./about/tr"
import { docs as docsEn } from "./docs/en"
import { docs as docsTr } from "./docs/tr"
import { groundedAnswers as groundedEn } from "./grounded-answers/en"
import { groundedAnswers as groundedTr } from "./grounded-answers/tr"
import { shopify as shopifyEn } from "./integrations/shopify.en"
import { shopify as shopifyTr } from "./integrations/shopify.tr"
import { webflow as webflowEn } from "./integrations/webflow.en"
import { webflow as webflowTr } from "./integrations/webflow.tr"
import { wordpress as wordpressEn } from "./integrations/wordpress.en"
import { wordpress as wordpressTr } from "./integrations/wordpress.tr"
import { privacy as privacyEn } from "./privacy/en"
import { privacy as privacyTr } from "./privacy/tr"
import { security as securityEn } from "./security/en"
import { security as securityTr } from "./security/tr"
import { terms as termsEn } from "./terms/en"
import { terms as termsTr } from "./terms/tr"
import type { MarketingContent, ProseContent } from "./types"
import { ecommerce as ecommerceEn } from "./use-cases/e-commerce.en"
import { ecommerce as ecommerceTr } from "./use-cases/e-commerce.tr"
import { saas as saasEn } from "./use-cases/saas.en"
import { saas as saasTr } from "./use-cases/saas.tr"

// Long-form pages per language. A new locale fails to type-check until it has all of them.
export const PROSE: Record<"docs" | "privacy" | "security" | "terms", Record<Locale, ProseContent>> = {
  docs: { en: docsEn, tr: docsTr },
  privacy: { en: privacyEn, tr: privacyTr },
  security: { en: securityEn, tr: securityTr },
  terms: { en: termsEn, tr: termsTr },
}

export const MARKETING: Record<"about" | "groundedAnswers", Record<Locale, MarketingContent>> = {
  about: { en: aboutEn, tr: aboutTr },
  groundedAnswers: { en: groundedEn, tr: groundedTr },
}

// /use-cases/<slug> and /integrations/<slug>
export const USE_CASES: Record<string, Record<Locale, MarketingContent>> = {
  "e-commerce": { en: ecommerceEn, tr: ecommerceTr },
  saas: { en: saasEn, tr: saasTr },
}

export const INTEGRATIONS: Record<string, Record<Locale, MarketingContent>> = {
  wordpress: { en: wordpressEn, tr: wordpressTr },
  shopify: { en: shopifyEn, tr: shopifyTr },
  webflow: { en: webflowEn, tr: webflowTr },
}

// Every indexable public page and when its content last changed (both languages), for the
// sitemap's <lastmod> and dateModified in structured data. Bump a date when you edit that page.
export const PUBLIC_PAGES: Record<string, string> = {
  "/": "2026-10-16",
  "/pricing": "2026-10-15",
  "/docs": "2026-10-15",
  "/about": "2026-10-16",
  "/grounded-answers": "2026-10-16",
  ...Object.fromEntries(Object.keys(USE_CASES).map((slug) => [`/use-cases/${slug}`, "2026-10-16"])),
  ...Object.fromEntries(Object.keys(INTEGRATIONS).map((slug) => [`/integrations/${slug}`, "2026-10-16"])),
  "/security": "2026-10-16",
  "/privacy": "2026-10-16",
  "/terms": "2026-10-15",
}

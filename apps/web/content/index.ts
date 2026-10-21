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
import { about as aboutLt } from "./about/lt"
import { about as aboutLv } from "./about/lv"
import { about as aboutEt } from "./about/et"
import { docs as docsLt } from "./docs/lt"
import { docs as docsLv } from "./docs/lv"
import { docs as docsEt } from "./docs/et"
import { groundedAnswers as groundedLt } from "./grounded-answers/lt"
import { groundedAnswers as groundedLv } from "./grounded-answers/lv"
import { groundedAnswers as groundedEt } from "./grounded-answers/et"
import { privacy as privacyLt } from "./privacy/lt"
import { privacy as privacyLv } from "./privacy/lv"
import { privacy as privacyEt } from "./privacy/et"
import { security as securityLt } from "./security/lt"
import { security as securityLv } from "./security/lv"
import { security as securityEt } from "./security/et"
import { terms as termsLt } from "./terms/lt"
import { terms as termsLv } from "./terms/lv"
import { terms as termsEt } from "./terms/et"
import { ecommerce as ecommerceLt } from "./use-cases/e-commerce.lt"
import { ecommerce as ecommerceLv } from "./use-cases/e-commerce.lv"
import { ecommerce as ecommerceEt } from "./use-cases/e-commerce.et"
import { saas as saasLt } from "./use-cases/saas.lt"
import { saas as saasLv } from "./use-cases/saas.lv"
import { saas as saasEt } from "./use-cases/saas.et"
import { shopify as shopifyLt } from "./integrations/shopify.lt"
import { shopify as shopifyLv } from "./integrations/shopify.lv"
import { shopify as shopifyEt } from "./integrations/shopify.et"
import { webflow as webflowLt } from "./integrations/webflow.lt"
import { webflow as webflowLv } from "./integrations/webflow.lv"
import { webflow as webflowEt } from "./integrations/webflow.et"
import { wordpress as wordpressLt } from "./integrations/wordpress.lt"
import { wordpress as wordpressLv } from "./integrations/wordpress.lv"
import { wordpress as wordpressEt } from "./integrations/wordpress.et"
import type { MarketingContent, ProseContent } from "./types"
import { ecommerce as ecommerceEn } from "./use-cases/e-commerce.en"
import { ecommerce as ecommerceTr } from "./use-cases/e-commerce.tr"
import { saas as saasEn } from "./use-cases/saas.en"
import { saas as saasTr } from "./use-cases/saas.tr"

// Long-form pages per language. A new locale fails to type-check until it has all of them.
export const PROSE: Record<"docs" | "privacy" | "security" | "terms", Record<Locale, ProseContent>> = {
  docs: { en: docsEn, tr: docsTr, lt: docsLt, lv: docsLv, et: docsEt },
  privacy: { en: privacyEn, tr: privacyTr, lt: privacyLt, lv: privacyLv, et: privacyEt },
  security: { en: securityEn, tr: securityTr, lt: securityLt, lv: securityLv, et: securityEt },
  terms: { en: termsEn, tr: termsTr, lt: termsLt, lv: termsLv, et: termsEt },
}

export const MARKETING: Record<"about" | "groundedAnswers", Record<Locale, MarketingContent>> = {
  about: { en: aboutEn, tr: aboutTr, lt: aboutLt, lv: aboutLv, et: aboutEt },
  groundedAnswers: { en: groundedEn, tr: groundedTr, lt: groundedLt, lv: groundedLv, et: groundedEt },
}

// /use-cases/<slug> and /integrations/<slug>
export const USE_CASES: Record<string, Record<Locale, MarketingContent>> = {
  "e-commerce": { en: ecommerceEn, tr: ecommerceTr, lt: ecommerceLt, lv: ecommerceLv, et: ecommerceEt },
  saas: { en: saasEn, tr: saasTr, lt: saasLt, lv: saasLv, et: saasEt },
}

export const INTEGRATIONS: Record<string, Record<Locale, MarketingContent>> = {
  wordpress: { en: wordpressEn, tr: wordpressTr, lt: wordpressLt, lv: wordpressLv, et: wordpressEt },
  shopify: { en: shopifyEn, tr: shopifyTr, lt: shopifyLt, lv: shopifyLv, et: shopifyEt },
  webflow: { en: webflowEn, tr: webflowTr, lt: webflowLt, lv: webflowLv, et: webflowEt },
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
  "/privacy": "2026-10-21",
  "/terms": "2026-10-21",
}

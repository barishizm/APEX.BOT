import { OVERAGE_BLOCK, PLANS, PLAN_LIMITS, PLAN_PRICES } from "@apex/db/plans"
import { INTEGRATIONS, MARKETING, USE_CASES } from "@/content"
import type { MarketingContent } from "@/content/types"
import { launchCopyLive } from "@/lib/billing/live"
import { DEFAULT_LOCALE, LOCALE_META, LOCALES, type Locale } from "@/lib/i18n"
import type { Dictionary } from "@/lib/i18n/dictionaries/en"
import { absoluteUrl, getDictionary, getMarketingDictionary } from "@/lib/i18n/server"

// A plain-text map of the site for AI assistants and answer engines (llmstxt.org), built from
// the same content as the pages so it never drifts from them; prices come from @apex/db/plans.
// Rebuilt at most every minute, like the pages, so it follows the billing and launch_copy flags.
export const revalidate = 60

function section(locale: Locale, t: Dictionary) {
  const link = (title: string, path: string, description: string) => `- [${title}](${absoluteUrl(path, locale)}): ${description}`
  const page = (path: string, content: MarketingContent) => link(content.meta.title, path, content.meta.description)
  return [
    `## ${LOCALE_META[locale].name}`,
    "",
    link(t.meta.defaultTitle, "/", t.meta.description),
    page("/about", MARKETING.about[locale]),
    page("/grounded-answers", MARKETING.groundedAnswers[locale]),
    link(t.meta.pricing.title, "/pricing", t.meta.pricing.description),
    link(t.meta.docs.title, "/docs", t.meta.docs.description),
    ...Object.entries(USE_CASES).map(([slug, content]) => page(`/use-cases/${slug}`, content[locale])),
    ...Object.entries(INTEGRATIONS).map(([slug, content]) => page(`/integrations/${slug}`, content[locale])),
    link(t.meta.security.title, "/security", t.meta.security.description),
    link(t.meta.privacy.title, "/privacy", t.meta.privacy.description),
    link(t.meta.terms.title, "/terms", t.meta.terms.description),
  ].join("\n")
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
const count = (n: number) => n.toLocaleString("en-US")

// The plans in English, whatever the language sections below say
function pricing(launched: boolean) {
  const names = getDictionary(DEFAULT_LOCALE).pricing.plans
  const plans = PLANS.map((plan) => {
    const { monthly, annual } = PLAN_PRICES[plan]
    const l = PLAN_LIMITS[plan]
    const price = monthly ? `${usd(monthly)}/month, or ${usd(annual)}/year (${usd(Math.round(annual / 12))}/month billed yearly)` : "$0"
    const sites = `${count(l.websites)} website${l.websites === 1 ? "" : "s"}`
    const models = l.allowedModelTiers.length === 1 ? "fast models only" : "all models"
    return `- ${names[plan].name}: ${price}. ${count(l.monthlyReplies)} AI replies a month, ${sites}, up to ${count(l.websitePages)} pages of knowledge per website, ${models}.`
  })
  return [
    "## Pricing",
    "",
    launched
      ? "Prices in USD; tax is added at checkout where it applies. Paddle is the reseller and merchant of record."
      : "Apex Bot is free during the closed beta. These are the plans from launch, in USD; tax is added at checkout where it applies.",
    "",
    ...plans,
    "",
    `An AI reply is one answer on a standard model; fast models count as 1/5, Claude Opus 5.5 as 2 and Claude Fable 5.1 as 5. Extra replies past the monthly allowance are off by default; on paid plans the owner can turn them on at ${usd(OVERAGE_BLOCK.priceCents)} per ${count(OVERAGE_BLOCK.replies)} replies, up to a monthly cap they set.`,
  ].join("\n")
}

export async function GET() {
  const launched = await launchCopyLive()
  const dictionaries = await Promise.all(LOCALES.map((locale) => getMarketingDictionary(locale)))
  const t = dictionaries[LOCALES.indexOf(DEFAULT_LOCALE)]!
  const body = [
    `# ${t.meta.siteName}`,
    "",
    `> ${t.meta.description}`,
    "",
    t.landing.features.text,
    "",
    pricing(launched),
    "",
    ...LOCALES.flatMap((locale, i) => [section(locale, dictionaries[i]!), ""]),
  ].join("\n")
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}

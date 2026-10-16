import { INTEGRATIONS, MARKETING, USE_CASES } from "@/content"
import type { MarketingContent } from "@/content/types"
import { DEFAULT_LOCALE, LOCALE_META, LOCALES, type Locale } from "@/lib/i18n"
import { absoluteUrl, getDictionary } from "@/lib/i18n/server"

// A plain-text map of the site for AI assistants and answer engines (llmstxt.org), built from
// the same content as the pages so it never drifts from them
export const dynamic = "force-static"

function section(locale: Locale) {
  const t = getDictionary(locale)
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

export function GET() {
  const t = getDictionary(DEFAULT_LOCALE)
  const body = [
    `# ${t.meta.siteName}`,
    "",
    `> ${t.meta.description}`,
    "",
    t.landing.features.text,
    "",
    ...LOCALES.flatMap((locale) => [section(locale), ""]),
  ].join("\n")
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}

import type { Metadata } from "next";
import { Home } from "@/components/landing/home";
import { LOCALE_META } from "@/lib/i18n";
import { absoluteUrl, getMarketingDictionary, jsonLd, pageMetadata, resolveLocale } from "@/lib/i18n/server";
import { billingLive } from "@/lib/billing/live";
import { organization, organizationId, softwareApplication } from "@/lib/structured-data";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  return pageMetadata({ locale: await resolveLocale(params), path: "/" });
}

// Structured data for rich results: who we are, the site, the product and the FAQ
async function structuredData(locale: Awaited<ReturnType<typeof resolveLocale>>) {
  const t = await getMarketingDictionary(locale);
  const url = absoluteUrl("/", locale);
  const language = LOCALE_META[locale].hreflang;
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(locale),
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: t.meta.siteName,
        url,
        inLanguage: language,
        publisher: { "@id": organizationId() },
      },
      // its plans, priced from @apex/db/plans
      softwareApplication(locale, await billingLive(), { featureList: t.landing.features.items.map((item) => item.title) }),
      {
        "@type": "FAQPage",
        "@id": `${url}/#faq`,
        inLanguage: language,
        mainEntity: t.landing.faq.items.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
}

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const locale = await resolveLocale(params);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(await structuredData(locale)) }} />
      <Home locale={locale} />
    </>
  );
}

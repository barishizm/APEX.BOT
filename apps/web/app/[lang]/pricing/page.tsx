import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Component as PricingSection } from "@/components/ui/pricing-section";
import { LOCALE_META } from "@/lib/i18n";
import { billingLive } from "@/lib/billing/live";
import { absoluteUrl, breadcrumbs, getMarketingDictionary, jsonLd, pageMetadata, resolveLocale } from "@/lib/i18n/server";
import { organization, organizationId } from "@/lib/structured-data";

export async function generateMetadata({ params }: PageProps<"/[lang]/pricing">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { title, description } = (await getMarketingDictionary(locale)).meta.pricing;
  return pageMetadata({ locale, path: "/pricing", title, description });
}

export default async function PricingPage({ params }: PageProps<"/[lang]/pricing">) {
  const locale = await resolveLocale(params);
  const { title, description } = (await getMarketingDictionary(locale)).meta.pricing;
  const url = absoluteUrl("/pricing", locale);
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbs(locale, [{ name: title, path: "/pricing" }]),
      organization(locale),
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: title,
        description,
        inLanguage: LOCALE_META[locale].hreflang,
        publisher: { "@id": organizationId() },
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <SiteHeader locale={locale} />
      <main id="main">
        <PricingSection billing={await billingLive()} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Component as PricingSection } from "@/components/ui/pricing-section";
import { getDictionary, pageMetadata, resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/pricing">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { title, description } = getDictionary(locale).meta.pricing;
  return pageMetadata({ locale, path: "/pricing", title, description });
}

export default async function PricingPage({ params }: PageProps<"/[lang]/pricing">) {
  const locale = await resolveLocale(params);
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main">
        <PricingSection />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

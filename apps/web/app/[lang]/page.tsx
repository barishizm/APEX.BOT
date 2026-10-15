import type { Metadata } from "next";
import { Home } from "@/components/landing/home";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { LOCALE_META, localizePath } from "@/lib/i18n";
import { getDictionary, jsonLd, pageMetadata, resolveLocale } from "@/lib/i18n/server";
import { siteUrl } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  return pageMetadata({ locale: await resolveLocale(params), path: "/" });
}

// Structured data for rich results: who we are, the site, the product and the FAQ
function structuredData(locale: Awaited<ReturnType<typeof resolveLocale>>) {
  const t = getDictionary(locale);
  const base = siteUrl();
  const url = base + localizePath("/", locale);
  const language = LOCALE_META[locale].hreflang;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: t.meta.siteName,
        url: base,
        logo: `${base}/icon.png`,
        email: CONTACT_EMAIL,
      },
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: t.meta.siteName,
        url,
        inLanguage: language,
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: t.meta.siteName,
        url,
        description: t.meta.description,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: language,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData(locale)) }} />
      <Home locale={locale} />
    </>
  );
}

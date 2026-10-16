import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { MARKETING } from "@/content";
import { resolveLocale } from "@/lib/i18n/server";
import { marketingMetadata, marketingSchema } from "@/lib/structured-data";

export async function generateMetadata({ params }: PageProps<"/[lang]/about">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return marketingMetadata(locale, "/about", MARKETING.about[locale]);
}

export default async function Page({ params }: PageProps<"/[lang]/about">) {
  const locale = await resolveLocale(params);
  const content = MARKETING.about[locale];
  return (
    <ProsePage locale={locale} content={content} path="/about" crumb={content.meta.crumb} schema={marketingSchema(locale, "/about", content, "AboutPage")} />
  );
}

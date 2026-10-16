import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { MARKETING } from "@/content";
import { resolveLocale } from "@/lib/i18n/server";
import { marketingMetadata, marketingSchema } from "@/lib/structured-data";

export async function generateMetadata({ params }: PageProps<"/[lang]/grounded-answers">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return marketingMetadata(locale, "/grounded-answers", MARKETING.groundedAnswers[locale]);
}

export default async function Page({ params }: PageProps<"/[lang]/grounded-answers">) {
  const locale = await resolveLocale(params);
  const content = MARKETING.groundedAnswers[locale];
  return (
    <ProsePage
      locale={locale}
      content={content}
      path="/grounded-answers"
      crumb={content.meta.crumb}
      schema={marketingSchema(locale, "/grounded-answers", content, "TechArticle")}
    />
  );
}

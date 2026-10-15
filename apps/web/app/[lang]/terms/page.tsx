import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { PROSE } from "@/content";
import { getDictionary, pageMetadata, resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/terms">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { title, description } = getDictionary(locale).meta.terms;
  return pageMetadata({ locale, path: "/terms", title, description });
}

export default async function Page({ params }: PageProps<"/[lang]/terms">) {
  const locale = await resolveLocale(params);
  return <ProsePage locale={locale} content={PROSE.terms[locale]} />;
}

import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import { PROSE } from "@/content";
import { getDictionary, pageMetadata, resolveLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { title, description } = getDictionary(locale).meta.privacy;
  return pageMetadata({ locale, path: "/privacy", title, description });
}

export default async function Page({ params }: PageProps<"/[lang]/privacy">) {
  const locale = await resolveLocale(params);
  return <ProsePage locale={locale} content={PROSE.privacy[locale]} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProsePage } from "@/components/prose-page";
import { INTEGRATIONS } from "@/content";
import type { Locale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";
import { marketingMetadata, marketingSchema } from "@/lib/structured-data";

// Only the pages in content/; any other slug is a 404
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(INTEGRATIONS).map((slug) => ({ slug }));

async function resolve(params: PageProps<"/[lang]/integrations/[slug]">["params"]): Promise<{ locale: Locale; path: string; slug: string }> {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  if (!Object.hasOwn(INTEGRATIONS, slug)) notFound();
  return { locale, slug, path: `/integrations/${slug}` };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/integrations/[slug]">): Promise<Metadata> {
  const { locale, slug, path } = await resolve(params);
  return marketingMetadata(locale, path, INTEGRATIONS[slug][locale]);
}

export default async function Page({ params }: PageProps<"/[lang]/integrations/[slug]">) {
  const { locale, slug, path } = await resolve(params);
  const content = INTEGRATIONS[slug][locale];
  return <ProsePage locale={locale} content={content} path={path} crumb={content.meta.crumb} schema={marketingSchema(locale, path, content, "TechArticle")} />;
}

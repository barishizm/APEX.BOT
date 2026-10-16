import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProsePage } from "@/components/prose-page";
import { USE_CASES } from "@/content";
import type { Locale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";
import { marketingMetadata, marketingSchema } from "@/lib/structured-data";

// Only the pages in content/; any other slug is a 404
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(USE_CASES).map((slug) => ({ slug }));

async function resolve(params: PageProps<"/[lang]/use-cases/[slug]">["params"]): Promise<{ locale: Locale; path: string; slug: string }> {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  if (!Object.hasOwn(USE_CASES, slug)) notFound();
  return { locale, slug, path: `/use-cases/${slug}` };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/use-cases/[slug]">): Promise<Metadata> {
  const { locale, slug, path } = await resolve(params);
  return marketingMetadata(locale, path, USE_CASES[slug][locale]);
}

export default async function Page({ params }: PageProps<"/[lang]/use-cases/[slug]">) {
  const { locale, slug, path } = await resolve(params);
  const content = USE_CASES[slug][locale];
  return <ProsePage locale={locale} content={content} path={path} crumb={content.meta.crumb} schema={marketingSchema(locale, path, content, "WebPage")} />;
}

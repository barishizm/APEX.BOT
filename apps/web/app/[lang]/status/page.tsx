import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SystemStatus } from "@/components/ui/system-status";
import { getDictionary, pageMetadata, resolveLocale } from "@/lib/i18n/server";
import { cachedCheckServices } from "@/lib/status";

export async function generateMetadata({ params }: PageProps<"/[lang]/status">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { title, description } = getDictionary(locale).meta.status;
  return pageMetadata({ locale, path: "/status", title, description });
}

export default async function StatusPage({ params }: PageProps<"/[lang]/status">) {
  const locale = await resolveLocale(params);
  await connection(); // never prerendered; results are shared for 30s
  const { checks, checkedAt } = await cachedCheckServices();
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main" className="flex min-h-[80vh] justify-center bg-[var(--color-surface)] px-6 pb-24 pt-32 sm:pt-40">
        <SystemStatus locale={locale} checks={checks} checkedAt={checkedAt} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

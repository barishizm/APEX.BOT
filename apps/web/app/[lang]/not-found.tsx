import type { Metadata } from "next";
import { lang } from "next/root-params";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/server";

// not-found files get no params; the root param still tells us the language
async function currentLocale() {
  const value = await lang();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await currentLocale()).meta.notFound.title };
}

export default async function NotFound() {
  const locale = await currentLocale();
  const t = getDictionary(locale).notFound;
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main" className="closing" style={{ minHeight: "80vh", justifyContent: "center", paddingTop: 140 }}>
        <p className="eyebrow">404</p>
        <h1 style={{ fontSize: "var(--text-h2)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15 }}>{t.title}</h1>
        <p className="lede">{t.text}</p>
        <div className="actions">
          <a href={localizePath("/", locale)} className="btn btn--primary">
            {t.home}
          </a>
          <a href={localizePath("/docs", locale)} className="btn btn--ghost">
            {t.docs}
          </a>
          <a href={localizePath("/pricing", locale)} className="btn btn--ghost">
            {t.pricing}
          </a>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

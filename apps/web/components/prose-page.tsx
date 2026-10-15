import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { ProseContent } from "@/content/types";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/server";

// Long-form pages (docs, legal): readable column, optional table of contents
export function ProsePage({ locale, content }: { locale: Locale; content: ProseContent }) {
  const t = getDictionary(locale);
  const { eyebrow, title, intro, toc, body: Body } = content;
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main" className="prose-page">
        <header className="prose-page__head">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {intro && <p className="prose-page__intro">{intro}</p>}
        </header>
        <div className={toc ? "prose-page__body prose-page__body--toc" : "prose-page__body"}>
          {toc && (
            <nav aria-label={t.common.onThisPage} className="toc">
              <p className="toc__title">{t.common.onThisPage}</p>
              <ul>
                {toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <article className="prose">
            <Body />
          </article>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

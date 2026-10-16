import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { ProseContent } from "@/content/types";
import type { Locale } from "@/lib/i18n";
import { breadcrumbs, getDictionary, jsonLd } from "@/lib/i18n/server";

// Long-form pages (docs, legal, marketing): readable column, optional table of contents.
// Every one gets a breadcrumb trail for search results, plus any page-specific structured data.
export function ProsePage({
  locale,
  content,
  path,
  crumb,
  schema = [],
}: {
  locale: Locale;
  content: ProseContent;
  path: string;
  crumb: string;
  schema?: Record<string, unknown>[];
}) {
  const t = getDictionary(locale);
  const { eyebrow, title, intro, toc, body: Body } = content;
  const graph = { "@context": "https://schema.org", "@graph": [breadcrumbs(locale, [{ name: crumb, path }]), ...schema] };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
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

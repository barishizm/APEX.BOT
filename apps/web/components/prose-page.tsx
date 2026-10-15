import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Long-form pages (docs, legal): readable column, optional table of contents
export function ProsePage({
  eyebrow,
  title,
  intro,
  toc,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  toc?: { id: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="prose-page">
        <header className="prose-page__head">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {intro && <p className="prose-page__intro">{intro}</p>}
        </header>
        <div className={toc ? "prose-page__body prose-page__body--toc" : "prose-page__body"}>
          {toc && (
            <nav aria-label="On this page" className="toc">
              <p className="toc__title">On this page</p>
              <ul>
                {toc.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`}>{t.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <article className="prose">{children}</article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

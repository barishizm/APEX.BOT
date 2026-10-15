import { LanguageLinks } from "@/components/i18n/language-switcher";
import { buildFooter } from "@/components/site-nav";
import { format, localizePath, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/server";

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <footer className="site-foot">
      <div className="site-foot__brand">
        <a href={localizePath("/", locale)} className="logo" aria-label={t.common.homeLabel}>
          <span className="logo__mark" aria-hidden="true" />
        </a>
        <p>{t.footer.tagline}</p>
      </div>
      {buildFooter(t).map((col) => (
        <nav key={col.heading} aria-label={col.heading} className="site-foot__col">
          <p className="site-foot__heading">{col.heading}</p>
          <ul>
            {col.links.map((link) => (
              <li key={link.label}>
                <a href={localizePath(link.href, locale)}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <div className="site-foot__legal">
        <p>{format(t.footer.rights, { year: new Date().getFullYear() })}</p>
        <LanguageLinks />
      </div>
    </footer>
  );
}

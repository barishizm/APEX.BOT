import { FOOTER } from "@/components/site-nav";

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot__brand">
        <a href="/" className="logo" aria-label="Apex Bot home">
          <span className="logo__mark" aria-hidden="true" />
        </a>
        <p>The AI assistant that answers from your own website, in Turkish and English.</p>
      </div>
      {FOOTER.map((col) => (
        <nav key={col.heading} aria-label={col.heading} className="site-foot__col">
          <p className="site-foot__heading">{col.heading}</p>
          <ul>
            {col.links.map((link) => (
              <li key={link.label}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <p className="site-foot__legal">© {new Date().getFullYear()} Apex Bot. All rights reserved.</p>
    </footer>
  );
}

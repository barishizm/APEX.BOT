import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="closing" style={{ minHeight: "80vh", justifyContent: "center", paddingTop: 140 }}>
        <p className="eyebrow">404</p>
        <h1 style={{ fontSize: "var(--text-h2)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          This page doesn't exist
        </h1>
        <p className="lede">The link may be old or mistyped. These are good places to continue from:</p>
        <div className="actions">
          <a href="/" className="btn btn--primary">
            Home
          </a>
          <a href="/docs" className="btn btn--ghost">
            Docs
          </a>
          <a href="/pricing" className="btn btn--ghost">
            Pricing
          </a>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

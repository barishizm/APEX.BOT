import type { Metadata } from "next"
import { fontVariables } from "@/lib/fonts"
import { siteUrl } from "@/lib/site"
import "./globals.css"

// For URLs no route matches at all (the proxy sends page URLs to the localized 404 instead)
export const metadata: Metadata = { metadataBase: new URL(siteUrl()), title: "Page not found — Apex Bot", robots: { index: false } }

export default function GlobalNotFound() {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <main id="main" className="closing" style={{ minHeight: "100vh", justifyContent: "center" }}>
          <p className="eyebrow">404</p>
          <h1 style={{ fontSize: "var(--text-h2)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
            This page doesn&apos;t exist
          </h1>
          <div className="actions">
            <a href="/" className="btn btn--primary">
              Home
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}

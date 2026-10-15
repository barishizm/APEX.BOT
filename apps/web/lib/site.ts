// Public origin of this site. Production falls back to the canonical host so metadata (OG images,
// canonical, sitemap) never points at a preview or *.vercel.app domain when the env var is missing.
export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === "production" ? "https://www.apexbot.eu" : "http://localhost:3000")).replace(/\/+$/, "")

// Public URL of the chat API (apps/api); it also serves /widget.js.
export const apiUrl = () => (process.env.NEXT_PUBLIC_APEX_API_URL || "http://localhost:8787").replace(/\/+$/, "")

export const embedSnippet = (siteKey: string) => `<script src="${apiUrl()}/widget.js" data-site-key="${siteKey}" async></script>`

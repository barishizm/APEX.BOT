import Script from "next/script"
import { fontVariables } from "@/lib/fonts"
import { LOCALE_META, type Locale } from "@/lib/i18n"
import { apiUrl } from "@/lib/site"

// Runs before first paint so the saved theme never flashes the wrong colors. The `dark`
// class drives Tailwind's dark: utilities, so it also follows the OS when nothing is saved.
const themeScript = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem("theme")}catch(e){}if(t==="light"||t==="dark")d.dataset.theme=t;d.classList.toggle("dark",t==="dark"||(t!=="light"&&m.matches))}a();m.addEventListener("change",function(){if(!d.dataset.theme)a()})})()`

// Our own Apex widget on the marketing site, loaded from the branded API host. The site key is a public
// key (it ships in every page's HTML), so it lives in code rather than an env var that could drift.
const widgetSrc = `${apiUrl()}/widget.js`
const widgetSiteKey = "apex_pk_fbd20f0990571ba528bc0f14854ac58630c1"

// The <html> shell shared by the site's root layouts (localized pages and the app)
export function RootDocument({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html lang={LOCALE_META[locale].hreflang} dir={LOCALE_META[locale].dir} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Script src={widgetSrc} data-site-key={widgetSiteKey} strategy="lazyOnload" />
      </body>
    </html>
  )
}

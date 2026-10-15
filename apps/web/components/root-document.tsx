import Script from "next/script"
import { fontVariables } from "@/lib/fonts"
import { LOCALE_META, type Locale } from "@/lib/i18n"

// Runs before first paint so the saved theme never flashes the wrong colors. The `dark`
// class drives Tailwind's dark: utilities, so it also follows the OS when nothing is saved.
const themeScript = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem("theme")}catch(e){}if(t==="light"||t==="dark")d.dataset.theme=t;d.classList.toggle("dark",t==="dark"||(t!=="light"&&m.matches))}a();m.addEventListener("change",function(){if(!d.dataset.theme)a()})})()`

// Our own Apex widget on the marketing site; unset NEXT_PUBLIC_APEX_WIDGET_SRC to hide it.
const widgetSrc = process.env.NEXT_PUBLIC_APEX_WIDGET_SRC
const widgetSiteKey = process.env.NEXT_PUBLIC_APEX_SITE_KEY ?? "apex_pk_demo"

// The <html> shell shared by the site's root layouts (localized pages and the app)
export function RootDocument({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html lang={LOCALE_META[locale].hreflang} dir={LOCALE_META[locale].dir} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {widgetSrc && <Script src={widgetSrc} data-site-key={widgetSiteKey} strategy="lazyOnload" />}
      </body>
    </html>
  )
}

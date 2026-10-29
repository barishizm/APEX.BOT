"use client"

import { Globe } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { useI18n } from "@/components/i18n/provider"
import { LOCALE_COOKIE, LOCALE_META, LOCALES, localizePath, splitLocale, type Locale } from "@/lib/i18n"

// Remember the choice; the proxy prefers it over Accept-Language
function remember(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}

// The same page in every language, as plain links crawlers can follow
export function useLanguageLinks() {
  const { locale } = useI18n()
  const { path } = splitLocale(usePathname() ?? "/")
  return LOCALES.map((l) => ({ locale: l, href: localizePath(path, l), current: l === locale, onClick: () => remember(l) }))
}

// Header dropdown
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, t } = useI18n()
  const links = useLanguageLinks()
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false
        ref.current.querySelector("summary")?.focus()
      }
    }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  return (
    <details ref={ref} className={`lang ${className}`}>
      {/* the visible code is part of the name ("Change language EN"), so voice control can say it */}
      <summary className="lang__toggle">
        <Globe size={16} aria-hidden />
        <span className="sr-only">{t.common.changeLanguage} </span>
        <span>{locale.toUpperCase()}</span>
      </summary>
      <ul className="lang__menu" aria-label={t.common.language}>
        {links.map((l) => (
          <li key={l.locale}>
            <a
              href={l.href}
              hrefLang={LOCALE_META[l.locale].hreflang}
              lang={LOCALE_META[l.locale].hreflang}
              aria-current={l.current ? "true" : undefined}
              onClick={l.onClick}
            >
              {LOCALE_META[l.locale].name}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

// Inline list for the footer and mobile menu
export function LanguageLinks({ className = "" }: { className?: string }) {
  const { t } = useI18n()
  const links = useLanguageLinks()
  return (
    <nav aria-label={t.common.language} className={`lang-links ${className}`}>
      <Globe size={14} aria-hidden />
      {links.map((l) => (
        <a
          key={l.locale}
          href={l.href}
          hrefLang={LOCALE_META[l.locale].hreflang}
          lang={LOCALE_META[l.locale].hreflang}
          aria-current={l.current ? "true" : undefined}
          onClick={l.onClick}
        >
          {LOCALE_META[l.locale].name}
        </a>
      ))}
    </nav>
  )
}

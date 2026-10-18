import { LOCALE_META, type Locale } from "./config"

// Locale-aware formatting shared by server and client components

export const formatNumber = (n: number, locale: Locale) => n.toLocaleString(LOCALE_META[locale].intl)

export const formatDate = (date: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
  new Date(date).toLocaleString(LOCALE_META[locale].intl, options)

// "3 minutes ago" / "3 dakika önce"; anything under two minutes is "now"
export function timeAgo(date: Date | string, locale: Locale, now = Date.now()) {
  const seconds = (new Date(date).getTime() - now) / 1000
  const rtf = new Intl.RelativeTimeFormat(LOCALE_META[locale].intl, { numeric: "auto" })
  const abs = Math.abs(seconds)
  if (abs < 120) return rtf.format(0, "second")
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour")
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day")
  return formatDate(date, locale)
}

// Plural forms by CLDR category. English and Turkish need only one/other; Lithuanian also
// uses `few` (2-9, 22-29: "2 puslapiai" vs "10 puslapių"). A missing category falls back to other.
export type PluralForms = { one: string; other: string; few?: string; many?: string }

// Pick the plural form: { one: "{n} source", other: "{n} sources" }
export function plural(n: number, forms: PluralForms, locale: Locale) {
  const category = new Intl.PluralRules(LOCALE_META[locale].intl).select(n)
  const form = (category === "one" || category === "few" || category === "many" ? forms[category] : undefined) ?? forms.other
  return form.replace(/\{n\}/g, formatNumber(n, locale))
}

// 0.83 -> "83%" / "%83"
export const formatPercent = (ratio: number, locale: Locale) =>
  new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "percent", maximumFractionDigits: 0 }).format(ratio)

/** US dollars; amounts under a cent keep four digits so they don't read as $0.00. */
export function formatUsd(n: number, locale: Locale) {
  const digits = n > 0 && n < 0.01 ? 4 : 2
  return new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
}

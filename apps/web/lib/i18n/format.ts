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

// Pick the plural form: { one: "{n} source", other: "{n} sources" }
export function plural(n: number, forms: { one: string; other: string }, locale: Locale) {
  const form = new Intl.PluralRules(LOCALE_META[locale].intl).select(n) === "one" ? forms.one : forms.other
  return form.replace(/\{n\}/g, formatNumber(n, locale))
}

// 0.83 -> "83%" / "%83"
export const formatPercent = (ratio: number, locale: Locale) =>
  new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "percent", maximumFractionDigits: 0 }).format(ratio)

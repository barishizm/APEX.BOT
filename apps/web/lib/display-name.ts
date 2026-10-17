import type { User } from "@apex/db"

// Names that arrive in all capitals ("MAHMUT BARIŞ") read as shouting in a greeting
function softenCaps(word: string, locale: string): string {
  if (word.length < 2 || word !== word.toLocaleUpperCase(locale) || word === word.toLocaleLowerCase(locale)) return word
  const lower = word.toLocaleLowerCase(locale)
  return lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1)
}

/** How to address someone in a greeting: the first word of their display name, else the username. */
export function firstName(user: Pick<User, "username" | "displayName">, locale: string): string {
  const first = user.displayName?.trim().split(/\s+/)[0]
  return first ? softenCaps(first, locale) : user.username
}

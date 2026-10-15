import type { Locale } from "../config"

// Each namespace file keeps every language side by side: `en` sets the shape and the
// others must match it, so a missing or extra key is a type error.
export type Messages<T> = Record<Locale, T>

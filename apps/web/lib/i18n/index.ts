// Safe to import from client components: no dictionaries are pulled in from here.
export * from "./config"
export type { Dictionary } from "./dictionaries/en"

// "© {year} Apex Bot" + { year: 2026 } -> "© 2026 Apex Bot"
export function format(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

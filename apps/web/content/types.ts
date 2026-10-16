import type { ReactNode } from "react"

// A long-form page (docs, legal) in one language. Section ids stay the same in every
// language so deep links like /docs#install work everywhere.
export type ProseContent = {
  eyebrow: string
  title: string
  intro?: ReactNode
  toc?: { id: string; label: string }[]
  body: () => ReactNode
}

// A marketing page (about, use cases, integrations) carries its own search metadata.
// `crumb` is its short name in breadcrumbs.
export type MarketingContent = ProseContent & {
  meta: { title: string; description: string; crumb: string }
}

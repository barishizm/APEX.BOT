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

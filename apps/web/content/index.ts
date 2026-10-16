import type { Locale } from "@/lib/i18n"
import { docs as docsEn } from "./docs/en"
import { docs as docsTr } from "./docs/tr"
import { privacy as privacyEn } from "./privacy/en"
import { privacy as privacyTr } from "./privacy/tr"
import { security as securityEn } from "./security/en"
import { security as securityTr } from "./security/tr"
import { terms as termsEn } from "./terms/en"
import { terms as termsTr } from "./terms/tr"
import type { ProseContent } from "./types"

// Long-form pages per language. A new locale fails to type-check until it has all three.
export const PROSE: Record<"docs" | "privacy" | "security" | "terms", Record<Locale, ProseContent>> = {
  docs: { en: docsEn, tr: docsTr },
  privacy: { en: privacyEn, tr: privacyTr },
  security: { en: securityEn, tr: securityTr },
  terms: { en: termsEn, tr: termsTr },
}

"use client"

import { useState } from "react"
import { DEFAULT_SETTINGS, LANGS, type BotSettings, type Lang } from "@apex/db/bot-settings"
import { useI18n } from "@/components/i18n/provider"
import { LOCALE_META } from "@/lib/i18n"
import { WidgetPreview, type PreviewView } from "@/components/widget-studio/preview"
import { useDark } from "@/lib/use-dark"

// The same preview the dashboard's widget studio renders, with a sample brand applied.
const SAMPLE: BotSettings = {
  ...DEFAULT_SETTINGS,
  general: { ...DEFAULT_SETTINGS.general, companyName: "Crest Cycles" },
  appearance: { ...DEFAULT_SETTINGS.appearance, primaryColor: "#312c85", launcherIcon: "sparkle" },
  messages: {
    ...DEFAULT_SETTINGS.messages,
    suggestions: {
      tr: ["Kargo ne kadar sürer?", "İade koşulları neler?"],
      en: ["How long does shipping take?", "What is your return policy?"],
      lt: ["Kiek laiko trunka pristatymas?", "Kokios grąžinimo sąlygos?"],
      lv: ["Cik ilgi notiek piegāde?", "Kādi ir atgriešanas noteikumi?"],
      et: ["Kui kaua tarne aega võtab?", "Millised on tagastustingimused?"],
    },
  },
  handoff: { ...DEFAULT_SETTINGS.handoff, email: "support@example.com" },
  security: { ...DEFAULT_SETTINGS.security, allowedOrigins: ["https://crest-cycles.example"] },
}

const VIEWS = ["conversation", "welcome"] as const satisfies readonly PreviewView[]

export function WidgetShowcase() {
  const { locale, t } = useI18n()
  const dark = useDark()
  // the widget speaks every site language, so the preview starts in the page's own
  const [lang, setLang] = useState<Lang>(locale)
  const [view, setView] = useState<PreviewView>("conversation")
  const [open, setOpen] = useState(true)

  const pill = (on: boolean) => `showcase__pill${on ? " showcase__pill--on" : ""}`

  return (
    <div className="showcase__stage">
      <div className="showcase__controls">
        <div role="radiogroup" aria-label={t.showcase.previewLanguage} className="showcase__pills">
          {[locale, ...LANGS.filter((l) => l !== locale)].map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              aria-label={LOCALE_META[l].name}
              title={LOCALE_META[l].name}
              lang={LOCALE_META[l].hreflang}
              className={pill(lang === l)}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label={t.showcase.previewScreen} className="showcase__pills">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={open && view === v}
              className={pill(open && view === v)}
              onClick={() => {
                setView(v)
                setOpen(true)
              }}
            >
              {v === "conversation" ? t.showcase.answer : t.showcase.welcome}
            </button>
          ))}
        </div>
      </div>
      <WidgetPreview settings={SAMPLE} lang={lang} open={open} device="desktop" dark={dark} view={view} onToggle={() => setOpen((o) => !o)} height={600} />
    </div>
  )
}

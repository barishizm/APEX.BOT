"use client"

import { useState } from "react"
import { DEFAULT_SETTINGS, type BotSettings, type Lang } from "@apex/db/bot-settings"
import { useI18n } from "@/components/i18n/provider"
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
    },
  },
  handoff: { ...DEFAULT_SETTINGS.handoff, email: "support@example.com" },
  security: { ...DEFAULT_SETTINGS.security, allowedOrigins: ["https://crest-cycles.example"] },
}

const VIEWS = ["conversation", "welcome"] as const satisfies readonly PreviewView[]

export function WidgetShowcase() {
  const { locale, t } = useI18n()
  const dark = useDark()
  // the widget speaks Turkish and English; other site languages preview in English
  const [lang, setLang] = useState<Lang>(locale === "tr" ? "tr" : "en")
  const [view, setView] = useState<PreviewView>("conversation")
  const [open, setOpen] = useState(true)

  const pill = (on: boolean) => `showcase__pill${on ? " showcase__pill--on" : ""}`

  return (
    <div className="showcase__stage">
      <div className="showcase__controls">
        <div role="radiogroup" aria-label={t.showcase.previewLanguage} className="showcase__pills">
          {(["en", "tr"] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className={pill(lang === l)} onClick={() => setLang(l)}>
              {l === "en" ? "English" : "Türkçe"}
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

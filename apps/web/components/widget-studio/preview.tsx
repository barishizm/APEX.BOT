"use client"

import {
  Bot,
  ChevronDown,
  CircleHelp,
  Headset,
  MessageCircle,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
  ArrowUp,
  type LucideIcon,
} from "lucide-react"
import type { CSSProperties } from "react"
import {
  FONT_STACKS,
  LAUNCHER_SIZES,
  PANEL_WIDTHS,
  readableOn,
  type BotSettings,
  type Lang,
  type LauncherIcon,
} from "@apex/db/bot-settings"
import { useI18n } from "@/components/i18n/provider"

export type PreviewView = "welcome" | "conversation" | "lead"

// Same palettes as the widget's shadow-root CSS (apps/widget/src/styles.ts)
const PALETTE = {
  light: { bg: "#ffffff", surface: "#f6f6f3", text: "#0c0c09", muted: "#64645c", line: "#e4e4de", bubble: "#f0f0eb" },
  dark: { bg: "#171713", surface: "#0f0f0c", text: "#f4f4f1", muted: "#a3a39b", line: "#2c2c25", bubble: "#24241e" },
}

export const LAUNCHER_ICONS: Record<Exclude<LauncherIcon, "custom">, LucideIcon> = {
  chat: MessageCircle,
  sparkle: Sparkles,
  help: CircleHelp,
  headset: Headset,
}

const COPY = {
  tr: {
    ai: "Yapay zekâ asistanı",
    human: "Bir insanla konuş",
    privacy: "Gizlilik",
    sources: "Kaynaklar",
    question: "Kargo ne kadar sürer?",
    answer: "Siparişler **1–3 iş günü** içinde kargoya verilir. 750 TL üzeri siparişlerde kargo ücretsizdir.",
    source: "Kargo ve teslimat",
    leadTitle: "Başlamadan önce",
    leadIntro: "Size daha iyi yardımcı olabilmemiz için iletişim bilgilerinizi bırakın.",
    name: "Adınız",
    email: "E-posta adresiniz",
    phone: "Telefon numaranız",
    optional: "(isteğe bağlı)",
    start: "Sohbete başla",
    skip: "Atla",
    powered: "Apex Bot ile çalışır",
  },
  en: {
    ai: "AI assistant",
    human: "Talk to a human",
    privacy: "Privacy",
    sources: "Sources",
    question: "How long does shipping take?",
    answer: "Orders ship within **1–3 business days**. Shipping is free on orders over $50.",
    source: "Shipping & delivery",
    leadTitle: "Before we start",
    leadIntro: "Leave your contact details so we can help you better.",
    name: "Your name",
    email: "Your email",
    phone: "Your phone number",
    optional: "(optional)",
    start: "Start chatting",
    skip: "Skip",
    powered: "Powered by Apex Bot",
  },
  lt: {
    ai: "DI asistentas",
    human: "Kalbėti su žmogumi",
    privacy: "Privatumas",
    sources: "Šaltiniai",
    question: "Kiek laiko trunka pristatymas?",
    answer: "Užsakymai išsiunčiami per **1–3 darbo dienas**. Užsakymams nuo 50 € pristatymas nemokamas.",
    source: "Pristatymas",
    leadTitle: "Prieš pradedant",
    leadIntro: "Palikite savo kontaktinius duomenis, kad galėtume jums geriau padėti.",
    name: "Jūsų vardas",
    email: "Jūsų el. pašto adresas",
    phone: "Jūsų telefono numeris",
    optional: "(neprivaloma)",
    start: "Pradėti pokalbį",
    skip: "Praleisti",
    powered: "Veikia su Apex Bot",
  },
  lv: {
    ai: "MI asistents",
    human: "Runāt ar cilvēku",
    privacy: "Privātums",
    sources: "Avoti",
    question: "Cik ilgi notiek piegāde?",
    answer: "Pasūtījumi tiek nosūtīti **1–3 darba dienu** laikā. Pasūtījumiem virs 50 € piegāde ir bez maksas.",
    source: "Piegāde",
    leadTitle: "Pirms sākam",
    leadIntro: "Atstājiet savu kontaktinformāciju, lai mēs varētu jums labāk palīdzēt.",
    name: "Jūsu vārds",
    email: "Jūsu e-pasta adrese",
    phone: "Jūsu tālruņa numurs",
    optional: "(nav obligāti)",
    start: "Sākt sarunu",
    skip: "Izlaist",
    powered: "Darbina Apex Bot",
  },
  et: {
    ai: "TI assistent",
    human: "Räägi inimesega",
    privacy: "Privaatsus",
    sources: "Allikad",
    question: "Kui kaua tarne aega võtab?",
    answer: "Tellimused saadetakse teele **1–3 tööpäeva** jooksul. Üle 50 € tellimuste tarne on tasuta.",
    source: "Tarne",
    leadTitle: "Enne alustamist",
    leadIntro: "Jätke oma kontaktandmed, et saaksime teid paremini aidata.",
    name: "Teie nimi",
    email: "Teie e-posti aadress",
    phone: "Teie telefoninumber",
    optional: "(valikuline)",
    start: "Alusta vestlust",
    skip: "Jäta vahele",
    powered: "Apex Boti toel",
  },
} satisfies Record<Lang, Record<string, string>>

function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
      )}
    </>
  )
}

export function WidgetPreview({
  settings,
  lang,
  open,
  device,
  dark,
  view,
  onToggle,
  height,
}: {
  settings: BotSettings
  lang: Lang
  open: boolean
  device: "desktop" | "mobile"
  dark: boolean
  view: PreviewView
  onToggle: () => void
  /** Frame height in px; defaults to a full browser window. */
  height?: number
}) {
  // the site dictionary: this preview also runs on the marketing pages
  const { t: site } = useI18n()
  const { general, appearance: a, messages: m, behavior: b, handoff } = settings
  const t = COPY[lang]
  const theme = a.theme === "auto" ? (dark ? "dark" : "light") : a.theme
  const c = PALETTE[theme]
  const onP = readableOn(a.primaryColor)
  const left = a.position === "bottom-left"
  const mobile = device === "mobile"
  const fullscreen = mobile && open && b.mobileFullscreen
  const size = LAUNCHER_SIZES[a.launcherSize]
  const label = a.launcherLabel[lang]
  const iconSize = { width: size * 0.42, height: size * 0.42 }
  const launcherIcon =
    a.launcherIcon === "custom" ? (
      a.launcherImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.launcherImage} alt="" style={{ width: size * 0.6, height: size * 0.6, objectFit: "contain" }} />
      ) : (
        <MessageCircle style={iconSize} />
      )
    ) : (
      (() => {
        const Icon = LAUNCHER_ICONS[a.launcherIcon]
        return <Icon style={iconSize} />
      })()
    )
  const subtitle = general.subtitle[lang] || [t.ai, general.companyName].filter(Boolean).join(" · ")
  const handoffOn = handoff.enabled && !!handoff.email
  const radius = Math.min(a.radius, 28)
  // the mobile frame is narrower than the real panel widths
  const edgeX = mobile ? Math.min(a.offsetX, 16) : a.offsetX
  const edgeY = mobile ? Math.min(a.offsetY, 16) : a.offsetY

  const root: CSSProperties = {
    fontFamily: FONT_STACKS[a.font],
    color: c.text,
    fontSize: 14,
    lineHeight: 1.5,
  }
  const side = (px: number): CSSProperties => (left ? { left: px } : { right: px })

  const avatar = (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold"
      style={{ width: 32, height: 32, background: a.primaryColor, color: onP, fontSize: 14 }}
    >
      {a.avatar === "image" && a.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : a.avatar === "icon" ? (
        <Bot className="h-4 w-4" />
      ) : (
        (general.botName || "A").slice(0, 1).toUpperCase()
      )}
    </span>
  )

  const bubble = (who: "bot" | "user"): CSSProperties =>
    who === "bot"
      ? { alignSelf: "flex-start", background: c.bubble, borderRadius: 16, borderBottomLeftRadius: 5 }
      : { alignSelf: "flex-end", background: a.primaryColor, color: onP, borderRadius: 16, borderBottomRightRadius: 5 }

  const chip: CSSProperties = {
    border: `1px solid ${c.line}`,
    background: c.bg,
    color: c.text,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    whiteSpace: "nowrap",
  }

  const suggestions = m.suggestions[lang]
  const body =
    view === "lead" && handoff.leadCapture === "before-chat" ? (
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto" style={{ padding: "20px 16px" }}>
        <strong style={{ fontSize: 16 }}>{t.leadTitle}</strong>
        <span style={{ color: c.muted, fontSize: 13 }}>{t.leadIntro}</span>
        {(
          [
            ["email", true],
            ["name", handoff.leadFields.name],
            ["phone", handoff.leadFields.phone],
          ] as const
        )
          .filter(([, on]) => on)
          .map(([key]) => (
            <span key={key} className="flex flex-col gap-1" style={{ fontSize: 12, fontWeight: 500 }}>
              {t[key]} {!handoff.leadRequired && key !== "email" ? <span style={{ color: c.muted }}>{t.optional}</span> : null}
              <span style={{ height: 36, border: `1px solid ${c.line}`, borderRadius: 10, background: c.surface }} />
            </span>
          ))}
        <span className="flex gap-2" style={{ marginTop: 4 }}>
          <span style={{ background: a.primaryColor, color: onP, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 500 }}>
            {t.start}
          </span>
          {!handoff.leadRequired && (
            <span style={{ border: `1px solid ${c.line}`, borderRadius: 10, padding: "8px 14px", fontSize: 13 }}>{t.skip}</span>
          )}
        </span>
      </div>
    ) : (
      <>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto" style={{ padding: "14px 12px" }}>
          <div style={{ ...bubble("bot"), padding: "8px 12px", maxWidth: "86%", whiteSpace: "pre-wrap" }}>{m.greeting[lang]}</div>
          {view === "conversation" && (
            <>
              <div style={{ ...bubble("user"), padding: "8px 12px", maxWidth: "86%" }}>{t.question}</div>
              <div style={{ ...bubble("bot"), padding: "8px 12px", maxWidth: "86%" }}>
                <Bold text={t.answer} />
              </div>
              <div className="flex flex-col gap-1.5" style={{ maxWidth: "86%", marginTop: -4 }}>
                {b.showSources && (
                  <span className="flex flex-wrap items-center gap-1.5" style={{ fontSize: 12 }}>
                    <span style={{ color: c.muted }}>{t.sources}:</span>
                    <span style={chip}>{t.source}</span>
                  </span>
                )}
                {b.showFeedback && (
                  <span className="flex gap-1" style={{ color: c.muted }}>
                    <ThumbsUp className="h-3.5 w-3.5" />
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        {view === "welcome" && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" style={{ padding: "0 12px 10px" }}>
            {suggestions.map((s) => (
              <span key={s} style={{ ...chip, fontSize: 12.5, padding: "5px 11px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2" style={{ padding: "8px 10px", borderTop: `1px solid ${c.line}` }}>
          <span
            className="flex-1 truncate"
            style={{ border: `1px solid ${c.line}`, borderRadius: 12, background: c.surface, padding: "9px 11px", color: c.muted }}
          >
            {m.placeholder[lang]}
          </span>
          <span className="grid shrink-0 place-items-center" style={{ width: 40, height: 40, borderRadius: 12, background: a.primaryColor, color: onP, opacity: 0.35 }}>
            <ArrowUp className="h-4 w-4" />
          </span>
        </div>
        <div className="text-center" style={{ padding: "0 12px 8px", fontSize: 10.5, color: c.muted, lineHeight: 1.5 }}>
          {[m.showDisclaimer && m.disclaimer[lang], m.privacyUrl && t.privacy, handoffOn && t.human]
            .filter(Boolean)
            .map((part, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {i === 0 && m.showDisclaimer ? part : <u>{part}</u>}
              </span>
            ))}
          {a.showBranding && <div style={{ opacity: 0.8 }}>{t.powered}</div>}
        </div>
      </>
    )

  const panel = open && (
    <section
      aria-label={site.showcase.panel}
      className="absolute flex flex-col overflow-hidden"
      style={
        fullscreen
          ? { inset: 0, background: c.bg, zIndex: 2 }
          : {
              ...side(edgeX),
              bottom: edgeY + size + 14,
              width: `min(${PANEL_WIDTHS[a.panelWidth]}px, calc(100% - ${edgeX * 2}px))`,
              top: 46,
              maxHeight: 640,
              background: c.bg,
              border: `1px solid ${c.line}`,
              borderRadius: radius,
              boxShadow: "0 24px 64px rgba(12,12,9,.18), 0 2px 8px rgba(12,12,9,.08)",
              zIndex: 2,
            }
      }
    >
      <div className="flex items-center gap-2.5" style={{ padding: "10px 8px 10px 12px", borderBottom: `1px solid ${c.line}` }}>
        {avatar}
        <span className="min-w-0 flex-1" style={{ lineHeight: 1.25 }}>
          <strong className="block truncate" style={{ fontSize: 14 }}>
            {general.botName}
          </strong>
          <span className="block truncate" style={{ fontSize: 11.5, color: c.muted }}>
            {subtitle}
          </span>
        </span>
        <RotateCcw className="h-4 w-4" style={{ color: c.muted }} />
        <button type="button" onClick={onToggle} aria-label={site.showcase.closePanel} className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent" style={{ color: c.muted }}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {body}
    </section>
  )

  const teaser = !open && b.teaser[lang] && (
    <span
      className="absolute"
      style={{
        ...side(edgeX),
        bottom: edgeY + size + 12,
        maxWidth: 240,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.line}`,
        borderRadius: 14,
        padding: "8px 12px",
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(12,12,9,.14)",
      }}
    >
      {b.teaser[lang]}
    </span>
  )

  const launcher = !fullscreen && (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? site.showcase.closePanel : site.showcase.openPanel}
      className="absolute flex cursor-pointer items-center justify-center gap-2 border-0 font-semibold transition-transform hover:scale-105"
      style={{
        ...side(edgeX),
        bottom: edgeY,
        height: size,
        minWidth: size,
        padding: label && !open ? `0 ${size / 2.6}px` : 0,
        borderRadius: 999,
        background: a.primaryColor,
        color: onP,
        fontFamily: FONT_STACKS[a.font],
        fontSize: 14,
        boxShadow: "0 8px 24px rgba(12,12,9,.24), 0 1px 3px rgba(12,12,9,.2)",
        zIndex: 3,
      }}
    >
      {open ? <ChevronDown style={iconSize} /> : launcherIcon}
      {label && !open && <span>{label}</span>}
    </button>
  )

  return (
    <div
      className={`relative mx-auto overflow-hidden border border-[var(--color-line)] ${mobile ? "rounded-[2rem]" : "rounded-xl"}`}
      style={{ ...root, width: mobile ? 360 : "100%", maxWidth: "100%", height: height ?? (mobile ? 680 : 700), background: theme === "dark" ? "#0c0c09" : "#eeeee9" }}
    >
      {/* a stand-in host page, so the widget's position and contrast read in context */}
      <div aria-hidden className="flex items-center gap-1.5 px-3" style={{ height: 34, background: theme === "dark" ? "#1b1b17" : "#ffffff", borderBottom: `1px solid ${c.line}` }}>
        {!mobile && ["#ff5f57", "#febc2e", "#28c840"].map((d) => <span key={d} className="h-2.5 w-2.5 rounded-full" style={{ background: d }} />)}
        <span className="mx-auto truncate rounded-md px-3 py-0.5 text-[11px]" style={{ background: c.surface, color: c.muted }}>
          {settings.security.allowedOrigins[0]?.replace(/^https?:\/\//, "") || "your-website.com"}
        </span>
      </div>
      <div aria-hidden className="flex flex-col gap-3 p-5 opacity-60">
        <span className="h-5 w-2/5 rounded" style={{ background: c.line }} />
        <span className="h-3 w-4/5 rounded" style={{ background: c.line }} />
        <span className="h-3 w-3/5 rounded" style={{ background: c.line }} />
        <span className="h-28 w-full rounded-lg" style={{ background: c.line, opacity: 0.6 }} />
        <span className="h-3 w-2/3 rounded" style={{ background: c.line }} />
      </div>
      {panel}
      {teaser}
      {launcher}
    </div>
  )
}

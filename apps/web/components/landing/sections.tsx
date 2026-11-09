import {
  BookOpenText,
  Cpu,
  Gauge,
  Globe,
  Languages,
  LifeBuoy,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
  Timer,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { CopySnippet } from "@/components/copy-snippet";
import { ClosingActions } from "@/components/landing/closing-actions";
import { WidgetShowcase } from "@/components/landing/widget-showcase";
import { localizePath, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/server";
import { embedSnippet } from "@/lib/site";

const STEP_IMAGES = ["/marketing/step1.jpg", "/marketing/step2.jpg", "/marketing/step3.jpg"];

const FEATURE_ICONS: LucideIcon[] = [BookOpenText, Languages, LifeBuoy, UserPlus, Cpu, Gauge];

const SECURITY_ICONS: LucideIcon[] = [Globe, ShieldCheck, LockKeyhole, Timer];

function SectionHead({ eyebrow, title, text, center }: { eyebrow: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? "section-head section-head--center" : "section-head"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {text && <p className="section-head__text">{text}</p>}
    </div>
  );
}

export function LandingSections({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing;
  return (
    <>
      <section className="night" aria-labelledby="night-title">
        <figure className="night__frame">
          <Image
            src="/marketing/night.jpg"
            alt={t.night.alt}
            width={2048}
            height={1152}
            sizes="(max-width: 1200px) 100vw, 1200px"
            className="night__img"
          />
          <figcaption className="night__caption">
            <p className="eyebrow">{t.night.eyebrow}</p>
            <h2 id="night-title">{t.night.title}</h2>
            <p>{t.night.text}</p>
          </figcaption>
        </figure>
      </section>

      <section id="how-it-works" className="section-block" aria-labelledby="how-title">
        <div className="section-head">
          <p className="eyebrow">{t.how.eyebrow}</p>
          <h2 id="how-title">{t.how.title}</h2>
        </div>
        <ol className="grid3 steps">
          {t.how.steps.map((step, i) => (
            <li key={step.title}>
              <Image src={STEP_IMAGES[i]} alt={step.alt} width={960} height={720} sizes="(max-width: 760px) 100vw, 380px" className="steps__img" />
              <span className="steps__n">0{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="section-block">
        <SectionHead eyebrow={t.features.eyebrow} title={t.features.title} text={t.features.text} />
        <ul className="feature-grid">
          {t.features.items.map(({ title, text }, i) => {
            const Icon = FEATURE_ICONS[i];
            return (
              <li key={title} className="feature">
                <span className="feature__icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="widget" className="section-block showcase">
        <div className="showcase__copy">
          <SectionHead eyebrow={t.widget.eyebrow} title={t.widget.title} text={t.widget.text} />
          <ul className="checks">
            {t.widget.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </div>
        <WidgetShowcase />
      </section>

      <section id="security" className="section-block">
        <SectionHead eyebrow={t.security.eyebrow} title={t.security.title} text={t.security.text} />
        <ul className="feature-grid feature-grid--two">
          {t.security.items.map(({ title, text }, i) => {
            const Icon = SECURITY_ICONS[i];
            return (
              <li key={title} className="feature">
                <span className="feature__icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="install" className="section-block install-band">
        <div className="install-band__frame">
          <SectionHead eyebrow={t.install.eyebrow} title={t.install.title} text={t.install.text} />
          <CopySnippet code={embedSnippet("YOUR_SITE_KEY")} />
          <p className="install-note">
            <ScanSearch size={16} aria-hidden="true" />
            <span>
              {t.install.notePre} <a href={localizePath("/docs#platforms", locale)}>{t.install.noteLink}</a>
              {t.install.notePost}
            </span>
          </p>
        </div>
      </section>

      <section id="faq" className="section-block">
        <SectionHead eyebrow={t.faq.eyebrow} title={t.faq.title} />
        <div className="faq">
          {t.faq.items.map(({ q, a }) => (
            <details key={q} className="faq__item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <Image src="/marketing/closing.jpg" alt="" fill sizes="(max-width: 1200px) 100vw, 1200px" className="closing__bg" />
        <h2 id="closing-title">{t.closing.title}</h2>
        <p className="lede">{t.closing.lede}</p>
        <div className="actions">
          <ClosingActions />
          <a href={localizePath("/docs", locale)} className="btn btn--ghost">
            {t.closing.docs}
          </a>
        </div>
      </section>
    </>
  );
}

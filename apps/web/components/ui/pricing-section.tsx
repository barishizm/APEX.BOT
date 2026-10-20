"use client";

import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { OVERAGE_BLOCK, PLANS, PLAN_LIMITS, PLAN_PRICES, annualSaving, type Plan } from "@apex/db/plans";
import { useI18n } from "@/components/i18n/provider";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { openAuth } from "@/components/ui/login-button";
import { formatNumber, formatPercent } from "@/lib/i18n/format";
import { LOCALE_META, format, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Names, blurbs and feature wording come from the dictionary; prices and every number in the
// features come from @apex/db/plans. Prices stay in USD in every language.
const FEATURED: Plan = "pro";

// $29, not $29.00: plan prices are whole dollars
const usd = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export const Component = () => {
  const { t: dict, locale } = useI18n();
  const t = dict.pricing;
  const [annual, setAnnual] = useState(true);

  return (
    <section className="relative w-full bg-[var(--color-surface)] pb-24 pt-32 text-[var(--color-text)] sm:pb-32 sm:pt-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="mb-14 flex flex-col items-center text-center">
          <p className="eyebrow mb-4">{t.eyebrow}</p>
          <h1 className="mb-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {t.titleA} <br className="hidden sm:block" />
            <span className="text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]">{t.titleB}</span>
          </h1>
          <p className="max-w-xl text-balance text-base text-[var(--color-muted)] sm:text-lg">
            {t.lede}
          </p>

          <div className="mt-10 flex items-center gap-3 text-sm font-medium">
            <span className={annual ? "text-[var(--color-muted)]" : "text-[var(--color-text)]"}>{t.monthly}</span>
            <button
              type="button"
              role="switch"
              aria-checked={annual}
              aria-label={t.billAnnually}
              onClick={() => setAnnual((a) => !a)}
              className="relative flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 bg-[color-mix(in_srgb,var(--color-text)_14%,transparent)] p-0 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_22%,transparent)]"
            >
              <span
                className={cn(
                  "absolute left-0 top-1 h-4 w-4 rounded-full bg-[var(--color-text)] transition-transform duration-200",
                  annual ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
            <span className={cn("flex items-center gap-2", annual ? "text-[var(--color-text)]" : "text-[var(--color-muted)]")}>
              {t.annually}
              <span className="rounded-full bg-[color-mix(in_srgb,var(--color-secondary)_16%,transparent)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-secondary)]">
                {format(t.save, { percent: formatPercent(Math.max(...PLANS.map(annualSaving)), locale) })}
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((id) => {
            const copy = t.plans[id];
            const featured = id === FEATURED;
            const prices = PLAN_PRICES[id];
            const paid = prices.monthly > 0;
            const price = usd(paid && annual ? prices.annual / 12 : prices.monthly, locale);
            const limits = PLAN_LIMITS[id];
            const numbers = {
              replies: formatNumber(limits.monthlyReplies, locale),
              websites: formatNumber(limits.websites, locale),
              pages: formatNumber(limits.websitePages, locale),
              retentionDays: formatNumber(limits.maxRetentionDays, locale),
            };
            return (
              <article
                key={id}
                className={cn(
                  "relative flex flex-col rounded-xl border p-7",
                  featured
                    ? "border-[color-mix(in_srgb,var(--color-text)_30%,transparent)] bg-[var(--color-raised)] shadow-xl"
                    : "border-[var(--color-line)] bg-[var(--color-raised)]",
                )}
              >
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{copy.name}</h2>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">{copy.blurb}</p>
                  </div>
                  {featured && (
                    <span className="shrink-0 rounded-full bg-[var(--color-text)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-surface)]">
                      {t.popular}
                    </span>
                  )}
                </div>

                <div className="mb-8 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight">{price}</span>
                  {copy.unit && <span className="text-sm font-medium text-[var(--color-muted)]">{copy.unit}</span>}
                  {paid && annual && (
                    <span className="text-xs text-[var(--color-muted)]">{t.billedYearly}</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => openAuth("register", e.currentTarget)}
                  className={cn(
                    "mb-8 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90 active:scale-[0.98]",
                    featured
                      ? "border-0 bg-[var(--color-text)] text-[var(--color-surface)]"
                      : "border border-[var(--color-line)] bg-transparent text-[var(--color-text)]",
                  )}
                >
                  {copy.cta}
                  {featured && <ArrowRight className="h-4 w-4" aria-hidden />}
                </button>

                <div className="mb-6 h-px w-full bg-[var(--color-line)]" />

                <ul className="flex flex-col gap-3.5 text-sm">
                  {copy.features.map((template) => format(template, numbers)).map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        className={cn("mt-0.5 h-4 w-4 shrink-0", featured ? "text-[var(--color-secondary)]" : "text-[var(--color-muted)]")}
                        aria-hidden
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-xs leading-relaxed text-[var(--color-muted)]">
          {format(t.usageNote, { blockPrice: usd(OVERAGE_BLOCK.priceCents, locale), blockReplies: formatNumber(OVERAGE_BLOCK.replies, locale) })}
        </p>

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          {t.footerPre}{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Apex Bot Enterprise")}`} className="text-[var(--color-text)] underline underline-offset-2">
            {t.emailUs}
          </a>
          {t.footerPost}
        </p>
      </div>
    </section>
  );
};

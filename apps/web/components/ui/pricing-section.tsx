"use client";

import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { CONTACT_EMAIL } from "@/components/site-nav";
import { openAuth } from "@/components/ui/login-button";
import { cn } from "@/lib/utils";

type Plan = {
  name: string;
  blurb: string;
  price: { monthly: string; annual: string } | string;
  unit?: string;
  features: string[];
  cta: { label: string; action: "register" | "contact" };
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    blurb: "For small sites trying an AI assistant for the first time.",
    price: "$0",
    unit: "forever",
    features: [
      "1 assistant on 1 website",
      "Up to 50 pages of knowledge",
      "Turkish and English",
      "Email hand-off and lead capture",
      "“Powered by Apex Bot” in the widget",
    ],
    cta: { label: "Start for free", action: "register" },
  },
  {
    name: "Pro",
    blurb: "For businesses that answer customers every day.",
    price: { monthly: "$39", annual: "$29" },
    unit: "per month",
    features: [
      "Up to 5 websites",
      "Up to 1,000 pages of knowledge",
      "Claude, OpenAI or Gemini models, with fallback",
      "Remove Apex branding",
      "Custom instructions and topics to decline",
      "Priority email support",
    ],
    cta: { label: "Start with Pro", action: "register" },
    featured: true,
  },
  {
    name: "Enterprise",
    blurb: "For teams with volume, compliance or data-residency needs.",
    price: "Custom",
    features: [
      "Unlimited websites and knowledge",
      "Custom usage limits and budgets",
      "Data processing agreement (KVKK / GDPR)",
      "Custom retention periods",
      "Onboarding with our team",
    ],
    cta: { label: "Contact sales", action: "contact" },
  },
];

export const Component = () => {
  const [annual, setAnnual] = useState(true);

  return (
    <section className="relative w-full bg-[var(--color-surface)] pb-24 pt-32 text-[var(--color-text)] sm:pb-32 sm:pt-40">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="mb-14 flex flex-col items-center text-center">
          <p className="eyebrow mb-4">Pricing</p>
          <h1 className="mb-4 max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Free during the beta. <br className="hidden sm:block" />
            <span className="text-[color-mix(in_srgb,var(--color-text)_45%,transparent)]">Simple plans after.</span>
          </h1>
          <p className="max-w-xl text-balance text-base text-[var(--color-muted)] sm:text-lg">
            Every feature is free while Apex is in beta. These are the plans we'll offer at launch; we'll tell you well before
            anything changes.
          </p>

          <div className="mt-10 flex items-center gap-3 text-sm font-medium">
            <span className={annual ? "text-[var(--color-muted)]" : "text-[var(--color-text)]"}>Monthly</span>
            <button
              type="button"
              role="switch"
              aria-checked={annual}
              aria-label="Bill annually"
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
              Annually
              <span className="rounded-full bg-[color-mix(in_srgb,var(--color-secondary)_16%,transparent)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-secondary)]">
                Save 25%
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const price = typeof plan.price === "string" ? plan.price : annual ? plan.price.annual : plan.price.monthly;
            return (
              <article
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-xl border p-8",
                  plan.featured
                    ? "border-[color-mix(in_srgb,var(--color-text)_30%,transparent)] bg-[var(--color-raised)] shadow-xl"
                    : "border-[var(--color-line)] bg-[var(--color-raised)]",
                )}
              >
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{plan.name}</h2>
                    <p className="mt-2 text-sm text-[var(--color-muted)]">{plan.blurb}</p>
                  </div>
                  {plan.featured && (
                    <span className="shrink-0 rounded-full bg-[var(--color-text)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-surface)]">
                      Popular
                    </span>
                  )}
                </div>

                <div className="mb-8 flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight">{price}</span>
                  {plan.unit && <span className="text-sm font-medium text-[var(--color-muted)]">{plan.unit}</span>}
                  {typeof plan.price !== "string" && annual && (
                    <span className="text-xs text-[var(--color-muted)]">· billed yearly</span>
                  )}
                </div>

                {plan.cta.action === "contact" ? (
                  <a
                    href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Apex Bot Enterprise")}`}
                    className="mb-8 flex h-10 w-full items-center justify-center rounded-md border border-[var(--color-line)] text-sm font-medium no-underline transition-colors hover:border-[var(--color-muted)]"
                  >
                    {plan.cta.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => openAuth("register", e.currentTarget)}
                    className={cn(
                      "mb-8 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90 active:scale-[0.98]",
                      plan.featured
                        ? "border-0 bg-[var(--color-text)] text-[var(--color-surface)]"
                        : "border border-[var(--color-line)] bg-transparent text-[var(--color-text)]",
                    )}
                  >
                    {plan.cta.label}
                    {plan.featured && <ArrowRight className="h-4 w-4" aria-hidden />}
                  </button>
                )}

                <div className="mb-6 h-px w-full bg-[var(--color-line)]" />

                <ul className="flex flex-col gap-3.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        className={cn("mt-0.5 h-4 w-4 shrink-0", plan.featured ? "text-[var(--color-secondary)]" : "text-[var(--color-muted)]")}
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

        <p className="mt-12 text-center text-sm text-[var(--color-muted)]">
          AI usage is included in every plan, with daily budgets you control. Questions?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--color-text)] underline underline-offset-2">
            Email us
          </a>
          .
        </p>
      </div>
    </section>
  );
};

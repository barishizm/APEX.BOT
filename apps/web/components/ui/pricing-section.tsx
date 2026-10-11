"use client";

import { cn } from "@/lib/utils";
import { Check, ArrowRight } from "lucide-react";
import { useState } from "react";

// No auth state exists yet, so every visitor is logged out: send them to sign-up
const openRegister = (e: React.MouseEvent<HTMLButtonElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent("apex:open-register", {
      detail: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    }),
  );
};

export const Component = () => {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section className="relative w-full bg-[var(--color-surface)] py-24 font-sans text-[var(--color-text)] sm:py-32 selection:bg-[var(--color-text)] selection:text-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        
        {/* Header */}
        <div className="mb-16 flex flex-col items-center text-center">
          <h2 className="mb-4 max-w-2xl text-balance text-4xl font-medium tracking-tighter text-[var(--color-text)] sm:text-5xl md:text-6xl">
            Predictable pricing. <br className="hidden sm:block" />
            <span className="text-[color-mix(in_srgb,var(--color-text)_35%,transparent)]">Infinite scale.</span>
          </h2>
          <p className="max-w-xl text-balance text-base text-[var(--color-muted)] sm:text-lg">
            Start for free, then pay only for what you use. No hidden fees, no complex tier structures. Just raw compute.
          </p>

          {/* Billing Toggle */}
          <div className="mt-10 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className={cn("justify-self-end text-sm font-medium", !isAnnual ? "text-[var(--color-text)]" : "text-[var(--color-muted)]")}>Monthly</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative flex h-6 w-11 shrink-0 cursor-pointer appearance-none items-center rounded-full border-0 p-0 bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_20%,transparent)]"
              aria-label="Toggle billing cycle"
            >
              <div
                className={cn(
                  "absolute left-0 top-1 h-4 w-4 rounded-full bg-[var(--color-text)] transition-transform duration-200 ease-in-out",
                  isAnnual ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
            <span className={cn("flex items-center gap-2 justify-self-start whitespace-nowrap text-sm font-medium", isAnnual ? "text-[var(--color-text)]" : "text-[var(--color-muted)]")}>
              Annually
              <span className="rounded-full bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text)]">
                Save 20%
              </span>
            </span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
          
          {/* Developer Tier */}
          <div className="flex flex-col rounded-xl border border-solid border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[var(--color-raised)] p-8 transition-colors hover:border-[color-mix(in_srgb,var(--color-text)_15%,transparent)]">
            <div className="mb-6">
              <h3 className="text-lg font-medium text-[var(--color-text)]">Developer</h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">Perfect for side projects and evaluating the platform.</p>
            </div>
            
            <div className="mb-8 flex items-baseline gap-1">
              <span className="text-4xl font-medium tracking-tighter">$0</span>
              <span className="text-sm font-medium text-[var(--color-muted)]">/ forever</span>
            </div>
            
            <button onClick={openRegister} className="mb-8 flex h-10 w-full items-center justify-center rounded-md border border-solid border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-transparent p-0 font-[inherit] text-sm font-medium transition-all hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] active:scale-[0.98]">
              Start for free
            </button>
            
            <div className="mb-6 h-px w-full bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]" />
            
            <ul className="flex flex-col gap-4 text-sm text-[color-mix(in_srgb,var(--color-text)_80%,transparent)]">
              {["100,000 edge requests/mo", "3 global edge regions", "Shared infrastructure", "Community support", "1 week log retention"].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro Tier (Highlighted) */}
          <div className="relative flex flex-col rounded-xl border border-solid border-[color-mix(in_srgb,var(--color-text)_25%,transparent)] bg-[var(--color-surface)] p-8 shadow-2xl">
            {/* Top Highlight Accent */}
            <div className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-[var(--color-text)] to-transparent" />
            
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium text-[var(--color-text)]">Production</h3>
                <p className="mt-2 text-sm text-[var(--color-muted)]">For scalable applications and growing teams.</p>
              </div>
              <span className="rounded-full bg-[var(--color-text)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--color-surface)]">
                Popular
              </span>
            </div>
            
            <div className="mb-8 flex items-baseline gap-1">
              <span className="text-4xl font-medium tracking-tighter">
                ${isAnnual ? "29" : "39"}
              </span>
              <span className="text-sm font-medium text-[var(--color-muted)]">
                / user / mo
              </span>
            </div>
            
            <button onClick={openRegister} className="mb-8 flex h-10 w-full items-center justify-center gap-2 rounded-md border-0 bg-[var(--color-text)] p-0 font-[inherit] text-sm font-medium text-[var(--color-surface)] transition-all hover:opacity-90 active:scale-[0.98]">
              Upgrade to Pro
              <ArrowRight className="h-4 w-4" />
            </button>
            
            <div className="mb-6 h-px w-full bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]" />
            
            <ul className="flex flex-col gap-4 text-sm text-[color-mix(in_srgb,var(--color-text)_80%,transparent)]">
              {["10,000,000 edge requests/mo", "150+ global edge regions", "Dedicated execution environment", "Email & priority chat support", "30 day log retention", "Advanced access controls"].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text)]" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Enterprise Tier */}
          <div className="flex flex-col rounded-xl border border-solid border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[var(--color-raised)] p-8 transition-colors hover:border-[color-mix(in_srgb,var(--color-text)_15%,transparent)]">
            <div className="mb-6">
              <h3 className="text-lg font-medium text-[var(--color-text)]">Enterprise</h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">Custom infrastructure for mission-critical workloads.</p>
            </div>
            
            <div className="mb-8 flex items-baseline gap-1">
              <span className="text-4xl font-medium tracking-tighter">Custom</span>
            </div>
            
            <button onClick={openRegister} className="mb-8 flex h-10 w-full items-center justify-center rounded-md border border-solid border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-transparent p-0 font-[inherit] text-sm font-medium transition-all hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] active:scale-[0.98]">
              Contact Sales
            </button>
            
            <div className="mb-6 h-px w-full bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]" />
            
            <ul className="flex flex-col gap-4 text-sm text-[color-mix(in_srgb,var(--color-text)_80%,transparent)]">
              {["Unlimited edge requests", "Custom region selection", "Single-tenant infrastructure", "24/7 dedicated support SLA", "Infinite log retention", "SOC2 Type II compliance"].map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
        
        {/* Overage / Usage Note */}
        <div className="mt-12 flex items-center justify-center gap-2 text-sm text-[var(--color-muted)]">
          <span className="flex h-2 w-2 rounded-full bg-[var(--color-line)]" />
          Need more? Extra requests are billed at $0.40 per 1M across all paid plans.
        </div>

      </div>
    </section>
  );
};

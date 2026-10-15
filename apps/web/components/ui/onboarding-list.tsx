"use client";

import { BookOpen, Check, ChevronRight, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CONTACT_EMAIL } from "@/components/site-nav";
import type { Step } from "@/lib/setup-steps";


function ChatPreview() {
  const bubble = "max-w-[85%] rounded-xl px-3 py-2 text-[0.6875rem] leading-snug";
  return (
    <div
      aria-hidden
      className="relative hidden min-h-[15rem] overflow-hidden md:block"
      style={{
        background:
          "radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--color-secondary) 55%, transparent), transparent 60%), linear-gradient(135deg, #312c85, #4f46e5)",
      }}
    >
      <span className="absolute left-6 top-20 flex items-center gap-2 rounded-full bg-[#e5f86b] px-3 py-1 text-sm font-medium text-[#0c0c09] shadow-lg">
        Chatting
        <span className="h-5 w-5 rounded-full bg-[#312c85]" />
      </span>
      <div className="absolute bottom-0 right-6 top-10 flex w-[62%] flex-col gap-3 rounded-t-2xl bg-[#171713] p-4 text-[#f4f4f1] shadow-2xl">
        <span className="mx-auto flex items-center gap-1.5 rounded-full bg-[#26261f] px-3 py-1 text-[0.6875rem] font-medium">
          <Sparkles className="h-3 w-3" />
          AI assistant
        </span>
        <p className={bubble}>Hello! Welcome to Crest Cycles. How can I help you?</p>
        <p className={`${bubble} ml-auto bg-[#26261f]`}>Is the Urban Pro e-bike back in stock in matte black?</p>
        <p className={bubble}>It is! It came back this week. You can order it on the product page.</p>
        <p className={`${bubble} ml-auto bg-[#26261f]`}>Great, thanks!</p>
      </div>
    </div>
  );
}

export function OnboardingList({ stages }: { stages: { label: string; steps: Step[] }[] }) {
  const [stage, setStage] = useState(0);
  const steps = stages[stage].steps;
  // null = open the first unfinished step
  const [picked, setPicked] = useState<number | null>(null);
  const open = picked ?? steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  const card = "rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]";
  const ghostButton =
    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)]";

  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="flex w-full max-w-[52rem] flex-col gap-5 px-4 py-6 sm:px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Set up your assistant</h1>
          <div role="tablist" aria-label="Setup stages" className="flex rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
            {stages.map((s, i) => {
              const finished = s.steps.every((x) => x.done);
              return (
                <button
                  key={s.label}
                  type="button"
                  role="tab"
                  aria-selected={stage === i}
                  onClick={() => {
                    setStage(i);
                    setPicked(null);
                  }}
                  className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-0 px-4 text-sm font-semibold transition-colors sm:px-8 ${
                    stage === i ? "bg-[var(--color-bubble)] text-[var(--color-text)]" : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {finished && <Check className="h-3.5 w-3.5 text-green-600" strokeWidth={3} aria-label="(done)" />}
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            {doneCount} of {steps.length} done
          </p>
        </div>

        <section className={`${card} grid overflow-hidden md:grid-cols-[1.6fr_1fr]`}>
          <ol className="list-none" style={{ margin: 0, padding: "1.25rem clamp(1.25rem, 4vw, 2.5rem)" }}>
            {steps.map((step, i) => {
              const expanded = open === i;
              const last = i === steps.length - 1;
              return (
                <li key={step.key} className="relative flex gap-5 sm:gap-6">
                  {!last && <span aria-hidden className={`absolute bottom-0 left-[11px] top-8 w-0.5 ${step.done ? "bg-green-500" : "bg-[var(--color-line)]"}`} />}
                  <span
                    aria-hidden
                    className={`relative mt-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      step.done ? "bg-green-600 text-white" : "border-2 border-[var(--color-line)] bg-[var(--color-surface)]"
                    }`}
                  >
                    {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>

                  <div className={`min-w-0 flex-1 ${last ? "" : "border-b border-[var(--color-line)]"}`}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setPicked(expanded ? -1 : i)}
                      className={`flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent py-3 text-left text-base ${
                        step.done ? "text-[var(--color-muted)]" : expanded ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text)]"
                      }`}
                    >
                      <span className="flex-1">
                        {step.title}
                        {step.done && <span className="sr-only"> (completed)</span>}
                      </span>
                      {!expanded && <ChevronRight className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />}
                    </button>
                    {expanded && (
                      <div className="flex flex-col items-start gap-3 pb-4">
                        <p className="m-0 text-[var(--color-muted)]">{step.description}</p>
                        <Link
                          href={step.href}
                          {...(step.external && { target: "_blank", rel: "noopener noreferrer" })}
                          className="inline-flex h-9 items-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold no-underline"
                          // unlayered `a { color: inherit }` in globals.css beats the utility
                          style={{ color: "var(--color-on-primary)" }}
                        >
                          {step.cta}
                        </Link>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <ChatPreview />
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className={`${card} flex flex-col items-start gap-1 p-5`}>
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-bubble)]">
              <BookOpen className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Read the setup guide</h2>
            <p className="m-0 text-sm text-[var(--color-muted)]">Step-by-step instructions for WordPress, Shopify, Webflow and more.</p>
            <a href="/docs#setup" target="_blank" rel="noopener noreferrer" className={`${ghostButton} mt-3`}>
              Open docs
            </a>
          </section>
          <section className={`${card} flex flex-col items-start gap-1 p-5`}>
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-bubble)]">
              <Mail className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Stuck? Write to us</h2>
            <p className="m-0 text-sm text-[var(--color-muted)]">We answer every beta customer personally, usually within a day.</p>
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Apex Bot setup")}`} className={`${ghostButton} mt-3`}>
              Email the team
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

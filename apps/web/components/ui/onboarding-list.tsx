"use client";

import { Check, ChevronRight, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

type Step = {
  title: string;
  description: string;
  cta: string;
  done?: boolean;
  id?: "knowledge";
  href?: string;
};

// Set by the onboarding screen once the user's website URL passes validation;
// that crawl is the agent's first training, so the knowledge step counts as done
export const KNOWLEDGE_KEY = "apex:onboarding:url";

function readTrained() {
  try {
    return !!localStorage.getItem(KNOWLEDGE_KEY);
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function useKnowledgeTrained() {
  return useSyncExternalStore(subscribe, readTrained, () => false);
}

function isDone(step: Step, trained: boolean) {
  return !!step.done || (step.id === "knowledge" && trained);
}

const STAGES: { label: string; steps: Step[] }[] = [
  {
    label: "Go live",
    steps: [
      {
        title: "Create Apex Bot account",
        description: "Your workspace is ready.",
        cta: "View account",
        done: true,
      },
      {
        id: "knowledge",
        title: "Train AI agent with knowledge",
        description:
          "Add your website, docs or FAQs so the agent answers like your team.",
        cta: "Add knowledge",
      },
      {
        title: "Customize your widget",
        description: "Match colors, greeting and avatar to your brand.",
        cta: "Customize widget",
        href: "/dashboard/widget",
      },
      {
        title: "Place widget on your website",
        description: "Talk to visitors as they browse and guide them to buy.",
        cta: "Connect widget",
        href: "/dashboard/widget",
      },
      {
        title: "Test a live conversation",
        description:
          "Open your site and chat with the agent before customers do.",
        cta: "Start test chat",
      },
    ],
  },
  {
    label: "Reach first goal",
    steps: [
      {
        title: "Answer your first visitor",
        description: "Let the agent handle a real conversation end to end.",
        cta: "Open inbox",
      },
      {
        title: "Capture your first lead",
        description: "Ask for an email when a visitor shows buying intent.",
        cta: "Set up lead capture",
      },
      {
        title: "Close your first sale",
        description:
          "Recommend products and send visitors straight to checkout.",
        cta: "Connect store",
      },
    ],
  },
  {
    label: "Keep growing",
    steps: [
      {
        title: "Connect more channels",
        description: "Reply to email and messaging apps from the same inbox.",
        cta: "Add channel",
      },
      {
        title: "Create a playbook",
        description: "Automate follow-ups, hand-offs and proactive messages.",
        cta: "New playbook",
      },
      {
        title: "Review analytics",
        description:
          "See which answers convert and where the agent needs help.",
        cta: "Open analytics",
      },
    ],
  },
];

export function useSetupProgress() {
  const trained = useKnowledgeTrained();
  const goLive = STAGES[0].steps;
  return {
    done: goLive.filter((s) => isDone(s, trained)).length,
    total: goLive.length,
  };
}

function ChatPreview() {
  const bubble =
    "max-w-[85%] rounded-xl px-3 py-2 text-[0.6875rem] leading-snug";
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
          AI Agent
        </span>
        <p className={bubble}>
          Hello! Welcome to Crest Cycles. How can I help you?
        </p>
        <p className={`${bubble} ml-auto bg-[#26261f]`}>
          Hi! Is the Urban Pro e-bike back in stock in matte black?
        </p>
        <p className={bubble}>
          It is! It came back this week. Would you like to book a test ride?
        </p>
        <p className={`${bubble} ml-auto bg-[#26261f]`}>
          Yes, please. That&apos;d be great!
        </p>
      </div>
    </div>
  );
}

export function OnboardingList() {
  const [stage, setStage] = useState(0);
  const trained = useKnowledgeTrained();
  const steps = STAGES[stage].steps;
  // null = follow progress and open the first unfinished step; storage is only
  // readable after hydration, so this can't be fixed at first render
  const [picked, setPicked] = useState<number | null>(null);
  const open = picked ?? steps.findIndex((s) => !isDone(s, trained));

  function pickStage(i: number) {
    setStage(i);
    setPicked(null);
  }

  const card =
    "rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]";
  const ghostButton =
    "inline-flex h-9 cursor-pointer items-center rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)]";

  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="flex w-full max-w-[52rem] flex-col gap-5 px-4 py-6 sm:px-8">
        <div
          role="tablist"
          aria-label="Setup stages"
          className="mx-auto flex rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-1"
        >
          {STAGES.map((s, i) => (
            <button
              key={s.label}
              type="button"
              role="tab"
              aria-selected={stage === i}
              onClick={() => pickStage(i)}
              className={`h-9 cursor-pointer rounded-lg border-0 px-4 text-sm font-semibold transition-colors sm:px-8 ${
                stage === i
                  ? "bg-[var(--color-bubble)] text-[var(--color-text)]"
                  : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <section
          className={`${card} grid overflow-hidden md:grid-cols-[1.6fr_1fr]`}
        >
          <ol
            className="list-none"
            style={{ margin: 0, padding: "1.25rem 2.5rem" }}
          >
            {steps.map((step, i) => {
              const expanded = open === i;
              const done = isDone(step, trained);
              const last = i === steps.length - 1;
              return (
                <li key={step.title} className="relative flex gap-6">
                  {!last && (
                    <span
                      aria-hidden
                      className={`absolute left-[11px] top-8 bottom-0 w-0.5 ${
                        done ? "bg-green-500" : "bg-[var(--color-line)]"
                      }`}
                    />
                  )}
                  <span
                    aria-hidden
                    className={`relative mt-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      done
                        ? "bg-green-600 text-white"
                        : "border-2 border-[var(--color-line)] bg-[var(--color-surface)]"
                    }`}
                  >
                    {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>

                  <div
                    className={`min-w-0 flex-1 ${last ? "" : "border-b border-[var(--color-line)]"}`}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setPicked(expanded ? -1 : i)}
                      className={`flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent py-3 text-left text-base ${
                        done
                          ? "text-[var(--color-muted)]"
                          : expanded
                            ? "font-semibold text-[var(--color-text)]"
                            : "text-[var(--color-text)]"
                      }`}
                    >
                      <span className="flex-1">
                        {step.title}
                        {done && <span className="sr-only"> (completed)</span>}
                      </span>
                      {!expanded && (
                        <ChevronRight
                          className="h-4 w-4 text-[var(--color-muted)]"
                          aria-hidden
                        />
                      )}
                    </button>
                    {expanded && (
                      <div className="pb-4">
                        <p className="m-0 text-[var(--color-muted)]">
                          {step.description}
                        </p>
                        {step.href ? (
                          <Link
                            href={step.href}
                            className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] no-underline"
                          >
                            {step.cta}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)]"
                          >
                            {step.cta}
                          </button>
                        )}
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
          <section className={`${card} p-5`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-bubble)]">
              <UserPlus className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mb-1 mt-4 text-base font-semibold">
              Invite your team
            </h2>
            <p className="m-0 text-sm text-[var(--color-muted)]">
              Set up together and respond to customers sooner.
            </p>
            <button type="button" className={`${ghostButton} mt-4`}>
              Invite teammate
            </button>
          </section>
          <section className={`${card} p-5`}>
            <span aria-hidden className="flex">
              {["#a9a4f2", "#e5f86b", "#f2a4b8"].map((c) => (
                <span
                  key={c}
                  className="-mr-2 h-9 w-9 rounded-full border-2 border-[var(--color-surface)]"
                  style={{ background: c }}
                />
              ))}
            </span>
            <h2 className="mb-1 mt-4 text-base font-semibold">
              Talk to a Product Expert
            </h2>
            <p className="m-0 text-sm text-[var(--color-muted)]">
              Schedule a 15-min call to get you to your goal quicker.
            </p>
            <button type="button" className={`${ghostButton} mt-4`}>
              Schedule call
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

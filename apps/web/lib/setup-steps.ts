import type { SetupStepId } from "@/lib/dashboard"
import type { AppDictionary } from "@/lib/i18n/app"

export type { SetupStepId }

type SetupCopy = AppDictionary["setup"]

// The "Go live" checklist. Completion comes from the server (lib/dashboard.ts getSetup);
// titles, descriptions and button labels come from the setup dictionary.
export const SETUP_STEPS: { id: SetupStepId; href: string }[] = [
  { id: "account", href: "/dashboard/settings" },
  { id: "knowledge", href: "/dashboard/knowledge" },
  { id: "widget", href: "/dashboard/widget" },
  { id: "install", href: "/dashboard/widget?section=install&guide=1" },
  { id: "test", href: "" },
]

export type Step = { key: string; title: string; description: string; cta: string; href: string; external?: boolean; done: boolean }

/** Builds the checklist from server state; kept here so the page stays a thin loader. */
export function buildStages(
  t: SetupCopy,
  input: {
    setup: Record<SetupStepId, boolean>
    testSite: string | null
    hasText: boolean
    handoffOn: boolean
    leadOn: boolean
    hasConversations: boolean
  },
): { label: string; steps: Step[] }[] {
  const goLive: Step[] = SETUP_STEPS.map((s) => {
    if (s.id !== "test") return { key: s.id, ...t.steps[s.id], href: s.href, done: input.setup[s.id] }
    // #apex-test makes the widget open and say hello on arrival
    return input.testSite
      ? { key: s.id, ...t.steps.test, href: `${input.testSite}/#apex-test`, external: true, done: input.setup.test }
      : { key: s.id, ...t.steps.testNoSite, href: "/dashboard/widget?section=install&guide=1", done: input.setup.test }
  })
  return [
    { label: t.stages.goLive, steps: goLive },
    {
      label: t.stages.improve,
      steps: [
        { key: "text", ...t.steps.text, href: "/dashboard/knowledge", done: input.hasText },
        { key: "handoff", ...t.steps.handoff, href: "/dashboard/widget?section=handoff", done: input.handoffOn },
        { key: "leads", ...t.steps.leads, href: "/dashboard/widget?section=handoff", done: input.leadOn },
        { key: "conversations", ...t.steps.conversations, href: "/dashboard/conversations", done: input.hasConversations },
      ],
    },
  ]
}

import type { SetupStepId } from "@/lib/dashboard"

export type { SetupStepId }

// The "Go live" checklist. Completion comes from the server (lib/dashboard.ts getSetup).
export const SETUP_STEPS: { id: SetupStepId; title: string; description: string; cta: string; href: string }[] = [
  {
    id: "account",
    title: "Create your Apex Bot account",
    description: "Your workspace and assistant are ready.",
    cta: "Account settings",
    href: "/dashboard/settings",
  },
  {
    id: "knowledge",
    title: "Teach it your content",
    description: "Add your website or paste FAQs and policies. The assistant answers only from what you add here.",
    cta: "Add knowledge",
    href: "/dashboard/knowledge",
  },
  {
    id: "widget",
    title: "Customize your widget",
    description: "Match the colors, name, greeting and tone to your brand.",
    cta: "Customize widget",
    href: "/dashboard/widget",
  },
  {
    id: "install",
    title: "Allow your website and add the code",
    description: "List the addresses the widget may run on, then paste one line of code into your site.",
    cta: "Install widget",
    href: "/dashboard/widget?section=install&guide=1",
  },
  {
    id: "test",
    title: "See it live on your site",
    description: "Open your website. This step completes on its own once the widget loads there.",
    cta: "Open your website",
    href: "",
  },
]

export type Step = { key: string; title: string; description: string; cta: string; href: string; external?: boolean; done: boolean }

/** Builds the checklist from server state; kept here so the page stays a thin loader. */
export function buildStages(input: {
  setup: Record<SetupStepId, boolean>
  testSite: string | null
  hasText: boolean
  handoffOn: boolean
  leadOn: boolean
  hasConversations: boolean
}): { label: string; steps: Step[] }[] {
  const goLive: Step[] = SETUP_STEPS.map((s) => {
    if (s.id !== "test") return { key: s.id, title: s.title, description: s.description, cta: s.cta, href: s.href, done: input.setup[s.id] }
    // #apex-test makes the widget open and say hello on arrival
    return input.testSite
      ? { key: s.id, title: s.title, description: s.description, cta: s.cta, href: `${input.testSite}/#apex-test`, external: true, done: input.setup.test }
      : { key: s.id, title: s.title, description: "Allow your website first, then open it to see the widget there.", cta: "Add your website", href: "/dashboard/widget?section=install&guide=1", done: input.setup.test }
  })
  return [
    { label: "Go live", steps: goLive },
    {
      label: "Improve answers",
      steps: [
        {
          key: "text",
          title: "Add your FAQs and policies as text",
          description: "Paste answers that aren't on your website, so fewer questions end in “I don't know”.",
          cta: "Add text",
          href: "/dashboard/knowledge",
          done: input.hasText,
        },
        {
          key: "handoff",
          title: "Let visitors reach a human",
          description: "Turn on hand-off so unanswered questions reach your team by email.",
          cta: "Set up hand-off",
          href: "/dashboard/widget?section=handoff",
          done: input.handoffOn,
        },
        {
          key: "leads",
          title: "Capture leads before the chat",
          description: "Ask for an email (and optionally a name or phone) before the first message.",
          cta: "Set up lead capture",
          href: "/dashboard/widget?section=handoff",
          done: input.leadOn,
        },
        {
          key: "conversations",
          title: "Review your first conversations",
          description: "See what visitors ask and which questions the assistant couldn't answer.",
          cta: "Open conversations",
          href: "/dashboard/conversations",
          done: input.hasConversations,
        },
      ],
    },
  ]
}

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  Braces,
  CircleHelp,
  Code,
  Languages,
  LifeBuoy,
  Palette,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

// One source for the header mega menu, the mobile menu and the footer, so every
// link points at a page or section that exists. Hrefs are written for the default
// language; components pass them through localizePath for the current one.

export type NavItem = { title: string; href: string; text?: string; icon?: LucideIcon };
export type NavPanel = { cols: { heading?: string; items: NavItem[] }[]; cta: { label: string; href: string } };
export type NavEntry = { label: string; href: string; panel?: NavPanel };

export function buildNav(t: Dictionary): NavEntry[] {
  return [
    {
      label: t.nav.product,
      href: "/#features",
      panel: {
        cols: [
          {
            heading: t.nav.buildAssistant,
            items: [
              { title: t.nav.howItWorks, text: t.nav.howItWorksText, href: "/#how-it-works" },
              { title: t.nav.features, text: t.nav.featuresText, href: "/#features" },
              { title: t.nav.chatWidget, text: t.nav.chatWidgetText, href: "/#widget" },
            ],
          },
          {
            heading: t.nav.whyApex,
            items: [
              { title: t.nav.groundedAnswers, href: "/#features", icon: Sparkles },
              { title: t.nav.turkishEnglish, href: "/#features", icon: Languages },
              { title: t.nav.humanHandoff, href: "/#features", icon: LifeBuoy },
              { title: t.nav.securityPrivacy, href: "/#security", icon: ShieldCheck },
            ],
          },
        ],
        cta: { label: t.nav.seePricing, href: "/pricing" },
      },
    },
    {
      label: t.nav.resources,
      href: "/docs",
      panel: {
        cols: [
          {
            heading: t.nav.getStarted,
            items: [
              { title: t.nav.setupGuide, href: "/docs#setup", icon: BookOpen },
              { title: t.nav.installWidget, href: "/docs#install", icon: Code },
              { title: t.nav.javascriptApi, href: "/docs#javascript-api", icon: Braces },
              { title: t.nav.customize, href: "/docs#customize", icon: Palette },
            ],
          },
          {
            heading: t.nav.help,
            items: [
              { title: t.nav.faq, href: "/#faq", icon: CircleHelp },
              { title: t.nav.troubleshooting, href: "/docs#troubleshooting", icon: Workflow },
              { title: t.nav.systemStatus, href: "/status", icon: Activity },
            ],
          },
        ],
        cta: { label: t.nav.readDocs, href: "/docs" },
      },
    },
    { label: t.nav.pricing, href: "/pricing" },
  ];
}

// Shown wherever visitors can reach us; set NEXT_PUBLIC_CONTACT_EMAIL per deployment
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@apexbot.eu";

export function buildFooter(t: Dictionary): { heading: string; links: { label: string; href: string }[] }[] {
  return [
    {
      heading: t.nav.product,
      links: [
        { label: t.nav.howItWorks, href: "/#how-it-works" },
        { label: t.nav.features, href: "/#features" },
        { label: t.nav.chatWidget, href: "/#widget" },
        { label: t.nav.pricing, href: "/pricing" },
      ],
    },
    {
      heading: t.nav.resources,
      links: [
        { label: t.nav.docs, href: "/docs" },
        { label: t.nav.javascriptApi, href: "/docs#javascript-api" },
        { label: t.nav.faq, href: "/#faq" },
        { label: t.nav.systemStatus, href: "/status" },
      ],
    },
    {
      heading: t.nav.company,
      links: [
        { label: t.nav.securityPrivacy, href: "/security" },
        { label: t.nav.terms, href: "/terms" },
        { label: t.nav.privacy, href: "/privacy" },
        { label: t.nav.contact, href: `mailto:${CONTACT_EMAIL}` },
      ],
    },
  ];
}

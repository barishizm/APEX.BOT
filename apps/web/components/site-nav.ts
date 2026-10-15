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

// One source for the header mega menu, the mobile menu and the footer, so every
// link points at a page or section that exists.

export type NavItem = { title: string; href: string; text?: string; icon?: LucideIcon };
export type NavPanel = { cols: { heading?: string; items: NavItem[] }[]; cta: { label: string; href: string } };
export type NavEntry = { label: string; href: string; panel?: NavPanel };

export const NAV: NavEntry[] = [
  {
    label: "Product",
    href: "/#features",
    panel: {
      cols: [
        {
          heading: "Build your assistant",
          items: [
            { title: "How it works", text: "From your website to live answers in minutes", href: "/#how-it-works" },
            { title: "Features", text: "Grounded answers, sources, hand-off and more", href: "/#features" },
            { title: "Chat widget", text: "Match your brand, place it anywhere", href: "/#widget" },
          ],
        },
        {
          heading: "Why Apex",
          items: [
            { title: "Grounded answers", href: "/#features", icon: Sparkles },
            { title: "Turkish & English", href: "/#features", icon: Languages },
            { title: "Human hand-off", href: "/#features", icon: LifeBuoy },
            { title: "Security & privacy", href: "/#security", icon: ShieldCheck },
          ],
        },
      ],
      cta: { label: "See pricing", href: "/pricing" },
    },
  },
  {
    label: "Resources",
    href: "/docs",
    panel: {
      cols: [
        {
          heading: "Get started",
          items: [
            { title: "Setup guide", href: "/docs#setup", icon: BookOpen },
            { title: "Install the widget", href: "/docs#install", icon: Code },
            { title: "JavaScript API", href: "/docs#javascript-api", icon: Braces },
            { title: "Customize", href: "/docs#customize", icon: Palette },
          ],
        },
        {
          heading: "Help",
          items: [
            { title: "FAQ", href: "/#faq", icon: CircleHelp },
            { title: "Troubleshooting", href: "/docs#troubleshooting", icon: Workflow },
            { title: "System status", href: "/status", icon: Activity },
          ],
        },
      ],
      cta: { label: "Read the docs", href: "/docs" },
    },
  },
  { label: "Pricing", href: "/pricing" },
];

// Shown wherever visitors can reach us; set NEXT_PUBLIC_CONTACT_EMAIL per deployment
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@apexbot.eu";

export const FOOTER: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Features", href: "/#features" },
      { label: "Chat widget", href: "/#widget" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "JavaScript API", href: "/docs#javascript-api" },
      { label: "FAQ", href: "/#faq" },
      { label: "System status", href: "/status" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Security & privacy", href: "/#security" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Contact", href: `mailto:${CONTACT_EMAIL}` },
    ],
  },
];

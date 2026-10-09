"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Code,
  CircleUser,
  Globe,
  GraduationCap,
  Heart,
  LayoutTemplate,
  LifeBuoy,
  Megaphone,
  HandCoins,
  ShoppingBag,
  ShoppingCart,
  SquareTerminal,
} from "lucide-react";

type IconType = LucideIcon | ((props: { size?: number }) => React.JSX.Element);
type PanelItem = { title: string; href: string; text?: string; icon?: IconType };
type Panel = { cols: { heading?: string; items: PanelItem[] }[]; cta: { label: string; href: string } };

// Placeholder brand marks (colored tile + initial); swap for official logos when available.
const brand = (bg: string, letter: string) =>
  function BrandIcon({ size = 22 }: { size?: number }) {
    return (
      <svg className="mega__icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill={bg} />
        <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
          {letter}
        </text>
      </svg>
    );
  };

const productPanel: Panel = {
  cols: [
    {
      heading: "Build your Apex",
      items: [
        { title: "AI Customer Service Agent", text: "Answer questions and help customers buy", href: "/product/agent" },
        { title: "AI Chatbot Builder", text: "Build your chatbot without coding", href: "/product/builder" },
        { title: "Chat Widget", text: "Add your chatbot to your website", href: "/product/widget" },
      ],
    },
    {
      heading: "Explore the product",
      items: [
        { title: "All Features", text: "Explore what your chatbot can do", href: "/product/features" },
        { title: "Analytics", text: "Measure resolutions and sales", href: "/product/analytics" },
        { title: "Product Demo", text: "Watch the five-minute walkthrough", href: "/product/demo" },
      ],
    },
  ],
  cta: { label: "Start a free 14-day trial", href: "/kayit" },
};

const solutionsPanel: Panel = {
  cols: [
    {
      heading: "By use case",
      items: [
        { title: "Customer Support", href: "/solutions/support", icon: CircleUser },
        { title: "Sales", href: "/solutions/sales", icon: HandCoins },
        { title: "Marketing", href: "/solutions/marketing", icon: Megaphone },
        { title: "AI Shopping Assistant", href: "/solutions/shopping", icon: ShoppingBag },
        { title: "Order Tracking", href: "/solutions/orders", icon: ShoppingCart },
      ],
    },
    {
      heading: "By business",
      items: [
        { title: "eCommerce", href: "/solutions/ecommerce", icon: ShoppingCart },
        { title: "Education", href: "/solutions/education", icon: GraduationCap },
        { title: "Healthcare", href: "/solutions/healthcare", icon: Heart },
        { title: "Small Business", href: "/solutions/small-business", icon: Building2 },
        { title: "Enterprise", href: "/solutions/enterprise", icon: Globe },
      ],
    },
  ],
  cta: { label: "All solutions", href: "/solutions" },
};

const resourcesPanel: Panel = {
  cols: [
    {
      heading: "Get started",
      items: [
        { title: "Help Center", href: "/resources/help", icon: LifeBuoy },
        { title: "Setup Guide", href: "/resources/setup", icon: LifeBuoy },
        { title: "Templates", href: "/resources/templates", icon: LayoutTemplate },
        { title: "API & Developers", href: "/resources/api", icon: SquareTerminal },
        { title: "MCP", href: "/resources/mcp", icon: Code },
      ],
    },
    {
      heading: "Learn",
      items: [
        { title: "Case Studies", text: "See how customers use Apex Bot", href: "/resources/case-studies" },
        { title: "Apex Academy", text: "Learn to build your chatbot", href: "/resources/academy" },
        { title: "Chatbot Best Practices", text: "Plan, build, and improve", href: "/resources/best-practices" },
        { title: "Blog", text: "Guides to AI and customer service", href: "/resources/blog" },
      ],
    },
  ],
  cta: { label: "System Status", href: "/status" },
};

const integrationsPanel: Panel = {
  cols: [
    {
      heading: "Top integrations",
      items: [
        { title: "Facebook Messenger", href: "/integrations/messenger", icon: brand("#0084ff", "M") },
        { title: "Twilio SMS", href: "/integrations/twilio", icon: brand("#e0404f", "T") },
        { title: "Klaviyo", href: "/integrations/klaviyo", icon: brand("#1c1c21", "K") },
        { title: "WhatsApp", href: "/integrations/whatsapp", icon: brand("#25d366", "W") },
      ],
    },
    {
      items: [
        { title: "WordPress", href: "/integrations/wordpress", icon: brand("#3858e9", "W") },
        { title: "Shopify", href: "/integrations/shopify", icon: brand("#95bf47", "S") },
        { title: "WooCommerce", href: "/integrations/woocommerce", icon: brand("#7f54b3", "W") },
        { title: "Slack", href: "/integrations/slack", icon: brand("#611f69", "S") },
      ],
    },
  ],
  cta: { label: "All integrations", href: "/integrations" },
};

const menu: { label: string; href: string; panel?: Panel }[] = [
  { label: "Product", href: "/product", panel: productPanel },
  { label: "Solutions", href: "/solutions", panel: solutionsPanel },
  { label: "Integrations", href: "/integrations", panel: integrationsPanel },
  { label: "Resources", href: "/resources", panel: resourcesPanel },
  { label: "Pricing", href: "/pricing" },
];

const PANEL_W = 640;
const CLOSE_DELAY = 160;

export function MegaMenu() {
  const navRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [moving, setMoving] = useState(false);
  const [x, setX] = useState(0);
  const [h, setH] = useState(0);

  const show = useCallback(
    (i: number) => {
      clearTimeout(timer.current);
      const link = linkRefs.current[i];
      const nav = navRef.current;
      if (!menu[i].panel || !link || !nav) {
        setOpen(false);
        return;
      }
      const navLeft = nav.getBoundingClientRect().left;
      const center = link.offsetLeft + link.offsetWidth / 2;
      const min = 16 - navLeft;
      const max = window.innerWidth - 16 - PANEL_W - navLeft;
      setX(Math.min(Math.max(center - PANEL_W / 2, min), max));
      setH(sheetRefs.current[i]?.offsetHeight ?? 0);
      // Slide only when already open; the first open appears in place.
      setMoving(open);
      setIdx(i);
      setOpen(true);
    },
    [open],
  );

  const scheduleClose = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <nav
      ref={navRef}
      className="bar__menu"
      aria-label="Site menüsü"
      onMouseLeave={scheduleClose}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {menu.map((m, i) => (
        <a
          key={m.href}
          ref={(el) => {
            linkRefs.current[i] = el;
          }}
          href={m.href}
          className={m.panel ? "bar__link bar__link--panel" : "bar__link"}
          aria-haspopup={m.panel ? "true" : undefined}
          aria-expanded={m.panel ? open && idx === i : undefined}
          data-active={open && idx === i ? "" : undefined}
          onMouseEnter={() => show(i)}
          onFocus={() => show(i)}
        >
          {m.label}
          {m.panel && (
            <svg className="mega__chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </a>
      ))}

      <div
        className="mega__panel"
        data-open={open ? "" : undefined}
        data-moving={moving ? "" : undefined}
        style={{ width: PANEL_W, transform: `translateX(${x}px)` }}
      >
        <div className="mega__card" style={{ height: h }}>
          {menu.map((m, i) =>
            m.panel ? (
              <div
                key={m.href}
                ref={(el) => {
                  sheetRefs.current[i] = el;
                }}
                className="mega__sheet"
                data-active={idx === i ? "" : undefined}
              >
                <div className="mega__cols">
                  {m.panel.cols.map((col, ci) => (
                    <div key={ci} className="mega__col">
                      {col.heading && <p className="mega__heading">{col.heading}</p>}
                      {col.items.map((it) => (
                        <a key={it.title} href={it.href} className={it.icon ? "mega__item mega__item--icon" : "mega__item"}>
                          {it.icon && <it.icon className="mega__icon" size={22} strokeWidth={1.75} aria-hidden="true" />}
                          <span className="mega__title">{it.title}</span>
                          {it.text && <span className="mega__text">{it.text}</span>}
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
                <a href={m.panel.cta.href} className="mega__cta">
                  {m.panel.cta.label} <span aria-hidden="true">→</span>
                </a>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </nav>
  );
}

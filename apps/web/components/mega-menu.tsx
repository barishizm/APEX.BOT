"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NAV as menu } from "@/components/site-nav";

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
      aria-label="Site menu"
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
                        <a
                          key={it.title}
                          href={it.href}
                          onClick={() => setOpen(false)}
                          className={it.icon ? "mega__item mega__item--icon" : "mega__item"}
                        >
                          {it.icon && <it.icon className="mega__icon" size={22} strokeWidth={1.75} aria-hidden="true" />}
                          <span className="mega__title">{it.title}</span>
                          {it.text && <span className="mega__text">{it.text}</span>}
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
                <a href={m.panel.cta.href} className="mega__cta" onClick={() => setOpen(false)}>
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

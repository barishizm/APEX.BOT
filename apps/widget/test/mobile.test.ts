// Phones: the open panel follows the visible part of the screen (the keyboard shrinks it, iOS pans it),
// the page behind holds still, and opening the chat doesn't throw the keyboard over it.
// jsdom has no layout, so this pins the behaviour; the geometry itself is in the stylesheet.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { A, setup } from "../../api/test/helpers.ts";
import { css } from "../src/styles.ts";

const { app } = setup({ ipMessagesPerMinute: 100 });

const dom = new JSDOM(
  `<!doctype html><html lang="en"><body><script src="https://cdn.example/widget.js" data-site-key="${A.key}" data-api="https://api.example"></script></body></html>`,
  { url: `${A.origin}/`, pretendToBeVisual: true },
);
const win = dom.window;
let shadow: ShadowRoot;
const attach = win.Element.prototype.attachShadow;
win.Element.prototype.attachShadow = function (init) {
  shadow = attach.call(this, init);
  return shadow;
};

// a phone: small, touch only
const matched = (q: string) => q.includes("max-width") || q.includes("hover: none");
const matchMedia = (query: string) => ({ matches: matched(query), addEventListener() {} });

const listeners = { resize: new Set<() => void>(), scroll: new Set<() => void>() };
const screen = { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 };
const visualViewport = {
  ...screen,
  addEventListener: (type: "resize" | "scroll", fn: () => void) => listeners[type].add(fn),
  removeEventListener: (type: "resize" | "scroll", fn: () => void) => listeners[type].delete(fn),
};
const change = (next: Partial<typeof screen>) => {
  Object.assign(visualViewport, next);
  for (const fn of listeners.resize) fn();
};
Object.defineProperty(win, "innerHeight", { value: 844, configurable: true });

Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  location: win.location,
  sessionStorage: win.sessionStorage,
  localStorage: win.localStorage,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  getComputedStyle: win.getComputedStyle.bind(win),
  matchMedia,
  visualViewport,
  fetch: (url: string, init: RequestInit = {}) =>
    app.request(url.replace("https://api.example", ""), { ...init, headers: { ...(init.headers as Record<string, string>), origin: A.origin } }),
});

const $ = <T extends Element = HTMLElement>(sel: string) => shadow.querySelector(sel) as T;
const root = () => $(".root");
const vars = () => ["--vt", "--vw", "--vh"].map((v) => root().style.getPropertyValue(v));
const html = win.document.documentElement;
type Facade = { open(): void; close(): void };
const apex = () => (win as unknown as { Apex: Facade }).Apex;

before(async () => {
  await import("../src/index.ts");
  for (let i = 0; i < 200 && !shadow?.querySelector(".launcher"); i++) await new Promise((r) => setTimeout(r, 10));
});

describe("widget on a phone", () => {
  it("doesn't open the keyboard with the chat, but moves focus into the dialog", () => {
    apex().open();
    assert.notEqual(shadow.activeElement, $(".compose textarea"));
    assert.equal(shadow.activeElement, $(".panel"));
  });

  it("sizes the panel to what is visible and follows the keyboard", () => {
    assert.deepEqual(vars(), ["0px", "390px", "844px"]);
    assert.equal(root().hasAttribute("data-kb"), false);
    change({ height: 508, offsetTop: 180 });
    assert.deepEqual(vars(), ["180px", "390px", "508px"]);
    assert.equal(root().hasAttribute("data-kb"), true);
    assert.equal(root().hasAttribute("data-short"), false);
  });

  it("drops everything but the conversation when a keyboard leaves very little room", () => {
    $<HTMLTextAreaElement>(".compose textarea").focus();
    change({ height: 300, offsetTop: 0 });
    assert.equal(root().hasAttribute("data-short"), true);
    change({ height: 844, offsetTop: 0 });
    assert.equal(root().hasAttribute("data-short"), false);
    assert.equal(root().hasAttribute("data-kb"), false);
  });

  it("holds still during a pinch zoom", () => {
    const before = vars();
    change({ height: 400, offsetTop: 90, scale: 2 });
    assert.deepEqual(vars(), before);
    change({ height: 844, offsetTop: 0, scale: 1 });
  });

  it("doesn't open the keyboard for a new chat either", () => {
    $<HTMLButtonElement>(".head .mw > .icon").click();
    $<HTMLButtonElement>(".menu .item").click();
    assert.equal(shadow.activeElement, $(".panel"));
  });

  it("stops the page scrolling behind the panel, and cancels drags outside what can scroll", () => {
    assert.equal(html.style.overflow, "hidden");
    assert.equal(win.document.body.style.overflow, "hidden");
    const drag = (target: Element, touches = 1) => {
      const event = Object.assign(new win.Event("touchmove", { bubbles: true, cancelable: true }), { touches: { length: touches } });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    assert.equal(drag($(".head")), true);
    assert.equal(drag($(".head"), 2), false, "a pinch still zooms");
    const log = $(".log");
    Object.defineProperty(log, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(log, "clientHeight", { value: 300, configurable: true });
    log.style.overflowY = "auto";
    assert.equal(drag(log), false);
  });

  it("gives everything back when closed", () => {
    apex().close();
    assert.equal(html.style.overflow, "");
    assert.equal(win.document.body.style.overflow, "");
    assert.equal(root().hasAttribute("data-fit"), false);
    assert.equal(listeners.resize.size + listeners.scroll.size, 0);
  });
});

describe("widget stylesheet", () => {
  it("never sizes the open panel from the layout viewport alone", () => {
    assert.match(css, /\.panel\{[^}]*height:min\(640px,calc\(var\(--vh,100vh\)/);
    assert.match(css, /:not\(\[data-float\]\) \.panel\{[^}]*top:var\(--vt,0\)[^}]*height:var\(--vh,100%\)/);
    assert.doesNotMatch(css, /\.panel\{[^}]*inset:0/);
  });

  it("fills landscape phones too", () => {
    assert.match(css, /@media \(max-width:480px\),\(max-height:480px\) and \(hover:none\)\{/);
  });

  it("gives the menu its own text colour, not the header's", () => {
    assert.match(css, /\.menu\{[^}]*color:var\(--text\)/);
  });

  it("applies the short-screen header after the full-screen one", () => {
    assert.ok(css.lastIndexOf(".root[data-short] .head{") > css.indexOf(":not([data-float]) .head{"));
  });
});

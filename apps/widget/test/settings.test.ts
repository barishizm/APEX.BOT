// Dashboard settings applied by the real widget, mounted in jsdom against the real API app.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { parseSettings, publicWidgetSettings } from "@apex/db/bot-settings";
import { A, setup } from "../../api/test/helpers.ts";
import { hiddenHere } from "../src/ui.ts";

const { app, store, mailer, model, tenants } = setup();
model.reply = ["Kargo ücretsizdir."];
const settings = parseSettings({
  general: { languageMode: "fixed", defaultLang: "tr", subtitle: { tr: "Saniyeler içinde yanıt", en: "" } },
  appearance: { theme: "dark", launcherIcon: "help", launcherLabel: { tr: "Bize sorun", en: "Ask us" }, panelWidth: "wide", radius: 4, offsetX: 40, avatar: "icon", font: "serif" },
  messages: { placeholder: { tr: "Sorunuzu yazın", en: "Ask" }, showDisclaimer: false },
  behavior: { showSources: false, showFeedback: false, teaser: { tr: "Sorunuz mu var?", en: "" }, persistence: "browser" },
  handoff: { enabled: false, leadCapture: "before-chat", leadFields: { name: true, phone: false }, leadRequired: true },
});
const t = tenants.findById("tn_a")!;
t.settings.ui = publicWidgetSettings(settings);
t.settings.handoffEnabled = false;

// the page says English, but the bot is pinned to its Turkish default
const dom = new JSDOM(
  `<!doctype html><html lang="en"><body><script src="https://cdn.example/widget.js" data-site-key="${A.key}" data-api="https://api.example"></script></body></html>`,
  { url: `${A.origin}/urunler`, pretendToBeVisual: true },
);
const win = dom.window;
let shadow: ShadowRoot;
const attach = win.Element.prototype.attachShadow;
win.Element.prototype.attachShadow = function (init) {
  shadow = attach.call(this, init);
  return shadow;
};
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  location: win.location,
  sessionStorage: win.sessionStorage,
  localStorage: win.localStorage,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  fetch: (url: string, init: RequestInit = {}) =>
    app.request(url.replace("https://api.example", ""), { ...init, headers: { ...(init.headers as Record<string, string>), origin: A.origin } }),
});

const $ = <T extends Element = HTMLElement>(sel: string) => shadow.querySelector(sel) as T | null;
const $$ = (sel: string) => [...shadow.querySelectorAll(sel)];
async function until<T>(fn: () => T, what: string, ms = 2000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const value = fn();
    if (value) return value as NonNullable<T>;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
const apex = () => (win as unknown as { Apex: { send(text: string): void } }).Apex;

// Another script on the page could write anything into the widget's storage; only well-formed tickets may show.
const at = "2026-10-01T10:00:00.000Z";
win.localStorage.setItem(
  `apex:${A.key}:tickets`,
  JSON.stringify([
    { id: "K7Q2-M9XA", createdAt: at, email: "ada@example.com", note: '<img src=x onerror="alert(1)">' },
    { id: "<script>alert(1)</script>", createdAt: at, email: "ada@example.com", note: "" },
    { id: "AAAA-BBBB", createdAt: "not a date", email: "ada@example.com", note: "" },
    { id: "AAAA-CCCC", createdAt: at, email: "x".repeat(300), note: "" },
    { id: "AAAA-DDDD", createdAt: at, email: "ada@example.com", note: "x".repeat(5000) },
    { id: "WXYZ-2345", createdAt: at, email: "ada@example.com", note: "", onclick: "alert(1)", __proto__: { polluted: true } },
    null,
    42,
    "ABCD-2345",
  ]),
);

before(async () => {
  await import("../src/index.ts");
  await until(() => win.document.getElementById("apex-bot"), "widget mount");
});

describe("widget with dashboard settings", () => {
  it("applies look settings as CSS variables and classes", () => {
    const root = $(".root")!;
    assert.ok(root.classList.contains("dk"), "dark theme");
    assert.equal(root.style.getPropertyValue("--pw"), "440px");
    assert.equal(root.style.getPropertyValue("--r"), "4px");
    assert.equal(root.style.getPropertyValue("--cx"), "40px");
    assert.match(root.style.getPropertyValue("--font"), /Georgia/);
    assert.equal(root.getAttribute("lang"), "tr", "fixed language beats the page's");
  });

  it("shows a labeled launcher and a dismissible teaser", async () => {
    const launcher = $("button.launcher")!;
    assert.ok(launcher.classList.contains("lbl"));
    assert.equal(launcher.textContent, "Bize sorun");
    assert.equal($(".teaser span")!.textContent, "Sorunuz mu var?");
    ($(".teaser .x") as HTMLButtonElement).click();
    assert.ok($(".teaser")!.classList.contains("out"), "fades out");
    await until(() => !$(".teaser"), "teaser removed");
    assert.ok(win.sessionStorage.getItem(`apex:${A.key}:conversation:teaser`));
  });

  it("opens to a required lead form that blocks sending", async () => {
    $("button.launcher")!.click();
    assert.equal($("button.launcher")!.textContent, "", "no label while open");
    const form = await until(() => $<HTMLFormElement>("form.form"), "lead form");
    assert.match(form.textContent!, /Başlamadan önce/);
    assert.equal(form.querySelector(".btn.ghost"), null, "required: no skip button");
    apex().send("Kargo?");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(model.requests.length, 0);
  });

  it("the menu can't skip a required lead form", () => {
    const btn = $<HTMLButtonElement>(".head .mw > .icon")!;
    btn.click();
    const items = $$(".menu .item") as HTMLButtonElement[];
    assert.ok(items.every((b) => b.disabled), "every item is locked");
    assert.equal(shadow.activeElement, $(".menu"), "focus stays in the menu");
    $(".menu")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok($("form.form"), "still on the lead form");
  });

  it("validates the lead form, then records the lead and opens the chat", async () => {
    const form = $<HTMLFormElement>("form.form")!;
    const [email, name] = [...form.querySelectorAll("input")];
    email.value = "ada@example.com";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }));
    assert.match($(".form .err")!.textContent!, /zorunlu/);

    name.value = "Ada";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }));
    await until(() => $("form.compose"), "chat view");
    const id = win.localStorage.getItem(`apex:${A.key}:conversation`);
    assert.ok(id, "browser persistence uses localStorage");
    assert.deepEqual(store.get("tn_a", id!)?.visitor, { email: "ada@example.com", name: "Ada" });
    // the team still hears about new leads with hand-off off; only the visitor-side option is hidden
    assert.equal(mailer.outbox.length, 1);
  });

  it("uses the custom header, placeholder and footer", () => {
    assert.equal($(".title span")!.textContent, "Saniyeler içinde yanıt");
    assert.equal($("textarea")!.getAttribute("placeholder"), "Sorunuzu yazın");
    assert.ok($(".avatar svg"), "bot icon avatar");
    const foot = $(".foot")!;
    assert.doesNotMatch(foot.textContent!, /yapay zekâ ile üretilir/, "disclaimer off");
    assert.doesNotMatch(foot.textContent!, /Bir insanla konuş/, "hand-off off");
    assert.match(foot.textContent!, /Apex Bot ile çalışır/);
  });

  it("shows only well-formed stored tickets, as text", () => {
    $<HTMLButtonElement>(".head .mw > .icon")!.click();
    const tickets = ($$(".menu .item") as HTMLButtonElement[]).find((b) => /Taleplerimi gör/.test(b.textContent!))!;
    assert.equal(tickets.hidden, false, "hand-off is off, but there are tickets to show");
    assert.equal(tickets.querySelector(".count")!.textContent, "2");
    tickets.click();
    const cards = $$(".pane.tks .ticket");
    assert.deepEqual(cards.map((c) => c.querySelector("strong")!.textContent), ["#K7Q2-M9XA", "#WXYZ-2345"]);
    assert.equal(cards[0].querySelector("p")!.textContent, '<img src=x onerror="alert(1)">');
    assert.equal($$("img, script").length, 0);
    assert.equal(cards[1].hasAttribute("onclick"), false);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    ($(".pane.tks .ph button") as HTMLButtonElement).click();
    assert.ok($("form.compose"));
  });

  it("hides sources and feedback when turned off", async () => {
    apex().send("Kargo ücreti?");
    await until(() => model.requests.length === 1 && $$(".msg.bot").length === 2 && !$("[aria-busy]"), "answer");
    await new Promise((r) => setTimeout(r, 30));
    assert.equal($(".sources"), null);
    assert.equal($(".rate"), null);
  });
});

describe("custom launcher image", () => {
  it("validates as an upload or an https URL, never SVG or http", async () => {
    const { checkSettings } = await import("@apex/db/bot-settings");
    const at = (launcherImage: string) =>
      checkSettings({ handoff: { enabled: false }, appearance: { launcherIcon: "custom", launcherImage } }).map((i) => i.path);
    assert.deepEqual(at("data:image/png;base64,iVBORw0KGgo="), []);
    assert.deepEqual(at("https://cdn.example/logo.webp"), []);
    assert.deepEqual(at("http://cdn.example/logo.png"), ["appearance.launcherImage", "appearance.launcherImage"]);
    assert.deepEqual(at("data:image/svg+xml;base64,PHN2Zz4="), ["appearance.launcherImage", "appearance.launcherImage"]);
    assert.deepEqual(at(""), ["appearance.launcherImage"]);
  });
});

describe("hiddenHere", () => {
  const ui = publicWidgetSettings(parseSettings({ handoff: { enabled: false }, behavior: { hiddenPaths: ["/checkout", "/account/"] } }));
  it("matches a path and everything under it, not lookalikes", () => {
    assert.equal(hiddenHere(ui, "/checkout"), true);
    assert.equal(hiddenHere(ui, "/checkout/pay"), true);
    assert.equal(hiddenHere(ui, "/checkouts"), false);
    assert.equal(hiddenHere(ui, "/account/orders"), true);
    assert.equal(hiddenHere(ui, "/"), false);
    assert.equal(hiddenHere(undefined, "/checkout"), false);
  });
});

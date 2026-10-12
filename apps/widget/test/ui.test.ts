// Integration test: the real widget bundle source, mounted in jsdom, talking to the real
// API app (in-process, with a fake model) through fetch.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { A, setup } from "../../api/test/helpers.ts";

const { app, store, mailer, model } = setup();
model.reply = ["**Kargo** ", "750 TL üzeri ", "ücretsizdir."];

const dom = new JSDOM(
  `<!doctype html><html lang="tr"><body><script src="https://cdn.example/widget.js" data-site-key="${A.key}" data-api="https://api.example"></script></body></html>`,
  { url: `${A.origin}/urunler`, pretendToBeVisual: true },
);
const win = dom.window;
let shadow: ShadowRoot;
const attach = win.Element.prototype.attachShadow;
win.Element.prototype.attachShadow = function (init) {
  shadow = attach.call(this, init);
  return shadow;
};

// Node defines a read-only global navigator, so it is redefined rather than assigned.
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  location: win.location,
  sessionStorage: win.sessionStorage,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  // The browser adds Origin to cross-origin requests; the in-process app needs it explicitly.
  fetch: (url: string, init: RequestInit = {}) =>
    app.request(url.replace("https://api.example", ""), {
      ...init,
      headers: { ...(init.headers as Record<string, string>), origin: A.origin },
    }),
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

type Facade = { version: string; open(): void; send(text: string): void; on(e: string, fn: (p: unknown) => void): void; identify(p: object): void };
const apex = () => (win as unknown as { Apex: Facade }).Apex;

before(async () => {
  await import("../src/index.ts");
  await until(() => win.document.getElementById("apex-bot"), "widget mount");
});

describe("widget", () => {
  it("mounts closed with an accessible launcher", () => {
    const launcher = $("button.launcher")!;
    assert.equal(launcher.getAttribute("aria-expanded"), "false");
    assert.equal(launcher.getAttribute("aria-label"), "Sohbeti aç");
    assert.equal($("section.panel")!.hidden, true);
    assert.equal(apex().version, "1");
  });

  it("opens with the AI disclosure, greeting and suggestions", async () => {
    $("button.launcher")!.click();
    assert.equal($("section.panel")!.hidden, false);
    assert.match($(".title span")!.textContent!, /Yapay zekâ asistanı/);
    await until(() => $(".msg.bot"), "greeting");
    assert.equal($(".msg.bot")!.textContent, "Merhaba");
  });

  it("streams an answer with markdown, sources and an event", async () => {
    let message: unknown;
    apex().on("message", (p) => (message = p));
    apex().send("Kargo ücreti ne kadar?");
    await until(() => $(".meta .rate"), "answer metadata");
    const bubbles = $$(".msg.bot");
    const answer = bubbles[bubbles.length - 1];
    assert.equal(answer.querySelector("strong")?.textContent, "Kargo");
    assert.equal(answer.textContent, "Kargo 750 TL üzeri ücretsizdir.");
    assert.equal($<HTMLAnchorElement>(".sources a.chip")!.href, "https://alpha.example/kargo");
    assert.equal($(".msg.user")!.textContent, "Kargo ücreti ne kadar?");
    assert.equal((message as { text: string }).text, "**Kargo** 750 TL üzeri ücretsizdir.");
    assert.ok(win.sessionStorage.getItem(`apex:${A.key}:conversation`));
  });

  it("sends feedback once", async () => {
    const [up, down] = $$(".rate button") as HTMLButtonElement[];
    up.click();
    assert.equal(up.getAttribute("aria-pressed"), "true");
    assert.equal(down.disabled, true);
    const id = win.sessionStorage.getItem(`apex:${A.key}:conversation`)!;
    await until(() => store.get("tn_a", id)?.messages.at(-1)?.feedback, "stored feedback");
  });

  it("validates and submits the handoff form", async () => {
    apex().identify({ name: "Ayşe" });
    ($$(".foot button")[0] as HTMLButtonElement).click();
    const form = $<HTMLFormElement>("form.form")!;
    const [email, name] = [...form.querySelectorAll("input")];
    assert.equal(name.value, "Ayşe");
    email.value = "not-an-email";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }));
    assert.match($(".form .err")!.textContent!, /Geçerli bir e-posta/);
    assert.equal(mailer.outbox.length, 0);

    email.value = "ayse@example.com";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }));
    await until(() => mailer.outbox.length === 1, "handoff email");
    assert.match(mailer.outbox[0].text, /Kargo ücreti ne kadar\?/);
    await until(() => $(".form [role=status]"), "success message");
    ($(".form .btn.ghost") as HTMLButtonElement).click();
    assert.ok($("form.compose"), "back in the chat view");
  });

  it("shows a retryable error when the stream fails", async () => {
    model.fail = true;
    apex().send("iade?");
    const error = await until(() => $(".msg.bot.error"), "error bubble");
    assert.match(error.textContent!, /Bir şeyler ters gitti/);
    model.fail = false;
    ($(".msg.bot.error + .meta button") as HTMLButtonElement).click();
    await until(() => !$(".msg.bot.error") && $$(".msg.user").length === 2 && $$(".meta .rate").length === 2, "retried answer");
  });

  it("starts a new chat", async () => {
    ($(".head .icon") as HTMLButtonElement).click();
    await until(() => $$(".msg").length === 1, "reset log");
    assert.equal(win.sessionStorage.getItem(`apex:${A.key}:conversation`), null);
  });

  it("closes on Escape and returns focus to the launcher", () => {
    $("section.panel")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal($("section.panel")!.hidden, true);
    assert.equal(shadow.activeElement, $("button.launcher"));
  });
});

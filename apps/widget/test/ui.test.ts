// Integration test: the real widget bundle source, mounted in jsdom, talking to the real
// API app (in-process, with a fake model) through fetch.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { A, setup } from "../../api/test/helpers.ts";

// the reply quota is enforced here (it is off by default until billing launches)
const { app, store, mailer, model, tenants } = setup({}, { featureEnabled: async (flag) => flag === "reply_quota" });
// the model cites the excerpt it used, so the widget shows it as a source
model.reply = ["**Kargo** ", "750 TL üzeri ", "ücretsizdir. [[used: 1]]"];

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
const key = (el: Element, k: string) => el.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const menuBtn = () => $<HTMLButtonElement>(".head .mw > .icon")!;
const items = () => $$(".menu .item") as HTMLButtonElement[];
const item = (label: RegExp) => items().find((b) => label.test(b.textContent!))!;
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
    assert.equal($(".head .title")!.textContent, "Apex");
    assert.match($("section.panel")!.getAttribute("aria-label")!, /Yapay zekâ asistanı/);
    assert.match($(".foot")!.textContent!, /Yanıtlar yapay zekâ ile üretilir/);
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
    menuBtn().click();
    item(/Bir insanla konuş/).click();
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
    // the visitor and the team see the same ticket reference
    const ref = $(".form .ref strong")!.textContent!;
    assert.match(ref, /^#[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.ok(mailer.outbox[0].subject.endsWith(`[${ref}]`));
    assert.match(mailer.outbox[0].text, new RegExp(`Talep no: ${ref}`));
    ($(".form .btn.primary") as HTMLButtonElement).click();
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

  it("has a labelled more-options button next to close", () => {
    const btn = menuBtn();
    assert.equal(btn.getAttribute("aria-label"), "Diğer seçenekler");
    assert.equal(btn.getAttribute("aria-haspopup"), "menu");
    assert.equal(btn.getAttribute("aria-expanded"), "false");
    assert.equal(btn.parentElement!.nextElementSibling!.getAttribute("aria-label"), "Sohbeti kapat");
    assert.deepEqual(items().map((b) => b.textContent!.replace(/\d+$/, "")), ["Yeni sohbet başlat", "Sohbeti sonlandır", "Bir insanla konuş", "Taleplerimi gör"]);
    assert.ok(items().every((b) => b.getAttribute("role") === "menuitem"));
  });

  it("opens the menu with focus on the first item and moves with the arrow keys", () => {
    menuBtn().click();
    assert.equal(menuBtn().getAttribute("aria-expanded"), "true");
    assert.ok($(".menu")!.classList.contains("on"));
    assert.equal(shadow.activeElement, items()[0]);
    key(items()[0], "ArrowDown");
    assert.equal(shadow.activeElement, items()[1]);
    key(items()[1], "End");
    assert.equal(shadow.activeElement, items()[3]);
    key(items()[3], "ArrowDown");
    assert.equal(shadow.activeElement, items()[0], "wraps around");
    key(items()[0], "ArrowUp");
    assert.equal(shadow.activeElement, items()[3]);
    key(items()[3], "Home");
    assert.equal(shadow.activeElement, items()[0]);
  });

  it("closes the menu on Escape without closing the panel", () => {
    key(items()[0], "Escape");
    assert.equal($(".menu")!.classList.contains("on"), false);
    assert.equal(menuBtn().getAttribute("aria-expanded"), "false");
    assert.equal($("section.panel")!.hidden, false);
    assert.equal(shadow.activeElement, menuBtn());
  });

  it("opens from the keyboard at the last item, and closes on a press outside it", () => {
    key(menuBtn(), "ArrowUp");
    assert.equal(shadow.activeElement, items()[3]);
    $(".log")!.dispatchEvent(new win.MouseEvent("pointerdown", { bubbles: true, composed: true }));
    assert.equal($(".menu")!.classList.contains("on"), false);
    menuBtn().click();
    win.document.body.dispatchEvent(new win.MouseEvent("pointerdown", { bubbles: true }));
    assert.equal($(".menu")!.classList.contains("on"), false, "a press on the host page");
  });

  it("lists the ticket sent earlier", () => {
    menuBtn().click();
    const tickets = item(/Taleplerimi gör/);
    assert.equal(tickets.querySelector(".count")!.textContent, "1");
    tickets.click();
    const pane = $(".pane.tks")!;
    const card = pane.querySelector(".ticket")!;
    assert.match(card.querySelector("strong")!.textContent!, /^#[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.match(card.textContent!, /Yanıt adresi: ayse@example.com/);
    assert.match(card.textContent!, /Mesaj eklenmedi/);
    assert.equal(shadow.activeElement, pane.querySelector(".ph button"), "focus on back");
    const stored = JSON.parse(win.sessionStorage.getItem(`apex:${A.key}:tickets`)!);
    assert.equal(stored.length, 1);
    (pane.querySelector(".ph button") as HTMLButtonElement).click();
    assert.ok($("form.compose"), "back in the chat");
    assert.equal(shadow.activeElement, $("textarea"));
  });

  it("asks before ending the chat, and Cancel keeps it", () => {
    menuBtn().click();
    item(/Sohbeti sonlandır/).click();
    const sheet = $(".sheet:not(.out) [role=alertdialog]")!;
    assert.match(sheet.textContent!, /Sohbet sonlandırılsın mı\?/);
    assert.equal(shadow.activeElement!.textContent, "Vazgeç", "the safe choice has focus");
    assert.ok($(".head")!.hasAttribute("inert"));
    key(sheet, "Escape");
    assert.equal($("section.panel")!.hidden, false, "Escape answers the question only");
    assert.equal($(".head")!.hasAttribute("inert"), false);
    assert.ok(win.sessionStorage.getItem(`apex:${A.key}:conversation`), "still the same chat");
    assert.equal(shadow.activeElement, menuBtn());
  });

  let ended = "";
  it("ends the chat", async () => {
    apex().on("end", (p) => (ended = (p as { conversationId: string }).conversationId));
    const id = win.sessionStorage.getItem(`apex:${A.key}:conversation`)!;
    menuBtn().click();
    item(/Sohbeti sonlandır/).click();
    ($(".sheet:not(.out) .btn.danger") as HTMLButtonElement).click();
    const pane = await until(() => $(".pane.end"), "ended pane");
    assert.match(pane.textContent!, /Sohbet sonlandırıldı/);
    assert.equal($("form.compose"), null, "no composer on an ended chat");
    assert.equal(win.sessionStorage.getItem(`apex:${A.key}:conversation`), null);
    assert.equal(ended, id);
    assert.equal(shadow.activeElement!.textContent, "Yeni sohbet başlat");
    menuBtn().click();
    assert.equal(item(/Sohbeti sonlandır/).disabled, true, "nothing left to end");
    key(menuBtn(), "Escape");
  });

  it("erases the ended conversation on request", async () => {
    ($(".pane.end .link") as HTMLButtonElement).click();
    await until(() => /Sohbet kaydı silindi/.test($(".pane.end [role=status]")!.textContent!), "erased");
    assert.equal(store.get("tn_a", ended), undefined);
    assert.equal($(".pane.end .link"), null);
  });

  it("starts a new chat from the ended pane", async () => {
    ($(".pane.end .btn.primary") as HTMLButtonElement).click();
    await until(() => $("form.compose") && $$(".msg").length === 1, "fresh chat");
    assert.equal($(".msg.bot")!.textContent, "Merhaba");
  });

  it("a message sent to an ended chat starts a new one", async () => {
    apex().send("Kargo?");
    await until(() => $$(".meta .rate").length === 1, "answer");
    menuBtn().click();
    item(/Sohbeti sonlandır/).click();
    ($(".sheet:not(.out) .btn.danger") as HTMLButtonElement).click();
    await until(() => $(".pane.end"), "ended pane");
    apex().send("İade?");
    await until(() => $("form.compose") && $$(".msg.user").length === 1 && $$(".meta .rate").length === 1, "new chat answer");
    assert.equal($(".msg.user")!.textContent, "İade?");
  });

  it("starts a new chat from the menu", async () => {
    menuBtn().click();
    item(/Yeni sohbet başlat/).click();
    await until(() => $$(".msg").length === 1, "reset log");
    assert.equal(win.sessionStorage.getItem(`apex:${A.key}:conversation`), null);
    assert.equal(shadow.activeElement, $("textarea"));
  });

  it("renders markup in replies as text, never as elements", async () => {
    model.reply = ['<img src=x onerror="alert(1)"> [tıkla](javascript:alert(1)) <script>alert(2)</script>'];
    apex().send("<b>kalın</b><iframe src=//evil.example>");
    await until(() => $$(".meta .rate").length === 1, "answer");
    assert.equal($$("img, script, iframe, b").length, 0);
    assert.equal($(".msg.user")!.textContent, "<b>kalın</b><iframe src=//evil.example>");
    const reply = $$(".msg.bot").at(-1)!;
    assert.equal(reply.querySelector("a"), null, "javascript: link stays text");
    assert.match(reply.textContent!, /<script>alert\(2\)<\/script>/);
    // the model cites the excerpt it used, so the widget shows it as a source
model.reply = ["**Kargo** ", "750 TL üzeri ", "ücretsizdir. [[used: 1]]"];
  });

  it("closes on Escape with a transition and returns focus to the launcher", async () => {
    $("section.panel")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal($(".root")!.hasAttribute("data-open"), false, "the closing transition starts at once");
    assert.equal(shadow.activeElement, $("button.launcher"));
    await until(() => $("section.panel")!.hidden, "panel out of the layout");
  });

  it("reopening mid-transition keeps the panel", async () => {
    $("button.launcher")!.click();
    $("button.launcher")!.click();
    $("button.launcher")!.click();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal($("section.panel")!.hidden, false);
    assert.ok($(".root")!.hasAttribute("data-open"));
  });

  it("opens the hand-off form with the question and a note when the site's monthly replies are used up", async () => {
    const site = tenants.findById("tn_a")!;
    site.organizationId = "org_a";
    tenants.setWorkspaces([{ organizationId: "org_a", plan: "free", anchor: null, allowanceFifths: 0, overageCapFifths: 0 }]);
    const asked = model.requests.length;
    const sent = mailer.outbox.length;
    apex().send("Toptan fiyat alabilir miyim?");
    const form = await until(() => $<HTMLFormElement>("form.form"), "hand-off form");
    assert.equal(model.requests.length, asked, "the model is never called");
    assert.match(form.querySelector(".reason")!.textContent!, /Asistan şu anda yanıt veremiyor/);
    assert.doesNotMatch(form.textContent!, /kota/i, "visitors are never told about the quota");
    assert.equal(form.querySelector("textarea")!.value, "Toptan fiyat alabilir miyim?");
    form.querySelector<HTMLInputElement>("input[type=email]")!.value = "ayse@example.com";
    form.dispatchEvent(new win.Event("submit", { cancelable: true }));
    await until(() => mailer.outbox.length === sent + 1, "handoff email");
    assert.match(mailer.outbox.at(-1)!.text, /Toptan fiyat alabilir miyim\?/);
    ($(".form .btn.primary") as HTMLButtonElement).click();
    // the chat keeps the explanation and a way back to the form
    const error = [...shadow.querySelectorAll(".msg.bot.error")].at(-1)!;
    assert.match(error.textContent!, /ekibimize iletin/);
    assert.match(error.nextElementSibling!.textContent!, /Bir insanla konuş/);
    tenants.setWorkspaces([]);
    delete site.organizationId;
    menuBtn().click();
    item(/Yeni sohbet başlat/).click();
    await until(() => !$(".msg.bot.error"), "a fresh chat");
  });

  // last: it locks the composer for the rest of the page
  it("says the assistant is out of service when staff switch it off mid-visit, and locks the composer", async () => {
    tenants.pause(tenants.findById("tn_a")!);
    const asked = model.requests.length;
    apex().send("Hâlâ orada mısınız?");
    const error = await until(() => [...shadow.querySelectorAll(".msg.bot.error")].at(-1), "out-of-service bubble");
    assert.match(error.textContent!, /hizmet dışı/);
    // no retry or hand-off: nothing on the site answers now
    assert.ok(!error.nextElementSibling?.classList.contains("meta"));
    assert.equal($<HTMLTextAreaElement>("textarea")!.disabled, true);
    assert.match($<HTMLTextAreaElement>("textarea")!.placeholder, /hizmet dışı/);
    assert.equal($<HTMLButtonElement>("button.send")!.disabled, true);
    apex().send("Bir daha");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(model.requests.length, asked, "the model is never called");
  });
});

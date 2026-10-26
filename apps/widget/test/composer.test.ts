// The composer: privacy notice, attachments (drop, chips, upload to the real API) and voice
// (dictation and voice chat), with the browser's speech and canvas APIs replaced by fakes.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { A, setup } from "../../api/test/helpers.ts";

const { app, store, model, tenants } = setup({ ipMessagesPerMinute: 100 });
model.reply = ["**Kargo** 1-3 iş günü sürer. [Detaylar](https://alpha.example/kargo)"];
tenants.findById("tn_a")!.settings.privacyUrl = "https://alpha.example/gizlilik";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const dom = new JSDOM(
  `<!doctype html><html lang="tr"><body><script src="https://cdn.example/widget.js" data-site-key="${A.key}" data-api="https://api.example"></script></body></html>`,
  { url: `${A.origin}/`, pretendToBeVisual: true },
);
const win = dom.window;
let shadow: ShadowRoot;
const attach = win.Element.prototype.attachShadow;
win.Element.prototype.attachShadow = function (init) {
  shadow = attach.call(this, init);
  return shadow;
};

// Speech recognition as Chrome exposes it
class FakeRecognition extends win.EventTarget {
  static all: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  started = false;
  constructor() {
    super();
    FakeRecognition.all.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.dispatchEvent(new win.Event("end"));
  }
  abort() {
    this.dispatchEvent(new win.Event("end"));
  }
  hear(text: string, isFinal: boolean) {
    const results = [Object.assign([{ transcript: text }], { isFinal })];
    this.dispatchEvent(Object.assign(new win.Event("result"), { resultIndex: 0, results }));
  }
  fail(error: string) {
    this.dispatchEvent(Object.assign(new win.Event("error"), { error }));
  }
}
(win as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
const rec = () => FakeRecognition.all.at(-1)!;

const synth = { spoken: [] as { text: string; lang: string; onend: (() => void) | null }[], cancelled: 0, speak(u: never) { this.spoken.push(u); }, cancel() { this.cancelled++; } };
class Utterance {
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

// jsdom has no canvas or image decoding; the re-encoder gets a 4000x3000 "photo" and returns a real PNG
const drawn: { width: number; height: number }[] = [];
win.HTMLCanvasElement.prototype.getContext = function () {
  drawn.push({ width: this.width, height: this.height });
  return { fillRect() {}, drawImage() {} } as never;
} as never;
win.HTMLCanvasElement.prototype.toDataURL = () => `data:image/jpeg;base64,${PNG}`;

Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  location: win.location,
  sessionStorage: win.sessionStorage,
  localStorage: win.localStorage,
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  speechSynthesis: synth,
  SpeechSynthesisUtterance: Utterance,
  createImageBitmap: async () => ({ width: 4000, height: 3000, close() {} }),
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
const round = () => $<HTMLButtonElement>(".compose .send")!;
const textarea = () => $<HTMLTextAreaElement>(".compose textarea")!;
const type = (text: string) => {
  textarea().value = text;
  textarea().dispatchEvent(new win.Event("input", { bubbles: true }));
};
function drop(...files: File[]) {
  const event = Object.assign(new win.Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: { types: ["Files"], files } });
  $(".view")!.dispatchEvent(event);
}
const lastUserText = () => model.requests.at(-1)!.messages.at(-1)!.content;

before(async () => {
  await import("../src/index.ts");
  await until(() => win.document.getElementById("apex-bot"), "widget mount");
  $<HTMLButtonElement>("button.launcher")!.click();
  await until(() => $(".msg.bot"), "greeting");
});

describe("composer", () => {
  it("is a pill with paperclip, text field, microphone and a round button", () => {
    const bar = $(".compose .bar")!;
    assert.deepEqual(
      [...bar.children].map((el) => el.getAttribute("aria-label")),
      ["Dosya ekle", "Bir soru yazın…", "Sesle yaz", "Sesli sohbet"],
    );
    assert.ok(round().querySelector("svg"), "voice icon while there is nothing to send");
    assert.equal(round().disabled, false);
  });

  it("turns the round button into Send once there is text", () => {
    type("merhaba");
    assert.equal(round().getAttribute("aria-label"), "Gönder");
    type("   ");
    assert.equal(round().getAttribute("aria-label"), "Sesli sohbet");
  });

  it("shows a one-line privacy notice, dismissible for the visit", async () => {
    const notice = $(".notice")!;
    assert.equal(notice.querySelector("p")!.textContent, "Sohbet ederek gizlilik politikasını kabul edersiniz.");
    assert.equal($(".foot")!.textContent, "Yanıtlar yapay zekâ ile üretilir ve hatalı olabilir.", "the AI disclaimer sits under the composer");
    const link = notice.querySelector("a")!;
    assert.equal(link.getAttribute("href"), "https://alpha.example/gizlilik");
    assert.equal(link.getAttribute("rel"), "noopener noreferrer");
    assert.equal($(".dock")!.classList.contains("bare"), false);
    (notice.querySelector(".x") as HTMLButtonElement).click();
    assert.ok(notice.classList.contains("gone"), "collapses");
    assert.ok($(".dock")!.classList.contains("bare"));
    await until(() => !$(".notice"), "notice removed");
    assert.ok(win.localStorage.getItem(`apex:${A.key}:conversation:notice`), "dismissal outlives the visit");
  });
});

describe("attachments", () => {
  it("adds a dropped text file as a chip and sends it as data", async () => {
    drop(new File(["Hata kodu 42: ödeme reddedildi"], "hata.txt", { type: "text/plain" }));
    const chip = await until(() => $(".fchip:not(.busy)"), "ready chip");
    assert.equal(chip.querySelector(".fname")!.textContent, "hata.txt");
    assert.equal(round().getAttribute("aria-label"), "Gönder", "a file alone can be sent");
    round().click();
    await until(() => $$(".meta .rate").length === 1, "answer");
    assert.match(lastUserText() as string, /<attachment name="hata.txt">\nHata kodu 42: ödeme reddedildi\n<\/attachment>/);
    assert.equal($(".files")!.childElementCount, 0, "chips cleared after sending");
    assert.equal($(".msg.user .upfile")!.textContent, "hata.txt");
    const id = win.sessionStorage.getItem(`apex:${A.key}:conversation`)!;
    assert.equal(store.get("tn_a", id)!.messages.at(-2)!.content, "📎 hata.txt");
  });

  it("re-encodes a photo below the size cap and sends it as an image", async () => {
    drawn.length = 0;
    drop(new File([new Uint8Array(3_000_000)], "foto.heic.jpg", { type: "image/jpeg" }));
    const chip = await until(() => $(".fchip:not(.busy)"), "ready chip");
    assert.match(chip.querySelector(".fthumb img")!.getAttribute("src")!, /^data:image\/jpeg;base64,/);
    assert.deepEqual(drawn[0], { width: 1568, height: 1176 }, "scaled to the longest edge, aspect kept");
    type("Bu hangi ürün?");
    round().click();
    await until(() => $$(".meta .rate").length === 2, "answer");
    const turn = lastUserText() as { type: string; source?: { media_type: string; data: string } }[];
    assert.equal(turn[0].type, "image");
    assert.equal(turn[0].source!.data, PNG);
    const bubble = $$(".msg.user").at(-1)!;
    assert.ok(bubble.querySelector("img.upimg"));
    assert.equal(bubble.textContent, "Bu hangi ürün?");
  });

  it("refuses unsupported files with a message", async () => {
    drop(new File(["PK"], "arsiv.zip", { type: "application/zip" }));
    await until(() => $(".cerr")!.textContent, "error");
    assert.match($(".cerr")!.textContent!, /desteklenmiyor/);
    assert.equal($(".fchip"), null);
    drop(new File(["a\u0000b"], "binary.txt", { type: "text/plain" }));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal($(".fchip"), null, "binary content with a text name");
  });

  it("caps a message at three files and lets one be removed", async () => {
    drop(...[1, 2, 3, 4].map((n) => new File([`not ${n}`], `not${n}.txt`, { type: "text/plain" })));
    assert.match($(".cerr")!.textContent!, /En fazla 3 dosya/);
    await until(() => $$(".fchip:not(.busy)").length === 3, "three chips");
    ($$(".fchip .x")[1] as HTMLButtonElement).click();
    assert.deepEqual($$(".fchip .fname").map((n) => n.textContent), ["not1.txt", "not3.txt"]);
    for (const x of $$(".fchip .x")) (x as HTMLButtonElement).click();
    assert.equal($(".fchip"), null);
  });

  it("the transcript keeps the file names, not the files", async () => {
    const id = win.sessionStorage.getItem(`apex:${A.key}:conversation`)!;
    const res = await app.request(`/v1/conversations/${id}`, { headers: { origin: A.origin, "x-apex-site-key": A.key } });
    const { messages } = (await res.json()) as { messages: { role: string; content: string }[] };
    assert.equal(messages.find((m) => m.role === "user")!.content, "📎 hata.txt");
  });
});

describe("voice", () => {
  it("dictates into the text field until the microphone is pressed again", () => {
    type("");
    const mic = $<HTMLButtonElement>('.tool[aria-label="Sesle yaz"]')!;
    mic.click();
    const r = rec();
    assert.ok(r.started);
    assert.equal(r.lang, "tr-TR");
    assert.equal(r.continuous, true);
    assert.equal(mic.getAttribute("aria-pressed"), "true");
    assert.equal(textarea().placeholder, "Dinleniyor…");
    r.hear("kargo ", false);
    assert.equal(textarea().value, "kargo");
    r.hear("kargo ne kadar", true);
    assert.equal(textarea().value, "kargo ne kadar");
    assert.equal(round().getAttribute("aria-label"), "Gönder", "dictated text is sent like typed text");
    mic.click();
    assert.equal(mic.getAttribute("aria-pressed"), "false");
    assert.equal(textarea().placeholder, "Bir soru yazın…");
    assert.equal(model.requests.length, 2, "dictation never sends by itself");
  });

  it("explains a denied microphone", () => {
    type("");
    $<HTMLButtonElement>('.tool[aria-label="Sesle yaz"]')!.click();
    rec().fail("not-allowed");
    rec().stop();
    assert.equal($(".cerr")!.textContent, "Mikrofon izni verilmedi.");
  });

  it("voice chat sends what was said and reads the reply aloud", async () => {
    type("");
    round().click();
    const r = rec();
    assert.equal(r.continuous, false, "one utterance");
    assert.ok(round().classList.contains("live"));
    r.hear("Kargo ne kadar sürer", true);
    r.stop();
    await until(() => synth.spoken.length === 1, "reply spoken");
    assert.equal(model.requests.length, 3);
    assert.equal(synth.spoken[0].text, "Kargo 1-3 iş günü sürer. Detaylar", "markdown and links read as words");
    assert.equal(synth.spoken[0].lang, "tr-TR");
    assert.equal(round().getAttribute("aria-label"), "Sesli yanıtı durdur");
    const before = synth.cancelled;
    round().click();
    assert.ok(synth.cancelled > before);
    assert.equal(round().getAttribute("aria-label"), "Sesli sohbet");
  });

  it("stops listening and speaking when the panel closes", () => {
    round().click();
    assert.ok($(".root")!.classList.contains("rec"));
    $<HTMLButtonElement>("button.launcher")!.click();
    assert.equal($(".root")!.classList.contains("rec"), false);
  });
});

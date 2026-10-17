// Hostile-input suite for the public widget API: injection payloads, cross-tenant access,
// prototype pollution, mail header injection and abuse limits. Everything here is reachable
// by anyone who reads a site's HTML, so every route is treated as attacker-controlled.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { idOf, ticketRef } from "../src/app.ts";
import { ConversationStore, type Conversation, type ConversationPersistence } from "../src/store.ts";
import { A, B, headers, readSSE, setup } from "./helpers.ts";

/** Persistence that records every lookup, so tests can prove a payload never reached the database. */
function spyPersistence() {
  const calls = { load: [] as string[], deleted: [] as string[] };
  const persistence: ConversationPersistence = {
    created: async () => {},
    appended: async () => {},
    visitor: async () => {},
    handoff: async () => {},
    feedback: async () => {},
    deleted: async (_tenant, id) => (calls.deleted.push(id), false),
    load: async (_tenant, id) => (calls.load.push(id), undefined),
  };
  return { calls, store: new ConversationStore({ persistence }) };
}

const SQL_PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1 --",
  "1; DROP TABLE app.conversations; --",
  "00000000-0000-4000-8000-000000000000' OR '1'='1",
  "00000000-0000-4000-8000-000000000000; delete from app.messages",
  "') UNION SELECT id, content FROM app.messages --",
  "$1",
  "\\x00",
  "\u0000",
  "../../etc/passwd",
  "%27%20OR%201%3D1",
  "a".repeat(5000),
];

const post = (app: ReturnType<typeof setup>["app"], path: string, body: unknown, site = A, extra: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: headers(site, extra), body: typeof body === "string" ? body : JSON.stringify(body) });

describe("id validation", () => {
  it("accepts only v4-shaped UUIDs", () => {
    assert.equal(idOf("3f2b8c1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f"), "3f2b8c1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f");
    for (const bad of [...SQL_PAYLOADS, "", null, undefined, 42, {}, [], { $ne: null }]) assert.equal(idOf(bad), undefined, String(bad));
    // a valid id with anything around it is still rejected
    assert.equal(idOf(" 3f2b8c1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f"), undefined);
    assert.equal(idOf("3f2b8c1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f\n"), undefined);
  });

  it("ticket references are short, unambiguous and unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const ref = ticketRef();
      assert.match(ref, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      seen.add(ref);
    }
    assert.equal(seen.size, 2000);
  });
});

describe("injection payloads never reach storage", () => {
  it("chat starts a fresh conversation instead of looking a payload up", async () => {
    const { calls, store } = spyPersistence();
    const { app } = setup({ ipMessagesPerMinute: 1000 }, { store });
    for (const conversationId of [...SQL_PAYLOADS, { $ne: null }, { $gt: "" }, ["x"], 1, true]) {
      const res = await post(app, "/v1/chat", { message: "merhaba", conversationId });
      assert.equal(res.status, 200, JSON.stringify(conversationId).slice(0, 60));
      const [meta] = await readSSE(res);
      assert.ok(idOf(meta.data.conversationId), "a server-made id comes back");
    }
    assert.deepEqual(calls.load, []);
  });

  it("conversation reads and erasures 404 without a lookup", async () => {
    const { calls, store } = spyPersistence();
    const { app } = setup({ lookupsPerMinute: 1000 }, { store });
    for (const payload of SQL_PAYLOADS) {
      const path = `/v1/conversations/${encodeURIComponent(payload)}`;
      const read = await app.request(path, { headers: headers(A) });
      assert.equal(read.status, 404, payload.slice(0, 40));
      const erase = await app.request(path, { method: "DELETE", headers: headers(A) });
      assert.equal(erase.status, 404, payload.slice(0, 40));
    }
    assert.deepEqual(calls.load, []);
    assert.deepEqual(calls.deleted, []);
  });

  it("feedback, handoff and lead ignore payload ids", async () => {
    const { calls, store } = spyPersistence();
    const { app, mailer } = setup({ handoffsPerHour: 1000, lookupsPerMinute: 1000 }, { store });
    for (const payload of SQL_PAYLOADS.slice(0, 6)) {
      const rate = await post(app, "/v1/feedback", { conversationId: payload, messageId: payload, rating: "up" });
      assert.equal(rate.status, 400);
      assert.equal((await post(app, "/v1/handoff", { email: "v@example.com", conversationId: payload })).status, 200);
      assert.equal((await post(app, "/v1/lead", { email: "v@example.com", conversationId: payload })).status, 200);
    }
    assert.deepEqual(calls.load, []);
    for (const mail of mailer.outbox) assert.equal(mail.text.includes("DROP"), false);
  });

  it("feedback rejects ratings outside up/down", async () => {
    const { app } = setup();
    const [meta] = await readSSE(await post(app, "/v1/chat", { message: "iade" }));
    for (const rating of ["up' OR '1'='1", "UP", "", null, { $ne: "x" }]) {
      const res = await post(app, "/v1/feedback", { conversationId: meta.data.conversationId, messageId: meta.data.messageId, rating });
      assert.equal(res.status, 400);
    }
  });

  it("site keys with SQL or odd characters are unknown, never errors", async () => {
    const { app } = setup();
    for (const key of ["' OR 1=1 --", "apex_pk_alpha' --", "apex_pk_alpha\u0000", "*", "%", "apex_pk_%"]) {
      const res = await app.request(`/v1/widget/config?site_key=${encodeURIComponent(key)}`, { headers: { origin: A.origin } });
      assert.equal(res.status, 401, key);
    }
  });
});

describe("tenant isolation", () => {
  async function conversationOfA(app: ReturnType<typeof setup>["app"]) {
    const [meta] = await readSSE(await post(app, "/v1/chat", { message: "Gizli sipariş numaram 4411" }));
    return meta.data as { conversationId: string; messageId: string };
  }

  it("another tenant can't read, erase or rate a conversation", async () => {
    const { app, store } = setup();
    const { conversationId } = await conversationOfA(app);
    const reply = store.get("tn_a", conversationId)!.messages.at(-1)!;
    assert.equal((await app.request(`/v1/conversations/${conversationId}`, { headers: headers(B) })).status, 404);
    assert.equal((await app.request(`/v1/conversations/${conversationId}`, { method: "DELETE", headers: headers(B) })).status, 404);
    assert.equal((await post(app, "/v1/feedback", { conversationId, messageId: reply.id, rating: "down" }, B)).status, 404);
    assert.ok(store.get("tn_a", conversationId), "still there");
    assert.equal(reply.feedback, undefined);
  });

  it("another tenant's hand-off can't pull in the transcript", async () => {
    const { app, mailer } = setup();
    const { conversationId } = await conversationOfA(app);
    assert.equal((await post(app, "/v1/handoff", { email: "x@evil.example", conversationId }, B)).status, 200);
    assert.equal(mailer.outbox.at(-1)!.to, "owner@tn_b.example");
    assert.equal(mailer.outbox.at(-1)!.text.includes("4411"), false);
  });

  it("a site key only works from its own origins", async () => {
    const { app } = setup();
    for (const origin of ["https://alpha.example.evil.com", "https://evil.com", "http://alpha.example", "null", "https://alpha.example@evil.com"]) {
      const res = await post(app, "/v1/chat", { message: "x" }, A, { origin });
      assert.equal(res.status, 403, origin);
      assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
    }
  });
});

describe("request bodies", () => {
  it("non-object and malformed JSON is a 400, never a crash", async () => {
    const { app } = setup();
    for (const raw of ["[]", '"merhaba"', "null", "123", "true", "{", '{"message":', "\u0000", ""]) {
      for (const path of ["/v1/chat", "/v1/feedback", "/v1/handoff", "/v1/lead"]) {
        const res = await post(app, path, raw);
        assert.equal(res.status, 400, `${path} ${JSON.stringify(raw)}`);
      }
    }
  });

  it("rejects oversized bodies", async () => {
    const { app } = setup();
    const res = await post(app, "/v1/chat", { message: "x".repeat(20_000) });
    assert.equal(res.status, 413);
  });

  it("__proto__ and constructor keys don't pollute prototypes", async () => {
    const { app } = setup();
    const raw = '{"message":"iade","__proto__":{"polluted":"yes","isAdmin":true},"constructor":{"prototype":{"polluted":"yes"}}}';
    assert.equal((await post(app, "/v1/chat", raw)).status, 200);
    await post(app, "/v1/handoff", '{"email":"v@example.com","__proto__":{"handoffEmail":"evil@example.com"}}');
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(({} as Record<string, unknown>).isAdmin, undefined);
    assert.equal((Object.prototype as Record<string, unknown>).handoffEmail, undefined);
  });

  it("strips control characters before storing a message", async () => {
    const { app, store } = setup();
    const [meta] = await readSSE(await post(app, "/v1/chat", { message: "iade\u0000 nasıl\u0007\u001b[31m yapılır?\tşimdi\nlütfen" }));
    const saved = store.get("tn_a", meta.data.conversationId)!.messages[0].content;
    assert.equal(saved, "iade nasıl[31m yapılır?\tşimdi\nlütfen");
    // a message of nothing but control characters is empty
    assert.equal((await post(app, "/v1/chat", { message: "\u0000\u0001\u0002" })).status, 400);
  });

  it("returns markup as inert JSON data", async () => {
    const { app } = setup();
    const xss = `<img src=x onerror=alert(1)><script>alert(document.cookie)</script>`;
    const [meta] = await readSSE(await post(app, "/v1/chat", { message: xss }));
    const res = await app.request(`/v1/conversations/${meta.data.conversationId}`, { headers: headers(A) });
    assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = (await res.json()) as { messages: { content: string }[] };
    assert.equal(body.messages[0].content, xss, "stored verbatim; the widget renders it as text");
  });
});

describe("mail header injection", () => {
  const injected = [
    "v@example.com\r\nBcc: victim@example.com",
    "v@example.com\nSubject: hi",
    "v@example.com%0d%0aBcc:victim@example.com",
    "v@example.com\u0000",
    "v@example.com\u0085",
    "<v@example.com>",
    "v@example.com, other@example.com",
    `${"a".repeat(65)}@example.com`,
    "a@b.c",
  ];

  it("rejects addresses that could carry extra headers or recipients", async () => {
    const { app, mailer } = setup({ handoffsPerHour: 1000 });
    for (const email of injected) {
      assert.equal((await post(app, "/v1/handoff", { email })).status, 400, JSON.stringify(email));
      assert.equal((await post(app, "/v1/lead", { email })).status, 400, JSON.stringify(email));
    }
    assert.equal(mailer.outbox.length, 0);
  });

  it("keeps visitor text out of the subject and control characters out of the body", async () => {
    const { app, mailer } = setup();
    const res = await post(app, "/v1/handoff", { email: "v@example.com", name: "Ada\r\nBcc: x@evil.example", message: "Merhaba\u0000\r\nX-Header: 1" });
    const { ticket } = (await res.json()) as { ticket: { id: string; createdAt: string } };
    const mail = mailer.outbox.at(-1)!;
    assert.equal(mail.subject, `[Apex Bot] Site tn_a: ziyaretçi bir insanla görüşmek istiyor [#${ticket.id}]`);
    assert.equal(mail.replyTo, "v@example.com");
    assert.equal(/[\r\u0000]/.test(mail.text), false);
    assert.match(mail.text, new RegExp(`Talep no: #${ticket.id}`));
    assert.ok(!Number.isNaN(Date.parse(ticket.createdAt)));
  });
});

describe("abuse limits", () => {
  it("rate limits conversation lookups per IP", async () => {
    const { app } = setup({ lookupsPerMinute: 3 });
    const id = "3f2b8c1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f";
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await app.request(`/v1/conversations/${id}`, { headers: headers(A) })).status);
    assert.deepEqual(statuses, [404, 404, 404, 429]);
    const limited = await app.request(`/v1/conversations/${id}`, { method: "DELETE", headers: headers(A) });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    // another visitor is unaffected
    assert.equal((await app.request(`/v1/conversations/${id}`, { headers: headers(A, { "x-test-ip": "2.2.2.2" }) })).status, 404);
  });

  it("rate limits hand-offs per IP", async () => {
    const { app } = setup({ handoffsPerHour: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(app, "/v1/handoff", { email: "v@example.com" })).status);
    assert.deepEqual(statuses, [200, 200, 429]);
  });

  it("a stolen conversation can't be continued past its message cap", async () => {
    const { app, store } = setup({ maxConversationMessages: 2, ipMessagesPerMinute: 100 });
    const [meta] = await readSSE(await post(app, "/v1/chat", { message: "iade" }));
    const conversation = store.get("tn_a", meta.data.conversationId) as Conversation;
    assert.equal(conversation.messages.length, 2);
    assert.equal((await post(app, "/v1/chat", { message: "iade", conversationId: conversation.id })).status, 409);
  });
});

// Conversations of dashboard bots survive a restart of the chat API.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { confirmHandoffEmail, getBotForUser, listConversations, register, saveBotSettings, startHandoffVerification, type Db } from "@apex/db";
import { migrate } from "@apex/db/migrate";
import { createApp } from "../src/app.ts";
import { startBotSync } from "../src/bot-sync.ts";
import { defaultLimits } from "../src/config.ts";
import { OutboxMailer } from "../src/mailer.ts";
import { postgresPersistence } from "../src/persistence.ts";
import { KnowledgeBase } from "../src/retrieval.ts";
import { ConversationStore } from "../src/store.ts";
import { TenantRegistry } from "../src/tenants.ts";
import { FakeModel, readSSE } from "./helpers.ts";

let pg: PGlite;
let db: Db;
before(async () => {
  pg = new PGlite();
  const q = (runner: Pick<PGlite, "query" | "exec">) => async (t: string, p?: unknown[]) => ({
    rows: (p?.length ? await runner.query(t, p) : (await runner.exec(t)).at(-1)!).rows as never[],
  });
  db = { query: q(pg), transaction: (fn) => pg.transaction((tx) => fn({ query: q(tx as never) })), close: () => pg.close() };
  await migrate(db);
});
after(() => db.close());

const ORIGIN = "https://kahve.example";

describe("conversation persistence", () => {
  it("writes conversations through and reloads them after a restart", async () => {
    const { user } = await register(db, { email: "o@kahve.example", username: "owner", password: "correct horse", accountType: "personal", acceptTerms: true });
    const bot = await getBotForUser(db, user.id);
    const sent = await startHandoffVerification(db, user.id, "team@kahve.example");
    await confirmHandoffEmail(db, user.id, sent.code);
    const confirmed = await getBotForUser(db, user.id);
    await saveBotSettings(
      db,
      user.id,
      { ...bot.settings, handoff: { ...bot.settings.handoff, email: "team@kahve.example" }, security: { ...bot.settings.security, allowedOrigins: [ORIGIN] } },
      confirmed.version,
    );
    const tenants = new TenantRegistry([]);
    const sync = startBotSync(db, tenants, new KnowledgeBase(), 3_600_000);
    await sync.tick();
    sync.stop();

    const boot = () => {
      const store = new ConversationStore({ persistence: postgresPersistence(db), persists: (id) => tenants.findById(id)?.managed === true });
      const model = new FakeModel();
      // nothing in the knowledge base answers these, and the model says so
      model.reply = ["Bu bilgiye sahip değilim. [[no-answer]]"];
      const app = createApp({
        tenants,
        knowledge: new KnowledgeBase(),
        store,
        model,
        mailer: new OutboxMailer(),
        limits: defaultLimits,
        clientIp: () => "1.1.1.1",
      });
      const call = (path: string, init: { method?: string; body?: object } = {}) =>
        app.request(path, {
          method: init.method ?? "GET",
          headers: { "content-type": "application/json", "x-apex-site-key": bot.siteKey, origin: ORIGIN },
          ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        });
      return { store, call };
    };

    const first = boot();
    const lead = (await (await first.call("/v1/lead", { method: "POST", body: { email: "ada@example.com", name: "Ada" } })).json()) as { conversationId: string };
    const events = await readSSE(await first.call("/v1/chat", { method: "POST", body: { message: "Mars'a kargo var mı?", conversationId: lead.conversationId } }));
    const done = events.find((e) => e.event === "done")!.data;
    assert.equal((await first.call("/v1/handoff", { method: "POST", body: { email: "ada@example.com", conversationId: lead.conversationId } })).status, 200);
    await first.store.flush();

    const [listed] = (await listConversations(db, user.id)).conversations;
    assert.equal(listed.id, lead.conversationId);
    assert.equal(listed.preview, "Mars'a kargo var mı?");
    assert.equal(listed.visitorEmail, "ada@example.com");
    assert.equal(listed.unansweredCount, 1);
    assert.ok(listed.handoffAt);

    // a fresh process knows nothing in memory, yet the widget's history and feedback still work
    const second = boot();
    const history = (await (await second.call(`/v1/conversations/${lead.conversationId}`)).json()) as { messages: { role: string }[] };
    assert.deepEqual(history.messages.map((m: { role: string }) => m.role), ["user", "assistant"]);
    assert.equal((await second.call("/v1/feedback", { method: "POST", body: { conversationId: lead.conversationId, messageId: done.messageId, rating: "down" } })).status, 200);
    await readSSE(await second.call("/v1/chat", { method: "POST", body: { message: "Peki iade?", conversationId: lead.conversationId } }));
    await second.store.flush();
    const [after] = (await listConversations(db, user.id)).conversations;
    assert.equal(after.messageCount, 4);
    assert.equal(after.negativeCount, 1);

    // visitor erasure removes the stored copy too
    assert.equal((await second.call(`/v1/conversations/${lead.conversationId}`, { method: "DELETE" })).status, 204);
    assert.deepEqual((await listConversations(db, user.id)).conversations, []);
    assert.equal((await boot().call(`/v1/conversations/${lead.conversationId}`)).status, 404);
  });
});

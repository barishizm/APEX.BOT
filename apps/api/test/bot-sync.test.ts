// Dashboard bots and their knowledge reach the chat API through the database sync.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { addTextSource, addWebsiteSource, deleteSource, finishSync, getBotForUser, register, saveBotSettings, startSync, type Db } from "@apex/db";
import { migrate } from "@apex/db/migrate";
import { startBotSync } from "../src/bot-sync.ts";
import { createApp } from "../src/app.ts";
import { defaultLimits } from "../src/config.ts";
import { OutboxMailer } from "../src/mailer.ts";
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
const chunker = (title: string, content: string) => [{ url: "", title, text: content }];

describe("bot sync", () => {
  it("serves a dashboard bot with its knowledge, and follows changes", async () => {
    const { user } = await register(db, { email: "o@kahve.example", username: "owner", password: "correct horse", accountType: "business", company: "Kahve", acceptTerms: true });
    await db.query("update app.users set email_verified_at = now() where id = $1", [user.id]);
    const bot = await getBotForUser(db, user.id);
    await saveBotSettings(db, user.id, { ...bot.settings, security: { ...bot.settings.security, allowedOrigins: [ORIGIN] } }, bot.version);
    const text = await addTextSource(db, user.id, { title: "İade politikası", content: "Açılmamış paketleri 14 gün içinde ücretsiz iade edebilirsiniz." }, chunker);
    const site = await addWebsiteSource(db, user.id, `${ORIGIN}/`);
    await startSync(db, user.id, site.id);
    await finishSync(db, site.id, { pages: 1, chunks: [{ url: `${ORIGIN}/kargo`, title: "Kargo", text: "Kargo 1-3 iş günü sürer, 750 TL üzeri ücretsizdir." }] });

    const tenants = new TenantRegistry([]);
    const knowledge = new KnowledgeBase();
    const sync = startBotSync(db, tenants, knowledge, 3_600_000);
    await sync.tick();
    assert.equal(sync.status(), "ok");
    const tenant = tenants.findById(bot.id)!;
    assert.ok(tenant);
    assert.equal(knowledge.search(bot.id, [{ text: "iade kaç gün", weight: 1 }], 3)[0]?.chunk.title, "İade politikası");

    // the widget gets answers grounded in both sources; pasted text isn't shown as a link
    const model = new FakeModel();
    const app = createApp({
      tenants,
      knowledge,
      store: new ConversationStore(),
      model,
      mailer: new OutboxMailer(),
      limits: { ...defaultLimits, minRetrievalScore: 0.3 },
      clientIp: () => "1.1.1.1",
    });
    const ask = async (message: string) => {
      const res = await app.request("/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-apex-site-key": tenant.siteKey, origin: ORIGIN },
        body: JSON.stringify({ message }),
      });
      return (await readSSE(res)).find((e) => e.event === "done")!.data;
    };
    assert.deepEqual((await ask("Kargo kaç günde gelir?")).sources, [{ url: `${ORIGIN}/kargo`, title: "Kargo" }]);
    const refund = await ask("İade süresi ne kadar?");
    assert.deepEqual(refund.sources, []);
    assert.equal(refund.handoff, false);
    assert.match(String(model.requests.at(-1)!.messages.at(-1)!.content), /14 gün/);

    // removing a source reaches the index on the next pass; an unchanged pass does nothing
    await deleteSource(db, user.id, text.id);
    await sync.tick();
    assert.equal(knowledge.search(bot.id, [{ text: "iade kaç gün", weight: 1 }], 3).length, 0);
    assert.equal(await sync.tick(), 0);
    sync.stop();
  });
});

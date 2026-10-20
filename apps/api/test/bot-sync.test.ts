// Dashboard bots and their knowledge reach the chat API through the database sync.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  addReplyUsage,
  addTextSource,
  addWebsiteSource,
  adminClearTokenBudgetOverride,
  adminDisableBot,
  adminEnableBot,
  adminRotateBotSiteKey,
  adminSetTokenBudgetOverride,
  adminSuspendWorkspace,
  adminUnsuspendWorkspace,
  createBot,
  deleteBot,
  deleteSource,
  finishSync,
  getBotForUser,
  register,
  replyUsageFifths,
  saveBotSettings,
  startSync,
  upsertSubscription,
  type Db,
} from "@apex/db";
import { replyWindow } from "@apex/db/plans";
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
    const details = sync.details();
    assert.equal(details.status, "ok");
    assert.equal(details.lastError, null);
    assert.ok(details.lastOkAt && details.lastAttemptAt);
    assert.ok(details.bots >= 1);
    const tenant = tenants.findById(bot.id)!;
    assert.ok(tenant);
    assert.equal(knowledge.search(bot.id, [{ text: "iade kaç gün", weight: 1 }], 3)[0]?.chunk.title, "İade politikası");

    // the widget gets answers grounded in both sources; pasted text isn't shown as a link
    const model = new FakeModel();
    model.reply = ["Yanıt. [[used: 1]]"];
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

  it("serves each website of a workspace on its own, and drops a removed one", async () => {
    const { user } = await register(db, { email: "o@iki.example", username: "iki", password: "correct horse", accountType: "business", company: "Iki", acceptTerms: true });
    await db.query("update app.users set email_verified_at = now() where id = $1", [user.id]);
    const first = await getBotForUser(db, user.id);
    const second = await createBot(db, user.id, "Second site");
    const allow = (bot: typeof first, origin: string) =>
      saveBotSettings(db, { userId: user.id, botId: bot.id }, { ...bot.settings, security: { ...bot.settings.security, allowedOrigins: [origin] } }, bot.version);
    await allow(first, "https://one.iki.example");
    await allow(second, "https://two.iki.example");

    const tenants = new TenantRegistry([]);
    const sync = startBotSync(db, tenants, new KnowledgeBase(), 3_600_000);
    await sync.tick();
    assert.deepEqual(tenants.findById(first.id)?.allowedOrigins, ["https://one.iki.example"]);
    assert.deepEqual(tenants.findById(second.id)?.allowedOrigins, ["https://two.iki.example"]);

    await deleteBot(db, { userId: user.id, botId: second.id });
    await sync.tick();
    assert.equal(tenants.findById(second.id), undefined);
    assert.ok(tenants.findById(first.id));
    sync.stop();
  });
});

describe("bots taken out of service by staff", () => {
  async function site(slug: string) {
    const { user } = await register(db, { email: `o@${slug}.example`, username: slug, password: "correct horse", accountType: "business", company: slug, acceptTerms: true });
    await db.query("update app.users set email_verified_at = now() where id = $1", [user.id]);
    const bot = await getBotForUser(db, user.id);
    const origin = `https://${slug}.example`;
    await saveBotSettings(db, user.id, { ...bot.settings, security: { ...bot.settings.security, allowedOrigins: [origin] } }, bot.version);
    await addTextSource(db, user.id, { title: "İade", content: "Açılmamış paketleri 14 gün içinde iade edebilirsiniz." }, chunker);
    const tenants = new TenantRegistry([]);
    const knowledge = new KnowledgeBase();
    const sync = startBotSync(db, tenants, knowledge, 3_600_000);
    await sync.tick();
    const model = new FakeModel();
    const app = createApp({ tenants, knowledge, store: new ConversationStore(), model, mailer: new OutboxMailer(), limits: defaultLimits, clientIp: () => "1.1.1.1" });
    const chat = (key: string) =>
      app.request("/v1/chat", { method: "POST", headers: { "content-type": "application/json", "x-apex-site-key": key, origin }, body: JSON.stringify({ message: "iade" }) });
    return { user, bot, org: bot.organizationId, tenants, knowledge, sync, model, chat, app, origin };
  }
  const staff = <T>(fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) => db.transaction(fn);
  const hits = (k: KnowledgeBase, id: string) => k.search(id, [{ text: "iade gün", weight: 1 }], 3).length;

  it("a disabled bot is paused on the next pass: no tenant, no knowledge, a polite 503", async () => {
    const s = await site("kapali");
    assert.ok(s.tenants.findById(s.bot.id));
    assert.ok(hits(s.knowledge, s.bot.id) > 0);

    await staff((tx) => adminDisableBot(tx, s.bot.id, "abuse report"));
    await s.sync.tick();
    assert.equal(s.tenants.findById(s.bot.id), undefined);
    assert.equal(s.tenants.isPaused(s.bot.id), true);
    assert.equal(hits(s.knowledge, s.bot.id), 0);
    const res = await s.chat(s.bot.siteKey);
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { error: string }).error, "out_of_service");
    const config = await s.app.request(`/v1/widget/config?site_key=${s.bot.siteKey}`, { headers: { origin: s.origin } });
    assert.equal(config.status, 503);
    assert.equal(s.model.requests.length, 0);
    // an unchanged pass leaves it paused
    assert.equal(await s.sync.tick(), 0);
    assert.equal(s.tenants.isPaused(s.bot.id), true);

    await staff((tx) => adminEnableBot(tx, s.bot.id));
    await s.sync.tick();
    assert.ok(s.tenants.findById(s.bot.id));
    assert.ok(hits(s.knowledge, s.bot.id) > 0, "its knowledge is loaded again");
    const back = await s.chat(s.bot.siteKey);
    assert.equal(back.status, 200);
    await readSSE(back);
    s.sync.stop();
  });

  it("a suspended workspace pauses its bots, and lifting it brings them back", async () => {
    const s = await site("askida");
    await staff((tx) => adminSuspendWorkspace(tx, s.org, "unpaid"));
    await s.sync.tick();
    assert.equal(s.tenants.isPaused(s.bot.id), true);
    assert.equal((await s.chat(s.bot.siteKey)).status, 503);
    await staff((tx) => adminUnsuspendWorkspace(tx, s.org));
    await s.sync.tick();
    assert.ok(s.tenants.findById(s.bot.id));
    s.sync.stop();
  });

  it("catches a suspension that didn't touch the bots, and its lifting", async () => {
    const s = await site("dogrudan");
    await db.query("update app.organizations set suspended_at = now() where id = $1", [s.org]);
    await s.sync.tick();
    assert.equal(s.tenants.isPaused(s.bot.id), true);
    await db.query("update app.organizations set suspended_at = null where id = $1", [s.org]);
    // one pass notices, the next reloads it
    await s.sync.tick();
    await s.sync.tick();
    assert.ok(s.tenants.findById(s.bot.id));
    assert.ok(hits(s.knowledge, s.bot.id) > 0);
    s.sync.stop();
  });

  it("starts paused when the API boots with a disabled bot", async () => {
    const s = await site("acilis");
    s.sync.stop();
    await staff((tx) => adminDisableBot(tx, s.bot.id, "test"));
    const tenants = new TenantRegistry([]);
    const sync = startBotSync(db, tenants, new KnowledgeBase(), 3_600_000);
    await sync.tick();
    assert.equal(tenants.isPaused(s.bot.id), true);
    assert.ok(tenants.findPaused(s.bot.siteKey));
    assert.ok(tenants.isKnownOrigin(s.origin), "preflights still pass");
    sync.stop();
  });

  it("a rotated key replaces the old one on the next pass", async () => {
    const s = await site("anahtar");
    const old = s.bot.siteKey;
    await staff((tx) => adminRotateBotSiteKey(tx, s.bot.id));
    await s.sync.tick();
    const fresh = s.tenants.findById(s.bot.id)!.siteKey;
    assert.notEqual(fresh, old);
    assert.equal((await s.chat(old)).status, 401);
    const res = await s.chat(fresh);
    assert.equal(res.status, 200);
    await readSSE(res);
    s.sync.stop();
  });

  it("a token budget override reaches the tenant, and clearing it removes it", async () => {
    const s = await site("butce");
    await staff((tx) => adminSetTokenBudgetOverride(tx, s.bot.id, 50_000, 2));
    await s.sync.tick();
    const override = s.tenants.findById(s.bot.id)!.budgetOverride!;
    assert.equal(override.tokens, 50_000);
    assert.ok(override.until > Date.now() + 3_500_000 && override.until <= Date.now() + 7_200_000);
    await staff((tx) => adminClearTokenBudgetOverride(tx, s.bot.id));
    await s.sync.tick();
    assert.equal(s.tenants.findById(s.bot.id)!.budgetOverride, undefined);
    s.sync.stop();
  });

  it("each pass brings the workspace's plan and billing anchor, also when no bot row changed", async () => {
    const s = await site("donem");
    assert.deepEqual(s.tenants.workspace(s.org), { organizationId: s.org, plan: "free", anchor: null, allowanceFifths: 500, overageCapFifths: 0, enforcePlan: false });
    const start = new Date(Date.now() - 86_400_000);
    await staff((tx) =>
      upsertSubscription(tx, {
        organizationId: s.org,
        provider: "paddle",
        providerSubscriptionId: "sub_donem",
        plan: "pro",
        interval: "month",
        status: "active",
        currentPeriodStart: start,
        currentPeriodEnd: new Date(start.getTime() + 30 * 86_400_000),
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        providerUpdatedAt: new Date(),
      }),
    );
    await s.sync.tick();
    const ws = s.tenants.workspace(s.org)!;
    assert.equal(ws.plan, "pro");
    assert.equal(ws.anchor?.getTime(), start.getTime());
    assert.equal(ws.allowanceFifths, 1500 * 5);
    s.sync.stop();
  });

  it("counts replies in app.reply_usage and stops at the quota with the flag on", async () => {
    const s = await site("kota");
    let clock = Date.now();
    const app = createApp({
      now: () => clock,
      tenants: s.tenants,
      knowledge: s.knowledge,
      store: new ConversationStore(),
      model: s.model,
      mailer: new OutboxMailer(),
      limits: defaultLimits,
      clientIp: () => "1.1.1.1",
      replyUsage: { load: (org, at) => replyUsageFifths(db, org, at), add: (org, at, f, o) => addReplyUsage(db, org, at, f, o) },
      featureEnabled: async (flag) => flag === "reply_quota",
    });
    const chat = () =>
      app.request("/v1/chat", { method: "POST", headers: { "content-type": "application/json", "x-apex-site-key": s.bot.siteKey, origin: s.origin }, body: JSON.stringify({ message: "iade" }) });
    const period = replyWindow(null, new Date(clock)).start;
    const res = await chat();
    assert.equal(res.status, 200);
    await readSSE(res);
    await new Promise((r) => setTimeout(r, 50));
    const weight = await replyUsageFifths(db, s.org, period);
    assert.ok(weight >= 1, "the delivered answer was counted");
    // the rest of Free's 100 replies used elsewhere (another instance, another bot of the workspace)
    await addReplyUsage(db, s.org, period, 500 - weight);
    // this instance's cached count is re-read once it is 15 seconds old
    clock += 15_000;
    const asked = s.model.requests.length;
    const stopped = await chat();
    assert.equal(stopped.status, 429);
    assert.deepEqual(await stopped.json(), { error: "quota_exhausted" });
    assert.equal(s.model.requests.length, asked);
    s.sync.stop();
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceQuota } from "@apex/db";
import { replyFifths } from "@apex/db/bot-settings";
import { ReplyQuota, type OverageLimit, type ReplyUsageStore } from "../src/limits.ts";
import { ModelRouter, type ChatModel, type ChatRequest, type ModelEvent } from "../src/model.ts";
import type { AppDeps } from "../src/app.ts";
import { A, FakeModel, headers, readSSE, setup } from "./helpers.ts";

const JAN = Date.parse("2027-01-20T12:00:00Z");
const JAN_START = new Date("2027-01-01T00:00:00Z");
const FEB_START = new Date("2027-02-01T00:00:00Z");

/** app.reply_usage in memory: one shared count per workspace and window, incremented atomically like the upsert. */
class MemoryReplyUsage implements ReplyUsageStore {
  rows = new Map<string, number>();
  adds: { fifths: number; overage?: OverageLimit }[] = [];
  key = (org: string, start: Date) => `${org}:${start.toISOString()}`;
  async load(org: string, start: Date) {
    return this.rows.get(this.key(org, start)) ?? 0;
  }
  async add(org: string, start: Date, fifths: number, overage?: OverageLimit) {
    this.adds.push({ fifths, ...(overage ? { overage } : {}) });
    const total = (this.rows.get(this.key(org, start)) ?? 0) + fifths;
    this.rows.set(this.key(org, start), total);
    return total;
  }
}

const workspace = (patch: Partial<WorkspaceQuota> = {}): WorkspaceQuota => ({
  organizationId: "org_a",
  plan: "free",
  anchor: null,
  allowanceFifths: 100 * 5,
  overageCapFifths: 0,
  enforcePlan: false,
  ...patch,
});

/** tn_a in workspace org_a, a Sonnet bot by default, with the reply quota flag on unless told otherwise. */
function quotaSetup(opts: { ws?: Partial<WorkspaceQuota>; clock?: { t: number }; store?: ReplyUsageStore; enforce?: boolean; deps?: Partial<AppDeps> } = {}) {
  const clock = opts.clock ?? { t: JAN };
  const env = setup(
    // many messages from one visitor in a row: rate limits are not what these tests are about
    { ipMessagesPerMinute: 10_000, tenantMessagesPerMinute: 10_000 },
    {
      now: () => clock.t,
      replyUsage: opts.store,
      featureEnabled: async (flag) => (flag === "reply_quota" ? opts.enforce ?? true : true),
      ...opts.deps,
    },
  );
  const site = env.tenants.findById("tn_a")!;
  site.organizationId = "org_a";
  site.settings.model = { provider: "anthropic", id: "claude-sonnet-5-5" };
  env.tenants.setWorkspaces([workspace(opts.ws)]);
  const chat = (message = "iade") => env.app.request("/v1/chat", { method: "POST", headers: headers(A), body: JSON.stringify({ message }) });
  /** One message, read to the end (so its reply is counted); resolves to the status. */
  const ask = async (message?: string) => {
    const res = await chat(message);
    await (res.status === 200 ? readSSE(res) : res.text());
    await settle();
    return res.status;
  };
  return { ...env, site, clock, chat, ask };
}

const settle = () => new Promise((r) => setImmediate(r));

describe("reply weights", () => {
  it("come from the model: fast ⅕, balanced 1, flagship 2, Fable 5, in fifths", () => {
    assert.equal(replyFifths("anthropic", "claude-haiku-5-5"), 1);
    assert.equal(replyFifths("openai", "gpt-6-luna"), 1);
    assert.equal(replyFifths("anthropic", "claude-sonnet-5-5"), 5);
    assert.equal(replyFifths("google", "gemini-3.8-flash"), 5);
    assert.equal(replyFifths("anthropic", "claude-opus-5-5"), 10);
    assert.equal(replyFifths("openai", "gpt-6-astra"), 10);
    assert.equal(replyFifths("anthropic", "claude-fable-5-1"), 25);
    // a model the catalog doesn't know never counts as cheaper than a flagship
    assert.equal(replyFifths("anthropic", "claude-next"), 10);
  });

  it("each delivered answer is counted at the weight of the bot's model", async () => {
    const store = new MemoryReplyUsage();
    const { chat, site } = quotaSetup({ store });
    for (const id of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"]) {
      site.settings.model = { provider: "anthropic", id };
      await readSSE(await chat());
    }
    await settle();
    assert.deepEqual(store.adds.map((a) => a.fifths), [1, 5, 10, 25]);
    assert.equal(await store.load("org_a", JAN_START), 41);
  });

  it("counts \"I don't know\" answers, but not refusals or provider errors", async () => {
    const store = new MemoryReplyUsage();
    const { chat, model } = quotaSetup({ store });
    model.reply = ["Bilmiyorum. [[no-answer]]"];
    await readSSE(await chat());
    model.refuse = true;
    await readSSE(await chat());
    model.refuse = false;
    model.fail = true;
    await readSSE(await chat());
    await settle();
    assert.deepEqual(store.adds.map((a) => a.fifths), [5]);
  });

  it("JSON-file tenants (no workspace) are never counted or held", async () => {
    const store = new MemoryReplyUsage();
    const { chat, tenants } = quotaSetup({ store, ws: { allowanceFifths: 0 } });
    tenants.setWorkspaces([]);
    const res = await chat();
    assert.equal(res.status, 200);
    await readSSE(res);
    assert.equal(store.adds.length, 0);
  });
});

describe("fallback", () => {
  const provider = (behaviour: "fail" | "refuse" | "answer"): ChatModel => ({
    async *stream(): AsyncIterable<ModelEvent> {
      if (behaviour === "fail") throw new Error("overloaded");
      if (behaviour === "answer") yield { type: "text", text: "Yanıt." };
      yield { type: "end", refused: behaviour === "refuse", truncated: false, inputTokens: 10, outputTokens: 5 };
    },
  });
  const request = (fallbackId: string): ChatRequest => ({
    system: [],
    messages: [{ role: "user", content: "x" }],
    model: { provider: "anthropic", id: "claude-fable-5-1", fallback: { provider: "openai", id: fallbackId } },
  });
  const endOf = async (stream: AsyncIterable<ModelEvent>) => {
    let end: ModelEvent | undefined;
    for await (const e of stream) if (e.type === "end") end = e;
    return end as Extract<ModelEvent, { type: "end" }>;
  };

  it("the router names the model that answered: the primary, or the fallback after a failure or a refusal", async () => {
    const ok = new ModelRouter({ anthropic: provider("answer"), openai: provider("answer"), google: provider("answer") }, provider("answer"));
    assert.deepEqual((await endOf(ok.stream(request("gpt-6-luna")))).model, { provider: "anthropic", id: "claude-fable-5-1" });
    const failing = new ModelRouter({ anthropic: provider("fail"), openai: provider("answer"), google: provider("answer") }, provider("answer"));
    assert.deepEqual((await endOf(failing.stream(request("gpt-6-luna")))).model, { provider: "openai", id: "gpt-6-luna" });
    const refusing = new ModelRouter({ anthropic: provider("refuse"), openai: provider("answer"), google: provider("answer") }, provider("answer"));
    const end = await endOf(refusing.stream(request("gpt-5.6-terra")));
    assert.deepEqual(end.model, { provider: "openai", id: "gpt-5.6-terra" });
    // the refused attempt's tokens still reach the daily budget
    assert.equal(end.inputTokens, 25);
  });

  it("the answer is counted at the fallback's weight, not the primary's", async () => {
    const store = new MemoryReplyUsage();
    const router = new ModelRouter({ anthropic: provider("fail"), openai: provider("answer"), google: provider("answer") }, provider("answer"));
    const { chat, site } = quotaSetup({ store, deps: { model: router } });
    site.settings.model = { provider: "anthropic", id: "claude-fable-5-1", fallback: { provider: "openai", id: "gpt-6-luna" } };
    const events = await readSSE(await chat());
    assert.ok(events.some((e) => e.event === "done"));
    await settle();
    assert.deepEqual(store.adds.map((a) => a.fifths), [1]);
  });
});

describe("when the quota is used up", () => {
  it("answers quota_exhausted without calling the model; the hand-off form still works", async () => {
    const { chat, model, app, mailer } = quotaSetup({ ws: { allowanceFifths: 10 } });
    await readSSE(await chat()); // 5
    await readSSE(await chat()); // 10: the allowance is reached
    const asked = model.requests.length;
    const res = await chat();
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: "quota_exhausted" });
    assert.equal(res.headers.get("retry-after"), null);
    assert.equal(model.requests.length, asked);
    const handoff = await app.request("/v1/handoff", { method: "POST", headers: headers(A), body: JSON.stringify({ email: "ayse@example.com", message: "Fiyat?" }) });
    assert.equal(handoff.status, 200);
    assert.equal(mailer.outbox.length, 1);
  });

  it("lets the last reply through even when it goes past the line (a Fable answer at 99.8)", async () => {
    const { ask, site } = quotaSetup({ ws: { allowanceFifths: 6 } });
    site.settings.model = { provider: "anthropic", id: "claude-fable-5-1" };
    assert.equal(await ask(), 200);
    assert.equal(await ask(), 429);
  });

  it("with overage on, answers continue up to the owner's cap, and the excess is reported as overage", async () => {
    const store = new MemoryReplyUsage();
    const { ask } = quotaSetup({ store, ws: { plan: "starter", allowanceFifths: 5, overageCapFifths: 10 } });
    for (let i = 0; i < 3; i++) assert.equal(await ask(), 200, `reply ${i + 1}`);
    assert.equal(await ask(), 429);
    assert.deepEqual(store.adds[0].overage, { allowanceFifths: 5, capFifths: 10 });
  });

  it("with the reply_quota flag off, replies are counted but never stopped", async () => {
    const store = new MemoryReplyUsage();
    const { ask } = quotaSetup({ store, enforce: false, ws: { allowanceFifths: 5 } });
    for (let i = 0; i < 3; i++) assert.equal(await ask(), 200);
    await settle();
    assert.equal(await store.load("org_a", JAN_START), 15);
  });

  it("the daily token budget is a separate guard, checked first", async () => {
    const { chat, model } = quotaSetup({ ws: { allowanceFifths: 5 } });
    model.tokens = 2_000_000;
    await readSSE(await chat());
    const res = await chat();
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: "budget_exhausted" });
  });
});

describe("period boundary", () => {
  it("a Free workspace starts again on the 1st, 00:00 UTC", async () => {
    const store = new MemoryReplyUsage();
    const clock = { t: Date.parse("2027-01-31T23:59:59Z") };
    const { chat, ask } = quotaSetup({ store, clock, ws: { allowanceFifths: 5 } });
    await readSSE(await chat());
    assert.equal(await ask(), 429);
    clock.t = FEB_START.getTime();
    const res = await chat();
    assert.equal(res.status, 200);
    await readSSE(res);
    await settle();
    assert.equal(await store.load("org_a", JAN_START), 5);
    assert.equal(await store.load("org_a", FEB_START), 5);
  });

  it("a paid workspace's window turns on its billing anchor, clamped to short months", async () => {
    const store = new MemoryReplyUsage();
    const anchor = new Date("2027-01-31T10:00:00Z");
    const clock = { t: Date.parse("2027-02-28T09:59:59Z") };
    const { chat, ask } = quotaSetup({ store, clock, ws: { plan: "pro", anchor, allowanceFifths: 5 } });
    await readSSE(await chat());
    assert.equal(await ask(), 429, "still the window that began on Jan 31");
    clock.t = Date.parse("2027-02-28T10:00:00Z");
    assert.equal(await ask(), 200, "Feb 28 10:00 opens the next one");
    await settle();
    assert.deepEqual([...store.rows.keys()], ["org_a:2027-01-31T10:00:00.000Z", "org_a:2027-02-28T10:00:00.000Z"]);
  });
});

describe("more than one API instance", () => {
  it("concurrent replies on two instances all reach the shared count", async () => {
    const store = new MemoryReplyUsage();
    const clock = { t: JAN };
    const one = quotaSetup({ store, clock, ws: { allowanceFifths: 1000 } });
    const two = quotaSetup({ store, clock, ws: { allowanceFifths: 1000 } });
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? one : two).chat(`soru ${i}`)));
    await Promise.all(responses.map(readSSE));
    await settle();
    assert.equal(await store.load("org_a", JAN_START), 20 * 5);
  });

  it("an instance sees what another counted once its cache is stale", async () => {
    const store = new MemoryReplyUsage();
    const clock = { t: JAN };
    const one = quotaSetup({ store, clock, ws: { allowanceFifths: 200 } });
    const two = quotaSetup({ store, clock, ws: { allowanceFifths: 200 } });
    await readSSE(await two.chat()); // two caches the count (5)
    for (let i = 0; i < 39; i++) assert.equal(await one.ask(), 200); // one takes the window to its limit
    assert.equal(await store.load("org_a", JAN_START), 200);
    // two's cached 5 is fresh and far from the limit
    clock.t += 1_000;
    assert.equal(await two.ask(), 200, "fresh and far from the limit: served from the cache");
    clock.t += 15_000;
    assert.equal(await two.ask(), 429, "stale: re-read, and the limit is seen");
  });

  it("the cache re-reads on every check within nearFifths of the limit", async () => {
    let reads = 0;
    let shared = 0;
    const store: ReplyUsageStore = {
      load: async () => (reads++, shared),
      add: async (_o, _p, f) => (shared += f),
    };
    const clock = { t: JAN };
    const quota = new ReplyQuota(() => clock.t, store, undefined, 15_000, 50);
    await quota.load("org", JAN_START, 100);
    await quota.load("org", JAN_START, 100);
    assert.equal(reads, 1, "fresh and far: one read");
    shared = 60; // counted elsewhere
    clock.t += 15_000;
    await quota.load("org", JAN_START, 100);
    assert.equal(quota.usedIn("org", JAN_START), 60);
    await quota.load("org", JAN_START, 100);
    await quota.load("org", JAN_START, 100);
    assert.equal(reads, 4, "within 50 of the limit, every check reads the store");
  });

  it("keeps counting in memory when the store fails, and fails open on reads", async () => {
    const errors: unknown[] = [];
    const store: ReplyUsageStore = {
      load: async () => {
        throw new Error("db down");
      },
      add: async () => {
        throw new Error("db down");
      },
    };
    const quota = new ReplyQuota(() => JAN, store, (e) => errors.push(e));
    await quota.load("org", JAN_START, 10);
    quota.record("org", JAN_START, 5);
    await settle();
    assert.equal(quota.usedIn("org", JAN_START), 5);
    assert.equal(errors.length, 2);
  });
});

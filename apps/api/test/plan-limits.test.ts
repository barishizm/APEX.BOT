// A workspace's plan in the chat API (docs/adr/0003-billing.md (e), @apex/db/entitlements): with the
// plan_limits flag on, each dashboard bot serves what its plan includes and answers nothing past the
// plan's number of websites. Its stored settings are never changed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkspaceQuota } from "@apex/db";
import { parseSettings, publicWidgetSettings, type BotSettings } from "@apex/db/bot-settings";
import type { Plan } from "@apex/db/plans";
import { tenantFromBot } from "../src/tenants.ts";
import { A, headers, readSSE, setup } from "./helpers.ts";

/** A bot with everything the biggest plan allows, as stored in the dashboard. */
function stored(patch: (s: BotSettings) => void = () => {}) {
  const settings = parseSettings({
    handoff: { email: "team@crest.example", leadCapture: "before-chat" },
    security: { allowedOrigins: [A.origin], retentionDays: 365 },
    appearance: { showBranding: false },
    persona: { blockedTopics: ["politics"] },
    model: { provider: "anthropic", id: "claude-opus-5-5", fallback: { enabled: true, provider: "google", id: "gemini-3.8-flash" } },
  });
  patch(settings);
  return settings;
}

function planSetup(opts: { plan?: Plan; enforce?: boolean; siteRank?: number; settings?: BotSettings } = {}) {
  const env = setup({ ipMessagesPerMinute: 10_000, tenantMessagesPerMinute: 10_000 }, { featureEnabled: async () => false });
  const bot = { id: "tn_a", organizationId: "org_a", organizationName: "Crest", siteKey: A.key, settings: opts.settings ?? stored(), handoffVerified: true, siteRank: opts.siteRank ?? 1 };
  env.tenants.upsert(tenantFromBot(bot, publicWidgetSettings(bot.settings)));
  const plan = (p: Plan, enforce = opts.enforce ?? true) =>
    env.tenants.setWorkspaces([
      { organizationId: "org_a", plan: p, anchor: null, allowanceFifths: 1_000_000, overageCapFifths: 0, enforcePlan: enforce } satisfies WorkspaceQuota,
    ]);
  plan(opts.plan ?? "free");
  const config = async () => (await (await env.app.request("/v1/widget/config", { headers: headers(A) })).json()) as { ui: ReturnType<typeof publicWidgetSettings> };
  const chat = () => env.app.request("/v1/chat", { method: "POST", headers: headers(A), body: JSON.stringify({ message: "iade" }) });
  const lead = () => env.app.request("/v1/lead", { method: "POST", headers: headers(A), body: JSON.stringify({ email: "visitor@example.com" }) });
  return { ...env, plan, config, chat, lead, tenant: () => env.tenants.findBySiteKey(A.key)! };
}

describe("plan limits in the chat API", () => {
  it("off: the bot serves its settings as stored", async () => {
    const env = planSetup({ enforce: false });
    assert.equal(env.tenant().settings.model?.id, "claude-opus-5-5");
    assert.equal((await env.config()).ui.appearance.showBranding, false);
    assert.equal(env.tenant().retentionCapDays, undefined);
  });

  it("a model the plan doesn't include answers with the plan's default, and its fallback is dropped", async () => {
    const env = planSetup();
    const res = await env.chat();
    assert.equal(res.status, 200);
    await readSSE(res);
    assert.equal(env.model.requests[0]?.model?.id, "claude-haiku-5-5");
    assert.equal(env.model.requests[0]?.model?.fallback, undefined);
  });

  it("\"Powered by Apex Bot\" returns without removeBranding", async () => {
    assert.equal((await planSetup({ plan: "starter" }).config()).ui.appearance.showBranding, true);
    assert.equal((await planSetup({ plan: "pro" }).config()).ui.appearance.showBranding, false);
  });

  it("topics to decline are kept but not applied without declineTopics", async () => {
    const env = planSetup({ plan: "starter" });
    assert.deepEqual(env.tenant().settings.blockedTopics, []);
    await readSSE(await env.chat());
    assert.ok(!JSON.stringify(env.model.requests[0]?.system).includes("politics"));
    assert.deepEqual(planSetup({ plan: "pro" }).tenant().settings.blockedTopics, ["politics"]);
  });

  it("lead capture is off in the widget and refused by /v1/lead without leadCapture", async () => {
    const free = planSetup({ plan: "free" });
    assert.equal((await free.config()).ui.handoff.leadCapture, "off");
    assert.equal((await free.lead()).status, 404);
    const starter = planSetup({ plan: "starter" });
    assert.equal((await starter.config()).ui.handoff.leadCapture, "before-chat");
    assert.equal((await starter.lead()).status, 200);
  });

  it("retention is held to the plan's longest, and new conversations carry that cap", () => {
    const env = planSetup({ plan: "starter" });
    assert.equal(env.tenant().retentionDays, 90);
    assert.equal(env.tenants.findById("tn_a")?.retentionCapDays, 90);
    assert.equal(planSetup({ plan: "business" }).tenant().retentionDays, 365);
  });

  it("a website past the plan's number offers the hand-off form only", async () => {
    const env = planSetup({ plan: "free", siteRank: 2 });
    const res = await env.chat();
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: "quota_exhausted" });
    assert.equal(env.model.requests.length, 0);
    // the widget still loads, so it can show that form
    assert.equal((await env.app.request("/v1/widget/config", { headers: headers(A) })).status, 200);
    env.plan("pro");
    assert.equal((await env.chat()).status, 200);
  });

  it("a plan change applies on the next sync of workspaces, with no change to the bot", async () => {
    const env = planSetup({ plan: "free" });
    assert.equal(env.tenant().settings.model?.id, "claude-haiku-5-5");
    env.plan("business");
    assert.equal(env.tenant().settings.model?.id, "claude-opus-5-5");
    assert.equal(env.tenant().settings.model?.fallback?.id, "gemini-3.8-flash");
    env.plan("business", false);
    assert.equal(env.tenant().retentionCapDays, undefined);
  });
});

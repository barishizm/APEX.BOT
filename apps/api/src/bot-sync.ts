// Keeps dashboard-managed bots (app.bots) and their knowledge in the tenant registry and the
// retrieval index. Polls for rows changed since the last sync, so a save in the dashboard
// reaches the widget within one interval. A bot's chunks are reloaded only when its
// knowledge_version moves, not on every settings save. A bot staff disabled, or one in a suspended
// workspace, is paused: it stops resolving as a tenant and its knowledge is unloaded, and only its
// site key and origins are kept so the widget can be told it is out of service. Each pass also
// re-reads every workspace's plan, billing anchor and reply limits (a renewal touches no bot row).
// shortcut: polling; switch to LISTEN/NOTIFY once the API keeps a dedicated connection.
import type { Db } from "@apex/db";
import { listBotStates, listBotsChangedSince, listKnowledgeChunks, listWorkspaceQuotas, type BotRecord } from "@apex/db";
import { publicWidgetSettings } from "@apex/db/bot-settings";
import { log } from "./log.ts";
import { maskPII } from "./pii.ts";
import type { ChunkIndexer } from "./embeddings.ts";
import type { KnowledgeBase } from "./retrieval.ts";
import { tenantFromBot, type TenantRegistry } from "./tenants.ts";

export interface BotSync {
  /** Runs one sync; resolves to the number of bots updated. */
  tick(): Promise<number>;
  /** "ok" after a successful pass, "failing" after a failed one, "starting" before the first. */
  status(): "starting" | "ok" | "failing";
  /** For the admin health details: when passes ran and how the last failure read (the error is PII-masked). */
  details(): BotSyncDetails;
  stop(): void;
}

export interface BotSyncDetails {
  status: "starting" | "ok" | "failing";
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  /** The last failed pass's error, kept until a pass succeeds. */
  lastError: string | null;
  /** Bots this API serves or holds paused. */
  bots: number;
  intervalMs: number;
}

const OVERLAP_MS = 10_000;

/**
 * `indexer` embeds each loaded bot's chunks in the background (hybrid search); omit it for lexical
 * only. `siteRanks: false` for a database before migration 0036 (every website then ranks first).
 */
export function startBotSync(
  db: Db,
  tenants: TenantRegistry,
  knowledge: KnowledgeBase,
  intervalMs = 30_000,
  indexer?: ChunkIndexer,
  options: { siteRanks?: boolean } = {},
): BotSync {
  let since: Date | null = null;
  let inFlight: Promise<number> | null = null;
  let state: "starting" | "ok" | "failing" = "starting";
  let lastAttemptAt: Date | null = null;
  let lastOkAt: Date | null = null;
  let lastError: string | null = null;
  const loaded = new Map<string, number>();
  // updatedAt of the version last applied per bot
  const applied = new Map<string, number>();
  // set when the database and the registry disagree on whether a bot serves: the next pass reads every bot
  let resync = false;
  let quotasFailing = false;

  const unload = (id: string) => {
    knowledge.load(id, []);
    loaded.delete(id);
  };
  const pause = (bot: Pick<BotRecord, "id" | "siteKey" | "settings">) => {
    const { allowedOrigins, retentionDays } = bot.settings.security;
    tenants.pause({ id: bot.id, siteKey: bot.siteKey, allowedOrigins, managed: true, retentionDays });
    unload(bot.id);
  };

  // A tick while one is running waits for that one instead of starting another
  const tick = () => (inFlight ??= pass().finally(() => (inFlight = null)));

  const pass = async () => {
    lastAttemptAt = new Date();
    try {
      // updated_at is the writing transaction's start time, so a slow transaction can commit
      // a row older than `since`; re-reading a short overlap catches it
      const from = resync ? null : since && new Date(since.getTime() - OVERLAP_MS);
      resync = false;
      const bots = (await listBotsChangedSince(db, from, options)).filter(
        (bot) => applied.get(bot.id) !== bot.updatedAt.getTime() || (bot.serving && loaded.get(bot.id) !== bot.knowledgeVersion),
      );
      let newest = since;
      let firstFailure: Date | null = null;
      for (const bot of bots) {
        try {
          if (!bot.serving) {
            if (!tenants.isPaused(bot.id)) log("info", "bot paused", { tenant: bot.id });
            pause(bot);
            applied.set(bot.id, bot.updatedAt.getTime());
            if (!newest || bot.updatedAt > newest) newest = bot.updatedAt;
            continue;
          }
          tenants.upsert(tenantFromBot(bot, publicWidgetSettings(bot.settings)));
          if (loaded.get(bot.id) !== bot.knowledgeVersion) {
            const chunks = await listKnowledgeChunks(db, bot.id);
            const generation = knowledge.load(bot.id, chunks);
            loaded.set(bot.id, bot.knowledgeVersion);
            log("info", "knowledge loaded", { tenant: bot.id, chunks: chunks.length });
            // lexical search serves right away; vectors attach when the background job is done
            void indexer?.index(bot.id, generation, chunks);
          }
          applied.set(bot.id, bot.updatedAt.getTime());
        } catch (error) {
          log("error", "bot sync skipped a bot", { bot: bot.id, error });
          loaded.delete(bot.id);
          if (!firstFailure || bot.updatedAt < firstFailure) firstFailure = bot.updatedAt;
          continue;
        }
        if (!newest || bot.updatedAt > newest) newest = bot.updatedAt;
      }
      // A deleted website (or account) must stop answering: drop bots that are gone. Staff changes
      // touch the bot's row, but a suspension set some other way is caught here too.
      const states = new Map((await listBotStates(db)).map((b) => [b.id, b.serving]));
      for (const id of [...applied.keys()]) {
        const serving = states.get(id);
        if (serving === undefined) {
          tenants.remove(id);
          unload(id);
          applied.delete(id);
          log("info", "bot removed", { tenant: id });
        } else if (!serving && !tenants.isPaused(id)) {
          const tenant = tenants.findById(id);
          if (tenant) {
            tenants.pause(tenant);
            unload(id);
            log("info", "bot paused", { tenant: id });
          }
        } else if (serving && tenants.isPaused(id)) {
          // back in service without its row changing: reload it from scratch
          applied.delete(id);
          resync = true;
        }
      }
      // Without them (before migration 0035, or a failed read) the last ones stay and replies keep being answered
      try {
        tenants.setWorkspaces(await listWorkspaceQuotas(db));
        quotasFailing = false;
      } catch (error) {
        if (!quotasFailing) log("warn", "workspace reply limits not synced", { error });
        quotasFailing = true;
      }
      // A failed bot is fetched again next pass (re-applying the others is harmless)
      since = firstFailure ? new Date(firstFailure.getTime() - 1) : newest;
      if (bots.length) log("info", "bots synced", { count: bots.length });
      state = "ok";
      lastOkAt = new Date();
      lastError = null;
      return bots.length;
    } catch (error) {
      if (state !== "failing") log("error", "bot sync failed", { error });
      state = "failing";
      lastError = maskPII(error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300);
      return 0;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  const details = (): BotSyncDetails => ({
    status: state,
    lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
    lastOkAt: lastOkAt?.toISOString() ?? null,
    lastError,
    bots: applied.size,
    intervalMs,
  });
  return { tick, status: () => state, details, stop: () => clearInterval(timer) };
}

// Keeps dashboard-managed bots (app.bots) and their knowledge in the tenant registry and the
// retrieval index. Polls for rows changed since the last sync, so a save in the dashboard
// reaches the widget within one interval. A bot's chunks are reloaded only when its
// knowledge_version moves, not on every settings save.
// shortcut: polling; switch to LISTEN/NOTIFY once the API keeps a dedicated connection.
import type { Db } from "@apex/db";
import { listBotIds, listBotsChangedSince, listKnowledgeChunks } from "@apex/db";
import { publicWidgetSettings } from "@apex/db/bot-settings";
import { log } from "./log.ts";
import type { ChunkIndexer } from "./embeddings.ts";
import type { KnowledgeBase } from "./retrieval.ts";
import { tenantFromBot, type TenantRegistry } from "./tenants.ts";

export interface BotSync {
  /** Runs one sync; resolves to the number of bots updated. */
  tick(): Promise<number>;
  /** "ok" after a successful pass, "failing" after a failed one, "starting" before the first. */
  status(): "starting" | "ok" | "failing";
  stop(): void;
}

const OVERLAP_MS = 10_000;

/** `indexer` embeds each loaded bot's chunks in the background (hybrid search); omit it for lexical only. */
export function startBotSync(db: Db, tenants: TenantRegistry, knowledge: KnowledgeBase, intervalMs = 30_000, indexer?: ChunkIndexer): BotSync {
  let since: Date | null = null;
  let inFlight: Promise<number> | null = null;
  let state: "starting" | "ok" | "failing" = "starting";
  const loaded = new Map<string, number>();
  // updatedAt of the version last applied per bot
  const applied = new Map<string, number>();

  // A tick while one is running waits for that one instead of starting another
  const tick = () => (inFlight ??= pass().finally(() => (inFlight = null)));

  const pass = async () => {
    try {
      // updated_at is the writing transaction's start time, so a slow transaction can commit
      // a row older than `since`; re-reading a short overlap catches it
      const bots = (await listBotsChangedSince(db, since && new Date(since.getTime() - OVERLAP_MS))).filter(
        (bot) => applied.get(bot.id) !== bot.updatedAt.getTime() || loaded.get(bot.id) !== bot.knowledgeVersion,
      );
      let newest = since;
      let firstFailure: Date | null = null;
      for (const bot of bots) {
        try {
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
      // A deleted website (or account) must stop answering: drop bots that are gone
      const live = new Set(await listBotIds(db));
      for (const id of [...applied.keys()]) {
        if (live.has(id)) continue;
        tenants.remove(id);
        knowledge.load(id, []);
        applied.delete(id);
        loaded.delete(id);
        log("info", "bot removed", { tenant: id });
      }
      // A failed bot is fetched again next pass (re-applying the others is harmless)
      since = firstFailure ? new Date(firstFailure.getTime() - 1) : newest;
      if (bots.length) log("info", "bots synced", { count: bots.length });
      state = "ok";
      return bots.length;
    } catch (error) {
      if (state !== "failing") log("error", "bot sync failed", { error });
      state = "failing";
      return 0;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return { tick, status: () => state, stop: () => clearInterval(timer) };
}

// Keeps dashboard-managed bots (app.bots) in the tenant registry. Polls for rows changed
// since the last sync, so a save in the dashboard reaches the widget within one interval.
// shortcut: polling; switch to LISTEN/NOTIFY once the API keeps a dedicated connection.
import type { Db } from "@apex/db";
import { listBotsChangedSince } from "@apex/db";
import { publicWidgetSettings } from "@apex/db/bot-settings";
import { log } from "./log.ts";
import { tenantFromBot, type TenantRegistry } from "./tenants.ts";

export interface BotSync {
  /** Runs one sync; resolves to the number of bots updated. */
  tick(): Promise<number>;
  stop(): void;
}

export function startBotSync(db: Db, tenants: TenantRegistry, intervalMs = 30_000): BotSync {
  let since: Date | null = null;
  let running = false;

  const tick = async () => {
    if (running) return 0;
    running = true;
    try {
      const bots = await listBotsChangedSince(db, since);
      for (const bot of bots) {
        try {
          // shortcut: dashboard bots have no knowledge pipeline yet, so every answer is "I don't know"
          tenants.upsert(tenantFromBot(bot, publicWidgetSettings(bot.settings)));
        } catch (error) {
          log("error", "bot sync skipped a bot", { bot: bot.id, error });
        }
        if (!since || bot.updatedAt > since) since = bot.updatedAt;
      }
      if (bots.length) log("info", "bots synced", { count: bots.length });
      return bots.length;
    } catch (error) {
      log("error", "bot sync failed", { error });
      return 0;
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return { tick, stop: () => clearInterval(timer) };
}

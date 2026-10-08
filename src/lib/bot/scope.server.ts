// Which bot is handling the current update. Server-only.
import { AsyncLocalStorage } from "node:async_hooks";

export type BotId = "smm" | "tg" | "sms";
const store = new AsyncLocalStorage<BotId>();

export function runAsBot<T>(bot: BotId, fn: () => T): T {
  return store.run(bot, fn);
}

export function currentBot(): BotId {
  return store.getStore() ?? "smm";
}

/** Per-bot tables; everything else (settings, secrets, deposits, bKash SMS) is shared. */
const PER_BOT_TABLES = new Set([
  "bot_users", "bot_states", "bot_orders", "bot_tg_accounts", "bot_tickets",
  "bot_popular", "bot_api_keys", "bot_ext_licenses",
]);

export function scopedTable(table: string): string {
  if (currentBot() === "sms" && (PER_BOT_TABLES.has(table) || table === "bot_settings")) return table.replace(/^bot_/, "bot3_");
  return currentBot() === "tg" && PER_BOT_TABLES.has(table) ? table.replace(/^bot_/, "bot2_") : table;
}

export function scopedRpc(fn: string): string {
  if (fn === "bot_adjust_balance" && currentBot() === "sms") return "bot3_adjust_balance";
  return currentBot() === "tg" && fn === "bot_adjust_balance" ? "bot2_adjust_balance" : fn;
}

// Admin-editable pricing settings stored in bot_settings (cached briefly in memory).
import { currentBot } from "./scope.server";
import { supabaseAdmin } from "./store.server";

export type Settings = { smm_markup_pct: number; tg_multiplier: number; ref_pct: number; sms_markup_pct: number };
const DEFAULTS: Settings = { smm_markup_pct: 40, tg_multiplier: 3, ref_pct: 5, sms_markup_pct: 30 };
const TTL_MS = 30 * 1000;
const caches = new Map<string, { value: Settings; at: number }>();

export async function getSettings(): Promise<Settings> {
  const cache = caches.get(currentBot());
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value: Settings = { ...DEFAULTS };
  try {
    const { data } = await supabaseAdmin.from("bot_settings").select("key, value");
    for (const row of data ?? []) {
      const n = Number(row.value);
      if (row.key in value && Number.isFinite(n)) (value as any)[row.key] = n;
    }
  } catch (error) {
    console.error("[settings] load failed", error);
  }
  caches.set(currentBot(), { value, at: Date.now() });
  return value;
}

export async function setSetting(key: keyof Settings, value: number) {
  await supabaseAdmin.from("bot_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  caches.delete(currentBot());
}

export async function smmMultiplier(): Promise<number> {
  return 1 + (await getSettings()).smm_markup_pct / 100;
}

export async function tgMultiplier(): Promise<number> {
  return (await getSettings()).tg_multiplier;
}

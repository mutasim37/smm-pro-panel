// Admin-editable pricing settings stored in bot_settings (cached briefly in memory).
import { supabaseAdmin } from "./store.server";

export type Settings = { smm_markup_pct: number; tg_multiplier: number; ref_pct: number };
const DEFAULTS: Settings = { smm_markup_pct: 40, tg_multiplier: 3, ref_pct: 5 };
const TTL_MS = 30 * 1000;
let cache: { value: Settings; at: number } | null = null;

export async function getSettings(): Promise<Settings> {
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
  cache = { value, at: Date.now() };
  return value;
}

export async function setSetting(key: keyof Settings, value: number) {
  await supabaseAdmin.from("bot_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  cache = null;
}

export async function smmMultiplier(): Promise<number> {
  return 1 + (await getSettings()).smm_markup_pct / 100;
}

export async function tgMultiplier(): Promise<number> {
  return (await getSettings()).tg_multiplier;
}

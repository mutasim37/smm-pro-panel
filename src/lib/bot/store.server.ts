// Database access for the bot. Server-only.
import { supabaseAdmin as rawAdmin } from "@/integrations/supabase/client.server";
import { scopedRpc, scopedTable } from "./scope.server";

/** Service-role client whose per-bot tables are routed to the bot handling this update. */
const supabaseAdmin = new Proxy(rawAdmin, {
  get(target, prop, receiver) {
    if (prop === "from") return (name: string) => (target.from as any)(scopedTable(name));
    if (prop === "rpc") return (fn: string, args?: any, opts?: any) => (target.rpc as any)(scopedRpc(fn), args, opts);
    return Reflect.get(target, prop, receiver);
  },
}) as typeof rawAdmin;

export type BotUser = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  balance: number;
  total_deposited: number;
  total_spent: number;
  is_banned: boolean;
  currency: string | null;
  created_at: string;
};

export type TelegramFrom = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export async function upsertUser(
  from: TelegramFrom,
): Promise<{ user: BotUser; isNew: boolean }> {
  const { data: existing } = await supabaseAdmin
    .from("bot_users")
    .select("*")
    .eq("telegram_id", from.id)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("bot_users")
      .update({
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        last_name: from.last_name ?? null,
        language_code: from.language_code ?? null,
        last_seen_at: new Date().toISOString(),
      })
      .eq("telegram_id", from.id);
    return { user: existing as unknown as BotUser, isNew: false };
  }

  const { data: created } = await supabaseAdmin
    .from("bot_users")
    .insert({
      telegram_id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      language_code: from.language_code ?? null,
    })
    .select("*")
    .single();

  return { user: created as unknown as BotUser, isNew: true };
}

export async function getUser(telegramId: number): Promise<BotUser | null> {
  const { data } = await supabaseAdmin
    .from("bot_users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return (data as unknown as BotUser) ?? null;
}

export async function adjustBalance(telegramId: number, delta: number): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("bot_adjust_balance", {
    _telegram_id: telegramId,
    _delta: delta,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export type BotState = { step: string | null; data: Record<string, any> };

export async function getState(telegramId: number): Promise<BotState> {
  const { data } = await supabaseAdmin
    .from("bot_states")
    .select("step, data")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return {
    step: (data?.step as string | null) ?? null,
    data: (data?.data as Record<string, any>) ?? {},
  };
}

export async function setState(
  telegramId: number,
  step: string | null,
  data: Record<string, any> = {},
) {
  await supabaseAdmin.from("bot_states").upsert({
    telegram_id: telegramId,
    step,
    data: data as never,
    updated_at: new Date().toISOString(),
  });
}

export async function clearState(telegramId: number) {
  await setState(telegramId, null, {});
}

export async function setCurrency(telegramId: number, currency: string) {
  await supabaseAdmin.from("bot_users").update({ currency }).eq("telegram_id", telegramId);
}

export { supabaseAdmin };

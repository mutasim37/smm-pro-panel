// Promoter program: admin-granted accounts earn a % of referred users' deposits for 30 days.
import { supabaseAdmin } from "./store.server";
import { currentBot } from "./scope.server";
import { escapeHtml, type InlineKeyboard } from "./telegram.server";
import { botUsername } from "./growth.server";
import { DIVIDER, money, usd } from "./views.server";
import { promoFee, PROMO_WINDOW_DAYS, defaultPromoPct, type PromoMethod } from "./promoter-rules";

const db = supabaseAdmin as any;

export async function getPromoter(telegramId: number) {
  const { data } = await db.from("bot_promoters").select("*").eq("bot", currentBot()).eq("telegram_id", telegramId).eq("active", true).maybeSingle();
  return data as null | { telegram_id: number; pct: number; balance: number; total_earned: number; total_withdrawn: number };
}

export async function promoLink(telegramId: number) {
  return `https://t.me/${await botUsername()}?start=pr_${telegramId}`;
}

/** New users joining via pr_ID are tied to an active promoter. */
export async function attachPromoter(newUserId: number, payload: string): Promise<number | null> {
  const id = Number(payload.replace(/^pr_/, ""));
  if (!Number.isFinite(id) || id <= 0 || id === newUserId) return null;
  if (!(await getPromoter(id))) return null;
  await db.from("bot_users").update({ promoted_by: id, promoted_at: new Date().toISOString() }).eq("telegram_id", newUserId).is("promoted_by", null);
  return id;
}

/** Called after every confirmed deposit. */
export async function creditPromoter(userId: number, depositUsd: number) {
  try {
    const { data: u } = await db.from("bot_users").select("promoted_by, promoted_at").eq("telegram_id", userId).maybeSingle();
    if (!u?.promoted_by || !u.promoted_at) return;
    if (Date.now() - new Date(u.promoted_at).getTime() > PROMO_WINDOW_DAYS * 86400_000) return;
    const p = await getPromoter(Number(u.promoted_by));
    if (!p) return;
    const reward = Math.round(depositUsd * Number(p.pct) * 100) / 10000;
    if (reward <= 0) return;
    const { data: ok } = await db.rpc("bot_promo_credit", { _bot: currentBot(), _promoter: p.telegram_id, _amount: reward });
    if (!ok) return;
    const { sendMessage } = await import("./telegram.server");
    await sendMessage(p.telegram_id, ["<b>📣 PROMOTER EARNING</b>", DIVIDER, `A user you promoted deposited <b>${money(depositUsd)}</b>.`, `💰 You earned <b>${money(reward)}</b> (${p.pct}%).`].join("\n"));
  } catch (e) { console.error("[promoter] credit failed", e); }
}

export async function promoterView(telegramId: number): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const p = await getPromoter(telegramId);
  if (!p) return null;
  const [link, { count }] = await Promise.all([
    promoLink(telegramId),
    db.from("bot_users").select("*", { count: "exact", head: true }).eq("promoted_by", telegramId),
  ]);
  return {
    text: [
      "<b>📣 Promoter Dashboard</b>", DIVIDER,
      `Earn <b>${p.pct}%</b> of every deposit your users make during their first <b>${PROMO_WINDOW_DAYS} days</b>.`, "",
      "🔗 <b>Your promo link</b> (tap to copy)", `<code>${link}</code>`, "",
      `👥 <b>Users joined</b> · <code>${count ?? 0}</code>`,
      `💰 <b>Available</b> · <code>${money(Number(p.balance))}</code>`,
      `📈 <b>Total earned</b> · <code>${money(Number(p.total_earned))}</code>`,
      `💸 <b>Withdrawn</b> · <code>${money(Number(p.total_withdrawn))}</code>`,
    ].join("\n"),
    keyboard: [
      [{ text: "💸 Withdraw Earnings", callback_data: "pm:wd" }],
      [{ text: "🏠 Home", callback_data: "home" }],
    ],
  };
}

export function withdrawMethods(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: ["<b>💸 Withdraw Earnings</b>", DIVIDER, "Your full available balance will be sent.", "", "📱 bKash · 2% fee", "🟡 Binance Pay ID · no fee", "💎 USDT BEP20 · $0.10 fee"].join("\n"),
    keyboard: [
      [{ text: "📱 bKash", callback_data: "pm:wm:bkash" }, { text: "🟡 Binance", callback_data: "pm:wm:binance" }],
      [{ text: "💎 USDT BEP20", callback_data: "pm:wm:usdt" }],
      [{ text: "✖️ Cancel", callback_data: "cancel" }],
    ],
  };
}

export async function requestWithdraw(telegramId: number, method: PromoMethod, dest: string) {
  const p = await getPromoter(telegramId);
  if (!p) return { error: "Not a promoter." } as const;
  const fee = promoFee(method, Number(p.balance));
  const { data: id, error } = await db.rpc("bot_promo_withdraw", { _bot: currentBot(), _tg: telegramId, _fee: fee, _method: method, _dest: dest.slice(0, 120) });
  if (error || !id) return { error: "Balance too low to withdraw after fees." } as const;
  return { id: String(id), amount: Number(p.balance), fee } as const;
}

/* --------------------------------- admin --------------------------------- */

export async function adminPromoters(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const [{ data: list }, { data: pend }] = await Promise.all([
    db.from("bot_promoters").select("telegram_id, pct, balance, total_earned").eq("bot", currentBot()).eq("active", true).order("total_earned", { ascending: false }).limit(20),
    db.from("bot_promo_withdrawals").select("id, telegram_id, amount, fee, method, destination").eq("bot", currentBot()).eq("status", "pending").order("created_at").limit(10),
  ]);
  const lines = (list ?? []).map((p: any) => `• <code>${p.telegram_id}</code> · ${p.pct}% · earned <code>${usd(Number(p.total_earned))}</code> · bal <code>${usd(Number(p.balance))}</code>`);
  const wd = (pend ?? []).map((w: any) => `• <code>${w.telegram_id}</code> · <code>${usd(Number(w.amount))}</code> −fee ${usd(Number(w.fee))} · ${w.method} · <code>${escapeHtml(w.destination)}</code>`);
  return {
    text: ["<b>📣 Promoters</b>", DIVIDER, `Default commission · <code>${defaultPromoPct(currentBot())}%</code> for ${PROMO_WINDOW_DAYS} days`, "", lines.join("\n") || "No promoters yet.", DIVIDER, "<b>Pending withdrawals</b>", wd.join("\n") || "—"].join("\n"),
    keyboard: [
      ...(pend ?? []).map((w: any) => [
        { text: `✅ Paid ${w.telegram_id}`, callback_data: `pm:ok:${w.id}` },
        { text: "❌ Reject", callback_data: `pm:no:${w.id}` },
      ]),
      [{ text: "➕ Add Promoter", callback_data: "pm:add" }, { text: "🗑 Remove", callback_data: "pm:rm" }],
      [{ text: "⬅️ Admin Panel", callback_data: "a:panel" }],
    ],
  };
}

export async function addPromoter(telegramId: number, pct?: number) {
  const value = pct && pct > 0 && pct <= 50 ? pct : defaultPromoPct(currentBot());
  await db.from("bot_promoters").upsert({ bot: currentBot(), telegram_id: telegramId, pct: value, active: true }, { onConflict: "bot,telegram_id" });
  return value;
}

export async function removePromoter(telegramId: number) {
  await db.from("bot_promoters").update({ active: false }).eq("bot", currentBot()).eq("telegram_id", telegramId);
}

export async function decideWithdraw(id: string, approve: boolean) {
  if (!approve) {
    const { data } = await db.rpc("bot_promo_reject", { _id: id });
    if (!data) return null;
  } else {
    const { data } = await db.from("bot_promo_withdrawals").update({ status: "paid", decided_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
    if (!data) return null;
  }
  const { data: w } = await db.from("bot_promo_withdrawals").select("*").eq("id", id).maybeSingle();
  return w as { telegram_id: number; amount: number; fee: number; method: string } | null;
}

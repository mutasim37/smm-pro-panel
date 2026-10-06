// Growth features: product deep links, popular services, referrals, force-join channel.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tg, escapeHtml, type InlineKeyboard } from "./telegram.server";
import { getCatalog } from "./catalog.server";
import { getSettings } from "./settings.server";
import { adjustBalance } from "./store.server";
import { DIVIDER, money, usd } from "./views.server";

/* ------------------------------ bot username ------------------------------ */

let botName: string | null = null;
export async function botUsername(): Promise<string> {
  if (botName) return botName;
  const me = await tg<{ username: string }>("getMe");
  botName = me?.username ?? "bot";
  return botName;
}

export async function productLink(serviceId: number): Promise<string> {
  return `https://t.me/${await botUsername()}?start=p_${serviceId}`;
}

export async function referralLink(telegramId: number): Promise<string> {
  return `https://t.me/${await botUsername()}?start=ref_${telegramId}`;
}

export function shareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

/* ---------------------------- force join channel --------------------------- */

let channelCache: { value: string; at: number } | null = null;
export async function forceChannel(): Promise<string> {
  if (channelCache && Date.now() - channelCache.at < 60_000) return channelCache.value;
  const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "force_channel").maybeSingle();
  const value = String(data?.value ?? "").trim();
  channelCache = { value, at: Date.now() };
  return value;
}

export async function setForceChannel(input: string): Promise<string> {
  let value = input.trim();
  if (/^(off|none|disable|-)$/i.test(value)) value = "";
  value = value.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  if (value && !/^[A-Za-z0-9_]{4,64}$/.test(value)) throw new Error("Invalid channel username");
  const stored = value ? `@${value}` : "";
  await supabaseAdmin.from("bot_secrets").upsert({ name: "force_channel", value: stored }, { onConflict: "name" });
  channelCache = null;
  joinedCache.clear();
  return stored;
}

const joinedCache = new Map<number, number>();
/** True when no channel is set, or the user is a member. Positive results are cached 30s. */
export async function isJoined(userId: number): Promise<boolean> {
  const channel = await forceChannel();
  if (!channel) return true;
  const at = joinedCache.get(userId);
  if (at && Date.now() - at < 30_000) return true;
  const member = await tg<{ status: string }>("getChatMember", { chat_id: channel, user_id: userId });
  // If the bot can't read the channel (not admin), don't lock everyone out.
  if (!member) return true;
  const ok = ["creator", "administrator", "member"].includes(member.status) || (member as any).is_member === true;
  if (ok) joinedCache.set(userId, Date.now());
  else joinedCache.delete(userId);
  return ok;
}

export async function joinGate(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const channel = await forceChannel();
  return {
    text: [
      "<b>🔒 Join Required</b>",
      DIVIDER,
      `To use the bot, please join our official channel <b>${escapeHtml(channel)}</b>.`,
      "",
      "After joining, tap <b>✅ I Have Joined</b>.",
    ].join("\n"),
    keyboard: [
      [{ text: "📢 Join Channel", url: `https://t.me/${channel.replace(/^@/, "")}` }],
      [{ text: "✅ I Have Joined", callback_data: "fj" }],
    ],
  };
}

/* --------------------------------- popular -------------------------------- */

let popularCache: { ids: number[]; at: number } | null = null;
export async function pinnedIds(): Promise<number[]> {
  const { data } = await supabaseAdmin.from("bot_popular").select("service_id").order("created_at", { ascending: true });
  return (data ?? []).map((r) => Number(r.service_id));
}

/** Admin pins first, then the most-ordered services. Cached 10 minutes. */
export async function popularIds(limit = 20): Promise<number[]> {
  if (popularCache && Date.now() - popularCache.at < 10 * 60_000) return popularCache.ids.slice(0, limit);
  const catalog = await getCatalog();
  const pins = await pinnedIds();
  const { data } = await supabaseAdmin
    .from("bot_orders")
    .select("service_id")
    .order("created_at", { ascending: false })
    .limit(3000);
  const counts = new Map<number, number>();
  for (const r of data ?? []) counts.set(Number(r.service_id), (counts.get(Number(r.service_id)) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const ids = [...new Set([...pins, ...top])].filter((id) => catalog.services.has(id));
  popularCache = { ids, at: Date.now() };
  return ids.slice(0, limit);
}

export async function togglePin(serviceId: number, on: boolean) {
  if (on) await supabaseAdmin.from("bot_popular").upsert({ service_id: serviceId });
  else await supabaseAdmin.from("bot_popular").delete().eq("service_id", serviceId);
  popularCache = null;
}

/* -------------------------------- referrals ------------------------------- */

export async function attachReferrer(newUserId: number, payload: string) {
  const ref = Number(payload.replace(/^ref_/, ""));
  if (!Number.isFinite(ref) || ref <= 0 || ref === newUserId) return null;
  const { data: referrer } = await supabaseAdmin.from("bot_users").select("telegram_id").eq("telegram_id", ref).maybeSingle();
  if (!referrer) return null;
  await supabaseAdmin.from("bot_users").update({ referred_by: ref }).eq("telegram_id", newUserId).is("referred_by", null);
  return ref;
}

/** Pays the referrer a % of the referred user's first purchase. Guarded once by ref_rewarded. */
export async function rewardReferrer(buyerId: number, charge: number): Promise<{ referrer: number; reward: number } | null> {
  const { data } = await supabaseAdmin
    .from("bot_users")
    .update({ ref_rewarded: true })
    .eq("telegram_id", buyerId)
    .eq("ref_rewarded", false)
    .not("referred_by", "is", null)
    .select("referred_by")
    .maybeSingle();
  const referrer = Number(data?.referred_by ?? 0);
  if (!referrer) return null;
  const pct = (await getSettings()).ref_pct;
  const reward = Math.round(charge * pct) / 100;
  if (reward <= 0) return null;
  await adjustBalance(referrer, reward);
  const { data: row } = await supabaseAdmin.from("bot_users").select("ref_earned").eq("telegram_id", referrer).maybeSingle();
  await supabaseAdmin
    .from("bot_users")
    .update({ ref_earned: Number(row?.ref_earned ?? 0) + reward })
    .eq("telegram_id", referrer);
  const { sendMessage } = await import("./telegram.server");
  await sendMessage(
    referrer,
    ["<b>🎁 REFERRAL REWARD</b>", DIVIDER, `Your friend made their first purchase.`, `💰 <b>${money(reward)}</b> was added to your wallet.`].join("\n"),
  );
  return { referrer, reward };
}

export async function referralView(telegramId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const [link, settings, { count }, { data: me }] = await Promise.all([
    referralLink(telegramId),
    getSettings(),
    supabaseAdmin.from("bot_users").select("*", { count: "exact", head: true }).eq("referred_by", telegramId),
    supabaseAdmin.from("bot_users").select("ref_earned").eq("telegram_id", telegramId).maybeSingle(),
  ]);
  return {
    text: [
      "<b>🎁 Refer & Earn</b>",
      DIVIDER,
      `Invite friends and earn <b>${settings.ref_pct}%</b> of their first purchase — straight to your wallet.`,
      "",
      `🔗 <b>Your link</b> (tap to copy)`,
      `<code>${link}</code>`,
      "",
      `👥 <b>Friends invited</b> · <code>${count ?? 0}</code>`,
      `💰 <b>Total earned</b> · <code>${money(Number(me?.ref_earned ?? 0))}</code>`,
    ].join("\n"),
    keyboard: [
      [{ text: "📤 Share Invite Link", url: shareUrl(link, "Premium SMM services, TG accounts & more — join me here:") }],
      [{ text: "🏠 Home", callback_data: "home" }],
    ],
  };
}

export async function adminReferrals(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const settings = await getSettings();
  const { data } = await supabaseAdmin
    .from("bot_users")
    .select("telegram_id, username, ref_earned")
    .gt("ref_earned", 0)
    .order("ref_earned", { ascending: false })
    .limit(10);
  const lines = (data ?? []).map(
    (u, i) => `${i + 1}. <code>${u.telegram_id}</code> ${u.username ? "@" + escapeHtml(u.username) : ""} · <code>${usd(Number(u.ref_earned))}</code>`,
  );
  return {
    text: ["<b>🎁 Referral Program</b>", DIVIDER, `💸 <b>Commission</b> · <code>${settings.ref_pct}%</code> of first purchase`, DIVIDER, "<b>Top referrers</b>", lines.join("\n") || "—"].join("\n"),
    keyboard: [
      [{ text: "✏️ Edit Commission %", callback_data: "a:pref" }],
      [{ text: "⬅️ Admin Panel", callback_data: "a:panel" }, { text: "🏠 Home", callback_data: "home" }],
    ],
  };
}

export async function adminPopular(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const catalog = await getCatalog();
  const pins = await pinnedIds();
  const rows: InlineKeyboard = pins.map((id) => [
    { text: `🗑 #${id} · ${(catalog.services.get(id)?.name ?? "unavailable").slice(0, 40)}`, callback_data: `a:popdel:${id}` },
  ]);
  return {
    text: [
      "<b>🔥 Popular Services</b>",
      DIVIDER,
      `📌 <b>Pinned by you</b> · <code>${pins.length}</code>`,
      "Pinned services show first, followed by the most-ordered ones automatically.",
      "",
      "Tap a pin to remove it.",
    ].join("\n"),
    keyboard: [
      ...rows,
      [{ text: "➕ Pin by Code", callback_data: "a:popadd" }],
      [{ text: "⬅️ Admin Panel", callback_data: "a:panel" }, { text: "🏠 Home", callback_data: "home" }],
    ],
  };
}

export async function adminChannel(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const channel = await forceChannel();
  return {
    text: [
      "<b>📢 Force Join Channel</b>",
      DIVIDER,
      `📡 <b>Status</b> · ${channel ? `ON · <code>${escapeHtml(channel)}</code>` : "OFF"}`,
      "",
      "<blockquote>Make the bot an <b>admin</b> of the channel so it can check members automatically. Users who leave are locked out again until they rejoin.</blockquote>",
    ].join("\n"),
    keyboard: [
      [{ text: "✏️ Set Channel", callback_data: "a:chset" }, ...(channel ? [{ text: "🚫 Turn Off", callback_data: "a:choff" }] : [])],
      [{ text: "⬅️ Admin Panel", callback_data: "a:panel" }, { text: "🏠 Home", callback_data: "home" }],
    ],
  };
}

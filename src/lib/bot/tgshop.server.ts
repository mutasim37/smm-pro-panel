import { rewardReferrer } from "./growth.server";
// "Buy TG Account" shop: browse supplier stock, quote with admin multiplier, deliver + OTP.
import { EFFECTS, supportUsername } from "./config.server";
import { editMessage, escapeHtml, ik, sendChatAction, sendMessage, tg, type InlineKeyboard } from "./telegram.server";
import { DIVIDER, money, usd } from "./views.server";
import { adjustBalance, getUser, setState, clearState, supabaseAdmin } from "./store.server";
import { tgMultiplier } from "./settings.server";
import { fastBuy, getAccount, loginCode, resetSessions, searchAccounts, PhoenixError, type TgItem } from "./phoenix.server";
import { notifyAdmins } from "./admin.server";

type Ctx = { chatId: number; messageId?: number; fromPhoto?: boolean };

export const TG_COUNTRIES: { code: string; flag: string; name: string }[] = [
  { code: "ALL", flag: "🌍", name: "All Countries" },
  { code: "IN", flag: "🇮🇳", name: "India" },
  { code: "BD", flag: "🇧🇩", name: "Bangladesh" },
  { code: "US", flag: "🇺🇸", name: "USA" },
  { code: "ID", flag: "🇮🇩", name: "Indonesia" },
  { code: "RU", flag: "🇷🇺", name: "Russia" },
  { code: "MX", flag: "🇲🇽", name: "Mexico" },
  { code: "PK", flag: "🇵🇰", name: "Pakistan" },
  { code: "NG", flag: "🇳🇬", name: "Nigeria" },
  { code: "PH", flag: "🇵🇭", name: "Philippines" },
  { code: "VN", flag: "🇻🇳", name: "Vietnam" },
  { code: "BR", flag: "🇧🇷", name: "Brazil" },
];

export function flagOf(code: string): string {
  const c = (code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🌐";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

const PER_PAGE = 8;
const API_PER_PAGE = 40;

async function show(ctx: Ctx, text: string, keyboard: InlineKeyboard) {
  const markup = { reply_markup: ik(keyboard) };
  if (ctx.messageId && !ctx.fromPhoto) {
    if (await editMessage(ctx.chatId, ctx.messageId, text, markup)) return;
  }
  if (ctx.messageId) await tg("deleteMessage", { chat_id: ctx.chatId, message_id: ctx.messageId });
  await sendMessage(ctx.chatId, text, markup);
}

export async function quote(item: TgItem): Promise<number> {
  return Math.round(item.price * (await tgMultiplier()) * 10000) / 10000;
}

export async function showTgCountries(ctx: Ctx) {
  const rows: InlineKeyboard = [];
  for (let i = 0; i < TG_COUNTRIES.length; i += 2) {
    rows.push(TG_COUNTRIES.slice(i, i + 2).map((c) => ({ text: `${c.flag} ${c.name}`, callback_data: `tg:c:${c.code}:0` })));
  }
  rows.push([{ text: "📂 My TG Accounts", callback_data: "tg:my:0" }]);
  rows.push([{ text: "🏠 Home", callback_data: "home" }]);
  await show(ctx, [
    "<b>📱 TELEGRAM ACCOUNTS</b>",
    DIVIDER,
    "Fresh, ready-to-use Telegram accounts with <b>instant delivery</b>.",
    "",
    "✅ Spam-free stock only",
    "📨 Login code (OTP) delivered inside the bot",
    "🔐 One-tap session reset after login",
    DIVIDER,
    "<b>Select a country</b> 👇",
  ].join("\n"), rows);
}

export async function showTgList(ctx: Ctx, country: string, page: number) {
  const apiPage = Math.floor((page * PER_PAGE) / API_PER_PAGE) + 1;
  const offset = (page * PER_PAGE) % API_PER_PAGE;
  let result;
  try {
    result = await searchAccounts(country, apiPage);
  } catch (error) {
    console.error("[tg] search failed", error);
    return show(ctx, "⚠️ Stock is temporarily unavailable. Please try again in a moment.", [
      [{ text: "🔁 Retry", callback_data: `tg:c:${country}:${page}` }, { text: "⬅️ Back", callback_data: "tg" }],
    ]);
  }
  const items = result.items.slice(offset, offset + PER_PAGE);
  const meta = TG_COUNTRIES.find((c) => c.code === country);
  if (!items.length) {
    return show(ctx, `${meta?.flag ?? "🌐"} <b>No accounts in stock right now.</b>\nTry another country.`, [
      [{ text: "⬅️ Countries", callback_data: "tg" }, { text: "🏠 Home", callback_data: "home" }],
    ]);
  }
  const mult = await tgMultiplier();
  const rows: InlineKeyboard = items.map((item) => [{
    text: `${flagOf(item.telegram_country)} ${item.telegram_country} · ${money(item.price * mult)}${item.telegram_premium ? " · ⭐" : ""} · 👥${item.telegram_contacts_count ?? 0}`,
    callback_data: `tg:i:${item.item_id}`,
  }]);
  const hasNext = offset + PER_PAGE < result.items.length || result.hasNext;
  const nav: InlineKeyboard[number] = [];
  if (page > 0) nav.push({ text: "◀️ Previous", callback_data: `tg:c:${country}:${page - 1}` });
  nav.push({ text: `📄 ${page + 1}`, callback_data: "noop" });
  if (hasNext) nav.push({ text: "Next ▶️", callback_data: `tg:c:${country}:${page + 1}` });
  rows.push(nav);
  rows.push([{ text: "⬅️ Countries", callback_data: "tg" }, { text: "🏠 Home", callback_data: "home" }]);
  await show(ctx, [
    `<b>${meta?.flag ?? "🌐"} ${meta?.name ?? country} · Telegram Accounts</b>`,
    DIVIDER,
    `📦 <b>In stock</b> · <code>${result.total.toLocaleString("en-US")}</code>`,
    "💡 Cheapest first · ⭐ = Premium · 👥 = contacts",
    DIVIDER,
    "Tap an account to view details.",
  ].join("\n"), rows);
}

function yesNo(v: number | undefined) {
  return v && v > 0 ? "Yes" : "No";
}

export async function showTgItem(ctx: Ctx, itemId: number) {
  await sendChatAction(ctx.chatId);
  const item = await getAccount(itemId).catch(() => null);
  if (!item) {
    return show(ctx, "⚠️ This account was just sold or is unavailable. Please choose another one.", [
      [{ text: "⬅️ Countries", callback_data: "tg" }],
    ]);
  }
  const price = await quote(item);
  await setState(ctx.chatId, "tg_confirm", { itemId, charge: price, country: item.telegram_country });
  const user = await getUser(ctx.chatId);
  const balance = Number(user?.balance ?? 0);
  const rows: InlineKeyboard = [];
  if (balance >= price) rows.push([{ text: `💰 Pay from Wallet (${money(price)})`, callback_data: "tg:pay:w" }]);
  rows.push([{ text: "📱 Direct Pay with bKash", callback_data: "tg:pay:b" }]);
  rows.push([{ text: "🪙 Direct Pay with USDT", callback_data: "tg:pay:d" }]);
  rows.push([{ text: "⬅️ Back", callback_data: `tg:c:${item.telegram_country}:0` }, { text: "🏠 Home", callback_data: "home" }]);
  const lastSeen = item.telegram_last_seen ? new Date(item.telegram_last_seen * 1000).toISOString().slice(0, 10) : "—";
  await show(ctx, [
    `<b>${flagOf(item.telegram_country)} TELEGRAM ACCOUNT · ${escapeHtml(item.telegram_country)}</b>`,
    DIVIDER,
    `🆔 <b>Item</b> · <code>${item.item_id}</code>`,
    `💵 <b>Price</b> · <code>${money(price)}</code>`,
    `⭐ <b>Premium</b> · ${yesNo(item.telegram_premium)}`,
    `🛡 <b>Spam block</b> · ${item.telegram_spam_block && item.telegram_spam_block > 0 ? "Yes" : "No"}`,
    `🔐 <b>2FA password</b> · ${yesNo(item.telegram_password)}`,
    `👥 <b>Contacts</b> · <code>${item.telegram_contacts_count ?? 0}</code>`,
    `💬 <b>Chats</b> · <code>${item.telegram_chats_count ?? 0}</code> · 📢 <b>Channels</b> · <code>${item.telegram_channels_count ?? 0}</code>`,
    `🕓 <b>Last seen</b> · <code>${lastSeen}</code>`,
    DIVIDER,
    `💰 <b>Wallet</b> · <code>${money(balance)}</code>`,
    "<blockquote expandable>The phone number is delivered instantly after payment. Log in with it in Telegram, then tap <b>Get Login Code</b> to receive your OTP here.</blockquote>",
  ].join("\n"), rows);
}

/** Charge wallet, buy from supplier, deliver. Refunds on any failure. */
export async function buyTgAccount(chatId: number, draft: { itemId: number; charge: number }) {
  const user = await getUser(chatId);
  if (!user) return;
  if (Number(user.balance) + 0.00001 < draft.charge) {
    await sendMessage(chatId, "⚠️ Wallet balance is not enough. Please top up and try again.", {
      reply_markup: ik([[{ text: "💳 Add Funds", callback_data: "dep" }]]),
    });
    return;
  }
  await sendChatAction(chatId);

  // Re-check live price so a supplier price jump never sells at a loss.
  const live = await getAccount(draft.itemId).catch(() => null);
  if (!live || (await quote(live)) > draft.charge + 0.0001) {
    await clearState(chatId);
    await sendMessage(chatId, "⚠️ This account was just sold or its price changed. Nothing was charged — please pick another one.", {
      reply_markup: ik([[{ text: "📱 TG Accounts", callback_data: "tg" }]]),
    });
    return;
  }

  const balanceAfter = await adjustBalance(chatId, -draft.charge);
  try {
    const result = await fastBuy(draft.itemId);
    await supabaseAdmin.from("bot_tg_accounts").insert({
      telegram_id: chatId,
      item_id: draft.itemId,
      phone: result.phone,
      country: result.country || live.telegram_country,
      charge: draft.charge,
      cost: result.cost,
      order_ref: result.orderRef,
    });
    await supabaseAdmin.from("bot_users").update({ total_spent: Number(user.total_spent) + draft.charge }).eq("telegram_id", chatId);
    await clearState(chatId);
    await sendMessage(chatId, [
      "<b>✅ ACCOUNT DELIVERED</b>",
      DIVIDER,
      `📞 <b>Phone</b> · <code>${escapeHtml(result.phone)}</code>`,
      `${flagOf(live.telegram_country)} <b>Country</b> · <code>${escapeHtml(live.telegram_country)}</code>`,
      `🧾 <b>Ref</b> · <code>${escapeHtml(result.orderRef)}</code>`,
      `💵 <b>Charged</b> · <code>${money(draft.charge)}</code>`,
      `💰 <b>New balance</b> · <code>${money(balanceAfter)}</code>`,
      DIVIDER,
      "<blockquote>1. Open Telegram → Log in with the number above.\n2. Tap <b>Get Login Code</b> below to receive the OTP.\n3. After login, tap <b>Reset Other Sessions</b> to secure the account.</blockquote>",
    ].join("\n"), {
      message_effect_id: EFFECTS.party,
      reply_markup: ik(accountKeyboard(draft.itemId)),
    });
    await rewardReferrer(chatId, draft.charge).catch(() => null);
    await notifyAdmins([
      "<b>📱 TG ACCOUNT SOLD</b>",
      DIVIDER,
      `👤 <code>${chatId}</code> ${user.username ? "@" + escapeHtml(user.username) : ""}`,
      `📞 <code>${escapeHtml(result.phone)}</code> · ${escapeHtml(live.telegram_country)}`,
      `💵 Sold <code>${usd(draft.charge)}</code> · Cost <code>${usd(result.cost)}</code>`,
    ].join("\n"), EFFECTS.fire);
  } catch (error) {
    await adjustBalance(chatId, draft.charge);
    await clearState(chatId);
    const msg = error instanceof PhoenixError && error.status === 409 ? "This account just went out of stock." : "The purchase could not be completed.";
    await sendMessage(chatId, [
      "<b>⚠️ Purchase failed</b>",
      DIVIDER,
      msg,
      "Your balance has been fully refunded — nothing was lost.",
      `Need help? Contact @${supportUsername()}`,
    ].join("\n"), { reply_markup: ik([[{ text: "📱 TG Accounts", callback_data: "tg" }, { text: "🏠 Home", callback_data: "home" }]]) });
    await notifyAdmins(`⚠️ <b>TG purchase failed</b> for <code>${chatId}</code>\n<code>${escapeHtml(String(error)).slice(0, 300)}</code>`);
  }
}

function accountKeyboard(itemId: number): InlineKeyboard {
  return [
    [{ text: "📨 Get Login Code", callback_data: `tg:otp:${itemId}` }],
    [{ text: "🔄 Reset Other Sessions", callback_data: `tg:rs:${itemId}` }],
    [{ text: "📂 My TG Accounts", callback_data: "tg:my:0" }, { text: "🏠 Home", callback_data: "home" }],
  ];
}

async function owns(chatId: number, itemId: number) {
  const { data } = await supabaseAdmin.from("bot_tg_accounts").select("id, phone").eq("telegram_id", chatId).eq("item_id", itemId).maybeSingle();
  return data;
}

export async function tgOtp(chatId: number, itemId: number) {
  const row = await owns(chatId, itemId);
  if (!row) return sendMessage(chatId, "🚫 This account is not in your purchases.");
  await sendChatAction(chatId);
  let code: string | null = null;
  try {
    code = await loginCode(itemId);
  } catch (error) {
    console.error("[tg] otp", error);
  }
  if (!code) {
    return sendMessage(chatId, [
      "<b>⏳ No code yet</b>",
      DIVIDER,
      `Request the login code in Telegram for <code>${escapeHtml(row.phone ?? "")}</code>, wait a few seconds, then tap again.`,
    ].join("\n"), { reply_markup: ik([[{ text: "🔁 Check again", callback_data: `tg:otp:${itemId}` }]]) });
  }
  return sendMessage(chatId, [
    "<b>📨 LOGIN CODE</b>",
    DIVIDER,
    `📞 <code>${escapeHtml(row.phone ?? "")}</code>`,
    `🔑 <b>Code</b> · <code>${escapeHtml(code)}</code>`,
    DIVIDER,
    "<i>Tap the code to copy it.</i>",
  ].join("\n"), { reply_markup: ik([[{ text: "🔄 Reset Other Sessions", callback_data: `tg:rs:${itemId}` }]]) });
}

export async function tgReset(chatId: number, itemId: number) {
  const row = await owns(chatId, itemId);
  if (!row) return sendMessage(chatId, "🚫 This account is not in your purchases.");
  try {
    await resetSessions(itemId);
    return sendMessage(chatId, "✅ <b>All other sessions terminated.</b> The account is now only logged in on your device.");
  } catch {
    return sendMessage(chatId, "⚠️ Could not reset sessions right now. Please try again in a moment.", {
      reply_markup: ik([[{ text: "🔁 Retry", callback_data: `tg:rs:${itemId}` }]]),
    });
  }
}

export async function showMyTg(ctx: Ctx, page: number) {
  const size = 8;
  const { data, count } = await supabaseAdmin
    .from("bot_tg_accounts")
    .select("item_id, phone, country, charge, created_at", { count: "exact" })
    .eq("telegram_id", ctx.chatId)
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);
  const total = count ?? 0;
  if (!total) {
    return show(ctx, "<b>📂 My TG Accounts</b>\n" + DIVIDER + "\nYou have not bought any accounts yet.", [
      [{ text: "📱 Browse Accounts", callback_data: "tg" }, { text: "🏠 Home", callback_data: "home" }],
    ]);
  }
  const rows: InlineKeyboard = (data ?? []).map((r) => [{
    text: `${flagOf(r.country ?? "")} ${r.phone ?? r.item_id} · ${money(Number(r.charge))}`,
    callback_data: `tg:acc:${r.item_id}`,
  }]);
  const pages = Math.max(1, Math.ceil(total / size));
  const nav: InlineKeyboard[number] = [];
  if (page > 0) nav.push({ text: "◀️", callback_data: `tg:my:${page - 1}` });
  nav.push({ text: `${page + 1}/${pages}`, callback_data: "noop" });
  if (page < pages - 1) nav.push({ text: "▶️", callback_data: `tg:my:${page + 1}` });
  rows.push(nav, [{ text: "📱 Buy More", callback_data: "tg" }, { text: "🏠 Home", callback_data: "home" }]);
  await show(ctx, `<b>📂 My TG Accounts</b>\n${DIVIDER}\nTotal purchased · <code>${total}</code>\nTap an account for login code & session reset.`, rows);
}

export async function showMyTgAccount(ctx: Ctx, itemId: number) {
  const row = await owns(ctx.chatId, itemId);
  if (!row) return;
  await show(ctx, `<b>📱 Your Account</b>\n${DIVIDER}\n📞 <code>${escapeHtml(row.phone ?? "")}</code>`, accountKeyboard(itemId));
}

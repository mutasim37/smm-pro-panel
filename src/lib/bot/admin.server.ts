// Admin control panel. Only reachable by chat ids listed in BOT_ADMIN_CHAT_ID.
import { currentBot } from "./scope.server";
import { adminChatIds, BRAND, EFFECTS, setBotAccess, currencies, type CurrencyCode } from "./config.server";
import { escapeHtml, ik, sendMessage, sendPhoto, type InlineKeyboard } from "./telegram.server";
import { BANNERS } from "./assets.server";
import { DIVIDER, usd } from "./views.server";
import { supabaseAdmin, setState } from "./store.server";
import { providerBalance } from "./smmgen.server";
import { getCatalog } from "./catalog.server";
import { getSettings } from "./settings.server";
import { supplierBalance } from "./phoenix.server";

export function isAdmin(chatId: number): boolean {
  return adminChatIds().includes(chatId);
}

let accessAt = 0;
export async function loadBotAccess() {
  if (Date.now() - accessAt < 30000) return;
  const [{ data: roles, error }, { data: support }] = await Promise.all([
    supabaseAdmin.from("bot_admin_roles").select("telegram_id").eq("role", "admin"),
    supabaseAdmin.from("bot_secrets").select("value").eq("name", "support_username").maybeSingle(),
  ]);
  if (error) throw new Error("Unable to verify administrator access.");
  setBotAccess((roles ?? []).map((r) => Number(r.telegram_id)), support?.value ?? "Frreohi");
  accessAt = Date.now();
}

export function adminKeyboard(): InlineKeyboard {
  const switches: InlineKeyboard = [[{text:"Frrr SMM",url:"https://t.me/Frrrsmm_bot"},{text:"Frrr TG",url:"https://t.me/Frrrtg_bot"},{text:"Frrr SMS",url:"https://t.me/Frrrsms_bot"}]];
  if(currentBot()==="sms") return [[{text:"👥 Users",callback_data:"a:users"},{text:"📊 Statistics",callback_data:"a:stats"}],[{text:"📲 SMS Orders",callback_data:"a:orders"},{text:"🏦 Supplier",callback_data:"a:provider"}],[{text:"💵 Balance",callback_data:"a:bal"},{text:"💰 Deposits",callback_data:"a:deposits"}],[{text:"⚙ Pricing",callback_data:"a:pricing"},{text:"🔄 Refresh",callback_data:"a:refresh"}],[{text:"📣 Broadcast",callback_data:"a:broadcast"},{text:"🎫 Reports",callback_data:"a:tickets"}],[{text:"🎁 Referrals",callback_data:"a:ref"},{text:"📢 Force Channel",callback_data:"a:ch"}],...switches,[{text:"🏠 Home",callback_data:"home"}]];
  return [
    [
      { text: "👥 Users", callback_data: "a:users" },
      { text: "📊 Statistics", callback_data: "a:stats" },
    ],
    [
      { text: "📦 Orders", callback_data: "a:orders" },
      { text: "💰 Deposits", callback_data: "a:deposits" },
    ],
    [
      { text: "🎫 Reports", callback_data: "a:tickets" },
      { text: "🏦 Provider Balance", callback_data: "a:provider" },
    ],
    [
      { text: "📣 Broadcast", callback_data: "a:broadcast" },
      { text: "♻️ Refresh Catalog", callback_data: "a:refresh" },
    ],
    [
      { text: "⚙️ Pricing & Markup", callback_data: "a:pricing" },
      { text: "📱 TG Store", callback_data: "a:tgstore" },
    ],
    [
      { text: "⚡ Extension Store", callback_data: "a:ext" },
    ],
    [
      { text: "🔥 Popular Pins", callback_data: "a:pop" },
      { text: "📢 Force Channel", callback_data: "a:ch" },
    ],
    [
      { text: "🎁 Referrals", callback_data: "a:ref" },
      { text: "🎟 Coupons", callback_data: "a:coupons" },
      { text: "💵 Add / Deduct Balance", callback_data: "a:bal" },
    ],
    ...switches,
    [{ text: "🏠 Exit to Home", callback_data: "home" }],
  ];
}

export async function sendAdminPanel(chatId: number) {
  const caption = [
    "<b>🛡 ADMIN CONTROL CENTER</b>",
    DIVIDER,
    `Panel · <b>${BRAND.name}</b>`,
    "Full live control over users, orders, deposits and broadcasts.",
    DIVIDER,
    "<blockquote>All actions are logged. Handle with care.</blockquote>",
  ].join("\n");

  const sent = await sendPhoto(chatId, BANNERS.admin, caption, {
    reply_markup: ik(adminKeyboard()),
    message_effect_id: EFFECTS.fire,
  });
  if (sent) return sent;
  return sendMessage(chatId, caption, { reply_markup: ik(adminKeyboard()) });
}

function backRow(): InlineKeyboard {
  return [[{ text: "⬅️ Admin Panel", callback_data: "a:panel" }, { text: "🏠 Home", callback_data: "home" }]];
}

async function countSince(table: "bot_orders" | "bot_deposits" | "bot_users", isoDate: string) {
  const query = supabaseAdmin.from(table).select("*", { count: "exact", head: true }).gte("created_at", isoDate);
  const { count } = await query;
  return count ?? 0;
}

export async function adminStats(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const dayStart = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [{ count: users }, { count: orders }, todayUsers, todayOrders, todayDeposits, sums] =
    await Promise.all([
      supabaseAdmin.from("bot_users").select("*", { count: "exact", head: true }),
      currentBot() === "sms" ? supabaseAdmin.from("bot3_sms_orders").select("*", { count: "exact", head: true }) : supabaseAdmin.from("bot_orders").select("*", { count: "exact", head: true }),
      countSince("bot_users", dayStart),
      currentBot() === "sms" ? supabaseAdmin.from("bot3_sms_orders").select("*",{count:"exact",head:true}).gte("created_at",dayStart).then(r=>r.count??0) : countSince("bot_orders", dayStart),
      countSince("bot_deposits", dayStart),
      supabaseAdmin.from("bot_users").select("balance, total_deposited, total_spent"),
    ]);

  const rows = (sums.data ?? []) as { balance: number; total_deposited: number; total_spent: number }[];
  const totals = rows.reduce(
    (acc, row) => ({
      balance: acc.balance + Number(row.balance),
      deposited: acc.deposited + Number(row.total_deposited),
      spent: acc.spent + Number(row.total_spent),
    }),
    { balance: 0, deposited: 0, spent: 0 },
  );

  const text = [
    "<b>📊 Live Statistics</b>",
    DIVIDER,
    `👥 <b>Total users</b> · <code>${users ?? 0}</code>`,
    `📦 <b>Total orders</b> · <code>${orders ?? 0}</code>`,
    "",
    "<b>Last 24 hours</b>",
    `🆕 New users · <code>${todayUsers}</code>`,
    `🛍 Orders · <code>${todayOrders}</code>`,
    `💰 Deposits · <code>${todayDeposits}</code>`,
    "",
    "<b>Money</b>",
    `💳 Wallet liability · <code>${usd(totals.balance)}</code>`,
    `⬆️ Lifetime deposits · <code>${usd(totals.deposited)}</code>`,
    `⬇️ Lifetime spend · <code>${usd(totals.spent)}</code>`,
    DIVIDER,
  ].join("\n");

  return { text, keyboard: backRow() };
}

export async function adminUsers(page = 0): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const size = 10;
  const { data, count } = await supabaseAdmin
    .from("bot_users")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);

  const lines = ["<b>👥 Users</b>", DIVIDER];
  for (const user of (data ?? []) as any[]) {
    lines.push(
      `<b>${escapeHtml(user.first_name ?? "User")}</b> ${user.username ? "@" + escapeHtml(user.username) : ""}`,
      `   🆔 <code>${user.telegram_id}</code> · 💰 <code>${usd(Number(user.balance))}</code> · ⬇️ <code>${usd(Number(user.total_spent))}</code>`,
    );
  }
  if (!data?.length) lines.push("<i>No users yet.</i>");
  lines.push(DIVIDER, `Total · <code>${count ?? 0}</code>`);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / size));
  const nav: InlineKeyboard[number] = [];
  if (page > 0) nav.push({ text: "◀️", callback_data: `a:users:${page - 1}` });
  nav.push({ text: `${page + 1}/${totalPages}`, callback_data: "noop" });
  if (page < totalPages - 1) nav.push({ text: "▶️", callback_data: `a:users:${page + 1}` });

  return { text: lines.join("\n"), keyboard: [nav, ...backRow()] };
}

export async function adminOrders(page = 0): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const size = 8;
  const { data, count } = await supabaseAdmin
    .from("bot_orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);

  const lines = ["<b>📦 Latest Orders</b>", DIVIDER];
  for (const order of (data ?? []) as any[]) {
    lines.push(
      `#${order.provider_order_id ?? "—"} · <code>${usd(Number(order.charge))}</code> · ${escapeHtml(order.status)}`,
      `   👤 <code>${order.telegram_id}</code> · ${escapeHtml(String(order.service_name).slice(0, 48))}`,
    );
  }
  if (!data?.length) lines.push("<i>No orders yet.</i>");
  lines.push(DIVIDER, `Total · <code>${count ?? 0}</code>`);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / size));
  const nav: InlineKeyboard[number] = [];
  if (page > 0) nav.push({ text: "◀️", callback_data: `a:orders:${page - 1}` });
  nav.push({ text: `${page + 1}/${totalPages}`, callback_data: "noop" });
  if (page < totalPages - 1) nav.push({ text: "▶️", callback_data: `a:orders:${page + 1}` });

  return { text: lines.join("\n"), keyboard: [nav, ...backRow()] };
}

export async function adminDeposits(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const { data } = await supabaseAdmin
    .from("bot_deposits")
    .select("*")
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(10);

  const lines = ["<b>💰 Recent Confirmed Deposits</b>", DIVIDER];
  for (const dep of (data ?? []) as any[]) {
    lines.push(
      `<code>${usd(Number(dep.amount_credited))}</code> · 👤 <code>${dep.telegram_id}</code>`,
      `   🔗 <code>${String(dep.tx_hash).slice(0, 18)}…</code>`,
    );
  }
  if (!data?.length) lines.push("<i>No confirmed deposits yet.</i>");
  return { text: lines.join("\n"), keyboard: backRow() };
}

export async function adminTickets(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const { data } = await supabaseAdmin
    .from("bot_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  const lines = ["<b>🎫 Reports & Messages</b>", DIVIDER];
  for (const ticket of (data ?? []) as any[]) {
    lines.push(
      `👤 <code>${ticket.telegram_id}</code> · ${new Date(ticket.created_at).toISOString().slice(0, 16).replace("T", " ")}`,
      `<blockquote>${escapeHtml(String(ticket.message).slice(0, 300))}</blockquote>`,
    );
  }
  if (!data?.length) lines.push("<i>No reports.</i>");
  return { text: lines.join("\n"), keyboard: backRow() };
}

export async function adminProvider(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  try {
    const balance = await providerBalance();
    return {
      text: [
        "<b>🏦 Supply Account</b>",
        DIVIDER,
        `Available · <code>${Number(balance.balance).toFixed(4)} ${balance.currency}</code>`,
        DIVIDER,
        "<blockquote>Keep this funded — orders fail when it runs dry.</blockquote>",
      ].join("\n"),
      keyboard: backRow(),
    };
  } catch (error) {
    return { text: `⚠️ Could not read supply balance.\n<code>${escapeHtml(String(error))}</code>`, keyboard: backRow() };
  }
}

export async function adminRefreshCatalog(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const catalog = await getCatalog(true);
  return {
    text: [
      "<b>♻️ Catalog Refreshed</b>",
      DIVIDER,
      `🛍 Services · <code>${catalog.services.size}</code>`,
      `🗂 Categories · <code>${catalog.categories.length}</code>`,
      DIVIDER,
    ].join("\n"),
    keyboard: backRow(),
  };
}

export async function startBroadcast(chatId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  await setState(chatId, "await_broadcast", {});
  return {
    text: [
      "<b>📣 Broadcast</b>",
      DIVIDER,
      "Send the message now and it will be delivered to every user.",
      "Send /cancel to abort.",
    ].join("\n"),
    keyboard: backRow(),
  };
}

export async function startBalanceAdjust(chatId: number, code?: CurrencyCode): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!code) {
    await setState(chatId, "await_admin_bal_currency", {});
    return {
      text: `<b>💵 Manual Balance Adjustment</b>\n${DIVIDER}\nChoose the currency for this adjustment.`,
      keyboard: [
        [{text:"🇧🇩 BDT · Taka",callback_data:"a:balBDT"},{text:"🇮🇳 INR · Rupee",callback_data:"a:balINR"}],
        [{text:"🇺🇸 USD · Dollar",callback_data:"a:balUSD"}],
        ...backRow(),
      ],
    };
  }
  const currency = currencies()[code];
  await setState(chatId, "await_admin_bal", {currency: code, rate: currency.rate});
  return {
    text: [
      "<b>💵 Manual Balance Adjustment</b>",
      DIVIDER,
      `Send the user ID and the amount in <b>${code}</b>, separated by a space.`,
      "",
      `<blockquote>Add ${currency.symbol}100:  <code>123456789 100</code>\nDeduct ${currency.symbol}50:  <code>123456789 -50</code></blockquote>`,
      `Exchange rate · 1 USD = ${currency.rate} ${code}`,
      "",
      "Send /cancel to abort.",
    ].join("\n"),
    keyboard: [[{text:"💱 Change currency",callback_data:"a:bal"}],...backRow()],
  };
}

export async function runBroadcast(html: string): Promise<number> {
  const { data } = await supabaseAdmin.from("bot_users").select("telegram_id").eq("is_banned", false);
  let delivered = 0;
  for (const row of (data ?? []) as { telegram_id: number }[]) {
    const ok = await sendMessage(row.telegram_id, html);
    if (ok) delivered += 1;
  }
  return delivered;
}

export async function notifyAdmins(text: string, effect?: string) {
  for (const id of adminChatIds()) {
    await sendMessage(id, text, effect ? { message_effect_id: effect } : {});
  }
}

export async function adminPricing(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const settings = await getSettings();
  return {
    text: [
      "<b>⚙️ Pricing & Markup</b>",
      DIVIDER,
      `🛍 <b>SMM services markup</b> · <code>${settings.smm_markup_pct}%</code>`,
      `📱 <b>TG account multiplier</b> · <code>${settings.tg_multiplier}×</code>`,
      DIVIDER,
      `<blockquote>Example: supplier price $1.00 → SMM <code>$${(1 + settings.smm_markup_pct / 100).toFixed(2)}</code> · TG <code>$${settings.tg_multiplier.toFixed(2)}</code></blockquote>`,
    ].join("\n"),
    keyboard: [
      [{ text: "✏️ Edit SMM %", callback_data: "a:psmm" }, { text: "✏️ Edit TG ×", callback_data: "a:ptg" }],
      ...backRow(),
    ],
  };
}

export async function startPricingEdit(chatId: number, which: "smm" | "tg"): Promise<{ text: string; keyboard: InlineKeyboard }> {
  await setState(chatId, which === "smm" ? "await_admin_smm" : "await_admin_tg", {});
  return {
    text: which === "smm"
      ? "<b>✏️ SMM Markup</b>\n" + DIVIDER + "\nSend the new markup <b>percent</b>, e.g. <code>40</code> (= supplier price + 40%).\nSend /cancel to abort."
      : "<b>✏️ TG Account Multiplier</b>\n" + DIVIDER + "\nSend the new <b>multiplier</b>, e.g. <code>3</code> (supplier ৳10 → ৳30).\nSend /cancel to abort.",
    keyboard: backRow(),
  };
}

export async function adminTgStore(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const [balance, sales] = await Promise.all([
    supplierBalance().catch(() => null),
    supabaseAdmin.from("bot_tg_accounts").select("phone, country, charge, cost, telegram_id, created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const rows = (sales.data ?? []) as { phone: string | null; country: string | null; charge: number; cost: number | null; telegram_id: number; created_at: string }[];
  const revenue = rows.reduce((t, r) => t + Number(r.charge), 0);
  const cost = rows.reduce((t, r) => t + Number(r.cost ?? 0), 0);
  const lines = [
    "<b>📱 TG Account Store</b>",
    DIVIDER,
    `🏦 <b>Supplier balance</b> · <code>${balance === null ? "unavailable" : usd(balance)}</code>`,
    `🧾 <b>Accounts sold</b> · <code>${rows.length}</code>`,
    `💵 <b>Revenue</b> · <code>${usd(revenue)}</code> · <b>Profit</b> · <code>${usd(revenue - cost)}</code>`,
    DIVIDER,
    "<b>Latest sales</b>",
  ];
  for (const r of rows.slice(0, 10)) {
    lines.push(`• <code>${escapeHtml(r.phone ?? "—")}</code> ${escapeHtml(r.country ?? "")} · ${usd(Number(r.charge))} · <code>${r.telegram_id}</code>`);
  }
  if (!rows.length) lines.push("<i>No sales yet.</i>");
  lines.push(DIVIDER, "<blockquote>Keep the supplier wallet funded — purchases fail when it runs dry.</blockquote>");
  return { text: lines.join("\n"), keyboard: backRow() };
}

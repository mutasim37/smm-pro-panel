// Core bot brain: routing, menus, order flow, wallet flow.
import { BRAND, EFFECTS, depositAddress, PAYMENT_WINDOW_MINUTES, supportUsername, isCurrency, currencies } from "./config.server";
import { syncOrder, FINAL_STATUSES, type OrderRow } from "./orders.server";
import { channelDraft, publishProduct, productRef, type ProductRef } from "./channel-posts.server";
import {
  answerCallback,
  escapeHtml,
  ik,
  sendChatAction,
  sendMessage,
  sendPhoto,
  editMessage,
  tg,
  type InlineKeyboard,
} from "./telegram.server";
import { BANNERS } from "./assets.server";
import {
  getCatalog,
  needsComments,
  isQuantityFree,
  platformMeta,
  priceFor,
  type Service,
} from "./catalog.server";
import { placeOrder } from "./smmgen.server";
import { verifyUsdtDeposit, looksLikeTxHash } from "./bsc.server";
import { bkashNumber, claimBkash, looksLikeTrxId } from "./bkash.server";
import { buyTgAccount, showMyTg, showMyTgAccount, showTgCountries, showTgItem, showTgList, tgOtp, tgReset } from "./tgshop.server";
import { setSetting } from "./settings.server";
import { adminChannel, adminPopular, adminReferrals, attachReferrer, isJoined, joinGate, popularIds, productLink, referralView, rewardReferrer, setForceChannel, shareUrl, togglePin } from "./growth.server";
import { addPackageFromText, adminExtStore, buyExtension, deletePackage, downloadExtension, listPackages, priceUsd, showExtGuide, showExtPackage, showExtStore, showMyLicenses, startExtAdd } from "./ext.server";
import {
  adjustBalance,
  clearState,
  getState,
  getUser,
  setState,
  setCurrency,
  supabaseAdmin,
  upsertUser,
  type BotUser,
} from "./store.server";
import {
  DIVIDER,
  aboutText,
  currencyKeyboard,
  currencyPickerText,
  currencyScope,
  progressBar,
  statusMeta,
  usd,
  fundsText,
  invoiceText,
  mainKeyboard,
  money,
  pager,
  platformKeyboard,
  profileText,
  qrUrl,
  serviceCard,
  summaryText,
  supportText,
  welcomeText,
} from "./views.server";
import {
  adminDeposits,
  adminOrders,
  adminProvider,
  adminRefreshCatalog,
  adminStats,
  adminTickets,
  adminUsers,
  isAdmin,
  loadBotAccess,
  notifyAdmins,
  runBroadcast,
  sendAdminPanel,
  startBroadcast,
  startBalanceAdjust,
  adminPricing,
  startPricingEdit,
  adminTgStore,
} from "./admin.server";

const PAGE_SIZE = 10;

type Ctx = {
  chatId: number;
  messageId?: number;
  fromPhoto?: boolean;
};

/** Last bot screen per chat (best effort) so a new screen replaces the old one. */
const lastScreen = new Map<number, number>();
const keyboardMessages = new Map<number, number>();

export async function dropMessage(chatId: number, messageId?: number) {
  if (!messageId) return;
  await tg("deleteMessage", { chat_id: chatId, message_id: messageId });
}

function remember(chatId: number, sent: any) {
  if (sent?.message_id) lastScreen.set(chatId, sent.message_id);
}

async function clearLastScreen(chatId: number) {
  const id = lastScreen.get(chatId);
  if (id) {
    lastScreen.delete(chatId);
    await dropMessage(chatId, id);
  }
}

async function respond(ctx: Ctx, text: string, keyboard?: InlineKeyboard) {
  const markup = keyboard ? { reply_markup: ik(keyboard) } : {};
  if (ctx.messageId && !ctx.fromPhoto) {
    const edited = await editMessage(ctx.chatId, ctx.messageId, text, markup);
    if (edited) return remember(ctx.chatId, edited);
  }
  if (ctx.messageId) await dropMessage(ctx.chatId, ctx.messageId);
  else await clearLastScreen(ctx.chatId);
  remember(ctx.chatId, await sendMessage(ctx.chatId, text, markup));
}

async function ordersCount(telegramId: number): Promise<number> {
  const { count } = await supabaseAdmin
    .from("bot_orders")
    .select("*", { count: "exact", head: true })
    .eq("telegram_id", telegramId);
  return count ?? 0;
}

/* ---------------------------------- home ---------------------------------- */

async function showHome(chatId: number, user: BotUser) {
  const orders = await ordersCount(chatId);
  const caption = welcomeText(user.first_name ?? "friend", Number(user.balance), orders);
  await clearLastScreen(chatId);
  // Never delete the active keyboard anchor during product navigation.
  const anchor = await sendMessage(chatId, `<b>${BRAND.name}</b>`, { reply_markup: mainKeyboard(isAdmin(chatId)) });
  if (anchor?.message_id) {
    await dropMessage(chatId, keyboardMessages.get(chatId));
    keyboardMessages.set(chatId, anchor.message_id);
  }
  let sent: any = await sendPhoto(chatId, BANNERS.welcome, caption, {
    message_effect_id: EFFECTS.fire,
  });
  if (!sent) sent = await sendMessage(chatId, caption);
  remember(chatId, sent);
}

/* -------------------------------- catalog -------------------------------- */

async function showPlatforms(ctx: Ctx) {
  const catalog = await getCatalog();
  const counts = new Map<string, number>();
  for (const [key, list] of catalog.byPlatform) counts.set(key, list.length);

  const text = [
    "<b>🛍 Service Catalog</b>",
    DIVIDER,
    `🌍 <b>${catalog.services.size.toLocaleString("en-US")}</b> services · <b>${catalog.categories.length}</b> categories`,
    "",
    "Select a platform to continue.",
    DIVIDER,
    "<blockquote>All prices are in USD and already include our service fee — no hidden charges.</blockquote>",
  ].join("\n");

  await respond(ctx, text, [
    [{ text: "🔍 Search by Code", callback_data: "find" }, { text: "🔥 Popular", callback_data: "pop" }],
    ...platformKeyboard(counts),
  ]);
}

async function showCategories(ctx: Ctx, platformKey: string, page: number) {
  const catalog = await getCatalog();
  const meta = platformMeta(platformKey);
  const indexes = catalog.byPlatform.get(platformKey) ?? [];
  const totalPages = Math.max(1, Math.ceil(indexes.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = indexes.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const rows: InlineKeyboard = slice.map((index) => {
    const name = catalog.categories[index]!;
    const count = catalog.byCategory.get(name)?.length ?? 0;
    return [
      {
        text: `${shorten(name, 52)} · ${count}`,
        callback_data: `ct:${index}:0`,
      },
    ];
  });

  const text = [
    `${meta.emoji} <b>${meta.label}</b>`,
    DIVIDER,
    `🗂 <b>${indexes.length}</b> categories available`,
    "",
    "Pick a category to see the services inside.",
  ].join("\n");

  await respond(ctx, text, [...rows, ...pager(`pl:${platformKey}`, safePage, totalPages, "svc")]);
}

async function showServices(ctx: Ctx, categoryIndex: number, page: number) {
  const catalog = await getCatalog();
  const category = catalog.categories[categoryIndex];
  if (!category) return showPlatforms(ctx);

  const services = catalog.byCategory.get(category) ?? [];
  const platformKey = [...catalog.byPlatform.entries()].find(([, list]) =>
    list.includes(categoryIndex),
  )?.[0] ?? "other";
  const meta = platformMeta(platformKey);

  const totalPages = Math.max(1, Math.ceil(services.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const slice = services.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const rows: InlineKeyboard = slice.map((service) => [
    {
      text: `${money(service.price)} · ${shorten(service.name, 44)}`,
      callback_data: `sv:${service.id}`,
    },
  ]);

  const text = [
    `${meta.emoji} <b>${escapeHtml(category)}</b>`,
    DIVIDER,
    `🛍 <b>${services.length}</b> services · sorted cheapest first`,
    "",
    "Tap a service for full details.",
  ].join("\n");

  await respond(ctx, text, [
    ...rows,
    ...pager(`ct:${categoryIndex}`, safePage, totalPages, `pl:${platformKey}:0`),
  ]);
}

async function showService(ctx: Ctx, serviceId: number) {
  const catalog = await getCatalog();
  const service = catalog.services.get(serviceId);
  if (!service) {
    await respond(ctx, "⚠️ This service is no longer available.", [
      [{ text: "🛍 Services", callback_data: "svc" }, { text: "🏠 Home", callback_data: "home" }],
    ]);
    return;
  }
  const categoryIndex = catalog.categories.indexOf(service.category);
  const platformKey = [...catalog.byPlatform.entries()].find(([, list]) =>
    list.includes(categoryIndex),
  )?.[0] ?? "other";

  const link = await productLink(service.id);
  await respond(ctx, serviceCard(service, platformMeta(platformKey).emoji, link), [
    [{ text: "🚀 Order Now", callback_data: `buy:${service.id}` }],
    [{ text: "📤 Share Product", url: shareUrl(link, service.name) }],
    ...(isAdmin(ctx.chatId) ? [[{ text: "📢 Upload in Channel", callback_data: `post:s:${service.id}` }]] : []),
    [
      { text: "⬅️ Back", callback_data: `ct:${categoryIndex}:0` },
      { text: "🏠 Home", callback_data: "home" },
    ],
  ]);
}

async function askCode(ctx: Ctx) {
  await setState(ctx.chatId, "await_code", {});
  await respond(ctx, ["<b>🔍 Search by Code</b>", DIVIDER, "Send the <b>product code</b> (e.g. <code>1250</code>).", "", "<i>You can find it on every product page.</i>"].join("\n"), [
    [{ text: "🔥 Popular", callback_data: "pop" }, { text: "✖️ Cancel", callback_data: "cancel" }],
  ]);
}

async function showPopular(ctx: Ctx) {
  const catalog = await getCatalog();
  const ids = await popularIds(20);
  const rows: InlineKeyboard = ids.map((id) => {
    const s = catalog.services.get(id)!;
    return [{ text: `${money(s.price)} · ${shorten(s.name, 44)}`, callback_data: `sv:${s.id}` }];
  });
  await respond(ctx, ["<b>🔥 Popular Services</b>", DIVIDER, ids.length ? "Our best-sellers and staff picks — fast, reliable and easy to order." : "No popular services yet. Browse the catalog to get started."].join("\n"), [
    ...rows,
    [{ text: "🔍 Search by Code", callback_data: "find" }, { text: "🛍 All Services", callback_data: "svc" }],
    [{ text: "🏠 Home", callback_data: "home" }],
  ]);
}

/** Shorten by code points so emoji are never split (split surrogates break Telegram buttons). */
function shorten(text: string, max: number): string {
  const clean = text
    .replace(/&amp;/g, "&")
    .replace(/[ᴺᴱᵂ]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(clean);
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : clean;
}

/* ------------------------------- order flow ------------------------------- */

async function startOrder(ctx: Ctx, serviceId: number) {
  const catalog = await getCatalog();
  const service = catalog.services.get(serviceId);
  if (!service) return showPlatforms(ctx);

  await setState(ctx.chatId, "await_link", { serviceId });
  await respond(
    ctx,
    [
      "<b>🔗 Step 1 of 3 — Target Link</b>",
      DIVIDER,
      `🛍 ${escapeHtml(service.name)}`,
      "",
      "Send the <b>post / profile / video link</b> for this order.",
      "",
      "<blockquote>Make sure the account is public and the link opens correctly. A wrong link cannot be refunded once the order starts.</blockquote>",
      "",
      "Send /cancel to abort.",
    ].join("\n"),
    [[{ text: "✖️ Cancel", callback_data: "cancel" }]],
  );
}

async function askComments(chatId: number, service: Service) {
  await sendMessage(
    chatId,
    [
      "<b>💬 Step 2 of 3 — Custom Comments</b>",
      DIVIDER,
      "Send your comments now — <b>one comment per line</b>.",
      "",
      "<blockquote>Example:\nGreat post 🔥\nLove this\nAmazing work</blockquote>",
      "",
      `The quantity will match the number of lines you send (min ${service.min}).`,
    ].join("\n"),
    { reply_markup: ik([[{ text: "✖️ Cancel", callback_data: "cancel" }]]) },
  );
}

async function askQuantity(chatId: number, service: Service) {
  await sendMessage(
    chatId,
    [
      "<b>🔢 Step 3 of 3 — Quantity</b>",
      DIVIDER,
      `📉 Minimum · <code>${service.min.toLocaleString("en-US")}</code>`,
      `📈 Maximum · <code>${service.max.toLocaleString("en-US")}</code>`,
      `💵 Rate · <code>${money(service.price)} / 1000</code>`,
      "",
      "Send the quantity you need as a number.",
    ].join("\n"),
    { reply_markup: ik([[{ text: "✖️ Cancel", callback_data: "cancel" }]]) },
  );
}

async function showSummary(chatId: number, draft: { serviceId: number; link: string; quantity: number; comments?: string | undefined }) {
  const catalog = await getCatalog();
  const service = catalog.services.get(draft.serviceId);
  const user = await getUser(chatId);
  if (!service || !user) return;

  const charge = priceFor(service, draft.quantity);
  await setState(chatId, "confirm", { ...draft, charge });

  const rows: InlineKeyboard = [];
  if (Number(user.balance) >= charge) {
    rows.push([{ text: `💰 Pay from Wallet (${money(charge)})`, callback_data: "pay:w" }]);
  }
  rows.push([{ text: "📱 Direct Pay with bKash", callback_data: "pay:b" }]);
  rows.push([{ text: "🪙 Direct Pay with USDT", callback_data: "pay:d" }]);
  rows.push([{ text: "✖️ Cancel", callback_data: "cancel" }]);

  await sendMessage(
    chatId,
    summaryText({
      serviceName: service.name,
      link: draft.link,
      quantity: draft.quantity,
      charge,
      balance: Number(user.balance),
      comments: draft.comments,
    }),
    { reply_markup: ik(rows) },
  );
}

async function submitOrder(
  chatId: number,
  draft: { serviceId: number; link: string; quantity: number; comments?: string | undefined; charge: number },
) {
  const catalog = await getCatalog();
  const service = catalog.services.get(draft.serviceId);
  const user = await getUser(chatId);
  if (!service || !user) return;

  if (Number(user.balance) + 0.00001 < draft.charge) {
    await sendMessage(chatId, "⚠️ Wallet balance is not enough. Please top up and try again.", {
      reply_markup: ik([[{ text: "💳 Add Funds", callback_data: "dep" }]]),
    });
    return;
  }

  await sendChatAction(chatId);
  const balanceAfter = await adjustBalance(chatId, -draft.charge);

  const { data: row } = await supabaseAdmin
    .from("bot_orders")
    .insert({
      telegram_id: chatId,
      service_id: service.id,
      service_name: service.name,
      category: service.category,
      link: draft.link,
      quantity: draft.quantity,
      comments: draft.comments ?? null,
      charge: draft.charge,
      status: "processing",
    })
    .select("id")
    .single();

  try {
    const result = await placeOrder({
      service: service.id,
      link: draft.link,
      quantity: draft.comments ? undefined : draft.quantity,
      comments: draft.comments,
    });

    if (!result.order) throw new Error(result.error ?? "Order rejected");

    await supabaseAdmin
      .from("bot_orders")
      .update({ provider_order_id: String(result.order), status: "in progress", updated_at: new Date().toISOString() })
      .eq("id", row?.id ?? "");

    await clearState(chatId);
    await sendMessage(
      chatId,
      [
        "<b>✅ ORDER CONFIRMED</b>",
        DIVIDER,
        `🆔 <b>Order ID</b> · <code>${result.order}</code>`,
        `🛍 ${escapeHtml(service.name)}`,
        `🔢 Quantity · <code>${draft.quantity.toLocaleString("en-US")}</code>`,
        `💵 Charged · <code>${money(draft.charge)}</code>`,
        `💰 New balance · <code>${money(balanceAfter)}</code>`,
        DIVIDER,
        "Your order is now running. Track it any time from <b>My Orders</b>.",
      ].join("\n"),
      {
        message_effect_id: EFFECTS.party,
        reply_markup: ik([
          [{ text: "📄 Track Order", callback_data: `od:${row?.id ?? ""}` }],
          [{ text: "🛍 Order More", callback_data: "svc" }, { text: "🏠 Home", callback_data: "home" }],
        ]),
      },
    );

    await rewardReferrer(chatId, draft.charge).catch(() => null);
    await notifyAdmins(
      [
        "<b>🛒 NEW ORDER</b>",
        DIVIDER,
        `👤 <code>${chatId}</code> ${user.username ? "@" + escapeHtml(user.username) : ""}`,
        `🆔 <code>${result.order}</code>`,
        `🛍 ${escapeHtml(service.name)}`,
        `🔢 <code>${draft.quantity}</code> · 💵 <code>${usd(draft.charge)}</code>`,
      ].join("\n"),
    );
  } catch (error) {
    await adjustBalance(chatId, draft.charge);
    await supabaseAdmin
      .from("bot_orders")
      .update({ status: "failed", error: String(error), updated_at: new Date().toISOString() })
      .eq("id", row?.id ?? "");
    await clearState(chatId);
    await sendMessage(
      chatId,
      [
        "<b>⚠️ Order could not be placed</b>",
        DIVIDER,
        "Your balance has been fully refunded — nothing was lost.",
        `<blockquote>${escapeHtml(String(error).replace(/^Error:\s*/, "")).slice(0, 300)}</blockquote>`,
        `Need help? Contact @${supportUsername()}`,
      ].join("\n"),
      { reply_markup: ik([[{ text: "🛍 Services", callback_data: "svc" }, { text: "🏠 Home", callback_data: "home" }]]) },
    );
    await notifyAdmins(`⚠️ <b>Order failed</b> for <code>${chatId}</code>\n<code>${escapeHtml(String(error)).slice(0, 300)}</code>`);
  }
}

/* -------------------------------- my orders ------------------------------- */

async function showMyOrders(ctx: Ctx, page: number) {
  const size = 8;
  const { data, count } = await supabaseAdmin
    .from("bot_orders")
    .select("id, provider_order_id, service_name, status, charge, quantity, created_at", { count: "exact" })
    .eq("telegram_id", ctx.chatId)
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);

  const orders = (data ?? []) as any[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const active = orders.filter((o) => !FINAL_STATUSES.includes(String(o.status).toLowerCase())).length;

  const lines = [
    "<b>🧾 Recent Orders</b>",
    DIVIDER,
    `Total <code>${total}</code>  ·  Active on this page <code>${active}</code>`,
    "",
  ];
  if (!orders.length) {
    lines.push("<i>You have not placed any orders yet.</i>");
  } else {
    lines.push("Tap an order to track it live, refresh its status or order it again.");
  }
  lines.push(DIVIDER);

  const rows: InlineKeyboard = orders.map((order) => {
    const meta = statusMeta(order.status);
    return [
      {
        text: `${meta.icon} #${order.provider_order_id ?? "—"} · ${money(Number(order.charge))} · ${shorten(order.service_name, 28)}`,
        callback_data: `od:${order.id}`,
      },
    ];
  });
  if (!orders.length) rows.push([{ text: "🛍 Browse Services", callback_data: "svc" }]);
  rows.push([{ text: "📂 My TG Accounts", callback_data: "tg:my:0" }, { text: "🔑 My Licenses", callback_data: "ext:my" }]);

  await respond(ctx, lines.join("\n"), [...rows, ...pager("ord", page, totalPages, "home")]);
}

async function loadOrder(chatId: number, id: string): Promise<OrderRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin
    .from("bot_orders")
    .select("*")
    .eq("id", id)
    .eq("telegram_id", chatId)
    .maybeSingle();
  return (data as unknown as OrderRow) ?? null;
}

async function showOrderDetail(ctx: Ctx, id: string, forceRefresh: boolean) {
  let order = await loadOrder(ctx.chatId, id);
  if (!order) {
    return respond(ctx, "⚠️ Order not found.", [[{ text: "🧾 Recent Orders", callback_data: "ord:0" }]]);
  }

  const isFinal = FINAL_STATUSES.includes(String(order.status).toLowerCase());
  if (order.provider_order_id && (forceRefresh || !isFinal)) {
    try {
      order = await syncOrder(order, false);
    } catch (error) {
      console.error("[orders] sync failed", error);
    }
  }

  const meta = statusMeta(order.status);
  const remains = Number(order.remains ?? order.quantity);
  const delivered = String(order.status).toLowerCase() === "completed"
    ? order.quantity
    : Math.max(0, order.quantity - (Number.isFinite(remains) ? remains : order.quantity));
  const time = new Date().toISOString().slice(11, 19);

  const lines = [
    `<b>📄 Order #${escapeHtml(order.provider_order_id ?? "pending")}</b>`,
    DIVIDER,
    `${meta.icon} <b>${meta.label}</b>`,
    `<code>${progressBar(delivered, order.quantity)}</code>`,
    "",
    `🛍 <b>Service</b> · ${escapeHtml(shorten(order.service_name, 90))}`,
    `🔗 <b>Link</b> · <code>${escapeHtml(order.link)}</code>`,
    `🔢 <b>Quantity</b> · <code>${order.quantity.toLocaleString("en-US")}</code>`,
    `▶️ <b>Start count</b> · <code>${order.start_count ?? "—"}</code>`,
    `⏳ <b>Remaining</b> · <code>${order.remains ?? "—"}</code>`,
    `💵 <b>Charged</b> · <code>${money(Number(order.charge))}</code>`,
  ];
  if (Number(order.refunded) > 0) lines.push(`💰 <b>Refunded</b> · <code>${money(Number(order.refunded))}</code>`);
  lines.push(
    `📅 <b>Placed</b> · <code>${new Date(order.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC</code>`,
    DIVIDER,
    `<i>Last updated ${time} UTC · status updates automatically</i>`,
  );

  await respond(ctx, lines.join("\n"), [
    [
      { text: "🔄 Refresh", callback_data: `od:${order.id}:r` },
      { text: "🔁 Order Again", callback_data: `re:${order.id}` },
    ],
    [
      { text: "⬅️ Orders", callback_data: "ord:0" },
      { text: "🏠 Home", callback_data: "home" },
    ],
  ]);
}

async function orderAgain(ctx: Ctx, id: string) {
  const order = await loadOrder(ctx.chatId, id);
  const catalog = await getCatalog();
  const service = order ? catalog.services.get(order.service_id) : undefined;
  if (!order || !service) {
    return respond(ctx, "⚠️ This service is no longer available. Please pick another one.", [
      [{ text: "🛍 Browse Services", callback_data: "svc" }, { text: "🏠 Home", callback_data: "home" }],
    ]);
  }
  const quantity = Math.min(Math.max(order.quantity, service.min), service.max);
  await showSummary(ctx.chatId, {
    serviceId: service.id,
    link: order.link,
    quantity,
    ...(order.comments ? { comments: order.comments } : {}),
  });
}

/* --------------------------------- wallet --------------------------------- */

async function showFunds(ctx: Ctx) {
  const user = await getUser(ctx.chatId);
  const address = depositAddress();
  await respond(ctx, fundsText(Number(user?.balance ?? 0), address), [
    [{ text: "💎 USDT (BEP20)", callback_data: "dep:new" }, { text: "📱 bKash (BDT)", callback_data: "dep:bk" }],
    [{ text: "🏠 Home", callback_data: "home" }],
  ]);
}

/* ---------------------------------- bKash --------------------------------- */

async function askBkashAmount(ctx: Ctx) {
  await setState(ctx.chatId, "await_bk_amount", {});
  await respond(
    ctx,
    [
      "<b>📱 bKash Deposit</b>",
      DIVIDER,
      "How much would you like to add? Send the amount in <b>Taka (BDT)</b>.",
      "",
      "<blockquote>Example: <code>500</code></blockquote>",
    ].join("\n"),
    [[{ text: "✖️ Cancel", callback_data: "cancel" }]],
  );
}

async function showBkashInvoice(chatId: number, amountBdt: number, pendingOrder?: any) {
  await setState(chatId, "await_bk_pay", { amountBdt, ...(pendingOrder ? { pendingOrder } : {}) });
  const rate = currencies().BDT.rate;
  await sendMessage(
    chatId,
    [
      "<b>📱 bKash PAYMENT</b>",
      DIVIDER,
      `💵 <b>Amount</b> · <code>৳${amountBdt.toFixed(2)}</code>`,
      `💰 <b>You receive</b> · <code>$${(amountBdt / rate).toFixed(4)}</code>`,
      "",
      "📲 <b>Send Money to this bKash number:</b>",
      `<code>${bkashNumber()}</code>  <i>(tap to copy)</i>`,
      DIVIDER,
      "<blockquote>1. Send the <b>exact</b> amount above via Send Money.\n2. Tap <b>Submit TrxID</b> and paste the Transaction ID from your bKash SMS.\n3. Your balance is credited instantly.</blockquote>",
    ].join("\n"),
    {
      reply_markup: ik([
        [{ text: "✅ Submit TrxID", callback_data: "dep:bkt" }],
        [{ text: "🆘 Support", url: `https://t.me/${supportUsername()}` }, { text: "✖️ Cancel", callback_data: "cancel" }],
      ]),
    },
  );
}

async function askBkashTrx(ctx: Ctx) {
  const state = await getState(ctx.chatId);
  const amountBdt = Number(state.data["amountBdt"]);
  if (!amountBdt) return askBkashAmount(ctx);
  await setState(ctx.chatId, "await_bk_trx", state.data);
  await sendMessage(
    ctx.chatId,
    [
      "<b>🔍 bKash Verification</b>",
      DIVIDER,
      "Send your <b>bKash TrxID</b> now.",
      "",
      "<blockquote>Example: <code>9A1B2C3D4E</code> · Each TrxID can be used only once.</blockquote>",
    ].join("\n"),
    { reply_markup: ik([[{ text: "✖️ Cancel payment", callback_data: "cancel" }]]) },
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Animated "checking" screen: sends a message, cycles progress frames, then removes it. */
async function withChecking<T>(chatId: number, title: string, task: () => Promise<T>): Promise<T> {
  const frames = [
    `<b>${title}</b>\n\n<code>[□□□□□□□□□□]</code> 0%`,
    `<b>${title}</b>\n\n<code>[■■□□□□□□□□]</code> 20%`,
    `<b>${title}</b>\n\n<code>[■■■■□□□□□□]</code> 40%`,
    `<b>${title}</b>\n\n<code>[■■■■■■□□□□]</code> 60%`,
    `<b>${title}</b>\n\n<code>[■■■■■■■■□□]</code> 80%`,
    `<b>${title}</b>\n\n<code>[■■■■■■■■■■]</code> 100%`,
  ];
  const msg = (await sendMessage(chatId, frames[0]!)) as any;
  const mid: number | undefined = msg?.message_id;
  let done = false;
  const animate = (async () => {
    for (let i = 1; i < frames.length && !done; i++) {
      await sleep(420);
      if (done || !mid) break;
      await tg("editMessageText", {
        chat_id: chatId,
        message_id: mid,
        text: frames[i],
        parse_mode: "HTML",
      }).catch(() => {});
    }
  })();
  try {
    return await task();
  } finally {
    done = true;
    await animate.catch(() => {});
    if (mid) await tg("deleteMessage", { chat_id: chatId, message_id: mid }).catch(() => {});
  }
}

async function verifyBkash(chatId: number, trxId: string, data: Record<string, any>) {
  const amountBdt = Number(data["amountBdt"]);
  await sendChatAction(chatId);
  const result = await withChecking(chatId, "🔍 VERIFYING PAYMENT…", () => claimBkash(chatId, trxId, amountBdt));
  if (!result.ok) {
    const reasons: Record<string, string> = {
      used: "🚫 <b>Transaction already used.</b> This TrxID has already been credited.",
      not_found: "❌ <b>Payment not found.</b> We could not find this TrxID. If you just paid, wait a minute and try again.",
      mismatch: `❌ <b>Amount mismatch.</b> This payment does not match the requested <code>৳${amountBdt.toFixed(2)}</code>.`,
      too_old: "❌ <b>Transaction expired.</b> This payment is older than 72 hours.",
    };
    await sendMessage(
      chatId,
      [reasons[result.reason] ?? "❌ Payment not found.", DIVIDER, `Need help? Contact @${supportUsername()}`].join("\n"),
      {
        reply_markup: ik([
          [{ text: "🔁 Try again", callback_data: "dep:bkt" }],
          [{ text: "🆘 Support", url: `https://t.me/${supportUsername()}` }, { text: "✖️ Cancel", callback_data: "cancel" }],
        ]),
      },
    );
    await setState(chatId, "await_bk_pay", data);
    return;
  }

  const usdAmount = Math.round((result.amount / currencies().BDT.rate) * 10000) / 10000;
  await supabaseAdmin.from("bot_deposits").insert({
    telegram_id: chatId,
    amount_requested: usdAmount,
    amount_credited: usdAmount,
    tx_hash: `bkash:${trxId.toUpperCase()}`,
    status: "confirmed",
    note: `bkash ৳${result.amount}`,
    confirmed_at: new Date().toISOString(),
  });
  const balance = await adjustBalance(chatId, usdAmount);
  const user = await getUser(chatId);
  if (user) {
    await supabaseAdmin
      .from("bot_users")
      .update({ total_deposited: Number(user.total_deposited) + usdAmount })
      .eq("telegram_id", chatId);
  }
  await clearState(chatId);

  await sendMessage(
    chatId,
    [
      "<b>✅ bKash PAYMENT CONFIRMED</b>",
      DIVIDER,
      `📱 <b>Received</b> · <code>৳${result.amount.toFixed(2)}</code>`,
      `💰 <b>New balance</b> · <code>${money(balance)}</code>`,
      `🧾 <code>${trxId.toUpperCase()}</code>`,
      DIVIDER,
      "Thank you — your funds are ready to use.",
    ].join("\n"),
    { message_effect_id: EFFECTS.party },
  );
  await notifyAdmins(
    [
      "<b>💰 NEW bKash DEPOSIT</b>",
      DIVIDER,
      `👤 <code>${chatId}</code> ${user?.username ? "@" + escapeHtml(user.username) : ""}`,
      `📱 <code>৳${result.amount.toFixed(2)}</code> → <code>$${usdAmount.toFixed(4)}</code>`,
      `🧾 <code>${trxId.toUpperCase()}</code>`,
    ].join("\n"),
    EFFECTS.fire,
  );
  if (data["pendingOrder"]) await completePending(chatId, data["pendingOrder"]);
}

async function completePending(chatId: number, pending: any) {
  if (pending?.kind === "tg") return buyTgAccount(chatId, pending);
  if (pending?.kind === "ext") return buyExtension(chatId, pending);
  return submitOrder(chatId, pending);
}

async function askDepositAmount(ctx: Ctx) {
  await setState(ctx.chatId, "await_amount", {});
  await respond(
    ctx,
    [
      "<b>➕ Add Balance</b>",
      DIVIDER,
      "How much would you like to deposit? Send the amount in <b>USD / USDT</b>.",
      "",
      "🚫 <b>No minimum limit</b> — deposit as much or as little as you want.",
      "",
      "<blockquote>Example: <code>10</code> or <code>2.5</code></blockquote>",
    ].join("\n"),
    [[{ text: "✖️ Cancel", callback_data: "cancel" }]],
  );
}

async function sendInvoice(chatId: number, amount: number, purpose: string, pendingOrder?: any) {
  const address = depositAddress();
  const { data } = await supabaseAdmin
    .from("bot_deposits")
    .insert({
      telegram_id: chatId,
      amount_requested: amount,
      status: "pending",
      note: purpose,
      expires_at: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  await setState(chatId, "await_hash", {
    depositId: data?.id,
    amount,
    ...(pendingOrder ? { pendingOrder } : {}),
  });

  const caption = invoiceText({ amount, address, purpose });
  const keyboard = ik([
    [{ text: "✅ I have paid — send hash", callback_data: "dep:chk" }],
    [{ text: "🆘 Support", url: `https://t.me/${supportUsername()}` }, { text: "✖️ Cancel", callback_data: "cancel" }],
  ]);

  const sent = await sendPhoto(chatId, qrUrl(address), caption, { reply_markup: keyboard });
  if (!sent) await sendMessage(chatId, caption, { reply_markup: keyboard });
}

async function askHash(chatId: number) {
  const state = await getState(chatId);
  await setState(chatId, "await_hash", state.data);
  await sendMessage(
    chatId,
    [
      "<b>🔍 Transaction Verification</b>",
      DIVIDER,
      "Send your <b>BEP20 transaction hash</b> now.",
      "",
      "<blockquote>It starts with <code>0x</code> and is 66 characters long. Each hash can be used only once.</blockquote>",
    ].join("\n"),
    { reply_markup: ik([[{ text: "✖️ Cancel", callback_data: "cancel" }]]) },
  );
}

async function verifyHash(chatId: number, hash: string) {
  const state = await getState(chatId);
  await sendChatAction(chatId);

  const existing = await supabaseAdmin
    .from("bot_deposits")
    .select("id")
    .eq("tx_hash", hash.toLowerCase())
    .maybeSingle();

  if (existing.data) {
    await sendMessage(chatId, [
      "<b>🚫 Hash already used</b>",
      DIVIDER,
      "This transaction has already been credited. Each hash works only once.",
      `Believe this is a mistake? Contact @${supportUsername()}`,
    ].join("\n"));
    return;
  }

  let result;
  try {
    result = await withChecking(chatId, "🔗 VERIFYING ON BLOCKCHAIN…", () => verifyUsdtDeposit(hash));
  } catch (error) {
    await sendMessage(chatId, `⚠️ Blockchain nodes are busy. Please send the hash again in a moment.`);
    console.error("[deposit] rpc error", error);
    return;
  }

  if (!result.ok) {
    const reasons: Record<string, string> = {
      invalid_hash: "That does not look like a valid BEP20 transaction hash.",
      not_found: "Transaction not found yet. Wait for 1–2 confirmations and try again.",
      tx_failed: "That transaction failed on-chain, so nothing was received.",
      no_transfer_to_wallet: "No USDT (BEP20) transfer to our deposit address was found in that transaction.",
      too_old: "That transaction is older than 72 hours and cannot be auto-verified.",
    };
    await sendMessage(
      chatId,
      [
        "<b>❌ Verification failed</b>",
        DIVIDER,
        reasons[result.reason] ?? "Could not verify this transaction.",
        "",
        `If you paid late or need manual review, contact @${supportUsername()}.`,
      ].join("\n"),
      { reply_markup: ik([[{ text: "🔁 Try again", callback_data: "dep:chk" }], [{ text: "🏠 Home", callback_data: "home" }]]) },
    );
    return;
  }

  // Credit the wallet and lock the hash.
  const { error: insertError } = await supabaseAdmin.from("bot_deposits").insert({
    telegram_id: chatId,
    amount_requested: state.data["amount"] ?? null,
    amount_credited: result.amount,
    tx_hash: hash.toLowerCase(),
    status: "confirmed",
    note: state.data["pendingOrder"] ? "direct-pay" : "topup",
    confirmed_at: new Date().toISOString(),
  });

  if (insertError) {
    await sendMessage(chatId, "🚫 This transaction hash has already been used.");
    return;
  }

  const balance = await adjustBalance(chatId, result.amount);
  await supabaseAdmin
    .from("bot_deposits")
    .update({ status: "confirmed" })
    .eq("telegram_id", chatId)
    .eq("status", "pending");

  await sendMessage(
    chatId,
    [
      "<b>✅ PAYMENT CONFIRMED</b>",
      DIVIDER,
      `🪙 <b>Received</b> · <code>${result.amount.toFixed(4)} USDT</code>`,
      `💰 <b>New balance</b> · <code>${money(balance)}</code>`,
      `🔗 <code>${hash.slice(0, 20)}…</code>`,
      DIVIDER,
      "Thank you — your funds are ready to use.",
    ].join("\n"),
    { message_effect_id: EFFECTS.party },
  );

  const user = await getUser(chatId);
  await notifyAdmins(
    [
      "<b>💰 NEW DEPOSIT</b>",
      DIVIDER,
      `👤 <code>${chatId}</code> ${user?.username ? "@" + escapeHtml(user.username) : ""}`,
      `🪙 <code>${result.amount.toFixed(4)} USDT</code>`,
      `🔗 <code>${hash}</code>`,
    ].join("\n"),
    EFFECTS.fire,
  );

  const pending = state.data["pendingOrder"];
  if (pending) {
    await completePending(chatId, pending);
  } else {
    await clearState(chatId);
  }
}

/* ------------------------------ text pipeline ----------------------------- */

async function channelPreview(ctx: Ctx, ref: ProductRef, customText?: string) {
  const draft = await channelDraft(ref);
  await setState(ctx.chatId, "channel_preview", { ref, customText });
  const text = customText ? `${escapeHtml(customText)}\n\n${draft.caption}` : draft.caption;
  return respond(ctx, `<b>📢 Post Preview · @allupdatexix</b>\n\n${text}`, [
    [{ text: "🚀 Order Now", url: draft.url }],
    [{ text: "📢 Publish to Channel", callback_data: "cp:send" }, { text: "✏️ Custom Text", callback_data: "cp:custom" }],
    [{ text: "✖️ Cancel", callback_data: "cancel" }],
  ]);
}

async function handleStep(chatId: number, text: string, state: { step: string | null; data: any }) {
  if (state.step === "await_channel_caption" && isAdmin(chatId)) {
    if (!text || text.length > 2000) {
      await respond({ chatId }, "⚠️ Send a caption of up to 2,000 characters.");
      return true;
    }
    const ref = productRef.parse(state.data.ref);
    await channelPreview({ chatId }, ref, text);
    return true;
  }
  const catalog = await getCatalog();

  if (state.step === "await_link") {
    if (!/^https?:\/\/\S+$/i.test(text) && !/^@?[\w.]+$/.test(text)) {
      await sendMessage(chatId, "⚠️ Please send a valid link (starting with http:// or https://).");
      return true;
    }
    const service = catalog.services.get(state.data.serviceId);
    if (!service) {
      await clearState(chatId);
      return true;
    }
    if (needsComments(service)) {
      await setState(chatId, "await_comments", { ...state.data, link: text });
      await askComments(chatId, service);
    } else if (isQuantityFree(service)) {
      await showSummary(chatId, { serviceId: service.id, link: text, quantity: service.min });
    } else {
      await setState(chatId, "await_qty", { ...state.data, link: text });
      await askQuantity(chatId, service);
    }
    return true;
  }

  if (state.step === "await_comments") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const service = catalog.services.get(state.data.serviceId);
    if (!service) {
      await clearState(chatId);
      return true;
    }
    if (lines.length < service.min) {
      await sendMessage(chatId, `⚠️ Please send at least <code>${service.min}</code> comment lines. You sent <code>${lines.length}</code>.`);
      return true;
    }
    await showSummary(chatId, {
      serviceId: service.id,
      link: state.data.link,
      quantity: lines.length,
      comments: lines.join("\n"),
    });
    return true;
  }

  if (state.step === "await_qty") {
    const quantity = Number(text.replace(/[,\s]/g, ""));
    const service = catalog.services.get(state.data.serviceId);
    if (!service) {
      await clearState(chatId);
      return true;
    }
    if (!Number.isInteger(quantity) || quantity < service.min || quantity > service.max) {
      await sendMessage(
        chatId,
        `⚠️ Quantity must be a whole number between <code>${service.min}</code> and <code>${service.max}</code>.`,
      );
      return true;
    }
    await showSummary(chatId, { serviceId: service.id, link: state.data.link, quantity });
    return true;
  }

  if (state.step === "await_amount") {
    const amount = Number(text.replace(/[,$\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      await sendMessage(chatId, "⚠️ Please send a valid amount, for example <code>10</code>.");
      return true;
    }
    await sendInvoice(chatId, Math.round(amount * 10000) / 10000, "Wallet top-up");
    return true;
  }

  if (state.step === "await_hash") {
    if (!looksLikeTxHash(text)) {
      await sendMessage(chatId, "⚠️ That is not a valid transaction hash. It must start with <code>0x</code> and be 66 characters long.");
      return true;
    }
    await verifyHash(chatId, text.trim());
    return true;
  }

  if (state.step === "await_bk_amount") {
    const amount = Number(text.replace(/[,৳\s]|tk/gi, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      await sendMessage(chatId, "⚠️ Please send a valid amount in Taka, for example <code>500</code>.");
      return true;
    }
    await showBkashInvoice(chatId, Math.round(amount * 100) / 100);
    return true;
  }

  if (state.step === "await_bk_trx") {
    if (!looksLikeTrxId(text)) {
      await sendMessage(chatId, "⚠️ That is not a valid bKash TrxID. Example: <code>9A1B2C3D4E</code>");
      return true;
    }
    await verifyBkash(chatId, text.trim(), state.data);
    return true;
  }

  if (state.step === "await_support") {
    await supabaseAdmin.from("bot_tickets").insert({ telegram_id: chatId, message: text });
    await clearState(chatId);
    await sendMessage(chatId, [
      "<b>✅ Message delivered</b>",
      DIVIDER,
      "Our team has your report and will reply shortly.",
      `Urgent? Message @${supportUsername()} directly.`,
    ].join("\n"), { message_effect_id: EFFECTS.heart });
    const user = await getUser(chatId);
    await notifyAdmins([
      "<b>🎫 NEW REPORT</b>",
      DIVIDER,
      `👤 <code>${chatId}</code> ${user?.username ? "@" + escapeHtml(user.username) : ""}`,
      `<blockquote>${escapeHtml(text).slice(0, 500)}</blockquote>`,
    ].join("\n"));
    return true;
  }

  if (state.step === "await_admin_bal" && isAdmin(chatId)) {
    const match = /^(\d{3,15})\s+(-?\d+(?:\.\d+)?)$/.exec(text.replace(/[$,]/g, "").trim());
    if (!match) {
      await sendMessage(chatId, "⚠️ Format: <code>USER_ID AMOUNT</code> — e.g. <code>123456789 10</code>");
      return true;
    }
    const targetId = Number(match[1]);
    const amount = Math.round(Number(match[2]) * 100000) / 100000;
    const target = await getUser(targetId);
    if (!target || amount === 0) {
      await sendMessage(chatId, "⚠️ User not found or amount is zero.");
      return true;
    }
    const balance = await adjustBalance(targetId, amount);
    if (amount > 0) {
      await supabaseAdmin
        .from("bot_users")
        .update({ total_deposited: Number(target.total_deposited) + amount })
        .eq("telegram_id", targetId);
    }
    await supabaseAdmin.from("bot_deposits").insert({
      telegram_id: targetId,
      amount_credited: amount,
      status: "confirmed",
      note: `admin-manual by ${chatId}`,
      confirmed_at: new Date().toISOString(),
    });
    await clearState(chatId);
    await sendMessage(chatId, [
      "<b>✅ Balance updated</b>",
      DIVIDER,
      `👤 <code>${targetId}</code> ${target.username ? "@" + escapeHtml(target.username) : ""}`,
      `${amount > 0 ? "➕ Added" : "➖ Deducted"} · <code>${usd(Math.abs(amount))}</code>`,
      `💰 New balance · <code>${usd(balance)}</code>`,
    ].join("\n"), { reply_markup: ik([[{ text: "⬅️ Admin Panel", callback_data: "a:panel" }]]) });

    const code = isCurrency(target.currency) ? target.currency : "USD";
    await currencyScope.run({ code }, () =>
      sendMessage(targetId, [
        amount > 0 ? "<b>💰 Balance Credited</b>" : "<b>💳 Balance Adjusted</b>",
        DIVIDER,
        `${amount > 0 ? "Added" : "Deducted"} · <code>${money(Math.abs(amount))}</code>`,
        `New balance · <code>${money(balance)}</code>`,
      ].join("\n"), amount > 0 ? { message_effect_id: EFFECTS.party } : {}),
    );
    return true;
  }

  if ((state.step === "await_admin_smm" || state.step === "await_admin_tg") && isAdmin(chatId)) {
    const value = Number(text.replace(/[%x×,\s]/gi, ""));
    const isSmm = state.step === "await_admin_smm";
    if (!Number.isFinite(value) || value < (isSmm ? 0 : 1) || value > (isSmm ? 1000 : 50)) {
      await sendMessage(chatId, isSmm ? "⚠️ Send a markup percent between 0 and 1000, e.g. <code>40</code>" : "⚠️ Send a multiplier between 1 and 50, e.g. <code>3</code>");
      return true;
    }
    await setSetting(isSmm ? "smm_markup_pct" : "tg_multiplier", value);
    await clearState(chatId);
    const view = await adminPricing();
    await sendMessage(chatId, `✅ <b>Saved.</b> New prices are live.\n\n${view.text}`, { reply_markup: ik(view.keyboard) });
    return true;
  }

  if (state.step === "await_admin_ext" && isAdmin(chatId)) {
    const err = await addPackageFromText(text);
    if (err) {
      await sendMessage(chatId, err);
      return true;
    }
    await clearState(chatId);
    const view = await adminExtStore();
    await sendMessage(chatId, `✅ <b>Package added.</b>\n\n${view.text}`, { reply_markup: ik(view.keyboard) });
    return true;
  }

  if (state.step === "await_code") {
    const id = Number(text.replace(/[#\s]/g, ""));
    if (!Number.isInteger(id) || !catalog.services.has(id)) {
      await sendMessage(chatId, "⚠️ No product found with that code. Please check and send again, or tap /cancel.");
      return true;
    }
    await clearState(chatId);
    await showService({ chatId }, id);
    return true;
  }

  if (state.step === "await_admin_pop" && isAdmin(chatId)) {
    const id = Number(text.replace(/[#\s]/g, ""));
    if (!Number.isInteger(id) || !catalog.services.has(id)) {
      await sendMessage(chatId, "⚠️ Unknown product code. Send a valid code.");
      return true;
    }
    await togglePin(id, true);
    await clearState(chatId);
    const view = await adminPopular();
    await sendMessage(chatId, `✅ <b>Pinned #${id}.</b>\n\n${view.text}`, { reply_markup: ik(view.keyboard) });
    return true;
  }

  if (state.step === "await_admin_ch" && isAdmin(chatId)) {
    try {
      await setForceChannel(text);
    } catch {
      await sendMessage(chatId, "⚠️ Send a channel username like <code>@mychannel</code>, or <code>off</code>.");
      return true;
    }
    await clearState(chatId);
    const view = await adminChannel();
    await sendMessage(chatId, `✅ <b>Saved.</b>\n\n${view.text}`, { reply_markup: ik(view.keyboard) });
    return true;
  }

  if (state.step === "await_admin_ref" && isAdmin(chatId)) {
    const value = Number(text.replace(/[%\s]/g, ""));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      await sendMessage(chatId, "⚠️ Send a percent between 0 and 100, e.g. <code>5</code>");
      return true;
    }
    await setSetting("ref_pct", value);
    await clearState(chatId);
    const view = await adminReferrals();
    await sendMessage(chatId, `✅ <b>Saved.</b>\n\n${view.text}`, { reply_markup: ik(view.keyboard) });
    return true;
  }

  if (state.step === "await_broadcast" && isAdmin(chatId)) {
    await clearState(chatId);
    const delivered = await runBroadcast(text);
    await sendMessage(chatId, `📣 Broadcast delivered to <b>${delivered}</b> users.`);
    return true;
  }

  return false;
}

/* --------------------------------- router -------------------------------- */

const MENU: Record<string, "svc" | "tg" | "ext" | "ord" | "dep" | "prof" | "sup" | "about" | "admin" | "find" | "pop" | "ref"> = {
  "🔍 search by code": "find",
  "🔥 popular": "pop",
  "🎁 refer & earn": "ref",
  "🛍 services": "svc",
  "📱 buy tg account": "tg",
  "⚡ lovable extension": "ext",
  "📦 my orders": "ord",
  "💳 add funds": "dep",
  "👤 profile": "prof",
  "🆘 support": "sup",
  "ℹ️ about": "about",
  "🛡 admin panel": "admin",
};

export async function handleUpdate(update: any): Promise<void> {
  await loadBotAccess();
  const from = update.callback_query?.from ?? (update.message ?? update.edited_message)?.from;
  let code: "USD" | "BDT" | "INR" = "USD";
  if (from?.id) {
    const { data } = await supabaseAdmin.from("bot_users").select("currency").eq("telegram_id", from.id).maybeSingle();
    if (isCurrency(data?.currency)) code = data.currency;
  }
  return currencyScope.run({ code }, () => routeUpdate(update));
}

/** Opens a product shared via deep link (start=p_ID), if one is pending. */
async function openDeepProduct(chatId: number): Promise<boolean> {
  const state = await getState(chatId);
  if (state.step !== "deep_product") return false;
  await clearState(chatId);
  await sendMessage(chatId, "👇 <b>Main menu</b>", { reply_markup: mainKeyboard(isAdmin(chatId)) });
  const id = Number(state.data["serviceId"]);
  if (state.data["kind"] === "tg") await showTgItem({ chatId }, id);
  else if (state.data["kind"] === "ext") await showExtPackage({ chatId }, id);
  else await showService({ chatId }, id);
  return true;
}

async function showCurrencyPicker(ctx: Ctx) {
  await respond(ctx, currencyPickerText(), currencyKeyboard());
}

async function routeUpdate(update: any): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);
  const message = update.message ?? update.edited_message;
  if (!message?.from || message.from.is_bot) return;

  const chatId = Number(message.chat.id);
  const text: string = (message.text ?? "").trim();
  const { user, isNew } = await upsertUser(message.from);

  if (user.is_banned) {
    await sendMessage(chatId, "🚫 Your access has been suspended.");
    return;
  }

  if (isNew) {
    await notifyAdmins(
      [
        "<b>🆕 NEW USER</b>",
        DIVIDER,
        `👤 <b>${escapeHtml(message.from.first_name ?? "User")}</b>`,
        `🔤 ${message.from.username ? "@" + escapeHtml(message.from.username) : "—"}`,
        `🆔 <code>${chatId}</code>`,
        `🗣 <code>${message.from.language_code ?? "—"}</code>`,
      ].join("\n"),
      EFFECTS.thumbsUp,
    );
  }

  const startPayload = /^\/start(?:@\w+)?\s+(\S+)/.exec(text)?.[1] ?? "";
  if (isNew && startPayload.startsWith("ref_")) {
    const ref = await attachReferrer(chatId, startPayload);
    if (ref) await sendMessage(ref, `🎉 <b>New referral joined!</b>\nYou'll earn a reward on their first purchase.`);
  }
  const deep = /^(p|tg|ext)_(\d+)$/.exec(startPayload);
  if (deep) await setState(chatId, "deep_product", { serviceId: Number(deep[2]), kind: deep[1] });

  if (!isAdmin(chatId) && !(await isJoined(chatId))) {
    const gate = await joinGate();
    await dropMessage(chatId, message.message_id);
    await respond({ chatId }, gate.text, gate.keyboard);
    return;
  }

  if (text === "/cancel") {
    await clearState(chatId);
    await sendMessage(chatId, "✖️ Cancelled.", { reply_markup: mainKeyboard(isAdmin(chatId)) });
    return;
  }

  if (text === "/start" || text === "/home" || text.startsWith("/start ")) {
    const pending = await getState(chatId);
    if (pending.step !== "deep_product") await clearState(chatId);
    if (!isCurrency(user.currency)) return showCurrencyPicker({ chatId });
    if (await openDeepProduct(chatId)) return;
    await showHome(chatId, user);
    return;
  }

  if (text === "/admin" || MENU[text.toLowerCase()] === "admin") {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, "🚫 This area is restricted.");
      return;
    }
    await clearState(chatId);
    await dropMessage(chatId, message.message_id);
    await clearLastScreen(chatId);
    remember(chatId, await sendAdminPanel(chatId));
    return;
  }

  const state = await getState(chatId);
  if (state.step && !MENU[text.toLowerCase()]) {
    const handled = await handleStep(chatId, text, state);
    if (handled) return;
  }

  const ctx: Ctx = { chatId };
  if (MENU[text.toLowerCase()]) await dropMessage(chatId, message.message_id);
  switch (MENU[text.toLowerCase()] ?? (text.startsWith("/services") ? "svc" : undefined)) {
    case "svc":
      await clearState(chatId);
      return showPlatforms(ctx);
    case "tg":
      await clearState(chatId);
      return showTgCountries(ctx);
    case "ext":
      await clearState(chatId);
      return showExtStore(ctx);
    case "ord":
      return showMyOrders(ctx, 0);
    case "dep":
      return showFunds(ctx);
    case "prof": {
      const fresh = (await getUser(chatId))!;
      return respond(ctx, profileText(fresh as any, await ordersCount(chatId)), [
        [{ text: "💳 Add Funds", callback_data: "dep" }, { text: "💱 Currency", callback_data: "cur" }],
        [{ text: "🏠 Home", callback_data: "home" }],
      ]);
    }
    case "sup":
      await setState(chatId, "await_support", {});
      return respond(ctx, supportText(), [
        [{ text: "💬 Chat with support", url: `https://t.me/${supportUsername()}` }],
        [{ text: "✖️ Cancel", callback_data: "cancel" }],
      ]);
    case "about":
      return respond(ctx, aboutText(), [[{ text: "🏠 Home", callback_data: "home" }]]);
    case "find":
      return askCode(ctx);
    case "pop":
      await clearState(chatId);
      return showPopular(ctx);
    case "ref": {
      const view = await referralView(chatId);
      return respond(ctx, view.text, view.keyboard);
    }
    default:
      break;
  }

  await sendMessage(
    chatId,
    [
      `<b>${BRAND.name}</b>`,
      DIVIDER,
      "Use the buttons below to navigate the panel.",
    ].join("\n"),
    { reply_markup: mainKeyboard(isAdmin(chatId)) },
  );
}

async function handleCallback(query: any) {
  const chatId = Number(query.message?.chat?.id ?? query.from.id);
  const data: string = query.data ?? "";
  const ctx: Ctx = {
    chatId,
    messageId: query.message?.message_id,
    fromPhoto: Boolean(query.message?.photo),
  };

  await Promise.all([answerCallback(query.id), upsertUser(query.from)]);

  const [head, a, b] = data.split(":");

  if (!isAdmin(chatId) && !(await isJoined(chatId))) {
    const gate = await joinGate();
    if (head === "fj") await answerCallback(query.id, "❌ You haven't joined yet.", true).catch(() => null);
    return respond(ctx, gate.text, gate.keyboard);
  }

  try {
    switch (head) {
      case "noop":
        return;
      case "post": {
        if (!isAdmin(Number(query.from.id))) return;
        const ref = productRef.parse({ kind: a, id: Number(b) });
        await setState(chatId, "channel_post", { ref });
        return respond(ctx, "<b>📢 Upload in Channel</b>\n\nChannel · @allupdatexix\nChoose a product caption or add your own text.", [
          [{ text: "📄 Product Caption", callback_data: "cp:default" }, { text: "✏️ Custom Text", callback_data: "cp:custom" }],
          [{ text: "✖️ Cancel", callback_data: "cancel" }],
        ]);
      }
      case "cp": {
        if (!isAdmin(Number(query.from.id))) return;
        const state = await getState(chatId);
        if (!["channel_post", "channel_preview"].includes(state.step ?? "")) return respond(ctx, "⚠️ Select a product to post again.");
        const ref = productRef.parse(state.data["ref"]);
        if (a === "custom") {
          await setState(chatId, "await_channel_caption", { ref });
          return respond(ctx, "<b>✏️ Custom Caption</b>\n\nSend your text (up to 2,000 characters). Product details and Order Now will be included.", [[{ text: "✖️ Cancel", callback_data: "cancel" }]]);
        }
        if (a === "default") return channelPreview(ctx, ref);
        if (a === "send" && state.step === "channel_preview") {
          const url = await publishProduct(Number(query.from.id), ref, state.data["customText"] as string | undefined);
          await clearState(chatId);
          return respond(ctx, "✅ <b>Product posted to @allupdatexix.</b>", [[{ text: "📢 View Post", url }], [{ text: "🛡 Admin Panel", callback_data: "a:panel" }]]);
        }
        return;
      }
      case "fj": {
        const user = (await getUser(chatId))!;
        await dropMessage(chatId, ctx.messageId);
        if (!isCurrency(user.currency)) return showCurrencyPicker({ chatId });
        if (await openDeepProduct(chatId)) return;
        await clearState(chatId);
        return showHome(chatId, user);
      }
      case "find":
        return askCode(ctx);
      case "pop":
        await clearState(chatId);
        return showPopular(ctx);
      case "ref": {
        const view = await referralView(chatId);
        return respond(ctx, view.text, view.keyboard);
      }
      case "home": {
        await clearState(chatId);
        const user = (await getUser(chatId))!;
        await dropMessage(chatId, ctx.messageId);
        return showHome(chatId, user);
      }
      case "svc":
        await clearState(chatId);
        return showPlatforms(ctx);
      case "tg": {
        if (!a) return showTgCountries(ctx);
        if (a === "c") return showTgList(ctx, b ?? "ALL", Number(data.split(":")[3] ?? 0));
        if (a === "i") return showTgItem(ctx, Number(b));
        if (a === "my") return showMyTg(ctx, Number(b ?? 0));
        if (a === "acc") return showMyTgAccount(ctx, Number(b));
        if (a === "otp") return tgOtp(chatId, Number(b));
        if (a === "rs") return tgReset(chatId, Number(b));
        if (a === "pay") {
          const state = await getState(chatId);
          if (state.step !== "tg_confirm") return respond(ctx, "⚠️ This checkout expired. Please choose the account again.", [[{ text: "📱 TG Accounts", callback_data: "tg" }]]);
          const draft = { kind: "tg", itemId: Number(state.data["itemId"]), charge: Number(state.data["charge"]) };
          if (b === "w") return buyTgAccount(chatId, draft);
          if (b === "b") return showBkashInvoice(chatId, Math.ceil(draft.charge * currencies().BDT.rate), draft);
          return sendInvoice(chatId, draft.charge, "TG account payment", draft);
        }
        return;
      }
      case "ext": {
        if (!a) return showExtStore(ctx);
        if (a === "p") return showExtPackage(ctx, Number(b));
        if (a === "my") return showMyLicenses(ctx);
        if (a === "dl") return downloadExtension(chatId);
        if (a === "guide") return showExtGuide(ctx);
        if (a === "pay") {
          const state = await getState(chatId);
          if (state.step !== "ext_confirm") return respond(ctx, "⚠️ This checkout expired. Please choose the package again.", [[{ text: "⚡ Extension Store", callback_data: "ext" }]]);
          const pkg = (await listPackages()).find((p) => p.id === Number(state.data["packageId"]));
          if (!pkg) return respond(ctx, "⚠️ This package is no longer available.", [[{ text: "⚡ Extension Store", callback_data: "ext" }]]);
          const draft = { kind: "ext", packageId: pkg.id, charge: priceUsd(pkg) };
          if (b === "w") return buyExtension(chatId, draft);
          if (b === "b") return showBkashInvoice(chatId, Math.ceil(draft.charge * currencies().BDT.rate), draft);
          return sendInvoice(chatId, draft.charge, "Extension payment", draft);
        }
        return;
      }
      case "pl":
        return showCategories(ctx, a!, Number(b ?? 0));
      case "ct":
        return showServices(ctx, Number(a), Number(b ?? 0));
      case "sv":
        return showService(ctx, Number(a));
      case "buy":
        return startOrder(ctx, Number(a));
      case "cancel":
        await clearState(chatId);
        return respond(ctx, "✖️ Cancelled. Nothing was charged.", [
          [{ text: "🛍 Services", callback_data: "svc" }, { text: "🏠 Home", callback_data: "home" }],
        ]);
      case "pay": {
        const state = await getState(chatId);
        if (state.step !== "confirm") {
          return respond(ctx, "⚠️ This order expired. Please start again.", [
            [{ text: "🛍 Services", callback_data: "svc" }],
          ]);
        }
        const draft = state.data as {
          serviceId: number;
          link: string;
          quantity: number;
          comments?: string;
          charge: number;
        };
        if (a === "w") return submitOrder(chatId, draft);
        if (a === "b") return showBkashInvoice(chatId, Math.ceil(draft.charge * currencies().BDT.rate), { kind: "smm", ...draft });
        return sendInvoice(chatId, draft.charge, "Order payment", draft);
      }
      case "ord":
        return showMyOrders(ctx, Number(a ?? 0));
      case "od":
        return showOrderDetail(ctx, a!, b === "r");
      case "re":
        return orderAgain(ctx, a!);
      case "cur": {
        if (!isCurrency(a)) return showCurrencyPicker(ctx);
        await setCurrency(chatId, a);
        const store = currencyScope.getStore();
        if (store) store.code = a;
        const cur = currencies()[a];
        await respond(ctx, `✅ Display currency set to <b>${cur.flag} ${cur.label} (${cur.code})</b>.`);
        const user = (await getUser(chatId))!;
        await dropMessage(chatId, ctx.messageId);
        if (await openDeepProduct(chatId)) return;
        return showHome(chatId, user);
      }
      case "prof": {
        const fresh = (await getUser(chatId))!;
        return respond(ctx, profileText(fresh as any, await ordersCount(chatId)), [
          [{ text: "💳 Add Funds", callback_data: "dep" }, { text: "💱 Currency", callback_data: "cur" }],
          [{ text: "🏠 Home", callback_data: "home" }],
        ]);
      }
      case "dep":
        if (a === "new") return askDepositAmount(ctx);
        if (a === "chk") return askHash(chatId);
        if (a === "bk") return askBkashAmount(ctx);
        if (a === "bkt") return askBkashTrx(ctx);
        return showFunds(ctx);
      case "a": {
        if (!isAdmin(chatId)) return;
        return handleAdminCallback(ctx, a!, Number(b ?? 0));
      }
      default:
        return;
    }
  } catch (error) {
    console.error("[bot] callback error", data, error);
    await sendMessage(chatId, "⚠️ Something went wrong. Please try again.");
  }
}

async function handleAdminCallback(ctx: Ctx, action: string, page: number) {
  if (action === "panel") {
    await dropMessage(ctx.chatId, ctx.messageId);
    remember(ctx.chatId, await sendAdminPanel(ctx.chatId));
    return;
  }

  const views: Record<string, () => Promise<{ text: string; keyboard: InlineKeyboard }>> = {
    stats: adminStats,
    users: () => adminUsers(page),
    orders: () => adminOrders(page),
    deposits: adminDeposits,
    tickets: adminTickets,
    provider: adminProvider,
    refresh: adminRefreshCatalog,
    broadcast: () => startBroadcast(ctx.chatId),
    bal: () => startBalanceAdjust(ctx.chatId),
    pricing: adminPricing,
    tgstore: adminTgStore,
    psmm: () => startPricingEdit(ctx.chatId, "smm"),
    ptg: () => startPricingEdit(ctx.chatId, "tg"),
    ext: adminExtStore,
    extadd: () => startExtAdd(ctx.chatId),
    pop: adminPopular,
    popadd: async () => {
      await setState(ctx.chatId, "await_admin_pop", {});
      return { text: "<b>➕ Pin a Popular Service</b>\n\nSend the product code to pin.", keyboard: [[{ text: "⬅️ Back", callback_data: "a:pop" }]] };
    },
    popdel: async () => {
      await togglePin(page, false);
      return adminPopular();
    },
    ch: adminChannel,
    chset: async () => {
      await setState(ctx.chatId, "await_admin_ch", {});
      return { text: "<b>📢 Set Force Channel</b>\n\nSend the channel username, e.g. <code>@mychannel</code>.\nMake sure the bot is an admin in that channel.", keyboard: [[{ text: "⬅️ Back", callback_data: "a:ch" }]] };
    },
    choff: async () => {
      await setForceChannel("off");
      return adminChannel();
    },
    ref: adminReferrals,
    pref: async () => {
      await setState(ctx.chatId, "await_admin_ref", {});
      return { text: "<b>✏️ Referral Commission</b>\n\nSend the percent of a friend's first purchase paid to the referrer, e.g. <code>5</code>.", keyboard: [[{ text: "⬅️ Back", callback_data: "a:ref" }]] };
    },
    extdel: async () => {
      await deletePackage(page);
      return adminExtStore();
    },
  };

  const view = views[action];
  if (!view) return;
  const { text, keyboard } = await view();
  return respond(ctx, text, keyboard);
}

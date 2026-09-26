// Core bot brain: routing, menus, order flow, wallet flow.
import { BRAND, EFFECTS, depositAddress, PAYMENT_WINDOW_MINUTES, supportUsername } from "./config.server";
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
import { placeOrder, orderStatus } from "./smmgen.server";
import { verifyUsdtDeposit, looksLikeTxHash } from "./bsc.server";
import {
  adjustBalance,
  clearState,
  getState,
  getUser,
  setState,
  supabaseAdmin,
  upsertUser,
  type BotUser,
} from "./store.server";
import {
  DIVIDER,
  aboutText,
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
  notifyAdmins,
  runBroadcast,
  sendAdminPanel,
  startBroadcast,
} from "./admin.server";

const PAGE_SIZE = 10;

type Ctx = {
  chatId: number;
  messageId?: number;
  fromPhoto?: boolean;
};

async function respond(ctx: Ctx, text: string, keyboard?: InlineKeyboard) {
  const markup = keyboard ? { reply_markup: ik(keyboard) } : {};
  if (ctx.messageId && !ctx.fromPhoto) {
    const edited = await editMessage(ctx.chatId, ctx.messageId, text, markup);
    if (edited) return;
  }
  await sendMessage(ctx.chatId, text, markup);
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
  const keyboard: InlineKeyboard = [
    [{ text: "🛍 Browse Services", callback_data: "svc" }],
    [
      { text: "💳 Add Funds", callback_data: "dep" },
      { text: "📦 My Orders", callback_data: "ord:0" },
    ],
    [
      { text: "👤 Profile", callback_data: "prof" },
      { text: "🆘 Support", url: `https://t.me/${supportUsername()}` },
    ],
  ];

  const sent = await sendPhoto(chatId, BANNERS.welcome, caption, {
    reply_markup: ik(keyboard),
    message_effect_id: EFFECTS.fire,
  });
  if (!sent) await sendMessage(chatId, caption, { reply_markup: ik(keyboard) });
  await sendMessage(chatId, "⌨️ <i>Your control keyboard is ready.</i>", {
    reply_markup: mainKeyboard(isAdmin(chatId)),
  });
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

  await respond(ctx, text, platformKeyboard(counts));
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

  await respond(ctx, serviceCard(service, platformMeta(platformKey).emoji), [
    [{ text: "🚀 Order Now", callback_data: `buy:${service.id}` }],
    [
      { text: "⬅️ Back", callback_data: `ct:${categoryIndex}:0` },
      { text: "🏠 Home", callback_data: "home" },
    ],
  ]);
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/[ᴺᴱᵂ]/g, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
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

async function showSummary(chatId: number, draft: { serviceId: number; link: string; quantity: number; comments?: string }) {
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
  draft: { serviceId: number; link: string; quantity: number; comments?: string; charge: number },
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
          [{ text: "📦 My Orders", callback_data: "ord:0" }],
          [{ text: "🛍 Order More", callback_data: "svc" }, { text: "🏠 Home", callback_data: "home" }],
        ]),
      },
    );

    await notifyAdmins(
      [
        "<b>🛒 NEW ORDER</b>",
        DIVIDER,
        `👤 <code>${chatId}</code> ${user.username ? "@" + escapeHtml(user.username) : ""}`,
        `🆔 <code>${result.order}</code>`,
        `🛍 ${escapeHtml(service.name)}`,
        `🔢 <code>${draft.quantity}</code> · 💵 <code>${money(draft.charge)}</code>`,
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
  const size = 5;
  const { data, count } = await supabaseAdmin
    .from("bot_orders")
    .select("*", { count: "exact" })
    .eq("telegram_id", ctx.chatId)
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);

  const lines = ["<b>📦 My Orders</b>", DIVIDER];
  const rows: InlineKeyboard = [];

  for (const order of (data ?? []) as any[]) {
    lines.push(
      `🆔 <code>${order.provider_order_id ?? "pending"}</code> · <b>${escapeHtml(order.status)}</b>`,
      `   ${escapeHtml(shorten(order.service_name, 46))}`,
      `   🔢 <code>${order.quantity}</code> · 💵 <code>${money(Number(order.charge))}</code> · 📅 ${new Date(order.created_at).toISOString().slice(0, 10)}`,
      "",
    );
    if (order.provider_order_id) {
      rows.push([{ text: `🔄 Status #${order.provider_order_id}`, callback_data: `os:${order.provider_order_id}` }]);
    }
  }
  if (!data?.length) lines.push("<i>You have no orders yet.</i>", "");

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / size));
  lines.push(DIVIDER, `Total orders · <code>${count ?? 0}</code>`);

  await respond(ctx, lines.join("\n"), [...rows, ...pager("ord", page, totalPages, "home")]);
}

async function showOrderStatus(ctx: Ctx, providerOrderId: string) {
  try {
    const status = await orderStatus(providerOrderId);
    if (status.error) throw new Error(status.error);
    await supabaseAdmin
      .from("bot_orders")
      .update({
        status: status.status ?? "unknown",
        start_count: status.start_count ?? null,
        remains: status.remains ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_order_id", providerOrderId)
      .eq("telegram_id", ctx.chatId);

    await sendMessage(
      ctx.chatId,
      [
        `<b>🔄 Order #${escapeHtml(providerOrderId)}</b>`,
        DIVIDER,
        `📊 <b>Status</b> · <b>${escapeHtml(status.status ?? "—")}</b>`,
        `▶️ <b>Start count</b> · <code>${status.start_count ?? "—"}</code>`,
        `⏳ <b>Remaining</b> · <code>${status.remains ?? "—"}</code>`,
        DIVIDER,
      ].join("\n"),
      { reply_markup: ik([[{ text: "📦 My Orders", callback_data: "ord:0" }, { text: "🏠 Home", callback_data: "home" }]]) },
    );
  } catch (error) {
    await sendMessage(ctx.chatId, `⚠️ Status unavailable right now.\n<code>${escapeHtml(String(error)).slice(0, 200)}</code>`);
  }
}

/* --------------------------------- wallet --------------------------------- */

async function showFunds(ctx: Ctx) {
  const user = await getUser(ctx.chatId);
  const address = depositAddress();
  await respond(ctx, fundsText(Number(user?.balance ?? 0), address), [
    [{ text: "➕ Add Balance", callback_data: "dep:new" }],
    [{ text: "🧾 I already paid — verify hash", callback_data: "dep:chk" }],
    [{ text: "🏠 Home", callback_data: "home" }],
  ]);
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
  const progress = await sendMessage(chatId, "⏳ <b>Verifying on the blockchain…</b>");

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
    result = await verifyUsdtDeposit(hash);
  } catch (error) {
    await sendMessage(chatId, `⚠️ Blockchain nodes are busy. Please send the hash again in a moment.`);
    console.error("[deposit] rpc error", error);
    return;
  }

  if (progress && typeof (progress as any).message_id === "number") {
    await tg("deleteMessage", { chat_id: chatId, message_id: (progress as any).message_id });
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
    await submitOrder(chatId, pending);
  } else {
    await clearState(chatId);
  }
}

/* ------------------------------ text pipeline ----------------------------- */

async function handleStep(chatId: number, text: string, state: { step: string | null; data: any }) {
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

  if (state.step === "await_broadcast" && isAdmin(chatId)) {
    await clearState(chatId);
    const delivered = await runBroadcast(text);
    await sendMessage(chatId, `📣 Broadcast delivered to <b>${delivered}</b> users.`);
    return true;
  }

  return false;
}

/* --------------------------------- router -------------------------------- */

const MENU: Record<string, "svc" | "ord" | "dep" | "prof" | "sup" | "about" | "admin"> = {
  "🛍 services": "svc",
  "📦 my orders": "ord",
  "💳 add funds": "dep",
  "👤 profile": "prof",
  "🆘 support": "sup",
  "ℹ️ about": "about",
  "🛡 admin panel": "admin",
};

export async function handleUpdate(update: any): Promise<void> {
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

  if (text === "/cancel") {
    await clearState(chatId);
    await sendMessage(chatId, "✖️ Cancelled.", { reply_markup: mainKeyboard(isAdmin(chatId)) });
    return;
  }

  if (text === "/start" || text === "/home") {
    await clearState(chatId);
    await showHome(chatId, user);
    return;
  }

  if (text === "/admin" || MENU[text.toLowerCase()] === "admin") {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, "🚫 This area is restricted.");
      return;
    }
    await clearState(chatId);
    await sendAdminPanel(chatId);
    return;
  }

  const state = await getState(chatId);
  if (state.step && !MENU[text.toLowerCase()]) {
    const handled = await handleStep(chatId, text, state);
    if (handled) return;
  }

  const ctx: Ctx = { chatId };
  switch (MENU[text.toLowerCase()] ?? (text.startsWith("/services") ? "svc" : undefined)) {
    case "svc":
      await clearState(chatId);
      return showPlatforms(ctx);
    case "ord":
      return showMyOrders(ctx, 0);
    case "dep":
      return showFunds(ctx);
    case "prof": {
      const fresh = (await getUser(chatId))!;
      return respond(ctx, profileText(fresh as any, await ordersCount(chatId)), [
        [{ text: "💳 Add Funds", callback_data: "dep" }, { text: "🏠 Home", callback_data: "home" }],
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

  await upsertUser(query.from);
  await answerCallback(query.id);

  const [head, a, b] = data.split(":");

  try {
    switch (head) {
      case "noop":
        return;
      case "home": {
        await clearState(chatId);
        const user = (await getUser(chatId))!;
        return showHome(chatId, user);
      }
      case "svc":
        await clearState(chatId);
        return showPlatforms(ctx);
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
        if (a === "w") return submitOrder(chatId, state.data);
        return sendInvoice(chatId, state.data.charge, "Order payment", state.data);
      }
      case "ord":
        return showMyOrders(ctx, Number(a ?? 0));
      case "os":
        return showOrderStatus(ctx, a!);
      case "prof": {
        const fresh = (await getUser(chatId))!;
        return respond(ctx, profileText(fresh as any, await ordersCount(chatId)), [
          [{ text: "💳 Add Funds", callback_data: "dep" }, { text: "🏠 Home", callback_data: "home" }],
        ]);
      }
      case "dep":
        if (a === "new") return askDepositAmount(ctx);
        if (a === "chk") return askHash(chatId);
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
  if (action === "panel") return sendAdminPanel(ctx.chatId);

  const views: Record<string, () => Promise<{ text: string; keyboard: InlineKeyboard }>> = {
    stats: adminStats,
    users: () => adminUsers(page),
    orders: () => adminOrders(page),
    deposits: adminDeposits,
    tickets: adminTickets,
    provider: adminProvider,
    refresh: adminRefreshCatalog,
    broadcast: () => startBroadcast(ctx.chatId),
  };

  const view = views[action];
  if (!view) return;
  const { text, keyboard } = await view();
  return respond(ctx, text, keyboard);
}

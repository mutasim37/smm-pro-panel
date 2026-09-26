// Message copy + keyboard builders. Keeps the bot voice consistent and premium.
import { BRAND, PAYMENT_WINDOW_MINUTES, MAX_TX_AGE_HOURS, supportUsername } from "./config.server";
import { escapeHtml, type InlineKeyboard } from "./telegram.server";
import { PLATFORMS, type Service } from "./catalog.server";

export const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";

export function money(value: number): string {
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.01 ? 5 : abs < 1 ? 4 : 2;
  return `${BRAND.symbol}${value.toFixed(digits)}`;
}

export function mainKeyboard(isAdmin: boolean) {
  const rows: { text: string }[][] = [
    [{ text: "🛍 Services" }, { text: "📦 My Orders" }],
    [{ text: "💳 Add Funds" }, { text: "👤 Profile" }],
    [{ text: "🆘 Support" }, { text: "ℹ️ About" }],
  ];
  if (isAdmin) rows.push([{ text: "🛡 Admin Panel" }]);
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Choose an option…",
  };
}

export function welcomeText(name: string, balance: number, orders: number): string {
  return [
    `<b>⚡ ${BRAND.name}</b> — <i>${BRAND.tagline}</i>`,
    DIVIDER,
    `Welcome back, <b>${escapeHtml(name)}</b> 👋`,
    "",
    `💰 <b>Wallet</b> · <code>${money(balance)}</code>`,
    `📦 <b>Orders</b> · <code>${orders}</code>`,
    `🌍 <b>Coverage</b> · <code>7,000+ services</code>`,
    "",
    "<blockquote>Instant delivery · Automatic crypto top-up · 24/7 human support · Zero data sharing.</blockquote>",
    DIVIDER,
    "Tap a button below to begin.",
  ].join("\n");
}

export function aboutText(): string {
  return [
    `<b>ℹ️ About ${BRAND.name}</b>`,
    DIVIDER,
    "A premium, fully automated social media marketing panel running inside Telegram.",
    "",
    "✅ <b>7,000+ services</b> across every major platform",
    "✅ <b>Instant order placement</b> — no waiting for staff",
    "✅ <b>USDT (BEP20) top-up</b> verified on-chain automatically",
    "✅ <b>Prices in USD</b> — available worldwide",
    "✅ <b>Privacy first</b> — we never share or sell your data",
    "",
    `🆘 Support · @${supportUsername()}`,
    DIVIDER,
    "<i>Fast. Private. Professional.</i>",
  ].join("\n");
}

export function profileText(user: {
  telegram_id: number;
  first_name: string | null;
  username: string | null;
  balance: number;
  total_deposited: number;
  total_spent: number;
  created_at: string;
}, orders: number): string {
  return [
    "<b>👤 Your Account</b>",
    DIVIDER,
    `🆔 <b>ID</b> · <code>${user.telegram_id}</code>`,
    `🔤 <b>Username</b> · ${user.username ? "@" + escapeHtml(user.username) : "—"}`,
    `💰 <b>Wallet balance</b> · <code>${money(Number(user.balance))}</code>`,
    `⬆️ <b>Total deposited</b> · <code>${money(Number(user.total_deposited))}</code>`,
    `⬇️ <b>Total spent</b> · <code>${money(Number(user.total_spent))}</code>`,
    `📦 <b>Orders placed</b> · <code>${orders}</code>`,
    `📅 <b>Member since</b> · <code>${new Date(user.created_at).toISOString().slice(0, 10)}</code>`,
    DIVIDER,
    "<blockquote>Your account details are private and never shared.</blockquote>",
  ].join("\n");
}

export function platformKeyboard(counts: Map<string, number>): InlineKeyboard {
  const rows: InlineKeyboard = [];
  const available = PLATFORMS.filter((p) => (counts.get(p.key) ?? 0) > 0);
  for (let i = 0; i < available.length; i += 2) {
    rows.push(
      available.slice(i, i + 2).map((p) => ({
        text: `${p.emoji} ${p.label}`,
        callback_data: `pl:${p.key}:0`,
      })),
    );
  }
  rows.push([{ text: "🏠 Home", callback_data: "home" }]);
  return rows;
}

export function pager(
  prefix: string,
  page: number,
  totalPages: number,
  backTo: string,
): InlineKeyboard {
  const nav: InlineKeyboard[number] = [];
  if (page > 0) nav.push({ text: "◀️ Previous", callback_data: `${prefix}:${page - 1}` });
  nav.push({ text: `📄 ${page + 1}/${totalPages}`, callback_data: "noop" });
  if (page < totalPages - 1) nav.push({ text: "Next ▶️", callback_data: `${prefix}:${page + 1}` });

  return [
    nav,
    [
      { text: "⬅️ Back", callback_data: backTo },
      { text: "🏠 Home", callback_data: "home" },
    ],
  ];
}

export function serviceCard(service: Service, emoji: string): string {
  const notes: string[] = [];
  if (service.refill) notes.push("♻️ Refill");
  if (service.cancel) notes.push("🛑 Cancel");
  if (!notes.length) notes.push("⚠️ No refill / no cancel");

  return [
    `${emoji} <b>${escapeHtml(service.name)}</b>`,
    DIVIDER,
    `💵 <b>Price</b> · <code>${money(service.price)} / 1000</code>`,
    `📉 <b>Minimum</b> · <code>${service.min.toLocaleString("en-US")}</code>`,
    `📈 <b>Maximum</b> · <code>${service.max.toLocaleString("en-US")}</code>`,
    `⚙️ <b>Type</b> · <code>${escapeHtml(service.type)}</code>`,
    `🛡 <b>Guarantee</b> · ${notes.join(" · ")}`,
    `🗂 <b>Category</b> · <i>${escapeHtml(service.category)}</i>`,
    DIVIDER,
    "<blockquote expandable>⏱ Start time is usually instant to 60 minutes. Delivery speed depends on the selected service. Never change your username or make the account private while an order is running.</blockquote>",
    "",
    "Ready? Tap <b>Order Now</b>.",
  ].join("\n");
}

export function summaryText(input: {
  serviceName: string;
  link: string;
  quantity: number;
  charge: number;
  balance: number;
  comments?: string | undefined;
}): string {
  const lines = [
    "<b>🧾 Order Summary</b>",
    DIVIDER,
    `🛍 <b>Service</b> · ${escapeHtml(input.serviceName)}`,
    `🔗 <b>Link</b> · <code>${escapeHtml(input.link)}</code>`,
    `🔢 <b>Quantity</b> · <code>${input.quantity.toLocaleString("en-US")}</code>`,
  ];
  if (input.comments) {
    const count = input.comments.split("\n").filter(Boolean).length;
    lines.push(`💬 <b>Comments</b> · <code>${count} lines</code>`);
  }
  lines.push(
    `💵 <b>Total</b> · <code>${money(input.charge)}</code>`,
    `💰 <b>Wallet</b> · <code>${money(input.balance)}</code>`,
    DIVIDER,
    input.balance >= input.charge
      ? "Choose how you would like to pay."
      : "⚠️ Wallet balance is not enough — use <b>Direct Pay</b> or top up first.",
  );
  return lines.join("\n");
}

export function fundsText(balance: number, address: string): string {
  return [
    "<b>💳 Wallet & Top-Up</b>",
    DIVIDER,
    `💰 <b>Available balance</b> · <code>${money(balance)}</code>`,
    "",
    "🪙 <b>Accepted</b> · USDT (BEP20 / BNB Smart Chain)",
    "🚫 <b>Minimum</b> · none — deposit any amount you like",
    "⚡ <b>Confirmation</b> · automatic, on-chain",
    "",
    `📥 <b>Deposit address</b>`,
    `<code>${escapeHeader(address)}</code>`,
    DIVIDER,
    "<blockquote>Send only USDT on the BEP20 network. Coins sent on another network cannot be recovered.</blockquote>",
  ].join("\n");
}

function escapeHeader(value: string): string {
  return escapeHtml(value);
}

export function invoiceText(input: {
  amount: number;
  address: string;
  purpose: string;
}): string {
  return [
    "<b>🧾 Payment Invoice</b>",
    DIVIDER,
    `💵 <b>Amount to send</b> · <code>${input.amount.toFixed(4)} USDT</code>`,
    `🌐 <b>Network</b> · <code>BEP20 (BNB Smart Chain)</code>`,
    `🎯 <b>Purpose</b> · ${escapeHtml(input.purpose)}`,
    "",
    "📥 <b>Address</b>",
    `<code>${escapeHtml(input.address)}</code>`,
    DIVIDER,
    `⏳ <b>Payment window</b> · ${PAYMENT_WINDOW_MINUTES} minutes`,
    "",
    "After sending, tap <b>I have paid</b> and send your <b>transaction hash</b>.",
    `<blockquote>Each transaction hash works only once. Transactions older than ${MAX_TX_AGE_HOURS} hours are not accepted. Paid late? Contact @${supportUsername()} and we will settle it manually.</blockquote>`,
  ].join("\n");
}

export function qrUrl(address: string, amount?: number): string {
  const data = amount
    ? `ethereum:${address}@56?value=0&label=USDT%20${amount}`
    : address;
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=${encodeURIComponent(data)}`;
}

export function supportText(): string {
  return [
    "<b>🆘 Support Center</b>",
    DIVIDER,
    `Human support · @${supportUsername()}`,
    "",
    "You can also describe your issue right here and it will be delivered to our team instantly with your order history attached.",
    DIVIDER,
    "<blockquote>Average first reply: under 30 minutes.</blockquote>",
  ].join("\n");
}

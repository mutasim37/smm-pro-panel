// "Lovable Unlimited Extension" marketplace: admin-managed packages, Pro licenses from eklas, gated download.
import { EFFECTS, currencies, supportUsername } from "./config.server";
import { editMessage, escapeHtml, ik, sendChatAction, sendMessage, tg, type InlineKeyboard } from "./telegram.server";
import { DIVIDER, money } from "./views.server";
import { adjustBalance, clearState, getUser, setState, supabaseAdmin } from "./store.server";
import { notifyAdmins } from "./admin.server";

type Ctx = { chatId: number; messageId?: number; fromPhoto?: boolean };
export type ExtPackage = { id: number; name: string; duration_value: number; duration_unit: string; price_bdt: number; active: boolean };

const UNITS = ["minute", "hour", "day", "week", "month"];
const DOWNLOAD_URL = "https://smm-pro-panel.lovable.app/zexxa-extension.zip";

let pkgCache: { at: number; list: ExtPackage[] } | null = null;
let keyCache: string | null = null;

export function invalidatePackages() {
  pkgCache = null;
}

export async function listPackages(includeInactive = false): Promise<ExtPackage[]> {
  if (!pkgCache || Date.now() - pkgCache.at > 60_000) {
    const { data } = await supabaseAdmin.from("bot_ext_packages").select("*").order("price_bdt");
    pkgCache = { at: Date.now(), list: ((data ?? []) as any[]).map((p) => ({ ...p, price_bdt: Number(p.price_bdt) })) };
  }
  return includeInactive ? pkgCache.list : pkgCache.list.filter((p) => p.active);
}

export function priceUsd(pkg: ExtPackage): number {
  return Math.round((pkg.price_bdt / currencies().BDT.rate) * 10000) / 10000;
}

function durationLabel(p: ExtPackage): string {
  if (p.duration_unit === "month" && p.duration_value >= 120) return "Lifetime";
  return `${p.duration_value} ${p.duration_unit}${p.duration_value > 1 ? "s" : ""}`;
}

async function apiKey(): Promise<string> {
  if (process.env["EKLAS_API_KEY"]) return process.env["EKLAS_API_KEY"];
  if (keyCache) return keyCache;
  const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "eklas_api_key").maybeSingle();
  if (!data?.value) throw new Error("License key missing");
  keyCache = String(data.value);
  return keyCache;
}

async function generateLicense(pkg: ExtPackage): Promise<{ key: string; expiresAt: string | null }> {
  const res = await fetch("https://io.eklas.dev/api/v1/license/generate", {
    method: "POST",
    headers: { Authorization: `Bearer ${await apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "Pro", durationValue: pkg.duration_value, durationUnit: pkg.duration_unit, maxActivations: 5 }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!json?.ok || !json.license_key) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return { key: String(json.license_key), expiresAt: json.expires_at ?? null };
}

async function show(ctx: Ctx, text: string, keyboard: InlineKeyboard) {
  const markup = { reply_markup: ik(keyboard) };
  if (ctx.messageId && !ctx.fromPhoto) {
    if (await editMessage(ctx.chatId, ctx.messageId, text, markup)) return;
  }
  if (ctx.messageId) await tg("deleteMessage", { chat_id: ctx.chatId, message_id: ctx.messageId });
  await sendMessage(ctx.chatId, text, markup);
}

export async function showExtStore(ctx: Ctx) {
  const pkgs = await listPackages();
  const rows: InlineKeyboard = pkgs.map((p) => [{ text: `💎 ${p.name} · ${money(priceUsd(p))}`, callback_data: `ext:p:${p.id}` }]);
  rows.push([{ text: "🔑 My Licenses", callback_data: "ext:my" }]);
  rows.push([{ text: "🏠 Home", callback_data: "home" }]);
  await show(ctx, [
    "<b>⚡ LOVABLE UNLIMITED EXTENSION</b>",
    DIVIDER,
    "Unlimited Lovable credits with the premium <b>ZEXXA</b> Chrome extension.",
    "",
    "🔑 License key delivered <b>instantly</b>",
    "📦 Extension file sent right inside the bot",
    "💻 Up to 5 device activations",
    DIVIDER,
    pkgs.length ? "<b>Choose a package:</b>" : "<i>No packages available right now.</i>",
  ].join("\n"), rows);
}

export async function showExtPackage(ctx: Ctx, id: number) {
  const pkg = (await listPackages()).find((p) => p.id === id);
  if (!pkg) return show(ctx, "⚠️ This package is no longer available.", [[{ text: "⬅️ Back", callback_data: "ext" }]]);
  const charge = priceUsd(pkg);
  const user = await getUser(ctx.chatId);
  await setState(ctx.chatId, "ext_confirm", { packageId: pkg.id, charge });
  const enough = Number(user?.balance ?? 0) + 0.00001 >= charge;
  await show(ctx, [
    `<b>💎 ${escapeHtml(pkg.name)}</b>`,
    DIVIDER,
    `⏳ <b>Validity</b> · <code>${durationLabel(pkg)}</code>`,
    `🏷 <b>Price</b> · <code>${money(charge)}</code>`,
    `💰 <b>Your balance</b> · <code>${money(Number(user?.balance ?? 0))}</code>`,
    DIVIDER,
    enough ? "Choose how you want to pay:" : "⚠️ Wallet balance is low — pay directly below.",
  ].join("\n"), [
    ...(enough ? [[{ text: "💳 Pay from Wallet", callback_data: "ext:pay:w" }]] : []),
    [{ text: "📱 Direct Pay with bKash", callback_data: "ext:pay:b" }],
    [{ text: "💎 Direct Pay with USDT", callback_data: "ext:pay:d" }],
    [{ text: "⬅️ Back", callback_data: "ext" }, { text: "🏠 Home", callback_data: "home" }],
  ]);
}

async function sendExtension(chatId: number, key: string) {
  await tg("sendDocument", {
    chat_id: chatId,
    document: DOWNLOAD_URL,
    caption: `📦 <b>ZEXXA Extension</b>\nActivate with: <code>${escapeHtml(key)}</code>\n\n<blockquote>Chrome → Extensions → enable Developer mode → Load unpacked (extract the zip first).</blockquote>`,
    parse_mode: "HTML",
  });
}

export async function buyExtension(chatId: number, draft: { packageId: number; charge: number }) {
  const user = await getUser(chatId);
  if (!user) return;
  const pkg = (await listPackages()).find((p) => p.id === draft.packageId);
  if (!pkg) {
    await clearState(chatId);
    await sendMessage(chatId, "⚠️ This package is no longer available. Nothing was charged.");
    return;
  }
  if (Number(user.balance) + 0.00001 < draft.charge) {
    await sendMessage(chatId, "⚠️ Wallet balance is not enough. Please top up and try again.", {
      reply_markup: ik([[{ text: "💳 Add Funds", callback_data: "dep" }]]),
    });
    return;
  }
  await sendChatAction(chatId);
  const balanceAfter = await adjustBalance(chatId, -draft.charge);
  try {
    const lic = await generateLicense(pkg);
    await supabaseAdmin.from("bot_ext_licenses").insert({
      telegram_id: chatId,
      package_id: pkg.id,
      package_name: pkg.name,
      license_key: lic.key,
      expires_at: lic.expiresAt,
      charge: draft.charge,
    });
    await supabaseAdmin.from("bot_users").update({ total_spent: Number(user.total_spent) + draft.charge }).eq("telegram_id", chatId);
    await clearState(chatId);
    await sendMessage(chatId, [
      "<b>✅ LICENSE ACTIVATED</b>",
      DIVIDER,
      `💎 <b>Package</b> · <code>${escapeHtml(pkg.name)}</code>`,
      `🔑 <b>License</b> · <code>${escapeHtml(lic.key)}</code>`,
      `⏳ <b>Expires</b> · <code>${durationLabel(pkg) === "Lifetime" ? "Lifetime" : lic.expiresAt ? lic.expiresAt.slice(0, 10) : "—"}</code>`,
      `💵 <b>Charged</b> · <code>${money(draft.charge)}</code>`,
      `💰 <b>New balance</b> · <code>${money(balanceAfter)}</code>`,
      DIVIDER,
      "<i>Tap the key to copy it. Your extension file is below.</i>",
    ].join("\n"), {
      message_effect_id: EFFECTS.party,
      reply_markup: ik([[{ text: "🔑 My Licenses", callback_data: "ext:my" }, { text: "🏠 Home", callback_data: "home" }]]),
    });
    await sendExtension(chatId, lic.key);
    await notifyAdmins([
      "<b>⚡ EXTENSION SOLD</b>",
      DIVIDER,
      `👤 <code>${chatId}</code> ${user.username ? "@" + escapeHtml(user.username) : ""}`,
      `💎 ${escapeHtml(pkg.name)} · ৳${pkg.price_bdt}`,
      `🔑 <code>${escapeHtml(lic.key)}</code>`,
    ].join("\n"));
  } catch (error) {
    console.error("[ext] license failed", error);
    const refunded = await adjustBalance(chatId, draft.charge);
    await clearState(chatId);
    await sendMessage(chatId, `⚠️ License could not be generated right now. <b>${money(draft.charge)}</b> was refunded to your wallet (balance ${money(refunded)}).`, {
      reply_markup: ik([[{ text: "🆘 Support", url: `https://t.me/${supportUsername()}` }]]),
    });
    await notifyAdmins(`⚠️ <b>Extension license failed</b> for <code>${chatId}</code> — refunded.\n<code>${escapeHtml(String((error as Error).message))}</code>`);
  }
}

export async function showMyLicenses(ctx: Ctx) {
  const { data } = await supabaseAdmin
    .from("bot_ext_licenses")
    .select("id, package_name, license_key, expires_at")
    .eq("telegram_id", ctx.chatId)
    .order("created_at", { ascending: false })
    .limit(10);
  const list = (data ?? []) as any[];
  const lines = ["<b>🔑 MY LICENSES</b>", DIVIDER];
  if (!list.length) lines.push("<i>You have no licenses yet.</i>");
  for (const l of list) {
    const exp = l.expires_at && new Date(l.expires_at).getFullYear() - new Date().getFullYear() < 5 ? String(l.expires_at).slice(0, 10) : "Lifetime";
    lines.push(`💎 <b>${escapeHtml(l.package_name)}</b> · <i>${exp}</i>\n<code>${escapeHtml(l.license_key)}</code>`, "");
  }
  await show(ctx, lines.join("\n"), [
    ...(list.length ? [[{ text: "📦 Download Extension", callback_data: "ext:dl" }]] : []),
    [{ text: "⚡ Extension Store", callback_data: "ext" }, { text: "🏠 Home", callback_data: "home" }],
  ]);
}

export async function downloadExtension(chatId: number) {
  const { data } = await supabaseAdmin
    .from("bot_ext_licenses")
    .select("license_key")
    .eq("telegram_id", chatId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return sendMessage(chatId, "⚠️ Buy a license first to download the extension.");
  return sendExtension(chatId, String(data.license_key));
}

/* --------------------------------- admin --------------------------------- */

export async function adminExtStore(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const pkgs = await listPackages(true);
  const { data } = await supabaseAdmin.from("bot_ext_licenses").select("charge");
  const sold = (data ?? []).length;
  const revenue = (data ?? []).reduce((s: number, r: any) => s + Number(r.charge), 0);
  const lines = [
    "<b>⚡ EXTENSION STORE</b>",
    DIVIDER,
    `🔑 Licenses sold · <code>${sold}</code>`,
    `💵 Revenue · <code>$${revenue.toFixed(2)}</code>`,
    DIVIDER,
    "<b>Packages</b> (tap to remove):",
  ];
  const keyboard: InlineKeyboard = pkgs.map((p) => [
    { text: `🗑 ${p.name} · ${durationLabel(p)} · ৳${p.price_bdt}`, callback_data: `a:extdel:${p.id}` },
  ]);
  keyboard.push([{ text: "➕ Add Package", callback_data: "a:extadd" }]);
  keyboard.push([{ text: "⬅️ Admin Panel", callback_data: "a:panel" }]);
  return { text: lines.join("\n"), keyboard };
}

export async function startExtAdd(chatId: number): Promise<{ text: string; keyboard: InlineKeyboard }> {
  await setState(chatId, "await_admin_ext", {});
  return {
    text: [
      "<b>➕ NEW PACKAGE</b>",
      DIVIDER,
      "Send: <code>NAME | DURATION UNIT | PRICE_BDT</code>",
      `Units: ${UNITS.join(", ")} (use <code>120 month</code> for lifetime)`,
      "",
      "<blockquote>Example: <code>3 Months | 90 day | 5</code></blockquote>",
    ].join("\n"),
    keyboard: [[{ text: "✖️ Cancel", callback_data: "a:ext" }]],
  };
}

export async function addPackageFromText(text: string): Promise<string | null> {
  const parts = text.split("|").map((s) => s.trim());
  const [dv, du] = (parts[1] ?? "").split(/\s+/);
  const value = Number(dv);
  const unit = (du ?? "").toLowerCase().replace(/s$/, "");
  const price = Number(parts[2]);
  if (!parts[0] || !Number.isInteger(value) || value <= 0 || !UNITS.includes(unit) || !Number.isFinite(price) || price <= 0) {
    return "⚠️ Invalid format. Example: <code>3 Months | 90 day | 5</code>";
  }
  const { error } = await supabaseAdmin.from("bot_ext_packages").insert({ name: parts[0].slice(0, 40), duration_value: value, duration_unit: unit, price_bdt: price });
  invalidatePackages();
  return error ? `⚠️ ${escapeHtml(error.message)}` : null;
}

export async function deletePackage(id: number) {
  await supabaseAdmin.from("bot_ext_packages").update({ active: false }).eq("id", id);
  await supabaseAdmin.from("bot_ext_packages").delete().eq("id", id).eq("active", false);
  invalidatePackages();
}

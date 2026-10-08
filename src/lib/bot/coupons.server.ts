// Coupons: admin-generated per bot, optionally locked to one product code. Server-only.
import { supabaseAdmin } from "./store.server";
import { currentBot } from "./scope.server";
import { currencies } from "./config.server";
import { applyDiscount, parseCouponSpec, productMatches } from "./coupon-rules";
import { escapeHtml, type InlineKeyboard } from "./telegram.server";
import { DIVIDER, usd } from "./views.server";

export type Coupon = {
  id: string;
  code: string;
  percent: number | null;
  amount_usd: number | null;
  product: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
};

function randomCode(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return (currentBot() === "tg" ? "TG-" : "FS-") + [...bytes].map((b) => abc[b % abc.length]).join("");
}

export function describe(c: Pick<Coupon, "percent" | "amount_usd">): string {
  return c.percent ? `${Number(c.percent)}% off` : `${usd(Number(c.amount_usd))} off`;
}

/** Validates a coupon for this user + product. Returns the new price or an error message. */
export async function checkCoupon(
  telegramId: number,
  rawCode: string,
  price: number,
  productCodes: string[],
): Promise<{ ok: true; code: string; price: number; label: string } | { ok: false; error: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: "❌ Invalid coupon code." };
  const { data } = await supabaseAdmin.from("bot_coupons").select("*").eq("code", code).eq("bot", currentBot()).maybeSingle();
  const c = data as Coupon | null;
  if (!c || !c.active) return { ok: false, error: "❌ Coupon not found." };
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { ok: false, error: "⌛ This coupon has expired." };
  if (c.used_count >= c.max_uses) return { ok: false, error: "🚫 This coupon is fully used." };
  if (!productMatches(c.product, productCodes)) return { ok: false, error: "🚫 This coupon is not valid for this product." };
  const { data: used } = await supabaseAdmin.from("bot_coupon_uses").select("coupon_id").eq("coupon_id", c.id).eq("telegram_id", telegramId).maybeSingle();
  if (used) return { ok: false, error: "🚫 You've already used this coupon." };
  return { ok: true, code, price: applyDiscount(price, c), label: describe(c) };
}

/** Atomically consumes one use; false if it is no longer valid. */
export async function redeemCoupon(telegramId: number, code: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("bot_redeem_coupon", { _code: code, _bot: currentBot(), _telegram_id: telegramId });
  return !error && data === true;
}

export async function releaseCoupon(telegramId: number, code: string) {
  await supabaseAdmin.rpc("bot_release_coupon", { _code: code, _bot: currentBot(), _telegram_id: telegramId });
}

export async function createCoupon(input: string): Promise<{ ok: true; coupon: Coupon } | { ok: false }> {
  const spec = parseCouponSpec(input, currencies().BDT.rate);
  if (!spec) return { ok: false };
  const { data, error } = await supabaseAdmin
    .from("bot_coupons")
    .insert({
      bot: currentBot(),
      code: spec.code ?? randomCode(),
      percent: spec.percent,
      amount_usd: spec.amountUsd,
      product: spec.product,
      max_uses: spec.maxUses,
      expires_at: spec.days ? new Date(Date.now() + spec.days * 86400000).toISOString() : null,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false };
  return { ok: true, coupon: data as Coupon };
}

export function couponCard(c: Coupon): string {
  return [
    `🎟 <code>${escapeHtml(c.code)}</code> · <b>${describe(c)}</b>`,
    `   📦 ${c.product ? `Product <code>${escapeHtml(c.product)}</code>` : "All products"} · 🔁 ${c.used_count}/${c.max_uses}` +
      (c.expires_at ? ` · ⌛ ${c.expires_at.slice(0, 10)}` : ""),
  ].join("\n");
}

export async function adminCoupons(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const { data } = await supabaseAdmin
    .from("bot_coupons")
    .select("*")
    .eq("bot", currentBot())
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(15);
  const list = (data ?? []) as Coupon[];
  const keyboard: InlineKeyboard = list.map((c) => [{ text: `🗑 Disable ${c.code}`, callback_data: `cpx:${c.code}` }]);
  keyboard.unshift([{ text: "➕ Generate Coupon", callback_data: "a:cpadd" }]);
  keyboard.push([{ text: "⬅️ Admin Panel", callback_data: "a:panel" }]);
  return {
    text: [
      "<b>🎟 COUPONS</b>",
      DIVIDER,
      list.length ? list.map(couponCard).join("\n\n") : "No active coupons yet.",
    ].join("\n"),
    keyboard,
  };
}

export async function disableCoupon(code: string) {
  await supabaseAdmin.from("bot_coupons").update({ active: false }).eq("code", code.toUpperCase()).eq("bot", currentBot());
}

export const COUPON_HELP = [
  "<b>➕ Generate Coupon</b>",
  DIVIDER,
  "Send the discount, then optional settings:",
  "",
  "<code>10%</code> — 10% off, 1 use, any product",
  "<code>$2 uses=50</code> — $2 off, 50 users",
  "<code>৳50 product=1234 days=7</code> — ৳50 off product 1234, valid 7 days",
  "<code>15% product=BD code=EID15</code> — custom code, BD accounts only",
  "",
  "<blockquote>Each customer can use a coupon once. Product codes work for SMM service codes, TG item IDs or TG country codes (e.g. BD).</blockquote>",
].join("\n");

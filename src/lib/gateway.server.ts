// Hosted bKash payment gateway core. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bkashNumber, generateBkashRef, parseBkashSms } from "./bot/bkash.server";

const db = supabaseAdmin as any;
const GW_CLAIMER = -1; // bot_bkash_sms.claimed_by sentinel: payment used by the gateway

export function checkAdmin(pw: string) {
  const real = process.env["GATEWAY_ADMIN_PASSWORD"];
  if (!real || pw !== real) throw new Error("Wrong password");
}

export async function keyMerchant(key: string | null): Promise<string | null> {
  if (!key) return null;
  const { data } = await db.from("gw_keys").select("name").eq("key", key).eq("active", true).maybeSingle();
  return data?.name ?? null;
}

export function newId(prefix: string, n = 16) {
  const c = "abcdefghijkmnpqrstuvwxyz23456789";
  return prefix + Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => c[b % c.length]).join("");
}

export async function createInvoice(i: { amount: number; merchant: string; order?: string | undefined; note?: string | null | undefined; callback?: string | undefined; minutes?: number | undefined }) {
  const row = {
    id: newId("inv_"), amount_bdt: Math.round(i.amount * 100) / 100, ref: generateBkashRef(), merchant: i.merchant,
    merchant_order: i.order ?? null, note: i.note ?? null, callback_url: i.callback ?? null,
    expires_at: new Date(Date.now() + (i.minutes ?? 30) * 60_000).toISOString(),
  };
  const { error } = await db.from("gw_invoices").insert(row);
  if (error) throw new Error("Could not create invoice");
  return row;
}

export function publicInvoice(r: any) {
  const expired = r.status === "pending" && new Date(r.expires_at).getTime() < Date.now();
  return {
    id: r.id, amount: Number(r.amount_bdt), ref: r.ref, status: expired ? "expired" : r.status,
    trx_id: r.trx_id, paid_amount: r.paid_bdt == null ? null : Number(r.paid_bdt), merchant: r.merchant,
    order: r.merchant_order, note: r.note, created_at: r.created_at, expires_at: r.expires_at, paid_at: r.paid_at,
    pay_number: bkashNumber(),
  };
}

export async function getInvoice(id: string) {
  const { data } = await db.from("gw_invoices").select("*").eq("id", id).maybeSingle();
  return data;
}

async function markPaid(inv: any, trx: string, paid: number, payer: string | null) {
  const { data } = await db.from("gw_invoices")
    .update({ status: "paid", trx_id: trx, paid_bdt: paid, payer, paid_at: new Date().toISOString() })
    .eq("id", inv.id).eq("status", "pending").select("*");
  const row = data?.[0];
  if (row?.callback_url) {
    fetch(row.callback_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "invoice.paid", invoice: publicInvoice(row) }) }).catch(() => {});
  }
  return row;
}

/** Claims one SMS atomically, then marks the invoice paid. Each TrxID can be used once across bots + gateway. */
async function claimSms(inv: any, trxId: string, amount: number, from: string | null): Promise<VerifyResult> {
  if (amount + 0.009 < Number(inv.amount_bdt)) return { ok: false, reason: "amount_low" };
  const { data } = await db.from("bot_bkash_sms").update({ claimed_by: GW_CLAIMER, claimed_at: new Date().toISOString() })
    .eq("trx_id", trxId).is("claimed_by", null).select("id");
  if (!data?.length) return { ok: false, reason: "used" };
  await markPaid(inv, trxId, amount, from);
  return { ok: true };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "not_found" | "used" | "amount_low" | "expired" | "not_pending" };

export async function verifyInvoice(id: string, trxRaw?: string): Promise<VerifyResult> {
  const inv = await getInvoice(id);
  if (!inv) return { ok: false, reason: "not_found" };
  if (inv.status !== "pending") return inv.status === "paid" ? { ok: true } : { ok: false, reason: "not_pending" };
  if (new Date(inv.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  const since = new Date(new Date(inv.created_at).getTime() - 10 * 60_000).toISOString();

  if (trxRaw) {
    const trx = trxRaw.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,12}$/.test(trx)) return { ok: false, reason: "not_found" };
    const { data: s } = await db.from("bot_bkash_sms").select("*").eq("trx_id", trx).maybeSingle();
    if (!s || new Date(s.received_at).toISOString() < since) return { ok: false, reason: "not_found" };
    if (s.claimed_by != null) return { ok: false, reason: "used" };
    return claimSms(inv, trx, Number(s.amount_bdt), parseBkashSms(s.body)?.from ?? null);
  }
  // Super mode: find an unclaimed SMS carrying this invoice's reference.
  const { data } = await db.from("bot_bkash_sms").select("trx_id, body, amount_bdt").is("claimed_by", null)
    .gte("received_at", since).ilike("body", `%${inv.ref}%`).limit(5);
  for (const s of data ?? []) {
    const p = parseBkashSms(s.body);
    if (p?.ref === inv.ref) return claimSms(inv, s.trx_id, p!.amount, p!.from);
  }
  return { ok: false, reason: "not_found" };
}

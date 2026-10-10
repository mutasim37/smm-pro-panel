// bKash payments via an SMS-forwarder app. Server-only.
import { supabaseAdmin } from "./store.server";

export function bkashNumber(): string {
  return process.env["BKASH_NUMBER"] ?? "01345500016";
}

/** Max age of a forwarded SMS that can still be claimed. */
export const BKASH_MAX_AGE_HOURS = 72;

export async function bkashSecret(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "bkash_webhook").maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

export type ParsedSms = { trxId: string; amount: number; from: string | null; ref: string | null };

/** Extracts TrxID + received amount (+ payer number and reference) from an official bKash SMS. */
export function parseBkashSms(body: string): ParsedSms | null {
  const text = body.replace(/\s+/g, " ");
  const trx = text.match(/TrxID\s*[:#]?\s*([A-Z0-9]{8,12})/i);
  const amt =
    text.match(/(?:received|cash\s*in)\s*(?:of\s*)?Tk\.?\s*([\d,]+(?:\.\d+)?)/i) ??
    text.match(/Tk\.?\s*([\d,]+(?:\.\d+)?)/i);
  if (!trx?.[1] || !amt?.[1]) return null;
  // Only incoming money (received / cash in), never outgoing payments.
  if (!/received|cash\s*in/i.test(text)) return null;
  const amount = Number(amt[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const from = text.match(/from\s*(\+?\d[\d\s-]{9,15}\d)/i)?.[1]?.replace(/\D/g, "") ?? null;
  const ref = text.match(/\bRef(?:erence)?\.?\s*[:#]?\s*([A-Za-z0-9]{3,20})\b/i)?.[1]?.toUpperCase() ?? null;
  return { trxId: trx[1].toUpperCase(), amount, from, ref };
}

/** 8-character payment reference without easily confused characters. */
export function generateBkashRef(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function normalizeBdPhone(value: string): string | null {
  const d = value.replace(/\D/g, "").replace(/^880/, "0").replace(/^88/, "");
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
}

export type RefClaim = { bot: string; telegram_id: number; amount: number; ref: string; message_id: number | null; pending_order: any; trxId: string };

/** Atomically matches a forwarded SMS (by TrxID) to a pending reference + payer number. */
export async function claimBkashRef(trxId: string, ref: string, sender: string): Promise<RefClaim | null> {
  const { data } = await (supabaseAdmin.rpc as any)("bot_claim_bkash_ref", { _trx: trxId, _ref: ref, _sender: sender });
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { ...row, amount: Number(row.amount), trxId: trxId.toUpperCase() } : null;
}

/** Recheck: scan recent unclaimed SMS for this reference. */
export async function findBkashRefPayment(ref: string, sender: string, since: string): Promise<RefClaim | null> {
  const { data } = await supabaseAdmin
    .from("bot_bkash_sms")
    .select("trx_id, body")
    .is("claimed_by", null)
    .gte("received_at", new Date(new Date(since).getTime() - 10 * 60_000).toISOString())
    .ilike("body", `%${ref}%`)
    .limit(10);
  for (const s of data ?? []) {
    const p = parseBkashSms(s.body);
    if (p?.ref === ref && p.from) {
      const c = await claimBkashRef(s.trx_id, ref, p.from);
      if (c) return c;
    }
  }
  return null;
}

export function looksLikeTrxId(value: string): boolean {
  return /^[A-Z0-9]{8,12}$/i.test(value.trim());
}

export type ClaimResult =
  | { ok: true; amount: number }
  | { ok: false; reason: "not_found" | "used" | "mismatch" | "too_old" };

/** Atomically claims a forwarded bKash payment for a user. */
export async function claimBkash(telegramId: number, trxIdRaw: string, expectedBdt: number): Promise<ClaimResult> {
  const trxId = trxIdRaw.trim().toUpperCase();
  const { data: row } = await supabaseAdmin.from("bot_bkash_sms").select("*").eq("trx_id", trxId).maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };
  if (row.claimed_by) return { ok: false, reason: "used" };
  if (Date.now() - new Date(row.received_at).getTime() > BKASH_MAX_AGE_HOURS * 3600_000) return { ok: false, reason: "too_old" };
  if (Math.abs(Number(row.amount_bdt) - expectedBdt) > 0.009) return { ok: false, reason: "mismatch" };

  const { data: claimed } = await supabaseAdmin
    .from("bot_bkash_sms")
    .update({ claimed_by: telegramId, claimed_at: new Date().toISOString() })
    .eq("trx_id", trxId)
    .is("claimed_by", null)
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: false, reason: "used" };
  return { ok: true, amount: Number(row.amount_bdt) };
}

// bKash payments via an SMS-forwarder app. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function bkashNumber(): string {
  return process.env["BKASH_NUMBER"] ?? "01345500016";
}

/** Max age of a forwarded SMS that can still be claimed. */
export const BKASH_MAX_AGE_HOURS = 72;

export async function bkashSecret(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "bkash_webhook").maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

export type ParsedSms = { trxId: string; amount: number };

/** Extracts TrxID + received amount from an official bKash SMS. */
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
  return { trxId: trx[1].toUpperCase(), amount };
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

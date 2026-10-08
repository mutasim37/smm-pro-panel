// Telegram account supplier client. Server-only. Never expose supplier details to users.
import { supabaseAdmin } from "./store.server";

const BASE = "http://phoenixstoreapi.duckdns.org:6772";
let keyCache: string | null = null;

async function apiKey(): Promise<string> {
  if (process.env["PHOENIX_API_KEY"]) return process.env["PHOENIX_API_KEY"];
  if (keyCache) return keyCache;
  const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "phoenix_api_key").maybeSingle();
  if (!data?.value) throw new Error("TG store key missing");
  keyCache = String(data.value);
  return keyCache;
}

export class PhoenixError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T = any>(path: string, method: "GET" | "POST" = "GET", body?: unknown, timeoutMs = 25000): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await apiKey()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.errors?.[0];
    throw new PhoenixError(res.status, err?.code ?? "error", err?.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export type TgItem = {
  item_id: number;
  price: number;
  telegram_country: string;
  item_origin?: string;
  telegram_premium?: number;
  telegram_spam_block?: number;
  telegram_contacts_count?: number;
  telegram_chats_count?: number;
  telegram_channels_count?: number;
  telegram_last_seen?: number;
  telegram_password?: number;
  telegram_authorizations?: number;
};

const listCache = new Map<string, { at: number; items: TgItem[]; hasNext: boolean; total: number }>();

export async function searchAccounts(country: string, page: number) {
  const key = `${country}:${page}`;
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < 90 * 1000) return hit;
  let json: any;
  try {
  const qs = new URLSearchParams({ page: String(page), currency: "usd", order_by: "price_to_up", spam: "no" });
  if (country !== "ALL") qs.append("country[]", country);
    json = await call(`/telegram?${qs.toString()}`, "GET", undefined, 15000);
  } catch (error) {
    // Supplier slow/down: serve last good list (up to 6h) instead of an error.
    if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit;
    throw error;
  }
  const items: TgItem[] = (json.items ?? []).map((i: any) => ({ ...i, price: Number(i.price) }));
  const value = { at: Date.now(), items, hasNext: Boolean(json.hasNextPage), total: Number(json.totalItems ?? items.length) };
  listCache.set(key, value);
  if (listCache.size > 300) listCache.delete(listCache.keys().next().value!);
  return value;
}

export async function getAccount(itemId: number): Promise<TgItem | null> {
  try {
    const json: any = await call(`/${itemId}`);
    const item = json.item ?? null;
    return item ? { ...item, price: Number(item.price) } : null;
  } catch (error) {
    if (error instanceof PhoenixError && error.status === 404) return null;
    throw error;
  }
}

export async function fastBuy(itemId: number) {
  const json: any = await call(`/${itemId}/fast-buy`, "POST");
  return {
    phone: String(json.order?.phone ?? json.item?.telegram_phone ?? ""),
    orderRef: String(json.order?.order_ref ?? ""),
    cost: Number(json.order?.price_usd ?? json.item?.price ?? 0),
    country: String(json.item?.telegram_country ?? ""),
  };
}

export async function loginCode(itemId: number): Promise<string | null> {
  const json: any = await call(`/${itemId}/telegram-login-code`);
  if (!json.ok) return null;
  const codes = (json.codes ?? []).map((c: any) => c.code).filter(Boolean);
  return codes.length ? codes.join(", ") : null;
}

export async function resetSessions(itemId: number) {
  await call(`/${itemId}/telegram-reset-authorizations`, "POST");
}

export async function supplierBalance(): Promise<number> {
  const json: any = await call(`/balance`);
  return Number(json.balance ?? 0);
}

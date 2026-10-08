// Reseller API (SMM-panel standard): key auth, services/add/status/balance. Money in USD.
import { getCatalog } from "./catalog.server";
import { getUser, supabaseAdmin } from "./store.server";
import { currentBot } from "./scope.server";
import { apiAddress, apiDocsAddress } from "./api-rules";

export const apiBase = () => apiAddress(currentBot());
export const apiDocsUrl = () => apiDocsAddress(currentBot());
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

export function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function getApiKey(telegramId: number): Promise<string | null> {
  const { data } = await supabaseAdmin.from("bot_api_keys").select("api_key").eq("telegram_id", telegramId).maybeSingle();
  return data?.api_key ?? null;
}

export async function regenerateApiKey(telegramId: number): Promise<string> {
  const key = newApiKey();
  const { error } = await supabaseAdmin.from("bot_api_keys").upsert({ telegram_id: telegramId, api_key: key, created_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return key;
}

const fmt = (n: number) => n.toFixed(4);
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export async function handleApi(params: Record<string, string>): Promise<unknown> {
  const key = (params["key"] ?? "").trim();
  if (!/^[A-Za-z0-9]{16}$/.test(key)) return { error: "Invalid API key" };
  const { data: row } = await supabaseAdmin.from("bot_api_keys").select("telegram_id").eq("api_key", key).maybeSingle();
  if (!row) return { error: "Invalid API key" };
  const uid = Number(row.telegram_id);
  const action = (params["action"] ?? "").toLowerCase();

  if (action === "balance") {
    const user = await getUser(uid);
    return { balance: fmt(Number(user?.balance ?? 0)), currency: "USD" };
  }

  if (action === "services") {
    const catalog = await getCatalog();
    const wanted = (params["services"] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
    const list = wanted.length ? wanted.flatMap((id) => { const s=catalog.services.get(id); return s ? [s] : []; }) : [...catalog.services.values()];
    return list.map((s) => ({
      service: s.id, name: s.name, type: s.type, category: s.category,
      rate: fmt(s.price), min: s.min, max: s.max, refill: s.refill, cancel: s.cancel,
    }));
  }

  if (action === "add") return { error: "Use the dedicated bot API with request_id" };

  if (action === "status") {
    const ids = (params["orders"] ?? params["order"] ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    if (!ids.length) return { error: "Order ID is required" };
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const { data } = valid.length
      ? await supabaseAdmin.from("bot_orders").select("id,status,charge,start_count,remains").eq("telegram_id", uid).in("id", valid)
      : { data: [] as any[] };
    const map = new Map((data ?? []).map((o: any) => [o.id, o]));
    const view = (id: string) => {
      const o = map.get(id);
      return o
        ? { order: id, status: titleCase(String(o.status)), charge: fmt(Number(o.charge)), start_count: o.start_count ?? "0", remains: o.remains ?? "0", currency: "USD" }
        : { error: "Order not found" };
    };
    if (params["orders"]) return Object.fromEntries(ids.map((id) => [id, view(id)]));
    const first=ids[0];
    return first ? view(first) : {error:"Order ID is required"};
  }

  return { error: "Incorrect action" };
}

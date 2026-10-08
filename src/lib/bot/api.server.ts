// Reseller API (SMM-panel standard): key auth, services/add/status/balance. Money in USD.
import { getCatalog, isQuantityFree, needsComments, priceFor } from "./catalog.server";
import { placeOrder } from "./smmgen.server";
import { adjustBalance, getUser, supabaseAdmin } from "./store.server";
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
    const list = wanted.length ? wanted.map((id) => catalog.services.get(id)).filter((s) => !!s) : [...catalog.services.values()];
    return list.map((s) => ({
      service: s!.id, name: s!.name, type: s!.type, category: s!.category,
      rate: fmt(s!.price), min: s!.min, max: s!.max, refill: s!.refill, cancel: s!.cancel,
    }));
  }

  if (action === "add") {
    const catalog = await getCatalog();
    const service = catalog.services.get(Number(params["service"]));
    if (!service) return { error: "Incorrect service ID" };
    const link = (params["link"] ?? "").trim();
    if (!link || link.length > 500) return { error: "Link is required" };
    let comments: string | undefined;
    let quantity = Number(params["quantity"] ?? 0);
    if (needsComments(service)) {
      comments = (params["comments"] ?? "").trim();
      if (!comments) return { error: "Comments are required for this service" };
      quantity = comments.split("\n").filter((l) => l.trim()).length;
    }
    if (isQuantityFree(service) && !quantity) quantity = service.min;
    if (!Number.isInteger(quantity) || quantity < service.min || quantity > service.max)
      return { error: `Quantity must be between ${service.min} and ${service.max}` };
    const charge = priceFor(service, quantity);
    const user = await getUser(uid);
    if (!user || Number(user.balance) + 0.00001 < charge) return { error: "Not enough funds on balance" };

    const balance = await adjustBalance(uid, -charge);
    const { data: order } = await supabaseAdmin.from("bot_orders").insert({
      telegram_id: uid, service_id: service.id, service_name: service.name, category: service.category,
      link, quantity, comments: comments ?? null, charge, status: "processing", source: "api",
    }).select("id").single();
    try {
      const result = await placeOrder({ service: service.id, link, quantity: comments ? undefined : quantity, comments });
      if (!result.order) throw new Error(result.error ?? "Order rejected");
      await supabaseAdmin.from("bot_orders").update({ provider_order_id: String(result.order), status: "in progress", updated_at: new Date().toISOString() }).eq("id", order?.id ?? "");
      await supabaseAdmin.from("bot_users").update({ total_spent: Number(user.total_spent) + charge }).eq("telegram_id", uid);
      import("./growth.server").then((g) => g.rewardReferrer(uid, charge)).catch(() => null);
      return { order: order?.id, charge: fmt(charge), currency: "USD", balance: fmt(balance) };
    } catch {
      const refunded = await adjustBalance(uid, charge);
      await supabaseAdmin.from("bot_orders").update({ status: "failed", refunded: charge }).eq("id", order?.id ?? "");
      return { error: "Order could not be placed, charge refunded", balance: fmt(refunded) };
    }
  }

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
    return view(ids[0]!);
  }

  return { error: "Incorrect action" };
}

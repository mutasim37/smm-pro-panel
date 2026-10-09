// SMS supplier adapter backed by 5SIM (https://5sim.net/docs).
// Exposes the classic handler-style responses (ACCESS_NUMBER, STATUS_OK, ACCESS_CANCEL…)
// so the existing reservation/refund safety logic stays unchanged.
import { env } from "./config.server";
import { supabaseAdmin } from "./store.server";

const BASE = "https://5sim.net/v1";
async function call(path: string, auth = true): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(BASE + path, {
      headers: { Accept: "application/json", ...(auth ? { Authorization: `Bearer ${env("FIVESIM_API_KEY")}` } : {}) },
      signal: AbortSignal.timeout(20000),
    });
    return { ok: res.ok, status: res.status, text: (await res.text()).trim() };
  } catch {
    throw new Error("SMS supplier did not respond. Please try again later.");
  }
}
const json = (t: string) => { try { return JSON.parse(t); } catch { return null; } };

export async function grizzly(action: string, params: Record<string, string> = {}): Promise<string> {
  if (action === "getBalance") {
    const r = await call("/user/profile"); const b = Number(json(r.text)?.balance);
    return Number.isFinite(b) ? `ACCESS_BALANCE:${b}` : "ERROR";
  }
  if (action === "getNumber") {
    const { service = "", country = "" } = params;
    const cat = await smsCatalog();
    const op = cat.prices[country]?.[service]?.op ?? "any";
    const q = op === "any" && params["maxPrice"] ? `?maxPrice=${encodeURIComponent(params["maxPrice"])}` : "";
    const r = await call(`/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(op)}/${encodeURIComponent(service)}${q}`);
    const o = json(r.text);
    if (r.ok && o?.id && o?.phone) return `ACCESS_NUMBER:${o.id}:${String(o.phone).replace(/\D/g, "")}`;
    // 5SIM definitive rejections (no number issued) → handler codes so the wallet refunds instantly.
    const t = r.text.toLowerCase();
    if (/no free phones|no product|not found|select operator|bad operator/.test(t)) return "NO_NUMBERS";
    if (/not enough (user )?(balance|rating)/.test(t)) return "NO_BALANCE";
    if (/bad country/.test(t)) return "SERVICE_UNAVAILABLE_REGION";
    if (/bad product|server offline/.test(t)) return "BAD_SERVICE";
    if (r.status === 401) return "BAD_KEY";
    return r.text.slice(0, 120) || "NO_NUMBERS";
  }
  if (action === "getStatus") {
    const r = await call(`/user/check/${encodeURIComponent(params["id"] ?? "")}`);
    const o = json(r.text);
    if (!r.ok || !o) return "UNKNOWN";
    const sms = Array.isArray(o.sms) ? o.sms : [];
    const code = sms.length ? String(sms[sms.length - 1]?.code ?? sms[sms.length - 1]?.text ?? "") : "";
    if (code) {
      if (o.status === "RECEIVED") void call(`/user/finish/${o.id}`).catch(() => null);
      return `STATUS_OK:${code}`;
    }
    if (o.status === "CANCELED" || o.status === "TIMEOUT" || o.status === "BANNED") return "STATUS_CANCEL";
    if (o.status === "PENDING" || o.status === "RECEIVED") return "STATUS_WAIT_CODE";
    return "UNKNOWN";
  }
  if (action === "setStatus" && params["status"] === "8") {
    const id = encodeURIComponent(params["id"] ?? "");
    const r = await call(`/user/cancel/${id}`);
    const o = json(r.text);
    if (r.ok && o?.status === "CANCELED" && !(Array.isArray(o.sms) && o.sms.length)) return "ACCESS_CANCEL";
    // Already canceled/timed out at supplier with no SMS also counts as a confirmed cancel.
    const c = json((await call(`/user/check/${id}`)).text);
    if (c && (c.status === "CANCELED" || c.status === "TIMEOUT") && !(Array.isArray(c.sms) && c.sms.length)) return "ACCESS_CANCEL";
    return r.text.slice(0, 120) || "CANCEL_FAILED";
  }
  return "UNSUPPORTED";
}

export type SmsCatalog = {
  countries: Record<string, { id: number; eng: string }>;
  services: { code: string; name: string }[];
  prices: Record<string, Record<string, { cost: number; count: number; op?: string }>>;
};
const pretty = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export async function smsCatalog(force = false): Promise<SmsCatalog> {
  const { data } = await supabaseAdmin.from("bot3_service_cache").select("payload,updated_at").eq("key", "catalog5").maybeSingle();
  if (!force && data && Date.now() - Date.parse(data.updated_at) < 180000) return data.payload as unknown as SmsCatalog;
  try {
    const [pr, cr] = await Promise.all([call("/guest/prices", false), call("/guest/countries", false)]);
    const raw = json(pr.text) as Record<string, Record<string, Record<string, { cost: number; count: number }>>> | null;
    const cj = (json(cr.text) ?? {}) as Record<string, { text_en?: string }>;
    if (!raw) throw new Error("bad");
    const prices: SmsCatalog["prices"] = {}; const products = new Set<string>(); const countries: SmsCatalog["countries"] = {};
    let i = 0;
    for (const [country, items] of Object.entries(raw)) {
      for (const [product, ops] of Object.entries(items ?? {})) {
        let best: { cost: number; op: string } | null = null; let count = 0;
        for (const [op, v] of Object.entries(ops ?? {})) {
          const n = Number(v?.count), c = Number(v?.cost);
          if (!(n > 0) || !(c > 0)) continue;
          count += n; if (!best || c < best.cost) best = { cost: c, op };
        }
        if (!best) continue;
        (prices[country] ??= {})[product] = { cost: best.cost, count, op: best.op };
        products.add(product);
      }
      if (prices[country]) countries[country] = { id: i++, eng: cj[country]?.text_en ?? pretty(country) };
    }
    const value: SmsCatalog = { countries, prices, services: [...products].map((code) => ({ code, name: pretty(code) })) };
    if (!value.services.length) throw new Error("empty");
    await supabaseAdmin.from("bot3_service_cache").upsert({ key: "catalog5", payload: value as never, updated_at: new Date().toISOString() });
    return value;
  } catch {
    if (data) return data.payload as unknown as SmsCatalog;
    throw new Error("Live SMS stock is unavailable. Please tap Retry later.");
  }
}

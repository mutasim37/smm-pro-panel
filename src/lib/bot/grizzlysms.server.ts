// Server 1: Grizzly SMS (classic handler_api). Responses are already handler-style strings.
import { env } from "./config.server";
import { supabaseAdmin } from "./store.server";
import type { SmsCatalog } from "./grizzly.server";

export async function gz(action: string, params: Record<string, string> = {}): Promise<string> {
  const url = new URL("https://api.grizzlysms.com/stubs/handler_api.php");
  url.search = new URLSearchParams({ api_key: env("GRIZZLY_SMS_API_KEY"), action, ...params }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const response = (await res.text()).trim();
    if(action === "setStatus" && params["status"] === "8" && response !== "ACCESS_CANCEL") {
      // A repeated cancel can return an error even though the first request succeeded.
      const current = await gz("getStatus", { id: params["id"] ?? "" });
      if(current === "STATUS_CANCEL") return "ACCESS_CANCEL";
      if(current.startsWith("STATUS_OK:")) return current;
    }
    return response;
  } catch { throw new Error("Server did not respond. Please try again later."); }
}

export async function gzCatalog(force = false): Promise<SmsCatalog> {
  const { data } = await supabaseAdmin.from("bot3_service_cache").select("payload,updated_at").eq("key", "catalog_gz").maybeSingle();
  if (!force && data && Date.now() - Date.parse(data.updated_at) < 180000) return data.payload as unknown as SmsCatalog;
  try {
    const [countries, services, prices] = await Promise.all([gz("getCountries"), gz("getServicesList", { lang: "en" }), gz("getPrices")]);
    const list = JSON.parse(services), rawC = JSON.parse(countries), rawP = JSON.parse(prices);
    // Keep only in-stock entries and the fields the bot uses — the raw feed is several MB.
    const p: SmsCatalog["prices"] = {}; const used = new Set<string>(); const c: SmsCatalog["countries"] = {};
    for (const [country, items] of Object.entries(rawP ?? {}) as [string, Record<string, { cost: number; count: number }>][]) {
      for (const [svc, v] of Object.entries(items ?? {})) {
        const n = Number(v?.count), cost = Number(v?.cost);
        if (n > 0 && cost > 0) { (p[country] ??= {})[svc] = { cost, count: n }; used.add(svc); }
      }
      if (p[country]) c[country] = { id: Number(rawC?.[country]?.id ?? country), eng: String(rawC?.[country]?.eng ?? country) };
    }
    const value: SmsCatalog = { countries: c, services: ((list.services ?? list) as { code: string; name: string }[]).filter(x => used.has(x.code)).map(x => ({ code: x.code, name: x.name })), prices: p };
    if (!Array.isArray(value.services) || !value.prices || !value.countries) throw new Error("bad");
    await supabaseAdmin.from("bot3_service_cache").upsert({ key: "catalog_gz", payload: value as never, updated_at: new Date().toISOString() });
    return value;
  } catch {
    if (data) return data.payload as unknown as SmsCatalog;
    throw new Error("Live stock is unavailable. Please tap Retry later.");
  }
}

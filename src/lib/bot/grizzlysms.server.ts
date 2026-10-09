// Server 1: Grizzly SMS (classic handler_api). Responses are already handler-style strings.
import { env } from "./config.server";
import { supabaseAdmin } from "./store.server";
import type { SmsCatalog } from "./grizzly.server";

export async function gz(action: string, params: Record<string, string> = {}): Promise<string> {
  const url = new URL("https://api.grizzlysms.com/stubs/handler_api.php");
  url.search = new URLSearchParams({ api_key: env("GRIZZLY_SMS_API_KEY"), action, ...params }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    return (await res.text()).trim();
  } catch { throw new Error("Server did not respond. Please try again later."); }
}

export async function gzCatalog(force = false): Promise<SmsCatalog> {
  const { data } = await supabaseAdmin.from("bot3_service_cache").select("payload,updated_at").eq("key", "catalog_gz").maybeSingle();
  if (!force && data && Date.now() - Date.parse(data.updated_at) < 180000) return data.payload as unknown as SmsCatalog;
  try {
    const [countries, services, prices] = await Promise.all([gz("getCountries"), gz("getServicesList", { lang: "en" }), gz("getPrices")]);
    const list = JSON.parse(services);
    const value: SmsCatalog = { countries: JSON.parse(countries), services: list.services ?? list, prices: JSON.parse(prices) };
    if (!Array.isArray(value.services) || !value.prices || !value.countries) throw new Error("bad");
    await supabaseAdmin.from("bot3_service_cache").upsert({ key: "catalog_gz", payload: value as never, updated_at: new Date().toISOString() });
    return value;
  } catch {
    if (data) return data.payload as unknown as SmsCatalog;
    throw new Error("Live stock is unavailable. Please tap Retry later.");
  }
}

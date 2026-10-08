import { env } from "./config.server";
import { supabaseAdmin } from "./store.server";
export async function grizzly(action: string, params: Record<string, string> = {}): Promise<string> {
  const url = new URL("https://api.grizzlysms.com/stubs/handler_api.php");
  url.search = new URLSearchParams({ api_key: env("GRIZZLY_SMS_API_KEY"), action, ...params }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("Supplier unavailable");
    return await res.text();
  } catch { throw new Error("SMS supplier did not respond. Please try again later."); }
}
export type SmsCatalog = {
  countries: Record<string, { id: number; eng: string }>;
  services: { code: string; name: string }[];
  prices: Record<string, Record<string, { cost: number; count: number }>>;
};
export async function smsCatalog(force = false): Promise<SmsCatalog> {
  const { data } = await supabaseAdmin.from("bot3_service_cache").select("payload,updated_at").eq("key", "catalog").maybeSingle();
  if (!force && data && Date.now() - Date.parse(data.updated_at) < 120000) return data.payload as unknown as SmsCatalog;
  try {
    const [countries, services, prices] = await Promise.all([grizzly("getCountries"), grizzly("getServicesList", { lang: "en" }), grizzly("getPrices")]);
    const list = JSON.parse(services);
    const value: SmsCatalog = { countries: JSON.parse(countries), services: list.services ?? list, prices: JSON.parse(prices) };
    if (!Array.isArray(value.services) || !value.prices || !value.countries) throw new Error("Catalog unavailable");
    await supabaseAdmin.from("bot3_service_cache").upsert({ key: "catalog", payload: value as never, updated_at: new Date().toISOString() });
    return value;
  } catch { throw new Error("Live SMS stock is unavailable. Please tap Retry later."); }
}
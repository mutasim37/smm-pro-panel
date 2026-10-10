// Telegram Mini App support for Frrr SMS: initData verification + catalog/selection.
import { runAsBot } from "./scope.server";
import { bot3TokenValue } from "./telegram.server";
import { smsPrice } from "./sms-rules";
import { getUser } from "./store.server";
import { money, currencyScope } from "./views.server";
import { isCurrency } from "./config.server";

async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
export async function verifyInitData(initData: string, tokenFn: () => Promise<string> = bot3TokenValue): Promise<number> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? ""; params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const token = await tokenFn();
  const secret = await hmac(new TextEncoder().encode("WebAppData"), token);
  const sig = [...(await hmac(secret, check))].map((b) => b.toString(16).padStart(2, "0")).join("");
  let diff = sig.length ^ hash.length; for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
  const age = Date.now() / 1000 - Number(params.get("auth_date"));
  const id = Number(JSON.parse(params.get("user") ?? "{}").id);
  if (diff || !(age < 86400) || !Number.isFinite(id) || id <= 0) throw new Error("Please open this from the bot.");
  return id;
}
async function withUser<T>(id: number, fn: () => Promise<T>) {
  const user = await getUser(id); const code = isCurrency(user?.currency) ? user.currency : "USD";
  return currencyScope.run({ code }, fn);
}
export function miniCatalog(initData: string, srv: "1" | "2" = "2") {
  return runAsBot("sms", async () => {
    const id = await verifyInitData(initData);
    return withUser(id, async () => {
      const { catalogFor, multFor } = await import("./sms.server");
      const cat = await catalogFor(srv); const m = await multFor(srv);
      const services = new Map<string, { code: string; name: string; min: number; countries: { code: string; name: string; price: string; usd: number; stock: number }[] }>();
      for (const [country, items] of Object.entries(cat.prices)) for (const [code, it] of Object.entries(items)) {
        if (!(Number(it.count) > 0)) continue;
        const usd = smsPrice(Number(it.cost), m);
        const s = services.get(code) ?? { code, name: cat.services.find((x) => x.code === code)?.name ?? code, min: Infinity, countries: [] };
        s.min = Math.min(s.min, usd);
        s.countries.push({ code: country, name: cat.countries[country]?.eng ?? country, price: money(usd), usd, stock: Number(it.count) });
        services.set(code, s);
      }
      return [...services.values()].map((s) => ({ ...s, from: money(s.min), countries: s.countries.sort((a, b) => a.usd - b.usd) }));
    });
  });
}
export function miniSelect(initData: string, service: string, country: string, srv: "1" | "2" = "2") {
  return runAsBot("sms", async () => {
    const id = await verifyInitData(initData);
    const { quote } = await import("./sms.server");
    await withUser(id, () => quote({ chatId: id }, service, country, srv));
    return { ok: true };
  });
}

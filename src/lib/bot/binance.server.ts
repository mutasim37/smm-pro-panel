// Binance Pay (Pay ID) deposits, verified via the read-only Pay history API. Server-only.
export function binancePayId(): string {
  return process.env["BINANCE_PAY_ID"] ?? "";
}

export function looksLikeBinanceId(v: string): boolean {
  return /^[A-Za-z0-9]{6,40}$/.test(v.trim());
}

export type BinanceResult = { ok: true; amount: number; id: string } | { ok: false; reason: "not_found" | "too_old" | "not_incoming" | "unavailable" };

async function sign(query: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(query)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Finds an incoming USDT Binance Pay transfer by Order ID or Transaction ID (≤72h). */
export async function findBinancePayment(ref: string): Promise<BinanceResult> {
  const apiKey = process.env["BINANCE_API_KEY"], secret = process.env["BINANCE_API_SECRET"];
  if (!apiKey || !secret) return { ok: false, reason: "unavailable" };
  const start = Date.now() - 72 * 3600_000;
  const q = `startTime=${start}&limit=100&recvWindow=10000&timestamp=${Date.now()}`;
  try {
    const res = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${q}&signature=${await sign(q, secret)}`, { headers: { "X-MBX-APIKEY": apiKey } });
    const json: any = await res.json();
    if (!res.ok || !Array.isArray(json?.data)) return { ok: false, reason: "unavailable" };
    const id = ref.trim();
    const tx = json.data.find((t: any) => String(t.orderId) === id || String(t.transactionId) === id);
    if (!tx) return { ok: false, reason: "not_found" };
    const amount = Number(tx.amount);
    if (String(tx.currency).toUpperCase() !== "USDT" || !(amount > 0)) return { ok: false, reason: "not_incoming" };
    if (Number(tx.transactionTime) < start) return { ok: false, reason: "too_old" };
    return { ok: true, amount: Math.round(amount * 10000) / 10000, id: String(tx.orderId || tx.transactionId) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

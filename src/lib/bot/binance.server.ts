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
  const sig = await sign(q, secret);
  let json: any = null;
  // Some Binance hosts geo-block cloud edge IPs (HTTP 451/403); try alternates.
  for (const host of ["api.binance.com", "api-gcp.binance.com", "api1.binance.com", "api2.binance.com", "api3.binance.com", "api4.binance.com"]) {
    try {
      const res = await fetch(`https://${host}/sapi/v1/pay/transactions?${q}&signature=${sig}`, { headers: { "X-MBX-APIKEY": apiKey } });
      const j: any = await res.json().catch(() => null);
      if (res.ok && Array.isArray(j?.data)) { json = j; break; }
      console.error("binance pay", host, res.status, j?.code, j?.msg);
    } catch (e) { console.error("binance pay", host, String(e)); }
  }
  if (!json) return { ok: false, reason: "unavailable" };
  try {
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

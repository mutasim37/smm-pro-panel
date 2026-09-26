// USDT (BEP20) on-chain payment verification via public BSC RPC nodes.
// No third-party API key required.
import { depositAddress, MAX_TX_AGE_HOURS } from "./config.server";

const USDT_BEP20 = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DECIMALS = 18n;

const RPC_ENDPOINTS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
  "https://rpc.ankr.com/bsc",
  "https://bsc.publicnode.com",
];

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: unknown = null;
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`RPC ${res.status}`);
      const json: any = await res.json();
      if (json.error) throw new Error(json.error.message ?? "RPC error");
      return json.result as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`All BSC nodes failed: ${String(lastError)}`);
}

function unpadAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function toAmount(hex: string): number {
  const raw = BigInt(hex === "0x" ? "0x0" : hex);
  const whole = raw / 10n ** DECIMALS;
  const frac = raw % 10n ** DECIMALS;
  return Number(whole) + Number(frac) / Number(10n ** DECIMALS);
}

export type VerifyResult =
  | { ok: true; amount: number; from: string; ageHours: number }
  | { ok: false; reason: string };

export function looksLikeTxHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

/**
 * Confirms a BEP20 USDT transfer to the house wallet.
 * Rejects failed, unconfirmed, misdirected, or stale (>72h) transactions.
 */
export async function verifyUsdtDeposit(txHash: string): Promise<VerifyResult> {
  const hash = txHash.trim().toLowerCase();
  if (!looksLikeTxHash(hash)) {
    return { ok: false, reason: "invalid_hash" };
  }

  const receipt = await rpc<any>("eth_getTransactionReceipt", [hash]);
  if (!receipt) return { ok: false, reason: "not_found" };
  if (receipt.status !== "0x1") return { ok: false, reason: "tx_failed" };

  const wallet = depositAddress().toLowerCase();
  let amount = 0;
  let from = "";

  for (const log of receipt.logs ?? []) {
    if (String(log.address).toLowerCase() !== USDT_BEP20) continue;
    if (String(log.topics?.[0]).toLowerCase() !== TRANSFER_TOPIC) continue;
    if (unpadAddress(log.topics[2]) !== wallet) continue;
    amount += toAmount(log.data);
    from = unpadAddress(log.topics[1]);
  }

  if (amount <= 0) return { ok: false, reason: "no_transfer_to_wallet" };

  const block = await rpc<any>("eth_getBlockByNumber", [receipt.blockNumber, false]);
  const timestamp = Number(BigInt(block?.timestamp ?? "0x0")) * 1000;
  const ageHours = (Date.now() - timestamp) / 3_600_000;
  if (!timestamp || ageHours > MAX_TX_AGE_HOURS) {
    return { ok: false, reason: "too_old" };
  }

  return { ok: true, amount: Math.round(amount * 100000) / 100000, from, ageHours };
}

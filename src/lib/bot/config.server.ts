// Central bot configuration. Server-only.
import { currentBot } from "./scope.server";

export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const BRAND = {
  get name() {
    return currentBot() === "tg" ? "Frrr TG" : "Free SMM";
  },
  get tagline() {
    return currentBot() === "tg" ? "Instant Telegram Accounts" : "Premium Social Growth Engine";
  },
  currency: "USD",
  symbol: "$",
};

export function supportUsername(): string {
  return currentSupport;
}

let currentSupport = "Frreohi";
let additionalAdmins: number[] = [];
export function setBotAccess(admins: number[], support: string) {
  additionalAdmins = admins;
  currentSupport = support.replace(/^@/, "") || "Frreohi";
}

export function adminChatIds(): number[] {
  return [...new Set([...(process.env["BOT_ADMIN_CHAT_ID"] ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v !== 0), ...additionalAdmins])];
}

export function markupMultiplier(): number {
  const pct = Number(process.env["PRICE_MARKUP_PERCENT"] ?? "10");
  return 1 + (Number.isFinite(pct) ? pct : 10) / 100;
}

export function depositAddress(): string {
  return env("USDT_BEP20_ADDRESS");
}

export type CurrencyCode = "USD" | "BDT" | "INR";

/** Display currencies. All balances are stored in USD; these only change how values are shown. */
export function currencies(): Record<CurrencyCode, { code: CurrencyCode; symbol: string; flag: string; label: string; rate: number }> {
  const bdt = Number(process.env["BDT_RATE"] ?? "122");
  const inr = Number(process.env["INR_RATE"] ?? "88");
  return {
    USD: { code: "USD", symbol: "$", flag: "🇺🇸", label: "US Dollar", rate: 1 },
    BDT: { code: "BDT", symbol: "৳", flag: "🇧🇩", label: "Bangladeshi Taka", rate: Number.isFinite(bdt) && bdt > 0 ? bdt : 122 },
    INR: { code: "INR", symbol: "₹", flag: "🇮🇳", label: "Indian Rupee", rate: Number.isFinite(inr) && inr > 0 ? inr : 88 },
  };
}

export function isCurrency(value: unknown): value is CurrencyCode {
  return value === "USD" || value === "BDT" || value === "INR";
}

/** Payment window in minutes for a direct-pay invoice. */
export const PAYMENT_WINDOW_MINUTES = 8;
/** Oldest on-chain transaction age accepted for verification. */
export const MAX_TX_AGE_HOURS = 72;

export const EFFECTS = {
  fire: "5104841245755180586",
  party: "5046509860389126442",
  heart: "5044134455711629726",
  thumbsUp: "5107584321108051014",
};

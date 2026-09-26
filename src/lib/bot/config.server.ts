// Central bot configuration. Server-only.

export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const BRAND = {
  name: "XNOVA SMM",
  tagline: "Premium Social Growth Engine",
  currency: "USD",
  symbol: "$",
};

export function supportUsername(): string {
  return process.env["SUPPORT_USERNAME"] ?? "xnxoje";
}

export function adminChatIds(): number[] {
  return (process.env["BOT_ADMIN_CHAT_ID"] ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v !== 0);
}

export function markupMultiplier(): number {
  const pct = Number(process.env["PRICE_MARKUP_PERCENT"] ?? "10");
  return 1 + (Number.isFinite(pct) ? pct : 10) / 100;
}

export function depositAddress(): string {
  return env("USDT_BEP20_ADDRESS");
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

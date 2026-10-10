export type PromoMethod = "bkash" | "binance" | "usdt";
export const PROMO_WINDOW_DAYS = 30;

/** Default promoter commission % per bot: SMM 10%, SMS 20%. */
export function defaultPromoPct(bot: string): number {
  return bot === "sms" ? 20 : 10;
}

/** Withdrawal fee in USD: bKash 2%, Binance free, USDT $0.10. */
export function promoFee(method: PromoMethod, amount: number): number {
  if (method === "bkash") return Math.round(amount * 2) / 100;
  if (method === "usdt") return 0.1;
  return 0;
}

export function isPromoMethod(v: unknown): v is PromoMethod {
  return v === "bkash" || v === "binance" || v === "usdt";
}

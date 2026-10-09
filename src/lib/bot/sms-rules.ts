export const SMS_WINDOW_MS = 15 * 60_000;
export const SMS_CANCEL_DELAY_MS = 5 * 60_000;
/** Customer price = supplier cost × admin multiplier (default 3×). */
export function smsPrice(cost: number, multiplier = 3) {
  return Math.ceil(cost * multiplier * 100000) / 100000;
}
export function canRefundSms(response: string, otp: string | null) {
  return response === "ACCESS_CANCEL" && !otp;
}
export function parseSmsStatus(value: string): { kind: "otp" | "waiting" | "canceled" | "unknown"; code?: string } {
  if (value.startsWith("STATUS_OK:")) return { kind: "otp", code: value.slice(10) };
  if (value === "STATUS_CANCEL") return { kind: "canceled" };
  if (value.startsWith("STATUS_WAIT")) return { kind: "waiting" };
  return { kind: "unknown" };
}
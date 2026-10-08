export const SMS_WINDOW_MS = 20 * 60_000;
export const SMS_CANCEL_DELAY_MS = 5 * 60_000;
export function smsPrice(cost: number, markup = 30) {
  return Math.ceil(cost * (1 + markup / 100) * 100000) / 100000;
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
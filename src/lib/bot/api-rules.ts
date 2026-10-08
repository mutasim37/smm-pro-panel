export type ApiBot = "smm" | "tg" | "sms";
export const API_ORIGIN = "https://smm-pro-panel.lovable.app";
export const apiAddress = (bot: ApiBot) => `${API_ORIGIN}/api/public/${bot}/v2`;
export const apiDocsAddress = (bot: ApiBot) => `${API_ORIGIN}/api/public/${bot}/docs`;
export function validRequestId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function apiAccessAllowed(balance: number, banned: boolean): boolean {
  return !banned && Number.isFinite(balance) && balance > 0;
}
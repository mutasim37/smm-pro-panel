// SMMGen provider API client. Server-only. Never expose provider details to users.
import { env } from "./config.server";

const API_URL = "https://my.smmgen.com/api/v2";

export type ProviderService = {
  service: number;
  name: string;
  type: string;
  rate: string;
  min: number | string;
  max: number | string;
  category: string;
  refill?: boolean;
  cancel?: boolean;
  dripfeed?: boolean;
};

async function call<T>(params: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams({
    key: env("SMMGEN_API_KEY"),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Provider responded ${res.status}`);
  return (await res.json()) as T;
}

export function fetchServices() {
  return call<ProviderService[]>({ action: "services" });
}

export function providerBalance() {
  return call<{ balance: string; currency: string }>({ action: "balance" });
}

export function placeOrder(input: {
  service: number;
  link: string;
  quantity?: number | undefined;
  comments?: string | undefined;
}) {
  const params: Record<string, string | number> = {
    action: "add",
    service: input.service,
    link: input.link,
  };
  if (input.comments) params["comments"] = input.comments;
  if (input.quantity) params["quantity"] = input.quantity;
  return call<{ order?: number; error?: string }>(params);
}

export function orderStatus(orderId: string) {
  return call<{
    charge?: string;
    start_count?: string;
    status?: string;
    remains?: string;
    currency?: string;
    error?: string;
  }>({ action: "status", order: orderId });
}

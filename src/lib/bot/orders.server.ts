// Order status sync: pulls live status from the provider, applies refunds for
// canceled / partial orders exactly once, and notifies the customer.
import { isCurrency } from "./config.server";
import { orderStatus, orderStatuses } from "./smmgen.server";
import { adjustBalance, supabaseAdmin } from "./store.server";
import { escapeHtml, sendMessage, ik } from "./telegram.server";
import { DIVIDER, currencyScope, money, statusMeta } from "./views.server";

export const FINAL_STATUSES = ["completed", "partial", "canceled", "cancelled", "failed"];

export type OrderRow = {
  id: string;
  telegram_id: number;
  service_id: number;
  service_name: string;
  link: string;
  quantity: number;
  comments: string | null;
  charge: number;
  provider_order_id: string | null;
  status: string;
  start_count: string | null;
  remains: string | null;
  refunded: number;
  created_at: string;
  updated_at: string;
};

type ProviderStatus = { status?: string; start_count?: string; remains?: string; error?: string };

function normalise(status: string | undefined): string {
  return String(status ?? "pending").trim().toLowerCase();
}

/** Apply a provider status to an order row. Returns the updated row and whether it became final now. */
async function apply(order: OrderRow, live: ProviderStatus, notify: boolean): Promise<OrderRow> {
  if (live.error || !live.status) return order;
  const next = normalise(live.status);
  const prev = normalise(order.status);
  const remains = live.remains ?? order.remains;

  let refund = 0;
  if (Number(order.refunded) <= 0) {
    if (next === "canceled" || next === "cancelled") refund = Number(order.charge);
    else if (next === "partial") {
      const left = Math.max(0, Math.min(Number(remains ?? 0), order.quantity));
      refund = Math.round((Number(order.charge) * left / Math.max(1, order.quantity)) * 100000) / 100000;
    }
  }

  const patch = {
    status: next,
    start_count: live.start_count ?? order.start_count,
    remains: remains ?? null,
    updated_at: new Date().toISOString(),
    ...(refund > 0 ? { refunded: refund } : {}),
  };

  // Guard the refund with a conditional update so it can only ever happen once.
  let query = supabaseAdmin.from("bot_orders").update(patch).eq("id", order.id);
  if (refund > 0) query = query.eq("refunded", 0);
  const { data } = await query.select("*");
  const updated = (data?.[0] as unknown as OrderRow | undefined) ?? null;
  if (!updated) return order;

  if (refund > 0) await adjustBalance(order.telegram_id, refund);

  if (notify && next !== prev) {
    const meta = statusMeta(next);
    const lines = [
      `<b>${meta.icon} Order Update · #${escapeHtml(order.provider_order_id ?? "")}</b>`,
      DIVIDER,
      `🛍 ${escapeHtml(order.service_name.slice(0, 80))}`,
      `📊 <b>Status</b> · <b>${meta.label}</b>`,
    ];
    if (refund > 0) lines.push(`💰 <b>Refunded</b> · <code>${money(refund)}</code> to your wallet`);
    await sendMessage(order.telegram_id, lines.join("\n"), {
      reply_markup: ik([[{ text: "📄 View Order", callback_data: `od:${order.id}` }]]),
    });
  }
  return updated;
}

export async function syncOrder(order: OrderRow, notify = false): Promise<OrderRow> {
  if (!order.provider_order_id) return order;
  const live = await orderStatus(order.provider_order_id);
  return apply(order, live, notify);
}

/** Sync all active orders. Called by the scheduled job; notifies customers on status changes. */
export async function syncActiveOrders(): Promise<{ checked: number }> {
  const { data } = await supabaseAdmin
    .from("bot_orders")
    .select("*")
    .not("provider_order_id", "is", null)
    .not("status", "in", `(${FINAL_STATUSES.map((s) => `"${s}"`).join(",")})`)
    .order("updated_at", { ascending: true })
    .limit(100);
  const orders = (data ?? []) as unknown as OrderRow[];
  if (!orders.length) return { checked: 0 };

  const statuses = await orderStatuses(orders.map((o) => o.provider_order_id!));
  const ids = [...new Set(orders.map((o) => o.telegram_id))];
  const { data: users } = await supabaseAdmin.from("bot_users").select("telegram_id, currency").in("telegram_id", ids);
  const currencyOf = new Map((users ?? []).map((u: any) => [Number(u.telegram_id), u.currency]));

  for (const order of orders) {
    const live = statuses[order.provider_order_id!];
    if (!live) continue;
    const code = currencyOf.get(Number(order.telegram_id));
    await currencyScope.run({ code: isCurrency(code) ? code : "USD" }, () => apply(order, live, true));
  }
  return { checked: orders.length };
}

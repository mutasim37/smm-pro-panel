import { afterEach, expect, mock, test } from "bun:test";

let order: Record<string, unknown>;
let lock = true;
let reads = 0;
let credits = 0;
let providerCalls: string[] = [];
let replies: Record<string, string> = {};
const chain = () => {
  let change: Record<string, unknown> | undefined;
  const q: Record<string, any> = {
    select: () => q, eq: () => q, is: () => q, in: () => q,
    update: (v: Record<string, unknown>) => { change = v; return q; },
    maybeSingle: async () => { reads++; return { data: { ...order } }; },
    then: (resolve: (v: unknown) => unknown) => {
      if (change) Object.assign(order, change);
      return Promise.resolve({ error: null }).then(resolve);
    },
  };
  return q;
};
mock.module("./handler.server", () => ({ respond: async () => undefined }));
mock.module("./grizzly.server", () => ({ grizzly: async (action: string) => { providerCalls.push(action); return replies[action] ?? "UNKNOWN"; }, smsCatalog: async () => ({}) }));
mock.module("./grizzlysms.server", () => ({ gz: async () => "UNKNOWN", gzCatalog: async () => ({}) }));
mock.module("./growth.server", () => ({ rewardReferrer: async () => undefined }));
mock.module("./store.server", () => ({
  supabaseAdmin: {
    from: () => chain(),
    rpc: async (name: string, p: Record<string, string>) => {
      if (name === "bot3_claim_sms_poll") return { data: lock };
      if (name === "bot3_finish_sms") {
        if (p._kind === "refund" && !order.otp && !order.refunded) {
          credits++; order.refunded = order.charge; order.status = "refunded";
          return { data: true };
        }
        if (p._kind === "otp" && !order.refunded) { order.otp = p._value; order.status = "received"; return { data: true }; }
      }
      return { data: false };
    },
  }, getUser: async () => null, setState: async () => undefined, getState: async () => ({}), clearState: async () => undefined,
}));
const { syncSmsOrder } = await import("./sms.server");
function reset(status = "waiting") {
  order = { id: "order", telegram_id: 1, provider_id: "123", otp: null, refunded: 0, charge: 0.5, status, created_at: "2026-01-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z" };
  lock = true; reads = 0; credits = 0; providerCalls = [];
  replies = { getStatus: "STATUS_WAIT_CODE", setStatus: "ACCESS_CANCEL" };
}
afterEach(() => mock.restore());
test("cancel intent survives a busy polling lock and refunds on next automatic check", async () => {
  reset(); lock = false;
  await syncSmsOrder(order as any, true);
  expect(order.status).toBe("cancel_pending");
  expect(providerCalls).toEqual([]);
  lock = true;
  await syncSmsOrder(order as any);
  expect(reads).toBeGreaterThan(0);
  expect(order.refunded).toBe(0.5);
  expect(credits).toBe(1);
  await syncSmsOrder(order as any);
  expect(credits).toBe(1);
});
test("unknown status does not discard a saved cancellation request", async () => {
  reset("refund_review"); replies.getStatus = "UNKNOWN";
  await syncSmsOrder(order as any);
  expect(providerCalls).toEqual(["getStatus", "setStatus"]);
  expect(order.refunded).toBe(0.5);
});
test("OTP arriving during cancellation is saved instead of refunded", async () => {
  reset("cancel_pending"); replies.setStatus = "STATUS_OK:012345";
  await syncSmsOrder(order as any);
  expect(order.otp).toBe("012345");
  expect(credits).toBe(0);
});
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-API-Key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: cors });

const createSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  order_id: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
  callback_url: z.string().url().max(500).optional(),
  expires_minutes: z.number().int().min(5).max(1440).optional(),
});

export const Route = createFileRoute("/api/public/gateway/v1")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const g = await import("@/lib/gateway.server");
        const merchant = await g.keyMerchant(request.headers.get("X-API-Key"));
        if (!merchant) return json({ error: "invalid_api_key" }, 401);
        const p = createSchema.safeParse(await request.json().catch(() => null));
        if (!p.success) return json({ error: "invalid_request", details: p.error.issues }, 400);
        const inv = await g.createInvoice({ amount: p.data.amount, merchant, order: p.data.order_id, note: p.data.note, callback: p.data.callback_url, minutes: p.data.expires_minutes });
        const origin = new URL(request.url).origin;
        return json({ ...g.publicInvoice(inv), status: "pending", payment_url: `${origin}/pay/${inv.id}` }, 201);
      },
      GET: async ({ request }) => {
        const g = await import("@/lib/gateway.server");
        const merchant = await g.keyMerchant(request.headers.get("X-API-Key"));
        if (!merchant) return json({ error: "invalid_api_key" }, 401);
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const r = await g.getInvoice(id);
        if (!r || r.merchant !== merchant) return json({ error: "not_found" }, 404);
        return json(g.publicInvoice(r));
      },
    },
  },
});

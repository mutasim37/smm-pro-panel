import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/cron/sync-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "cron_sync").maybeSingle();
        const provided = request.headers.get("X-Cron-Key") ?? "";
        if (!data?.value || !safeEqual(provided, data.value)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { syncActiveOrders } = await import("@/lib/bot/orders.server");
          const result = await syncActiveOrders();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("[cron] sync-orders failed", error);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});

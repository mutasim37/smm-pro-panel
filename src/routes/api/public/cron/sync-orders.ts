import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/sync-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
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

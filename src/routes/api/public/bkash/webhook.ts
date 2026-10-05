import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const ok = () => Response.json({ status: "ok" });

function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

export const Route = createFileRoute("/api/public/bkash/webhook")({
  server: {
    handlers: {
      GET: async () => ok(),
      POST: async ({ request }) => {
        const { bkashSecret, parseBkashSms } = await import("@/lib/bot/bkash.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const secret = await bkashSecret();
        const given = request.headers.get("x-bkash-secret") ?? new URL(request.url).searchParams.get("key") ?? "";
        if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const raw = await request.text();
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = Object.fromEntries(new URLSearchParams(raw));
          if (!Object.keys(payload).length) payload = { body: raw };
        }

        const sender = pick(payload, ["sender", "from", "address", "phone", "title"]);
        const body = pick(payload, ["body", "message", "msg", "text", "content", "sms"]);
        if (!/bkash/i.test(sender) || !body) return ok();

        const parsed = parseBkashSms(body);
        if (!parsed) return ok();

        await supabaseAdmin
          .from("bot_bkash_sms")
          .upsert(
            { trx_id: parsed.trxId, amount_bdt: parsed.amount, sender, body },
            { onConflict: "trx_id", ignoreDuplicates: true },
          );
        return ok();
      },
    },
  },
});

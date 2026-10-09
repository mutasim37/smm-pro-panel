import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
const updateSchema = z.object({ update_id: z.number().int().nonnegative(), message: z.any().optional(), callback_query: z.any().optional() }).passthrough();
export const Route = createFileRoute("/api/public/telegram/webhook3")({
  server: { handlers: { POST: async ({ request }) => {
    const { bot3TokenValue } = await import("@/lib/bot/telegram.server");
    const token = await bot3TokenValue().catch(() => "");
    if (!token) return new Response("Not configured", { status: 503 });
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${token}`)));
    const secret = btoa(String.fromCharCode(...digest)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    let diff = secret.length ^ supplied.length;
    for(let i=0;i<secret.length;i++) diff |= secret.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0);
    if(diff) return new Response("Unauthorized",{status:401});
    const parsed = updateSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success) return new Response("Invalid update",{status:400});
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {error} = await supabaseAdmin.from("bot3_updates").insert({update_id:parsed.data.update_id});
    if(error?.code === "23505") return Response.json({ok:true});
    if(error) return new Response("Temporarily unavailable",{status:503});
    try {
      const { runAsBot } = await import("@/lib/bot/scope.server");
      const { handleUpdate } = await import("@/lib/bot/handler.server");
      // Number search can take ~50s; reply to Telegram at once so the Stop button is delivered meanwhile.
      const cb = (parsed.data.callback_query as { data?: unknown } | undefined)?.data;
      if (cb === "sms:buy") { const { background } = await import("@/lib/wait-until"); await background(runAsBot("sms",()=>handleUpdate(parsed.data))); }
      else await runAsBot("sms",()=>handleUpdate(parsed.data));
    } catch { console.error("[sms] update failed"); }
    return Response.json({ok:true});
  } } },
});
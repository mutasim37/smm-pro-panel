import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/cron/sync-sms")({
  server: { handlers: { POST: async ({ request }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {data} = await supabaseAdmin.from("bot_secrets").select("value").eq("name","cron_sync").maybeSingle();
    const given = request.headers.get("X-Cron-Key") ?? "";
    if(!data?.value || given.length!==data.value.length) return new Response("Unauthorized",{status:401});
    let diff=0;for(let i=0;i<given.length;i++)diff|=given.charCodeAt(i)^data.value.charCodeAt(i);
    if(diff)return new Response("Unauthorized",{status:401});
    const {runAsBot}=await import("@/lib/bot/scope.server");
    const {syncActiveSms}=await import("@/lib/bot/sms.server");
    await runAsBot("sms",syncActiveSms);
    return Response.json({ok:true});
  } } },
});
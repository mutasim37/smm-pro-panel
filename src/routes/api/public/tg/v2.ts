import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/tg/v2")({
 server: { handlers: { POST: async ({request}) => {const {resellerRequest}=await import("@/lib/bot/reseller.server");return resellerRequest(request,"tg");}, OPTIONS: async () => {const {apiOptions}=await import("@/lib/bot/reseller.server");return apiOptions();} } }
});

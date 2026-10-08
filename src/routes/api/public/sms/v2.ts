import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/sms/v2")({
 server: { handlers: { POST: async ({request}) => {const {resellerRequest}=await import("@/lib/bot/reseller.server");return resellerRequest(request,"sms");}, OPTIONS: async () => {const {apiOptions}=await import("@/lib/bot/reseller.server");return apiOptions();} } }
});

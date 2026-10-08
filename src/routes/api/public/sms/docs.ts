import { createFileRoute } from "@tanstack/react-router";
import docs from "@/lib/bot/sms-api-docs.md?raw";
export const Route = createFileRoute("/api/public/sms/docs")({server:{handlers:{GET:()=>new Response(docs,{headers:{"Content-Type":"text/markdown; charset=utf-8"}})}}});

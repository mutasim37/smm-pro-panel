import { createFileRoute } from "@tanstack/react-router";
import docs from "@/lib/bot/smm-api-docs.md?raw";
export const Route = createFileRoute("/api/public/smm/docs")({server:{handlers:{GET:()=>new Response(docs,{headers:{"Content-Type":"text/markdown; charset=utf-8"}})}}});

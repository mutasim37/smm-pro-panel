import { createFileRoute } from "@tanstack/react-router";
import docs from "@/lib/bot/api-docs.md?raw";

export const Route = createFileRoute("/api/public/docs")({
  server: {
    handlers: {
      GET: () => new Response(docs, { headers: { "content-type": "text/markdown; charset=utf-8" } }),
    },
  },
});

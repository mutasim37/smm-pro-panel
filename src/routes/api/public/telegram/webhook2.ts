import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function expectedSecret(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(`telegram-webhook:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let binary = "";
  new Uint8Array(digest).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const Route = createFileRoute("/api/public/telegram/webhook2")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { bot2TokenValue } = await import("@/lib/bot/telegram.server");
        const token = await bot2TokenValue().catch(() => "");
        if (!token) return new Response("Not configured", { status: 500 });

        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(provided, await expectedSecret(token))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();

        try {
          const { handleUpdate } = await import("@/lib/bot/handler.server");
          const { runAsBot } = await import("@/lib/bot/scope.server");
          await runAsBot("tg", () => handleUpdate(update));
        } catch (error) {
          console.error("[webhook] handler failed", error);
        }

        // Always ack so Telegram does not retry-storm the endpoint.
        return Response.json({ ok: true });
      },
    },
  },
});

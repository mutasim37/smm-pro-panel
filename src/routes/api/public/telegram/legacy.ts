import { createFileRoute } from "@tanstack/react-router";

// Retired @smmxixbot: every message/button gets the migration notice pointing to @Frrrsmm_bot.
const NOTICE = `📢 <b>Service Update</b>

We have successfully migrated our bot from @smmxixbot to @Frrrsmm_bot.

Please be assured that all accounts, orders, balances, API settings, and related data remain fully intact. Nothing has been changed, lost, or affected during the migration.

You can continue using our services through @Frrrsmm_bot as usual.

Thank you for your continued trust and support.`;

async function expectedSecret(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${token}`)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const Route = createFileRoute("/api/public/telegram/legacy")({
  server: { handlers: { POST: async ({ request }) => {
    const token = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
    if (!token) return new Response("Not configured", { status: 503 });
    const secret = await expectedSecret(token);
    const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    let diff = secret.length ^ supplied.length;
    for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0);
    if (diff) return new Response("Unauthorized", { status: 401 });
    const update: any = await request.json().catch(() => null);
    const chatId = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
    const api = `https://api.telegram.org/bot${token}`;
    try {
      if (update?.callback_query?.id) await fetch(`${api}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: update.callback_query.id }) });
      if (chatId && update?.message?.chat?.type !== "channel") await fetch(`${api}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        chat_id: chatId, text: NOTICE, parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🚀 Open @Frrrsmm_bot", url: "https://t.me/Frrrsmm_bot?start=moved" }]], remove_keyboard: undefined },
      }) });
    } catch { console.error("[legacy] notice failed"); }
    return Response.json({ ok: true });
  } } },
});

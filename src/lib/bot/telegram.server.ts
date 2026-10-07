// Thin, fast Telegram Bot API client. Server-only.
import { env } from "./config.server";

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type InlineKeyboard = InlineButton[][];

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`;
}

export async function tg<T = any>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T | null> {
  try {
    const res = await fetch(apiUrl(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json();
    if (!json.ok) {
      console.error(`[telegram] ${method} failed:`, JSON.stringify(json));
      return null;
    }
    return json.result as T;
  } catch (error) {
    console.error(`[telegram] ${method} threw:`, error);
    return null;
  }
}

export function sendMessage(
  chatId: number | string,
  text: string,
  opts: Record<string, unknown> = {},
) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...opts,
  });
}

export function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  opts: Record<string, unknown> = {},
) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...opts,
  });
}

export function sendPhoto(
  chatId: number | string,
  photo: string,
  caption: string,
  opts: Record<string, unknown> = {},
) {
  return tg("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
    ...opts,
  });
}

export function sendAnimation(
  chatId: number | string,
  animation: string,
  caption: string,
  opts: Record<string, unknown> = {},
) {
  return tg("sendAnimation", {
    chat_id: chatId,
    animation,
    caption,
    parse_mode: "HTML",
    ...opts,
  });
}

export function sendChatAction(chatId: number | string, action = "typing") {
  return tg("sendChatAction", { chat_id: chatId, action });
}

export async function sendDocumentFile(chatId: number, filename: string, content: string, caption: string) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("document", new Blob([content], { type: "text/markdown;charset=utf-8" }), filename);
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  try {
    const response = await fetch(apiUrl("sendDocument"), { method: "POST", body: form });
    const result = await response.json() as { ok?: boolean; result?: unknown };
    return response.ok && result.ok ? result.result : null;
  } catch {
    console.error("[telegram] document upload failed");
    return null;
  }
}

export function answerCallback(id: string, text?: string, alert = false) {
  return tg("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text, show_alert: alert } : {}),
  });
}

export function ik(rows: InlineKeyboard) {
  return { inline_keyboard: rows };
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

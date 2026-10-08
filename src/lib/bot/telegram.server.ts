// Thin, fast Telegram Bot API client. Server-only.
import { env } from "./config.server";
import { currentBot, runAsBot } from "./scope.server";

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type InlineKeyboard = InlineButton[][];

let bot2Token: string | null = null;
let bot1Token: string | null = null;
async function botToken(): Promise<string> {
  if (currentBot() !== "tg") {
    if (!bot1Token) {
      const { supabaseAdmin } = await import("./store.server");
      const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "bot1_token").maybeSingle();
      bot1Token = data?.value ? String(data.value) : env("TELEGRAM_BOT_TOKEN");
    }
    return bot1Token;
  }
  if (!bot2Token) {
    const { supabaseAdmin } = await import("./store.server");
    const { data } = await supabaseAdmin.from("bot_secrets").select("value").eq("name", "bot2_token").maybeSingle();
    if (!data?.value) throw new Error("Bot 2 token missing");
    bot2Token = String(data.value);
  }
  return bot2Token;
}

export async function bot2TokenValue(): Promise<string> {
  return runAsBot("tg", botToken);
}

/** Frrr SMM token: bot_secrets.bot1_token overrides the env token (bot moved to a new username). */
export async function bot1TokenValue(): Promise<string> {
  return runAsBot("smm", botToken);
}

async function apiUrl(method: string): Promise<string> {
  return `https://api.telegram.org/bot${await botToken()}/${method}`;
}

export async function tg<T = any>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T | null> {
  try {
    const res = await fetch(await apiUrl(method), {
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
    const response = await fetch(await apiUrl("sendDocument"), { method: "POST", body: form });
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

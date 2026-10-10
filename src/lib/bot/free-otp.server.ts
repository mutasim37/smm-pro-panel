// Free public numbers (receivesms.co). OTP codes are posted ONLY to the public channel, never in the bot.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { escapeHtml, tg, type InlineKeyboard } from "./telegram.server";

export const FREE_CHANNEL = "@freesmsotp";
const BASE = "https://www.receivesms.co";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; FrrrSMS/1.0)" };
export const FREE_COUNTRIES: Record<string, { name: string; flag: string; path: string }> = {
  gb: { name: "United Kingdom", flag: "🇬🇧", path: "/british-phone-numbers/gb/" },
  us: { name: "United States", flag: "🇺🇸", path: "/us-phone-numbers/us/" },
  ca: { name: "Canada", flag: "🇨🇦", path: "/canadian-phone-numbers/ca/" },
  de: { name: "Germany", flag: "🇩🇪", path: "/german-phone-numbers/de/" },
  fr: { name: "France", flag: "🇫🇷", path: "/french-phone-numbers/fr/" },
  nl: { name: "Netherlands", flag: "🇳🇱", path: "/dutch-phone-numbers/nl/" },
  se: { name: "Sweden", flag: "🇸🇪", path: "/swedish-phone-numbers/se/" },
  es: { name: "Spain", flag: "🇪🇸", path: "/spanish-phone-numbers/es/" },
  in: { name: "India", flag: "🇮🇳", path: "/indian-phone-numbers/in/" },
  my: { name: "Malaysia", flag: "🇲🇾", path: "/malaysian-phone-numbers/my/" },
  ph: { name: "Philippines", flag: "🇵🇭", path: "/philippine-phone-numbers/ph/" },
  au: { name: "Australia", flag: "🇦🇺", path: "/australian-phone-numbers/au/" },
};

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: UA, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`free source ${r.status}`);
  return r.text();
}

export type FreeNumber = { id: string; path: string; phone: string };
const listCache = new Map<string, { at: number; v: FreeNumber[] }>();
export async function freeNumbers(cc: string): Promise<FreeNumber[]> {
  const c = FREE_COUNTRIES[cc]; if (!c) return [];
  const hit = listCache.get(cc); if (hit && Date.now() - hit.at < 600000) return hit.v;
  const html = await get(c.path);
  const out: FreeNumber[] = [];
  const re = /href="(\/[a-z]{2}-phone-number\/(\d+)\/)"[\s\S]*?<strong>([^<]+)<\/strong>/g;
  for (let m; (m = re.exec(html)) && out.length < 12;) out.push({ path: m[1], id: m[2], phone: m[3].replace(/[^\d+]/g, "") });
  listCache.set(cc, { at: Date.now(), v: out });
  return out;
}

type Otp = { from: string; code: string };
export function parseInbox(html: string): Otp[] {
  const out: Otp[] = [];
  for (const art of html.split("<article").slice(1)) {
    const code = /class="code" data-code="([^"]{3,12})"/.exec(art)?.[1];
    if (!code) continue;
    const from = /class="from-link">([^<]{1,40})</.exec(art)?.[1]?.trim() || "Unknown";
    out.push({ from, code });
  }
  return out.slice(0, 20);
}
const key = (phone: string, o: Otp) => `${phone}|${o.from}|${o.code}`;

/** Start watching a number; existing messages are marked seen so only new OTPs are posted. */
export async function watchFree(cc: string, n: FreeNumber) {
  const existing = parseInbox(await get(n.path).catch(() => ""));
  if (existing.length) await supabaseAdmin.from("bot3_free_seen").upsert(existing.map((o) => ({ key: key(n.phone, o) })), { onConflict: "key", ignoreDuplicates: true });
  await supabaseAdmin.from("bot3_free_watch").upsert({ phone: n.phone, country: cc, path: n.path, expires_at: new Date(Date.now() + 30 * 60000).toISOString() });
}

export async function syncFreeOtp() {
  const now = new Date().toISOString();
  await supabaseAdmin.from("bot3_free_watch").delete().lt("expires_at", now);
  await supabaseAdmin.from("bot3_free_seen").delete().lt("created_at", new Date(Date.now() - 3 * 86400000).toISOString());
  const { data } = await supabaseAdmin.from("bot3_free_watch").select("*").limit(25);
  let posted = 0;
  for (const w of data ?? []) {
    const msgs = parseInbox(await get(w.path).catch(() => "")).reverse();
    for (const o of msgs) {
      const { error } = await supabaseAdmin.from("bot3_free_seen").insert({ key: key(w.phone, o) });
      if (error) continue; // already posted
      const c = FREE_COUNTRIES[w.country];
      await tg("sendMessage", { chat_id: FREE_CHANNEL, parse_mode: "HTML", text: [
        "<b>🆕 New OTP Received</b>", "━━━━━━━━━━━━━━",
        `${c?.flag ?? "🌍"} Country · <b>${escapeHtml(c?.name ?? w.country)}</b>`,
        `📱 Number · <code>${escapeHtml(w.phone)}</code>`,
        `🏷 Service · <b>${escapeHtml(o.from)}</b>`, "",
        `🔐 OTP · <code>${escapeHtml(o.code)}</code>`, "",
        "<i>Public shared number · tap to copy</i>",
      ].join("\n") });
      posted++;
    }
  }
  return { watched: data?.length ?? 0, posted };
}

export const freeChannelButton: InlineKeyboard = [[{ text: "📢 Join @freesmsotp to get OTP", url: "https://t.me/freesmsotp" }]];

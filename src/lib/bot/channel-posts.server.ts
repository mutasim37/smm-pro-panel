import { z } from "zod";
import { getCatalog } from "./catalog.server";
import { getAccount } from "./phoenix.server";
import { listPackages, priceUsd } from "./ext.server";
import { quote, flagOf } from "./tgshop.server";
import { botUsername } from "./growth.server";
import { escapeHtml, ik, tg } from "./telegram.server";
import { money } from "./views.server";
import { isAdmin } from "./admin.server";

export const productRef = z.object({ kind: z.enum(["s", "tg", "ext"]), id: z.number().int().positive() });
export type ProductRef = z.infer<typeof productRef>;

export async function channelDraft(input: ProductRef) {
  const ref = productRef.parse(input);
  let title: string;
  let price: string;
  if (ref.kind === "s") {
    const item = (await getCatalog()).services.get(ref.id);
    if (!item) throw new Error("This service is unavailable.");
    title = item.name;
    price = `${money(item.price)} / 1000`;
  } else if (ref.kind === "tg") {
    const item = await getAccount(ref.id);
    if (!item) throw new Error("This account is unavailable.");
    title = `${flagOf(item.telegram_country)} Telegram Account · ${item.telegram_country}`;
    price = money(await quote(item));
  } else {
    const pkg = (await listPackages()).find((p) => p.id === ref.id);
    if (!pkg) throw new Error("This package is unavailable.");
    title = `Lovable Unlimited Extension · ${pkg.name}`;
    price = money(priceUsd(pkg));
  }
  const payload = ref.kind === "s" ? `p_${ref.id}` : `${ref.kind}_${ref.id}`;
  const url = `https://t.me/${await botUsername()}?start=${payload}`;
  return { ref, url, caption: `<b>🔥 ${escapeHtml(title)}</b>\n\n💵 <b>Price</b> · ${escapeHtml(price)}\n🔢 <b>Product Code</b> · <code>${ref.kind}_${ref.id}</code>\n\nPremium picks. Competitive prices.\n🚀 Order now from XNOVA SMM.` };
}

export async function publishProduct(adminId: number, ref: ProductRef, customText?: string) {
  if (!isAdmin(adminId)) throw new Error("Admin access required.");
  const draft = await channelDraft(ref);
  const custom = customText ? z.string().trim().min(1).max(2000).parse(customText) : "";
  const text = custom ? `${escapeHtml(custom)}\n\n${draft.caption}` : draft.caption;
  const sent = await tg<{ message_id: number }>("sendMessage", {
    chat_id: "@allupdatexix", text, parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: ik([[{ text: "🚀 Order Now", url: draft.url }]]),
  });
  if (!sent) throw new Error("Could not post. Check that the bot can post messages in @allupdatexix.");
  return `https://t.me/allupdatexix/${sent.message_id}`;
}
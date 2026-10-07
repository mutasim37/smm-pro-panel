import guide from "./extension-guide.md?raw";
import { sendDocumentFile, sendMessage } from "./telegram.server";

export async function sendExtensionGuide(chatId: number) {
  const caption = [
    "📖 <b>Please read the guide</b>",
    "Read the attached usage and troubleshooting guide carefully before using the extension, especially if this is your first time.",
    "",
    "<b>Reseller notice</b>",
    "We are only a reseller. This extension is not owned or developed by us. Please read the guide before your first use.",
  ].join("\n");
  const sent = await sendDocumentFile(chatId, "ZEXXA-USAGE-GUIDE.md", guide, caption);
  if (!sent) await sendMessage(chatId, "⚠️ Your purchase is complete, but the guide could not be sent. Tap Setup Guide to try again.");
}
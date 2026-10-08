// Public CDN URLs for bot media — each bot has its own banners.
import welcome from "@/assets/fsmm-welcome.jpg.asset.json";
import admin from "@/assets/fsmm-admin.jpg.asset.json";
import smmLogo from "@/assets/fsmm-logo.jpg.asset.json";
import tgWelcome from "@/assets/ftg-welcome.jpg.asset.json";
import tgAdmin from "@/assets/ftg-admin.jpg.asset.json";
import tgLogo from "@/assets/ftg-logo.jpg.asset.json";
import smsWelcome from "@/assets/fsms-welcome-white.jpg.asset.json";
import smsAdmin from "@/assets/fsms-admin-white.jpg.asset.json";
import smsLogo from "@/assets/fsms-logo-white.jpg.asset.json";
import { currentBot } from "./scope.server";

const DEFAULT_ORIGIN = "https://project--3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd-dev.lovable.app";

function origin(): string {
  return (process.env["PUBLIC_APP_URL"] ?? DEFAULT_ORIGIN).replace(/\/$/, "");
}

export const BANNERS = {
  get welcome() {
    return currentBot() === "sms" ? `${origin()}${smsWelcome.url}` : currentBot() === "tg" ? `${origin()}${tgWelcome.url}` : `${origin()}${welcome.url}`;
  },
  get admin() {
    return currentBot() === "sms" ? `${origin()}${smsAdmin.url}` : currentBot() === "tg" ? `${origin()}${tgAdmin.url}` : `${origin()}${admin.url}`;
  },
};

/** Bot logo (Frrr TG only) — shown on the About screen. */
export const LOGO = {
  get tg() {
    return `${origin()}${tgLogo.url}`;
  },
  /** Logo of whichever bot is handling the update. */
  get current() {
    return currentBot() === "sms" ? `${origin()}${smsLogo.url}` : currentBot() === "tg" ? `${origin()}${tgLogo.url}` : `${origin()}${smmLogo.url}`;
  },
};

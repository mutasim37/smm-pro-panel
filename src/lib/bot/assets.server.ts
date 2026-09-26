// Public CDN URLs for bot media.
import welcome from "@/assets/bot-welcome.jpg.asset.json";
import admin from "@/assets/bot-admin.jpg.asset.json";

const DEFAULT_ORIGIN = "https://project--3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd-dev.lovable.app";

function origin(): string {
  return (process.env["PUBLIC_APP_URL"] ?? DEFAULT_ORIGIN).replace(/\/$/, "");
}

export const BANNERS = {
  get welcome() {
    return `${origin()}${welcome.url}`;
  },
  get admin() {
    return `${origin()}${admin.url}`;
  },
};

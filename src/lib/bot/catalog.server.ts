// Catalog: loads the provider service list, groups it by platform + category,
// applies the reseller markup and keeps everything in a warm in-memory cache.
import { smmMultiplier } from "./settings.server";
import { fetchServices, type ProviderService } from "./smmgen.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Platform = {
  key: string;
  label: string;
  emoji: string;
  match: string[];
};

/** Ordered platform list. First match wins, so keep specific keys above generic ones. */
export const PLATFORMS: Platform[] = [
  { key: "facebook", label: "Facebook", emoji: "📘", match: ["facebook", "fb "] },
  { key: "instagram", label: "Instagram", emoji: "📸", match: ["instagram", "insta"] },
  { key: "tiktok", label: "TikTok", emoji: "🎵", match: ["tiktok", "tik tok"] },
  { key: "youtube", label: "YouTube", emoji: "▶️", match: ["youtube", "yt "] },
  { key: "telegram", label: "Telegram", emoji: "✈️", match: ["telegram"] },
  { key: "whatsapp", label: "WhatsApp", emoji: "💚", match: ["whatsapp"] },
  { key: "twitter", label: "X / Twitter", emoji: "✖️", match: ["twitter", " x -", "x ("] },
  { key: "threads", label: "Threads", emoji: "🧵", match: ["threads"] },
  { key: "spotify", label: "Spotify", emoji: "🎧", match: ["spotify"] },
  { key: "soundcloud", label: "SoundCloud", emoji: "🔊", match: ["soundcloud"] },
  { key: "linkedin", label: "LinkedIn", emoji: "💼", match: ["linkedin"] },
  { key: "discord", label: "Discord", emoji: "🎮", match: ["discord"] },
  { key: "twitch", label: "Twitch", emoji: "🟣", match: ["twitch"] },
  { key: "snapchat", label: "Snapchat", emoji: "👻", match: ["snapchat"] },
  { key: "pinterest", label: "Pinterest", emoji: "📌", match: ["pinterest"] },
  { key: "reddit", label: "Reddit", emoji: "👽", match: ["reddit"] },
  { key: "kick", label: "Kick", emoji: "🥊", match: ["kick"] },
  { key: "shopee", label: "Shopee", emoji: "🛒", match: ["shopee"] },
  { key: "google", label: "Google", emoji: "🔍", match: ["google"] },
  { key: "review", label: "Reviews", emoji: "⭐", match: ["review", "trustpilot"] },
  { key: "traffic", label: "Website Traffic", emoji: "🌐", match: ["traffic", "website"] },
  { key: "premium", label: "Premium Apps", emoji: "💎", match: ["premium apps", "subscription"] },
  { key: "other", label: "More Services", emoji: "🗂", match: [] },
];

export type Service = {
  id: number;
  name: string;
  type: string;
  price: number; // per 1000, markup applied
  min: number;
  max: number;
  category: string;
  refill: boolean;
  cancel: boolean;
};

export type Catalog = {
  services: Map<number, Service>;
  categories: string[]; // alphabetically sorted, index == callback id
  byCategory: Map<string, Service[]>;
  byPlatform: Map<string, number[]>; // platform key -> category indexes
  loadedAt: number;
  multiplier: number;
};

const TTL_MS = 15 * 60 * 1000;
let cache: Catalog | null = null;
let inflight: Promise<Catalog> | null = null;
let rawCache: ProviderService[] | null = null;

function platformOf(category: string): string {
  const lower = category.toLowerCase();
  for (const platform of PLATFORMS) {
    if (platform.match.some((needle) => lower.includes(needle))) return platform.key;
  }
  return "other";
}

function clean(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/[ᴺᴱᵂ]/g, "").replace(/\s+/g, " ").trim();
}

function build(raw: ProviderService[], multiplier: number): Catalog {
  rawCache = raw;
  const services = new Map<number, Service>();
  const byCategory = new Map<string, Service[]>();

  for (const item of raw) {
    const category = clean(item.category ?? "Others");
    const service: Service = {
      id: Number(item.service),
      name: clean(item.name),
      type: item.type ?? "Default",
      price: Math.round(Number(item.rate) * multiplier * 100000) / 100000,
      min: Number(item.min) || 1,
      max: Number(item.max) || 1000000,
      category,
      refill: Boolean(item.refill),
      cancel: Boolean(item.cancel),
    };
    if (!Number.isFinite(service.id) || !Number.isFinite(service.price)) continue;
    services.set(service.id, service);
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(service);
    else byCategory.set(category, [service]);
  }

  for (const list of byCategory.values()) list.sort((a, b) => a.price - b.price);

  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));
  const byPlatform = new Map<string, number[]>();
  categories.forEach((category, index) => {
    const key = platformOf(category);
    const bucket = byPlatform.get(key);
    if (bucket) bucket.push(index);
    else byPlatform.set(key, [index]);
  });

  return { services, categories, byCategory, byPlatform, loadedAt: Date.now(), multiplier };
}

async function loadFromDb(): Promise<ProviderService[] | null> {
  const { data } = await supabaseAdmin
    .from("bot_service_cache")
    .select("services, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (!data?.services) return null;
  const age = Date.now() - new Date(data.updated_at as string).getTime();
  if (age > 6 * 60 * 60 * 1000) return null;
  return data.services as unknown as ProviderService[];
}

async function saveToDb(raw: ProviderService[]) {
  await supabaseAdmin
    .from("bot_service_cache")
    .upsert({ id: 1, services: raw as never, updated_at: new Date().toISOString() });
}

export async function getCatalog(force = false): Promise<Catalog> {
  const multiplier = await smmMultiplier();
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) {
    if (cache.multiplier === multiplier) return cache;
    if (rawCache) {
      const loadedAt = cache.loadedAt;
      cache = build(rawCache, multiplier);
      cache.loadedAt = loadedAt;
      return cache;
    }
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (!force) {
        const stored = await loadFromDb();
        if (stored?.length) {
          cache = build(stored, multiplier);
          return cache;
        }
      }
      const fresh = await fetchServices();
      cache = build(fresh, multiplier);
      saveToDb(fresh).catch((error) => console.error("[catalog] cache save failed", error));
      return cache;
    } catch (error) {
      if (cache) return cache;
      throw error;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function platformMeta(key: string): Platform {
  return PLATFORMS.find((p) => p.key === key) ?? PLATFORMS[PLATFORMS.length - 1]!;
}

export function needsComments(service: Service): boolean {
  return /custom comments|mentions custom list/i.test(service.type);
}

export function isQuantityFree(service: Service): boolean {
  // Package / subscription style services have a fixed quantity.
  return /package|subscription/i.test(service.type);
}

export function priceFor(service: Service, quantity: number): number {
  return Math.round((service.price / 1000) * quantity * 100000) / 100000;
}

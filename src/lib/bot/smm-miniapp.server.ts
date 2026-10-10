// Telegram Mini App for Frrr SMM: platform → category → product, then the bot shows details.
import { runAsBot } from "./scope.server";
import { bot1TokenValue } from "./telegram.server";
import { verifyInitData } from "./miniapp.server";
import { getCatalog, PLATFORMS } from "./catalog.server";
import { getUser } from "./store.server";
import { money, currencyScope } from "./views.server";
import { isCurrency } from "./config.server";

async function scoped<T>(initData: string, fn: (id: number) => Promise<T>) {
  return runAsBot("smm", async () => {
    const id = await verifyInitData(initData, bot1TokenValue);
    const user = await getUser(id);
    const code = isCurrency(user?.currency) ? user.currency : "USD";
    return currencyScope.run({ code }, () => fn(id));
  });
}

export function smmPlatforms(initData: string) {
  return scoped(initData, async () => {
    const c = await getCatalog();
    return PLATFORMS.filter((p) => (c.byPlatform.get(p.key) ?? []).length).map((p) => ({
      key: p.key, label: p.label, emoji: p.emoji,
      cats: (c.byPlatform.get(p.key) ?? []).map((i) => ({ i, name: c.categories[i]!, count: c.byCategory.get(c.categories[i]!)?.length ?? 0 })),
    }));
  });
}

export function smmCategory(initData: string, index: number) {
  return scoped(initData, async () => {
    const c = await getCatalog();
    const name = c.categories[index];
    if (!name) return [];
    return (c.byCategory.get(name) ?? []).map((s) => ({
      id: s.id, name: s.name, price: money(s.price), min: s.min, max: s.max, refill: s.refill,
    }));
  });
}

export function smmSelect(initData: string, serviceId: number) {
  return scoped(initData, async (id) => {
    const c = await getCatalog();
    if (!c.services.has(serviceId)) throw new Error("This product is no longer available.");
    const { openMiniService } = await import("./handler.server");
    await openMiniService(id, serviceId);
    return { ok: true };
  });
}

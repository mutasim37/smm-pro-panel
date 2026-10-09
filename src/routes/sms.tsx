import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSmsMiniCatalog, selectSmsMini } from "@/lib/sms-miniapp.functions";

export const Route = createFileRoute("/sms")({
  head: () => ({
    meta: [
      { title: "Frrr SMS — Select Service" },
      { name: "description", content: "Pick a platform and country for your Frrr SMS virtual number." },
      { property: "og:title", content: "Frrr SMS — Select Service" },
      { property: "og:description", content: "Pick a platform and country for your Frrr SMS virtual number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: SmsMiniApp,
});

type Country = { code: string; name: string; price: string; usd: number; stock: number };
type Service = { code: string; name: string; from: string; countries: Country[] };
type TgWebApp = { initData: string; ready: () => void; expand: () => void; close: () => void };
const TOP = ["telegram", "whatsapp", "google", "facebook", "instagram", "tiktok", "twitter", "openai", "discord", "microsoft", "snapchat", "amazon"];

function SmsMiniApp() {
  const [list, setList] = useState<Service[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [service, setService] = useState<Service | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const tg = () => (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

  useEffect(() => {
    let tries = 0;
    const start = () => {
      const app = tg();
      if (!app?.initData) { if (tries++ < 20) return void setTimeout(start, 150); return setError("Open this page from the Frrr SMS bot."); }
      app.ready(); app.expand();
      loadSmsMiniCatalog({ data: { initData: app.initData } }).then((r) => setList(r as Service[])).catch((e) => setError(e instanceof Error ? e.message : "Could not load stock."));
    };
    start();
  }, []);

  const shown = useMemo(() => {
    const rank = (c: string) => { const i = TOP.indexOf(c); return i < 0 ? 99 : i; };
    const t = q.trim().toLowerCase();
    if (service) return service.countries.filter((c) => !t || c.name.toLowerCase().includes(t));
    return (list ?? []).filter((s) => !t || s.name.toLowerCase().includes(t)).sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name));
  }, [list, q, service]);

  async function confirm() {
    const app = tg(); if (!app || !service || !country) return;
    setBusy(true);
    try { await selectSmsMini({ data: { initData: app.initData, service: service.code, country: country.code } }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not select."); }
    finally { setBusy(false); }
  }

  const card = "w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-card-foreground transition hover:border-primary";
  return (
    <main className="min-h-screen bg-background px-4 pb-28 pt-5 text-foreground">
      <h1 className="text-xl font-bold">📲 Frrr SMS</h1>
      <p className="mb-4 text-sm text-muted-foreground">{done ? "Selected" : service ? `Step 2 · Choose a country for ${service.name}` : "Step 1 · Choose a platform"}</p>
      {error && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-lg font-semibold">✅ {service?.name} · {country?.name}</p>
          <p className="text-sm text-muted-foreground">Your summary is waiting in the bot. Tap Confirm there to get your number.</p>
          <button className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground" onClick={() => tg()?.close()}>⬅ Back to Bot</button>
        </div>
      ) : (
        <>
          {service && <button className="mb-3 text-sm text-primary" onClick={() => { setService(null); setCountry(null); setQ(""); }}>← All platforms</button>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={service ? "Search country…" : "Search platform…"} className="mb-3 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary" />
          {!list && !error && <p className="text-sm text-muted-foreground">Loading live stock…</p>}
          <div className="space-y-2">
            {service
              ? (shown as Country[]).slice(0, 150).map((c) => (
                  <button key={c.code} className={`${card} ${country?.code === c.code ? "border-primary ring-2 ring-primary" : ""}`} onClick={() => setCountry(c)}>
                    <div className="flex justify-between"><span className="font-medium">{c.name}</span><span className="font-semibold text-primary">{c.price}</span></div>
                    <div className="text-xs text-muted-foreground">{c.stock >= 100 ? "🟢 High" : c.stock >= 10 ? "🟡 Medium" : "🟠 Low"} stock</div>
                  </button>
                ))
              : (shown as Service[]).slice(0, 150).map((s) => (
                  <button key={s.code} className={card} onClick={() => { setService(s); setQ(""); }}>
                    <div className="flex justify-between"><span className="font-medium">{s.name}</span><span className="text-sm text-muted-foreground">from {s.from}</span></div>
                    <div className="text-xs text-muted-foreground">{s.countries.length} countries</div>
                  </button>
                ))}
          </div>
          {country && (
            <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background p-4">
              <button disabled={busy} className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60" onClick={confirm}>
                {busy ? "Selecting…" : `Select · ${country.name} · ${country.price}`}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

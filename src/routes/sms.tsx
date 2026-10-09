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
type TgWebApp = { initData: string; ready: () => void; expand: () => void; close: () => void; HapticFeedback?: { selectionChanged: () => void } };
const TOP = ["telegram", "whatsapp", "google", "facebook", "instagram", "tiktok", "twitter", "openai", "discord", "microsoft", "snapchat", "amazon"];

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold uppercase text-primary">
      {name.slice(0, 2)}
    </span>
  );
}

function StockDots({ n }: { n: number }) {
  const lvl = n >= 100 ? 3 : n >= 10 ? 2 : 1;
  return (
    <span className="flex items-end gap-0.5" aria-label="stock level">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= lvl ? "bg-primary" : "bg-muted"}`} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

function SmsMiniApp() {
  const [srv, setSrv] = useState<"1" | "2">("2");
  const [list, setList] = useState<Service[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [service, setService] = useState<Service | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const tg = () => (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  const tick = () => tg()?.HapticFeedback?.selectionChanged();

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s") === "1" ? "1" : "2";
    setSrv(s);
    let tries = 0;
    const start = () => {
      const app = tg();
      if (!app?.initData) { if (tries++ < 20) return void setTimeout(start, 150); return setError("Open this page from the Frrr SMS bot."); }
      app.ready(); app.expand();
      loadSmsMiniCatalog({ data: { initData: app.initData, srv: s } }).then((r) => setList(r as Service[])).catch((e) => setError(e instanceof Error ? e.message : "Could not load stock."));
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
    try { await selectSmsMini({ data: { initData: app.initData, service: service.code, country: country.code, srv } }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not select."); }
    finally { setBusy(false); }
  }

  const step = done ? 3 : service ? 2 : 1;
  const row = "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left text-card-foreground transition active:scale-[0.99]";

  return (
    <main className="min-h-screen bg-background pb-32 text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Frrr SMS</h1>
            <p className="text-xs text-muted-foreground">Virtual numbers · Instant OTP</p>
          </div>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            {srv === "1" ? "⚡ Server 1" : "🌍 Server 2"}
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {["Platform", "Country", "Done"].map((l, i) => (
            <div key={l} className="flex-1">
              <div className={`h-1 rounded-full ${i < step ? "bg-primary" : "bg-muted"}`} />
              <p className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${i < step ? "text-primary" : "text-muted-foreground"}`}>{l}</p>
            </div>
          ))}
        </div>
        {!done && (
          <div className="mt-3 flex items-center gap-2">
            {service && (
              <button className="rounded-xl border border-border px-3 py-2.5 text-sm font-medium" onClick={() => { setService(null); setCountry(null); setQ(""); }}>←</button>
            )}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={service ? `Search country for ${service.name}…` : "Search platform…"} className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        )}
      </header>

      <section className="px-4 pt-4">
        {error && <p className="mb-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {done ? (
          <div className="mt-8 space-y-4 rounded-3xl border border-border bg-card p-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-2xl">✓</div>
            <p className="text-lg font-semibold">{service?.name} · {country?.name}</p>
            <p className="text-2xl font-bold text-primary">{country?.price}</p>
            <p className="text-sm text-muted-foreground">Your order summary is waiting in the bot. Tap Confirm there to get your number.</p>
            <button className="w-full rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground" onClick={() => tg()?.close()}>Back to Bot</button>
          </div>
        ) : !list && !error ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {service
              ? (shown as Country[]).slice(0, 200).map((c) => (
                  <button key={c.code} className={`${row} ${country?.code === c.code ? "border-primary ring-2 ring-primary" : ""}`} onClick={() => { tick(); setCountry(c); }}>
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><StockDots n={c.stock} />{c.stock >= 100 ? "High" : c.stock >= 10 ? "Medium" : "Low"} stock</p>
                    </div>
                    <span className="font-bold text-primary">{c.price}</span>
                  </button>
                ))
              : (shown as Service[]).slice(0, 200).map((s) => (
                  <button key={s.code} className={row} onClick={() => { tick(); setService(s); setQ(""); window.scrollTo(0, 0); }}>
                    <Avatar name={s.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.countries.length} countries</p>
                    </div>
                    <span className="text-right text-xs text-muted-foreground">from<br /><b className="text-sm text-foreground">{s.from}</b></span>
                  </button>
                ))}
            {list && shown.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing found.</p>}
          </div>
        )}
      </section>

      {country && !done && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur">
          <div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">{service?.name} · {country.name}</span><b>{country.price}</b></div>
          <button disabled={busy} className="w-full rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground disabled:opacity-60" onClick={confirm}>
            {busy ? "Selecting…" : "Select & Continue"}
          </button>
        </div>
      )}
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadSmmCategory, loadSmmPlatforms, selectSmmService } from "@/lib/smm-miniapp.functions";

export const Route = createFileRoute("/smm")({
  head: () => ({
    meta: [
      { title: "Frrr SMM — Select Service" },
      { name: "description", content: "Pick a platform, category and product for your Frrr SMM order." },
      { property: "og:title", content: "Frrr SMM — Select Service" },
      { property: "og:description", content: "Pick a platform, category and product for your Frrr SMM order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: SmmMiniApp,
});

type Cat = { i: number; name: string; count: number };
type Platform = { key: string; label: string; emoji: string; cats: Cat[] };
type Product = { id: number; name: string; price: string; min: number; max: number; refill: boolean };
type TgWebApp = { initData: string; ready: () => void; expand: () => void; close: () => void; HapticFeedback?: { selectionChanged: () => void } };

function Icon({ children }: { children: string }) {
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg font-bold text-primary">{children}</span>;
}

function SmmMiniApp() {
  const [platforms, setPlatforms] = useState<Platform[] | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [cat, setCat] = useState<Cat | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const tg = () => (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  const tick = () => tg()?.HapticFeedback?.selectionChanged();

  useEffect(() => {
    let tries = 0;
    const start = () => {
      const app = tg();
      if (!app?.initData) { if (tries++ < 20) return void setTimeout(start, 150); return setError("Open this page from the Frrr SMM bot."); }
      app.ready(); app.expand();
      loadSmmPlatforms({ data: { initData: app.initData } }).then((r) => setPlatforms(r as Platform[])).catch((e) => setError(e instanceof Error ? e.message : "Could not load services."));
    };
    start();
  }, []);

  function openCat(c: Cat) {
    const app = tg(); if (!app) return;
    tick(); setCat(c); setProducts(null); setProduct(null); setQ(""); window.scrollTo(0, 0);
    loadSmmCategory({ data: { initData: app.initData, index: c.i } }).then((r) => setProducts(r as Product[])).catch((e) => setError(e instanceof Error ? e.message : "Could not load products."));
  }

  function back() {
    tick(); setQ(""); setProduct(null); setError("");
    if (cat) { setCat(null); setProducts(null); } else setPlatform(null);
  }

  async function confirm() {
    const app = tg(); if (!app || !product) return;
    setBusy(true);
    try { await selectSmmService({ data: { initData: app.initData, serviceId: product.id } }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not select."); }
    finally { setBusy(false); }
  }

  const t = q.trim().toLowerCase();
  const shownPlatforms = useMemo(() => (platforms ?? []).filter((p) => !t || p.label.toLowerCase().includes(t)), [platforms, t]);
  const shownCats = useMemo(() => (platform?.cats ?? []).filter((c) => !t || c.name.toLowerCase().includes(t)), [platform, t]);
  const shownProducts = useMemo(() => (products ?? []).filter((p) => !t || p.name.toLowerCase().includes(t) || String(p.id) === t), [products, t]);

  const step = done ? 4 : cat ? 3 : platform ? 2 : 1;
  const row = "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left text-card-foreground transition active:scale-[0.99]";
  const loading = <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>;

  return (
    <main className="min-h-screen bg-background pb-32 text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Frrr SMM</h1>
            <p className="text-xs text-muted-foreground">Premium Social Growth</p>
          </div>
          {platform && <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{platform.emoji} {platform.label}</span>}
        </div>
        <div className="mt-3 flex gap-1.5">
          {["Platform", "Category", "Product", "Done"].map((l, i) => (
            <div key={l} className="flex-1">
              <div className={`h-1 rounded-full ${i < step ? "bg-primary" : "bg-muted"}`} />
              <p className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${i < step ? "text-primary" : "text-muted-foreground"}`}>{l}</p>
            </div>
          ))}
        </div>
        {!done && (
          <div className="mt-3 flex items-center gap-2">
            {platform && <button aria-label="Back" className="rounded-xl border border-border px-3 py-2.5 text-sm font-medium" onClick={back}>←</button>}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={cat ? "Search product or code…" : platform ? `Search ${platform.label} category…` : "Search platform…"} className="w-full rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm outline-none focus:border-primary" />
          </div>
        )}
      </header>

      <section className="px-4 pt-4">
        {error && <p className="mb-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {done ? (
          <div className="mt-8 space-y-4 rounded-3xl border border-border bg-card p-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-2xl">✓</div>
            <p className="text-lg font-semibold">{product?.name}</p>
            <p className="text-2xl font-bold text-primary">{product?.price} <span className="text-sm font-medium text-muted-foreground">/ 1000</span></p>
            <p className="text-sm text-muted-foreground">Full product details are waiting in the bot. Continue your order there.</p>
            <button className="w-full rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground" onClick={() => tg()?.close()}>Back to Bot</button>
          </div>
        ) : !platforms && !error ? loading : cat ? (
          !products ? loading : (
            <div className="space-y-2">
              <p className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{cat.name}</p>
              {shownProducts.slice(0, 300).map((p) => (
                <button key={p.id} className={`${row} ${product?.id === p.id ? "border-primary ring-2 ring-primary" : ""}`} onClick={() => { tick(); setProduct(p); }}>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">#{p.id} · Min {p.min.toLocaleString()} · Max {p.max.toLocaleString()}{p.refill ? " · ♻️ Refill" : ""}</p>
                  </div>
                  <span className="text-right text-xs text-muted-foreground"><b className="text-sm text-primary">{p.price}</b><br />per 1000</span>
                </button>
              ))}
              {shownProducts.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing found.</p>}
            </div>
          )
        ) : platform ? (
          <div className="space-y-2">
            {shownCats.map((c) => (
              <button key={c.i} className={row} onClick={() => openCat(c)}>
                <Icon>{platform.emoji}</Icon>
                <p className="min-w-0 flex-1 text-sm font-medium">{c.name}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{c.count}</span>
              </button>
            ))}
            {shownCats.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing found.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {shownPlatforms.map((p) => (
              <button key={p.key} className={row} onClick={() => { tick(); setPlatform(p); setQ(""); window.scrollTo(0, 0); }}>
                <Icon>{p.emoji}</Icon>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.cats.length} categories</p>
                </div>
                <span className="text-muted-foreground">›</span>
              </button>
            ))}
            {platforms && shownPlatforms.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing found.</p>}
          </div>
        )}
      </section>

      {product && !done && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur">
          <div className="mb-2 flex justify-between gap-3 text-sm"><span className="truncate text-muted-foreground">#{product.id} · {product.name}</span><b className="shrink-0">{product.price}</b></div>
          <button disabled={busy} className="w-full rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground disabled:opacity-60" onClick={confirm}>
            {busy ? "Opening…" : "Confirm & Continue in Bot"}
          </button>
        </div>
      )}
    </main>
  );
}

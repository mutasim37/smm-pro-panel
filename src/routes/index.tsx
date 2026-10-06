import { createFileRoute } from "@tanstack/react-router";
import banner from "@/assets/bot-welcome.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XNOVA SMM — Premium Social Growth Engine" },
      {
        name: "description",
        content:
          "XNOVA SMM is a fully automated social media marketing panel on Telegram with 7,000+ services, instant delivery and automatic USDT top-up.",
      },
      { property: "og:title", content: "XNOVA SMM — Premium Social Growth Engine" },
      {
        property: "og:description",
        content:
          "7,000+ social media services, instant order placement and automatic on-chain USDT payments — all inside Telegram.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: "⚡", title: "Instant Delivery", body: "Orders reach the supply network the moment you confirm them." },
  { icon: "🪙", title: "Automatic USDT Top-Up", body: "BEP20 payments verified on-chain — no minimum, no waiting." },
  { icon: "🌍", title: "7,000+ Services", body: "Every major platform, grouped and searchable by category." },
  { icon: "🔒", title: "Privacy First", body: "Your links, orders and balance stay private. Always." },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden">
        <img
          src={banner}
          alt="XNOVA SMM premium social growth engine"
          width={1280}
          height={720}
          className="h-[46vh] w-full object-cover sm:h-[60vh]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-6 pb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">XNOVA SMM</h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Premium social growth engine — running entirely inside Telegram.
          </p>
          <a
            href="https://t.me/Frreohi"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Contact Support
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-6 py-12 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="rounded-2xl border border-border bg-card p-5">
            <div className="text-2xl">{feature.icon}</div>
            <h2 className="mt-3 text-base font-semibold text-card-foreground">{feature.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        XNOVA SMM · Automated social marketing · Support @Frreohi
      </footer>
    </main>
  );
}

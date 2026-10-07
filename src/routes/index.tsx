import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XNOVA SMM" },
      { name: "description", content: "Nothing in here. XNOVA SMM runs inside Telegram." },
      { property: "og:title", content: "XNOVA SMM" },
      { property: "og:description", content: "Nothing in here. XNOVA SMM runs inside Telegram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Empty,
});

function Empty() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <h1 className="text-lg font-medium tracking-wide text-muted-foreground">Nothing in here</h1>
    </main>
  );
}

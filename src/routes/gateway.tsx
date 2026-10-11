import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { gwAdmin } from "@/lib/gateway.functions";

export const Route = createFileRoute("/gateway")({
  head: () => ({
    meta: [
      { title: "Frrr Pay — Gateway Admin & API Docs" },
      { name: "description", content: "Manage bKash payment links, API keys and merchant docs." },
      { property: "og:title", content: "Frrr Pay — Gateway Admin & API Docs" },
      { property: "og:description", content: "Manage bKash payment links, API keys and merchant docs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const run = useServerFn(gwAdmin);
  const [pw, setPw] = useState("");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [last, setLast] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function call(action: any, extra: any = {}) {
    setErr("");
    try {
      const r: any = await run({ data: { password: pw, action, ...extra } });
      if (r.invoice) setLast(`${origin}/pay/${r.invoice.id}`);
      if (r.key) setLast(r.key);
      if (r.invoice || r.key) return call("list");
      setD(r);
    } catch (e: any) { setErr(e.message ?? "Error"); }
  }

  if (!d)
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-muted/40">
        <form onSubmit={(e) => { e.preventDefault(); call("list"); }} className="w-full max-w-sm rounded-2xl border bg-card p-6 space-y-3 shadow-xl">
          <h1 className="text-xl font-bold">Frrr Pay Admin</h1>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Admin password" className="w-full rounded-lg border bg-background px-3 py-2" />
          <button className="w-full rounded-lg bg-primary text-primary-foreground py-2 font-semibold">Login</button>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </form>
      </main>
    );

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Frrr Pay Admin</h1>
      {last && <div className="rounded-lg border bg-card p-3 font-mono text-sm break-all">{last} <button className="text-primary underline ml-2" onClick={() => navigator.clipboard?.writeText(last)}>copy</button></div>}
      {err && <p className="text-destructive">{err}</p>}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <h2 className="font-semibold">Create payment link</h2>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (৳)" className="w-full rounded border bg-background px-3 py-2" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded border bg-background px-3 py-2" />
          <button onClick={() => call("create", { amount: Number(amount), note: note || undefined })} className="rounded bg-primary text-primary-foreground px-4 py-2">Generate link</button>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <h2 className="font-semibold">API keys</h2>
          <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Website name" className="flex-1 rounded border bg-background px-3 py-2" />
            <button onClick={() => call("newkey", { name })} className="rounded bg-primary text-primary-foreground px-4">New key</button></div>
          {d.keys.map((k: any) => (
            <div key={k.key} className="text-xs font-mono flex justify-between gap-2 break-all">
              <span className={k.active ? "" : "line-through opacity-50"}>{k.name}: {k.key}</span>
              {k.active && <button className="text-destructive" onClick={() => call("revoke", { key: k.key })}>revoke</button>}
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Payment ID or TrxID" className="flex-1 rounded border bg-background px-3 py-2" />
          <button onClick={() => call("list", { q: q || undefined })} className="rounded border px-4">Search</button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th>Payment ID</th><th>Amount</th><th>Status</th><th>TrxID</th><th>Merchant</th><th>Created</th></tr></thead>
          <tbody>{d.invoices.map((i: any) => (
            <tr key={i.id} className="border-t"><td className="font-mono py-1"><a className="text-primary" href={`/pay/${i.id}`} target="_blank">{i.id}</a></td><td>৳{i.amount}{i.paid_amount != null && i.paid_amount !== i.amount ? ` (paid ${i.paid_amount})` : ""}</td>
              <td>{i.status}</td><td className="font-mono">{i.trx_id ?? "—"}</td><td>{i.merchant}{i.order ? ` #${i.order}` : ""}</td><td>{new Date(i.created_at).toLocaleString()}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="rounded-xl border bg-card p-4 space-y-2 text-sm">
        <h2 className="font-semibold text-base">API documentation</h2>
        <p>Base URL: <code>{origin}/api/public/gateway/v1</code> · Header: <code>X-API-Key: your_key</code></p>
        <p><b>Create invoice</b> — POST JSON:</p>
        <pre className="bg-muted rounded p-3 overflow-x-auto">{`{ "amount": 500, "order_id": "A123", "note": "Premium plan",
  "callback_url": "https://yoursite.com/webhook", "expires_minutes": 30 }
→ 201 { "id": "inv_...", "payment_url": "${origin}/pay/inv_...", "status": "pending", ... }`}</pre>
        <p><b>Check status</b> — GET <code>?id=inv_...</code> → <code>{`{ "status": "pending | paid | expired", "trx_id", "paid_amount" }`}</code></p>
        <p><b>Callback</b> — when paid we POST <code>{`{ "event": "invoice.paid", "invoice": {...} }`}</code> to callback_url. Always confirm with GET status before delivering.</p>
      </section>
    </main>
  );
}

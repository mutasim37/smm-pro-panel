import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { gwGetInvoice, gwVerify } from "@/lib/gateway.functions";

export const Route = createFileRoute("/pay/$id")({
  head: () => ({
    meta: [
      { title: "Secure bKash Checkout — Frrr Pay" },
      { name: "description", content: "Pay your invoice securely with bKash." },
      { property: "og:title", content: "Secure bKash Checkout — Frrr Pay" },
      { property: "og:description", content: "Pay your invoice securely with bKash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pay,
});

const reasons: Record<string, string> = {
  not_found: "Payment not found yet. Wait 30 seconds and try again.",
  used: "This transaction was already used.",
  amount_low: "Paid amount is less than the invoice amount.",
  expired: "This invoice has expired.",
  not_pending: "This invoice is no longer payable.",
};

function Pay() {
  const { id } = Route.useParams();
  const get = useServerFn(gwGetInvoice);
  const verify = useServerFn(gwVerify);
  const [inv, setInv] = useState<any>(undefined);
  const [mode, setMode] = useState<"super" | "normal" | null>(null);
  const [trx, setTrx] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => get({ data: { id } }).then(setInv);
  useEffect(() => { load(); }, [id]);

  async function check() {
    setBusy(true); setMsg("");
    const r = await verify({ data: { id, trx: mode === "normal" ? trx : undefined } });
    if (!r.ok) setMsg(reasons[r.reason] ?? "Failed");
    await load(); setBusy(false);
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t);

  return (
    <main className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl overflow-hidden">
        <div className="bg-primary text-primary-foreground px-6 py-5">
          <p className="text-xs uppercase tracking-widest opacity-80">Frrr Pay · Secure checkout</p>
          {inv && <p className="text-3xl font-bold mt-1">৳{inv.amount.toFixed(2)}</p>}
          {inv?.note && <p className="text-sm opacity-90 mt-1">{inv.note}</p>}
        </div>
        <div className="p-6 space-y-4">
          {inv === undefined && <p className="text-muted-foreground">Loading…</p>}
          {inv === null && <p>Invoice not found.</p>}
          {inv && inv.status === "paid" && (
            <div className="text-center space-y-2">
              <div className="text-5xl">✅</div>
              <p className="text-xl font-semibold">Payment successful</p>
              <p className="text-sm text-muted-foreground">Payment ID: <b className="font-mono">{inv.id}</b></p>
              <p className="text-sm text-muted-foreground">TrxID: <b className="font-mono">{inv.trx_id}</b></p>
            </div>
          )}
          {inv && inv.status === "expired" && <p className="text-center text-destructive font-medium">This invoice has expired.</p>}
          {inv && inv.status === "pending" && !mode && (
            <>
              <p className="font-medium">Choose payment method</p>
              <button onClick={() => setMode("super")} className="w-full rounded-xl border p-4 text-left hover:border-primary">
                <b>bKash Super Mode</b><p className="text-sm text-muted-foreground">Pay with a reference — confirmed automatically</p>
              </button>
              <button onClick={() => setMode("normal")} className="w-full rounded-xl border p-4 text-left hover:border-primary">
                <b>bKash Normal</b><p className="text-sm text-muted-foreground">Pay, then enter your Transaction ID</p>
              </button>
            </>
          )}
          {inv && inv.status === "pending" && mode && (
            <>
              <ol className="text-sm space-y-2 list-decimal pl-5">
                <li>Open bKash → <b>Send Money</b></li>
                <li>Number: <b className="font-mono">{inv.pay_number}</b> <button className="text-primary underline" onClick={() => copy(inv.pay_number)}>copy</button></li>
                <li>Amount: <b>৳{inv.amount.toFixed(2)}</b></li>
                {mode === "super" && <li>Reference: <b className="font-mono">{inv.ref}</b> <button className="text-primary underline" onClick={() => copy(inv.ref)}>copy</button> <span className="text-destructive">(required)</span></li>}
              </ol>
              {mode === "normal" && (
                <input value={trx} onChange={(e) => setTrx(e.target.value.toUpperCase())} placeholder="Transaction ID (TrxID)" className="w-full rounded-lg border bg-background px-3 py-2 font-mono" />
              )}
              <button disabled={busy || (mode === "normal" && trx.length < 8)} onClick={check} className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50">
                {busy ? "Finding payment…" : mode === "super" ? "I have paid — Check" : "Verify payment"}
              </button>
              {msg && <p className="text-sm text-destructive">{msg}</p>}
              <button onClick={() => { setMode(null); setMsg(""); }} className="w-full text-sm text-muted-foreground">← Change method</button>
            </>
          )}
          <p className="text-[11px] text-center text-muted-foreground pt-2">Payment ID {id}</p>
        </div>
      </div>
    </main>
  );
}

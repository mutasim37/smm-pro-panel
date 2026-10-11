import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const gwGetInvoice = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const g = await import("./gateway.server");
    const r = await g.getInvoice(data.id);
    return r ? g.publicInvoice(r) : null;
  });

export const gwVerify = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().min(4).max(40), trx: z.string().max(20).optional() }).parse(d))
  .handler(async ({ data }) => (await import("./gateway.server")).verifyInvoice(data.id, data.trx));

const pw = z.string().min(1).max(100);

export const gwAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      password: pw,
      action: z.enum(["list", "create", "newkey", "revoke", "lookup"]),
      amount: z.number().positive().max(1_000_000).optional(),
      note: z.string().max(200).optional(),
      name: z.string().max(60).optional(),
      key: z.string().max(80).optional(),
      q: z.string().max(40).optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    const g = await import("./gateway.server");
    g.checkAdmin(data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    if (data.action === "create") {
      if (!data.amount) throw new Error("Amount required");
      return { invoice: g.publicInvoice(await g.createInvoice({ amount: data.amount, merchant: "admin", note: data.note, minutes: 60 * 24 })) };
    }
    if (data.action === "newkey") {
      const key = g.newId("gw_live_", 32);
      await db.from("gw_keys").insert({ key, name: data.name || "Merchant" });
      return { key };
    }
    if (data.action === "revoke" && data.key) await db.from("gw_keys").update({ active: false }).eq("key", data.key);
    let q = db.from("gw_invoices").select("*").order("created_at", { ascending: false }).limit(50);
    if (data.q) q = db.from("gw_invoices").select("*").or(`id.eq.${data.q.replace(/[^\w]/g, "")},trx_id.eq.${data.q.replace(/[^\w]/g, "").toUpperCase()}`);
    const [{ data: inv }, { data: keys }] = await Promise.all([q, db.from("gw_keys").select("*").order("created_at", { ascending: false })]);
    return { invoices: (inv ?? []).map(g.publicInvoice), keys: keys ?? [] };
  });

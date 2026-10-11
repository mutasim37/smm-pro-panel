CREATE TABLE public.gw_keys (key text PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.gw_keys TO service_role;
ALTER TABLE public.gw_keys ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.gw_invoices (
 id text PRIMARY KEY, amount_bdt numeric NOT NULL CHECK (amount_bdt > 0), ref text NOT NULL,
 status text NOT NULL DEFAULT 'pending', trx_id text UNIQUE, paid_bdt numeric, payer text,
 merchant text, merchant_order text, note text, callback_url text,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes', paid_at timestamptz);
GRANT ALL ON public.gw_invoices TO service_role;
ALTER TABLE public.gw_invoices ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_bkash_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trx_id text NOT NULL UNIQUE,
  amount_bdt numeric NOT NULL,
  sender text,
  body text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  claimed_by bigint,
  claimed_at timestamptz
);
GRANT ALL ON public.bot_bkash_sms TO service_role;
ALTER TABLE public.bot_bkash_sms ENABLE ROW LEVEL SECURITY;
INSERT INTO public.bot_secrets (name, value) VALUES ('bkash_webhook', 'xnova_bkash_secure_key_2026') ON CONFLICT (name) DO NOTHING;
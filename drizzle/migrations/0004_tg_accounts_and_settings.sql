CREATE TABLE public.bot_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.bot_settings (key, value) VALUES ('smm_markup_pct', 40), ('tg_multiplier', 3) ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.bot_tg_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  item_id bigint NOT NULL,
  phone text,
  country text,
  charge numeric NOT NULL,
  cost numeric,
  order_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, item_id)
);
CREATE INDEX bot_tg_accounts_user_idx ON public.bot_tg_accounts (telegram_id, created_at DESC);
GRANT ALL ON public.bot_tg_accounts TO service_role;
ALTER TABLE public.bot_tg_accounts ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bot_secrets (name, value) VALUES ('phoenix_api_key', 'phx_J9qaf2S6bm5K8FHGHH4wKrirzntNjwzXihFs4yKp4wA') ON CONFLICT (name) DO NOTHING;
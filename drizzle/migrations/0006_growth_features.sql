ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS referred_by bigint;
ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS ref_earned numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS ref_rewarded boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS bot_users_referred_by_idx ON public.bot_users (referred_by);

CREATE TABLE public.bot_popular (
  service_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_popular TO service_role;
ALTER TABLE public.bot_popular ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bot_settings (key, value) VALUES ('ref_pct', 5) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.bot_secrets (name, value) VALUES ('force_channel', '') ON CONFLICT (name) DO NOTHING;
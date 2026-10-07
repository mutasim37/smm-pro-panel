CREATE TABLE public.bot_api_keys (telegram_id bigint PRIMARY KEY, api_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot_api_keys TO service_role;
ALTER TABLE public.bot_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'bot';
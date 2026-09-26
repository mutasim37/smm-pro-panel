-- Bot users
CREATE TABLE public.bot_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  balance NUMERIC(14,5) NOT NULL DEFAULT 0,
  total_deposited NUMERIC(14,5) NOT NULL DEFAULT 0,
  total_spent NUMERIC(14,5) NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_users TO service_role;
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;

-- Conversation state
CREATE TABLE public.bot_states (
  telegram_id BIGINT PRIMARY KEY,
  step TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_states TO service_role;
ALTER TABLE public.bot_states ENABLE ROW LEVEL SECURITY;

-- Deposits (tx hash can only be used once)
CREATE TABLE public.bot_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  amount_requested NUMERIC(14,5),
  amount_credited NUMERIC(14,5),
  tx_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '8 minutes'),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX idx_bot_deposits_user ON public.bot_deposits (telegram_id, created_at DESC);
GRANT ALL ON public.bot_deposits TO service_role;
ALTER TABLE public.bot_deposits ENABLE ROW LEVEL SECURITY;

-- Orders
CREATE TABLE public.bot_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  service_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  category TEXT,
  link TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  comments TEXT,
  charge NUMERIC(14,5) NOT NULL,
  provider_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  start_count TEXT,
  remains TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_orders_user ON public.bot_orders (telegram_id, created_at DESC);
GRANT ALL ON public.bot_orders TO service_role;
ALTER TABLE public.bot_orders ENABLE ROW LEVEL SECURITY;

-- Support tickets / reports
CREATE TABLE public.bot_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_tickets TO service_role;
ALTER TABLE public.bot_tickets ENABLE ROW LEVEL SECURITY;

-- Cached SMMGen service list
CREATE TABLE public.bot_service_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT ALL ON public.bot_service_cache TO service_role;
ALTER TABLE public.bot_service_cache ENABLE ROW LEVEL SECURITY;

-- Balance helper: atomic adjust
CREATE OR REPLACE FUNCTION public.bot_adjust_balance(_telegram_id BIGINT, _delta NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.bot_users
     SET balance = balance + _delta,
         total_deposited = total_deposited + GREATEST(_delta, 0),
         total_spent = total_spent + GREATEST(-_delta, 0)
   WHERE telegram_id = _telegram_id
   RETURNING balance INTO new_balance;
  RETURN new_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.bot_adjust_balance(BIGINT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_adjust_balance(BIGINT, NUMERIC) TO service_role;
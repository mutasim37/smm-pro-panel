ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.bot_orders ADD COLUMN IF NOT EXISTS refunded numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS bot_orders_active_idx ON public.bot_orders (status) WHERE provider_order_id IS NOT NULL;
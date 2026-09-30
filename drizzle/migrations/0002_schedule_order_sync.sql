-- lovable-cron-fallback-reviewed: SMMGen has no webhooks; order statuses must be polled. Only calls out when active orders exist.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.bot_secrets (
  name text PRIMARY KEY,
  value text NOT NULL
);
GRANT ALL ON public.bot_secrets TO service_role;
ALTER TABLE public.bot_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bot_secrets (name, value)
VALUES ('cron_sync', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule(
  'bot-sync-orders',
  '*/5 * * * *',
  $$SELECT net.http_post(
      url := 'https://project--3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd-dev.lovable.app/api/public/cron/sync-orders',
      headers := jsonb_build_object('Content-Type','application/json','X-Cron-Key',(SELECT value FROM public.bot_secrets WHERE name = 'cron_sync')),
      body := '{}'::jsonb
  )
  WHERE EXISTS (
    SELECT 1 FROM public.bot_orders
    WHERE provider_order_id IS NOT NULL
      AND status NOT IN ('completed','partial','canceled','cancelled','failed')
  )$$
);
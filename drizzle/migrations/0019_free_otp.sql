CREATE TABLE public.bot3_free_watch (phone text PRIMARY KEY, country text NOT NULL, path text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot3_free_watch TO service_role;
ALTER TABLE public.bot3_free_watch ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot3_free_seen (key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot3_free_seen TO service_role;
ALTER TABLE public.bot3_free_seen ENABLE ROW LEVEL SECURITY;
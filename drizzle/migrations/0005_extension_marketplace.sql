CREATE TABLE public.bot_ext_packages (
  id serial PRIMARY KEY,
  name text NOT NULL,
  duration_value int NOT NULL,
  duration_unit text NOT NULL,
  price_bdt numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_ext_packages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bot_ext_packages_id_seq TO service_role;
ALTER TABLE public.bot_ext_packages ENABLE ROW LEVEL SECURITY;
INSERT INTO public.bot_ext_packages (name, duration_value, duration_unit, price_bdt) VALUES
  ('1 Month', 30, 'day', 2),
  ('Lifetime', 120, 'month', 10);

CREATE TABLE public.bot_ext_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  package_id int,
  package_name text NOT NULL,
  license_key text NOT NULL UNIQUE,
  expires_at timestamptz,
  charge numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bot_ext_licenses_user_idx ON public.bot_ext_licenses (telegram_id, created_at DESC);
GRANT ALL ON public.bot_ext_licenses TO service_role;
ALTER TABLE public.bot_ext_licenses ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bot_secrets (name, value) VALUES ('eklas_api_key', '45263155_live_3ke8h2qLEtfyR0yA8zsHce5Fy9vGd4o1') ON CONFLICT (name) DO NOTHING;
CREATE TABLE public.bot_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot text NOT NULL DEFAULT 'smm',
  code text NOT NULL UNIQUE,
  percent numeric,
  amount_usd numeric,
  product text,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_coupons TO service_role;
ALTER TABLE public.bot_coupons ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bot_coupon_uses (
  coupon_id uuid NOT NULL REFERENCES public.bot_coupons(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coupon_id, telegram_id)
);
GRANT ALL ON public.bot_coupon_uses TO service_role;
ALTER TABLE public.bot_coupon_uses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bot_redeem_coupon(_code text, _bot text, _telegram_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  UPDATE public.bot_coupons SET used_count = used_count + 1
   WHERE code = upper(_code) AND bot = _bot AND active AND used_count < max_uses
     AND (expires_at IS NULL OR expires_at > now())
     AND NOT EXISTS (SELECT 1 FROM public.bot_coupon_uses u WHERE u.coupon_id = bot_coupons.id AND u.telegram_id = _telegram_id)
   RETURNING id INTO cid;
  IF cid IS NULL THEN RETURN false; END IF;
  INSERT INTO public.bot_coupon_uses(coupon_id, telegram_id) VALUES (cid, _telegram_id);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.bot_release_coupon(_code text, _bot text, _telegram_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  SELECT id INTO cid FROM public.bot_coupons WHERE code = upper(_code) AND bot = _bot;
  IF cid IS NULL THEN RETURN; END IF;
  DELETE FROM public.bot_coupon_uses WHERE coupon_id = cid AND telegram_id = _telegram_id;
  IF FOUND THEN UPDATE public.bot_coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = cid; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.bot_redeem_coupon(text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bot_release_coupon(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_redeem_coupon(text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bot_release_coupon(text, text, bigint) TO service_role;
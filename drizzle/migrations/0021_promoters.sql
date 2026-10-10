CREATE TABLE public.bot_promoters (
  bot text NOT NULL, telegram_id bigint NOT NULL, pct numeric NOT NULL,
  balance numeric NOT NULL DEFAULT 0, total_earned numeric NOT NULL DEFAULT 0, total_withdrawn numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot, telegram_id));
GRANT ALL ON public.bot_promoters TO service_role;
ALTER TABLE public.bot_promoters ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_promo_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bot text NOT NULL, telegram_id bigint NOT NULL,
  amount numeric NOT NULL, fee numeric NOT NULL, method text NOT NULL, destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz);
GRANT ALL ON public.bot_promo_withdrawals TO service_role;
ALTER TABLE public.bot_promo_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_users ADD COLUMN IF NOT EXISTS promoted_by bigint, ADD COLUMN IF NOT EXISTS promoted_at timestamptz;
ALTER TABLE public.bot2_users ADD COLUMN IF NOT EXISTS promoted_by bigint, ADD COLUMN IF NOT EXISTS promoted_at timestamptz;
ALTER TABLE public.bot3_users ADD COLUMN IF NOT EXISTS promoted_by bigint, ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

CREATE OR REPLACE FUNCTION public.bot_promo_credit(_bot text, _promoter bigint, _amount numeric)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE bot_promoters SET balance = balance + _amount, total_earned = total_earned + _amount
    WHERE bot = _bot AND telegram_id = _promoter AND active AND _amount > 0 RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM u) $$;

CREATE OR REPLACE FUNCTION public.bot_promo_withdraw(_bot text, _tg bigint, _fee numeric, _method text, _dest text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE amt numeric; wid uuid;
BEGIN
  UPDATE bot_promoters p SET balance = 0, total_withdrawn = total_withdrawn + p.balance
   WHERE bot = _bot AND telegram_id = _tg AND balance > _fee
   RETURNING (SELECT balance FROM bot_promoters WHERE bot = _bot AND telegram_id = _tg) INTO amt;
  IF amt IS NULL THEN RETURN NULL; END IF;
  INSERT INTO bot_promo_withdrawals(bot, telegram_id, amount, fee, method, destination)
   VALUES (_bot, _tg, amt, _fee, _method, _dest) RETURNING id INTO wid;
  RETURN wid;
END $$;

CREATE OR REPLACE FUNCTION public.bot_promo_reject(_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w record;
BEGIN
  UPDATE bot_promo_withdrawals SET status = 'rejected', decided_at = now() WHERE id = _id AND status = 'pending' RETURNING * INTO w;
  IF w IS NULL THEN RETURN false; END IF;
  UPDATE bot_promoters SET balance = balance + w.amount, total_withdrawn = total_withdrawn - w.amount
   WHERE bot = w.bot AND telegram_id = w.telegram_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bot_promo_credit(text,bigint,numeric), public.bot_promo_withdraw(text,bigint,numeric,text,text), public.bot_promo_reject(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_promo_credit(text,bigint,numeric), public.bot_promo_withdraw(text,bigint,numeric,text,text), public.bot_promo_reject(uuid) TO service_role;
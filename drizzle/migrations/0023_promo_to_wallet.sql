CREATE OR REPLACE FUNCTION public.bot_promo_to_wallet(_bot text, _tg bigint)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE amt numeric;
BEGIN
  SELECT balance INTO amt FROM bot_promoters WHERE bot = _bot AND telegram_id = _tg AND active FOR UPDATE;
  IF amt IS NULL OR amt <= 0 THEN RETURN 0; END IF;
  UPDATE bot_promoters SET balance = 0, total_withdrawn = total_withdrawn + amt WHERE bot = _bot AND telegram_id = _tg;
  IF _bot = 'sms' THEN UPDATE bot3_users SET balance = balance + amt WHERE telegram_id = _tg;
  ELSIF _bot = 'tg' THEN UPDATE bot2_users SET balance = balance + amt WHERE telegram_id = _tg;
  ELSE UPDATE bot_users SET balance = balance + amt WHERE telegram_id = _tg; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  RETURN amt;
END $$;
REVOKE ALL ON FUNCTION public.bot_promo_to_wallet(text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_promo_to_wallet(text,bigint) TO service_role;
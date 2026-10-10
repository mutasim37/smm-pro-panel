CREATE OR REPLACE FUNCTION public.bot_promo_withdraw(_bot text, _tg bigint, _fee numeric, _method text, _dest text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE amt numeric; wid uuid;
BEGIN
  SELECT balance INTO amt FROM bot_promoters WHERE bot = _bot AND telegram_id = _tg AND active FOR UPDATE;
  IF amt IS NULL OR amt <= _fee THEN RETURN NULL; END IF;
  UPDATE bot_promoters SET balance = 0, total_withdrawn = total_withdrawn + amt WHERE bot = _bot AND telegram_id = _tg;
  INSERT INTO bot_promo_withdrawals(bot, telegram_id, amount, fee, method, destination)
   VALUES (_bot, _tg, amt, _fee, _method, _dest) RETURNING id INTO wid;
  RETURN wid;
END $$;
REVOKE ALL ON FUNCTION public.bot_promo_withdraw(text,bigint,numeric,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_promo_withdraw(text,bigint,numeric,text,text) TO service_role;
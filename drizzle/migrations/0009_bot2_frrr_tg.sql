DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','states','orders','tg_accounts','tickets','popular','api_keys','ext_licenses'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.bot2_%s (LIKE public.bot_%s INCLUDING ALL)', t, t);
    EXECUTE format('GRANT ALL ON public.bot2_%s TO service_role', t);
    EXECUTE format('ALTER TABLE public.bot2_%s ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.bot2_adjust_balance(_telegram_id BIGINT, _delta NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance NUMERIC;
BEGIN
  UPDATE public.bot2_users
     SET balance = balance + _delta,
         total_deposited = total_deposited + GREATEST(_delta, 0),
         total_spent = total_spent + GREATEST(-_delta, 0)
   WHERE telegram_id = _telegram_id
   RETURNING balance INTO new_balance;
  RETURN new_balance;
END; $$;
REVOKE ALL ON FUNCTION public.bot2_adjust_balance(BIGINT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot2_adjust_balance(BIGINT, NUMERIC) TO service_role;

INSERT INTO public.bot_secrets(name, value) VALUES ('bot2_token', '8920052049:AAFhZq4DDlPTSKqFGDs4hV44KOvUf1oukzI')
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;
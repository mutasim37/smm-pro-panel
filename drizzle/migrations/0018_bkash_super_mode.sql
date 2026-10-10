CREATE TABLE public.bot_bkash_refs (
  ref text PRIMARY KEY,
  bot text NOT NULL,
  telegram_id bigint NOT NULL,
  sender text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  trx_id text,
  amount_bdt numeric,
  message_id bigint,
  pending_order jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX bot_bkash_refs_user_idx ON public.bot_bkash_refs (bot, telegram_id, status);
GRANT ALL ON public.bot_bkash_refs TO service_role;
ALTER TABLE public.bot_bkash_refs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bot_claim_bkash_ref(_trx text, _ref text, _sender text)
RETURNS TABLE(bot text, telegram_id bigint, amount numeric, ref text, message_id bigint, pending_order jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.bot_bkash_sms; r public.bot_bkash_refs;
BEGIN
  SELECT * INTO s FROM public.bot_bkash_sms WHERE trx_id = upper(_trx) AND claimed_by IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO r FROM public.bot_bkash_refs b
   WHERE b.ref = upper(_ref) AND b.status = 'pending' AND b.expires_at > now()
     AND right(regexp_replace(b.sender, '\D', '', 'g'), 10) = right(regexp_replace(_sender, '\D', '', 'g'), 10)
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.bot_bkash_sms SET claimed_by = r.telegram_id, claimed_at = now() WHERE id = s.id;
  UPDATE public.bot_bkash_refs SET status = 'claimed', trx_id = s.trx_id, amount_bdt = s.amount_bdt WHERE bot_bkash_refs.ref = r.ref;
  RETURN QUERY SELECT r.bot, r.telegram_id, s.amount_bdt, r.ref, r.message_id, r.pending_order;
END $$;
REVOKE ALL ON FUNCTION public.bot_claim_bkash_ref(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_claim_bkash_ref(text, text, text) TO service_role;
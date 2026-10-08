DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','states','tickets','orders','popular'] LOOP
 EXECUTE format('CREATE TABLE IF NOT EXISTS public.bot3_%s (LIKE public.bot_%s INCLUDING ALL)',t,t);
 EXECUTE format('GRANT ALL ON public.bot3_%s TO service_role',t);
 EXECUTE format('ALTER TABLE public.bot3_%s ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE TABLE public.bot3_sms_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_id bigint NOT NULL,
 service text NOT NULL, service_name text NOT NULL, country text NOT NULL, country_name text NOT NULL,
 charge numeric NOT NULL, cost numeric NOT NULL, provider_id text UNIQUE, phone text,
 status text NOT NULL DEFAULT 'purchasing', otp text, refunded numeric NOT NULL DEFAULT 0,
 request_key uuid NOT NULL UNIQUE, provider_response text, message_id bigint,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now()+interval '20 minutes'),
 updated_at timestamptz NOT NULL DEFAULT now(), notified_at timestamptz,
 poll_locked_until timestamptz
);
GRANT ALL ON public.bot3_sms_orders TO service_role;
ALTER TABLE public.bot3_sms_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX bot3_sms_orders_active ON public.bot3_sms_orders(status,expires_at);
CREATE INDEX bot3_sms_orders_owner ON public.bot3_sms_orders(telegram_id,created_at DESC);
CREATE TABLE public.bot3_settings (LIKE public.bot_settings INCLUDING ALL);
GRANT ALL ON public.bot3_settings TO service_role;
ALTER TABLE public.bot3_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot3_service_cache (key text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot3_service_cache TO service_role;
ALTER TABLE public.bot3_service_cache ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot3_updates (update_id bigint PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot3_updates TO service_role;
ALTER TABLE public.bot3_updates ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.bot3_adjust_balance(_telegram_id bigint,_delta numeric) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE b numeric; BEGIN
 UPDATE public.bot3_users SET balance=balance+_delta,total_deposited=total_deposited+greatest(_delta,0),total_spent=total_spent+greatest(-_delta,0) WHERE telegram_id=_telegram_id AND balance+_delta>=0 RETURNING balance INTO b;
 IF b IS NULL THEN RAISE EXCEPTION 'Insufficient balance or unknown user'; END IF; RETURN b; END $$;
REVOKE ALL ON FUNCTION public.bot3_adjust_balance(bigint,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_adjust_balance(bigint,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.bot3_reserve_sms(_user bigint,_key uuid,_service text,_service_name text,_country text,_country_name text,_charge numeric,_cost numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE oid uuid; BEGIN
 IF _charge<=0 OR _cost<=0 OR _charge<_cost THEN RAISE EXCEPTION 'Invalid price'; END IF;
 PERFORM 1 FROM public.bot3_users WHERE telegram_id=_user FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.bot3_sms_orders WHERE request_key=_key) THEN RETURN NULL; END IF;
 UPDATE public.bot3_users SET balance=balance-_charge,total_spent=total_spent+_charge WHERE telegram_id=_user AND NOT is_banned AND balance>=_charge;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.bot3_sms_orders(telegram_id,request_key,service,service_name,country,country_name,charge,cost) VALUES(_user,_key,_service,_service_name,_country,_country_name,_charge,_cost) RETURNING id INTO oid;
 RETURN oid; END $$;
REVOKE ALL ON FUNCTION public.bot3_reserve_sms(bigint,uuid,text,text,text,text,numeric,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_reserve_sms(bigint,uuid,text,text,text,text,numeric,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.bot3_finish_sms(_id uuid,_kind text,_value text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE o public.bot3_sms_orders; BEGIN
 SELECT * INTO o FROM public.bot3_sms_orders WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF _kind='otp' AND o.refunded=0 AND o.status NOT IN ('refunded','failed') THEN
 UPDATE public.bot3_sms_orders SET otp=_value,status='received',updated_at=now() WHERE id=_id; RETURN true;
 END IF;
 IF _kind='refund' AND o.otp IS NULL AND o.refunded=0 AND _value='ACCESS_CANCEL' THEN
 UPDATE public.bot3_users SET balance=balance+o.charge,total_spent=greatest(0,total_spent-o.charge) WHERE telegram_id=o.telegram_id;
 UPDATE public.bot3_sms_orders SET refunded=charge,status='refunded',provider_response=_value,updated_at=now() WHERE id=_id; RETURN true;
 END IF;
 IF _kind='rejected' AND o.status='purchasing' AND o.provider_id IS NULL AND o.refunded=0 AND _value IN ('NO_BALANCE','NO_NUMBERS','BAD_KEY','BAD_SERVICE','BAD_ACTION','SERVICE_UNAVAILABLE_REGION','The service is prohibited for sale by administration') THEN
 UPDATE public.bot3_users SET balance=balance+o.charge,total_spent=greatest(0,total_spent-o.charge) WHERE telegram_id=o.telegram_id;
 UPDATE public.bot3_sms_orders SET refunded=charge,status='failed',provider_response=_value,updated_at=now() WHERE id=_id; RETURN true;
 END IF;
 RETURN false; END $$;
REVOKE ALL ON FUNCTION public.bot3_finish_sms(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_finish_sms(uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.bot3_claim_sms_poll(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.bot3_sms_orders SET poll_locked_until=now()+interval '60 seconds' WHERE id=_id AND (poll_locked_until IS NULL OR poll_locked_until<now()) AND status IN ('waiting','cancel_pending','refund_review'); RETURN FOUND; END $$;
REVOKE ALL ON FUNCTION public.bot3_claim_sms_poll(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_claim_sms_poll(uuid) TO service_role;
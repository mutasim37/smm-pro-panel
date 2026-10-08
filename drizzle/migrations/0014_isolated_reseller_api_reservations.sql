CREATE TABLE public.bot3_api_keys (telegram_id bigint PRIMARY KEY, api_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot3_api_keys TO service_role;
ALTER TABLE public.bot3_api_keys ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_api_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bot text NOT NULL, telegram_id bigint NOT NULL, request_key uuid NOT NULL, product text NOT NULL, charge numeric NOT NULL, status text NOT NULL DEFAULT 'reserved', result jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(bot,telegram_id,request_key));
GRANT ALL ON public.bot_api_requests TO service_role;
ALTER TABLE public.bot_api_requests ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.bot_api_reserve(_bot text,_user bigint,_key uuid,_product text,_charge numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t text; rid uuid; BEGIN
 IF _bot NOT IN ('smm','tg') OR _charge<=0 OR _charge='NaN'::numeric THEN RAISE EXCEPTION 'Invalid request'; END IF;
 t:=CASE WHEN _bot='tg' THEN 'bot2_users' ELSE 'bot_users' END;
 EXECUTE format('SELECT 1 FROM public.%I WHERE telegram_id=$1 FOR UPDATE',t) USING _user;
 IF EXISTS(SELECT 1 FROM public.bot_api_requests WHERE bot=_bot AND telegram_id=_user AND request_key=_key) THEN RETURN NULL; END IF;
 EXECUTE format('UPDATE public.%I SET balance=balance-$1,total_spent=total_spent+$1 WHERE telegram_id=$2 AND NOT is_banned AND balance>=$1',t) USING _charge,_user;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.bot_api_requests(bot,telegram_id,request_key,product,charge) VALUES(_bot,_user,_key,_product,_charge) RETURNING id INTO rid; RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.bot_api_reserve(text,bigint,uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot_api_reserve(text,bigint,uuid,text,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.bot_api_reject(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.bot_api_requests; t text; BEGIN
 SELECT * INTO r FROM public.bot_api_requests WHERE id=_id FOR UPDATE; IF NOT FOUND OR r.status<>'reserved' THEN RETURN false; END IF;
 t:=CASE WHEN r.bot='tg' THEN 'bot2_users' ELSE 'bot_users' END;
 EXECUTE format('UPDATE public.%I SET balance=balance+$1,total_spent=greatest(0,total_spent-$1) WHERE telegram_id=$2',t) USING r.charge,r.telegram_id;
 UPDATE public.bot_api_requests SET status='refunded' WHERE id=_id; RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bot_api_reject(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot_api_reject(uuid) TO service_role;
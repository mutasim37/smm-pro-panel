CREATE OR REPLACE FUNCTION public.bot_api_reserve(_bot text,_user bigint,_key uuid,_product text,_charge numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t text; rid uuid; changed integer; BEGIN
 IF _bot NOT IN ('smm','tg') OR _charge<=0 OR _charge='NaN'::numeric THEN RAISE EXCEPTION 'Invalid request'; END IF;
 t:=CASE WHEN _bot='tg' THEN 'bot2_users' ELSE 'bot_users' END;
 EXECUTE format('SELECT 1 FROM public.%I WHERE telegram_id=$1 FOR UPDATE',t) USING _user;
 IF EXISTS(SELECT 1 FROM public.bot_api_requests WHERE bot=_bot AND telegram_id=_user AND request_key=_key) THEN RETURN NULL; END IF;
 EXECUTE format('UPDATE public.%I SET balance=balance-$1,total_spent=total_spent+$1 WHERE telegram_id=$2 AND NOT is_banned AND balance>=$1',t) USING _charge,_user;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed<>1 THEN RETURN NULL; END IF;
 INSERT INTO public.bot_api_requests(bot,telegram_id,request_key,product,charge) VALUES(_bot,_user,_key,_product,_charge) RETURNING id INTO rid; RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.bot_api_reserve(text,bigint,uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot_api_reserve(text,bigint,uuid,text,numeric) TO service_role;
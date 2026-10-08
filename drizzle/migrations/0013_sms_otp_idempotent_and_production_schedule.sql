-- lovable-cron-fallback-reviewed: Preserve the agreed one-minute OTP window, 1440 daily runs only while work exists; provider has no webhook and the job unschedules after drain.
CREATE OR REPLACE FUNCTION public.bot3_finish_sms(_id uuid,_kind text,_value text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE o public.bot3_sms_orders; BEGIN
 SELECT * INTO o FROM public.bot3_sms_orders WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF _kind='otp' AND o.otp IS NULL AND length(trim(_value))>0 AND o.provider_id IS NOT NULL AND o.refunded=0 AND o.status IN ('waiting','cancel_pending','refund_review') THEN
 UPDATE public.bot3_sms_orders SET otp=_value,status='received',updated_at=now() WHERE id=_id; RETURN true;
 END IF;
 IF _kind='refund' AND o.otp IS NULL AND o.refunded=0 AND o.provider_id IS NOT NULL AND _value='ACCESS_CANCEL' THEN
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
CREATE OR REPLACE FUNCTION public.bot3_reconcile_sms_schedule() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,cron AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(8543493783);
 IF EXISTS(SELECT 1 FROM public.bot3_sms_orders WHERE status IN ('waiting','cancel_pending') OR (status IN ('received','refunded') AND notified_at IS NULL AND notification_attempts<3)) THEN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='bot3-sync-sms') THEN
 PERFORM cron.schedule('bot3-sync-sms','* * * * *',$job$SELECT net.http_post(url := 'https://project--3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd.lovable.app/api/public/cron/sync-sms',headers := jsonb_build_object('Content-Type','application/json','X-Cron-Key',(SELECT value FROM public.bot_secrets WHERE name='cron_sync')),body := '{}'::jsonb);$job$);
 END IF;
 ELSE
 PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='bot3-sync-sms';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.bot3_reconcile_sms_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_reconcile_sms_schedule() TO service_role;
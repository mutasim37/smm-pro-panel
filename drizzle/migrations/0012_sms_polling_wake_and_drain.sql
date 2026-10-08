-- lovable-cron-fallback-reviewed: Grizzly has no inbound OTP webhook; one-minute polling is required for automatic OTP, dynamically armed only while active orders or bounded pending notifications exist and removed after drain.
ALTER TABLE public.bot3_sms_orders ADD COLUMN notification_attempts integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.bot3_reconcile_sms_schedule() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,cron AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(8543493783);
 IF EXISTS(SELECT 1 FROM public.bot3_sms_orders WHERE status IN ('waiting','cancel_pending') OR (status IN ('received','refunded') AND notified_at IS NULL AND notification_attempts<3)) THEN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='bot3-sync-sms') THEN
 PERFORM cron.schedule('bot3-sync-sms','* * * * *',$job$SELECT net.http_post(url := 'https://project--3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd-dev.lovable.app/api/public/cron/sync-sms',headers := jsonb_build_object('Content-Type','application/json','X-Cron-Key',(SELECT value FROM public.bot_secrets WHERE name='cron_sync')),body := '{}'::jsonb);$job$);
 END IF;
 ELSE
 PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='bot3-sync-sms';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.bot3_reconcile_sms_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_reconcile_sms_schedule() TO service_role;
CREATE OR REPLACE FUNCTION public.bot3_sms_schedule_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.bot3_reconcile_sms_schedule(); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.bot3_sms_schedule_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bot3_sms_wake AFTER INSERT OR UPDATE OF status,notified_at,notification_attempts ON public.bot3_sms_orders FOR EACH STATEMENT EXECUTE FUNCTION public.bot3_sms_schedule_trigger();
-- lovable-cron-fallback-reviewed: public free-number site has no webhooks; existing armed minute job extended, auto-unschedules when no active 30-minute watches
CREATE OR REPLACE FUNCTION public.bot3_reconcile_sms_schedule()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
BEGIN
 PERFORM pg_advisory_xact_lock(8543493783);
 IF EXISTS(SELECT 1 FROM public.bot3_sms_orders WHERE status IN ('waiting','cancel_pending','refund_review') OR (status='purchasing' AND search_tracked AND provider_response='STOP' AND NOT purchase_in_flight) OR (status IN ('received','refunded','failed') AND refunded+coalesce(length(otp),0)>0 AND notified_at IS NULL AND notification_attempts<3))
    OR EXISTS(SELECT 1 FROM public.bot3_free_watch WHERE expires_at > now()) THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='bot3-sync-sms') THEN
   PERFORM cron.schedule('bot3-sync-sms','* * * * *',$job$SELECT net.http_post(url := 'https://project--3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd.lovable.app/api/public/cron/sync-sms',headers := jsonb_build_object('Content-Type','application/json','X-Cron-Key',(SELECT value FROM public.bot_secrets WHERE name='cron_sync')),body := '{}'::jsonb);$job$);
  END IF;
 ELSE PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='bot3-sync-sms'; END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.bot3_free_watch_arm() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.bot3_reconcile_sms_schedule(); RETURN NULL; END $$;
REVOKE EXECUTE ON FUNCTION public.bot3_free_watch_arm() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bot3_free_watch_arm AFTER INSERT OR UPDATE OR DELETE ON public.bot3_free_watch FOR EACH STATEMENT EXECUTE FUNCTION public.bot3_free_watch_arm();
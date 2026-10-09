-- lovable-cron-fallback-reviewed: Existing minute OTP poll has no supplier push webhook; include pending refunds in the same bounded job and unschedule after drain.
ALTER TABLE public.bot3_sms_orders ADD COLUMN IF NOT EXISTS search_tracked boolean NOT NULL DEFAULT false;
ALTER TABLE public.bot3_sms_orders ADD COLUMN IF NOT EXISTS purchase_in_flight boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.bot3_sms_search_step(_id uuid, _action text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.bot3_sms_orders;
BEGIN
 SELECT * INTO o FROM public.bot3_sms_orders WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 'missing'; END IF;
 IF o.status <> 'purchasing' OR o.provider_id IS NOT NULL OR o.refunded>0 THEN RETURN o.status; END IF;
 IF _action='track' THEN
  UPDATE public.bot3_sms_orders SET search_tracked=true WHERE id=_id;
 ELSIF _action='begin' THEN
  IF o.provider_response='STOP' THEN RETURN 'stopped'; END IF;
  IF o.purchase_in_flight THEN RETURN 'busy'; END IF;
  UPDATE public.bot3_sms_orders SET search_tracked=true,purchase_in_flight=true,updated_at=now() WHERE id=_id;
  RETURN 'request';
 ELSIF _action='empty' THEN
  UPDATE public.bot3_sms_orders SET purchase_in_flight=false,updated_at=now() WHERE id=_id;
  o.purchase_in_flight:=false;
 ELSIF _action='stop' THEN
  UPDATE public.bot3_sms_orders SET provider_response='STOP',updated_at=now() WHERE id=_id;
  o.provider_response:='STOP';
 ELSE RETURN 'invalid'; END IF;
 IF o.provider_response='STOP' AND (o.search_tracked OR _action='track') AND NOT o.purchase_in_flight THEN
  PERFORM public.bot3_finish_sms(_id,'rejected','NO_NUMBERS');
  RETURN 'refunded';
 END IF;
 RETURN 'purchasing';
END $$;
REVOKE ALL ON FUNCTION public.bot3_sms_search_step(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bot3_sms_search_step(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.bot3_reconcile_sms_schedule() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,cron AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(8543493783);
 IF EXISTS(SELECT 1 FROM public.bot3_sms_orders WHERE status IN ('waiting','cancel_pending','refund_review') OR (status='purchasing' AND search_tracked AND provider_response='STOP' AND NOT purchase_in_flight) OR (status IN ('received','refunded','failed') AND refunded+coalesce(length(otp),0)>0 AND notified_at IS NULL AND notification_attempts<3)) THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='bot3-sync-sms') THEN
   PERFORM cron.schedule('bot3-sync-sms','* * * * *',$job$SELECT net.http_post(url := 'https://project--3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd.lovable.app/api/public/cron/sync-sms',headers := jsonb_build_object('Content-Type','application/json','X-Cron-Key',(SELECT value FROM public.bot_secrets WHERE name='cron_sync')),body := '{}'::jsonb);$job$);
  END IF;
 ELSE PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='bot3-sync-sms'; END IF;
END $$;
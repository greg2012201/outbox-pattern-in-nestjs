CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_expired_inbox_messages()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF to_regclass('public.inbox_messages') IS NULL THEN
    RETURN;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_inbox_messages_ttl
  ON public.inbox_messages ("receivedAt")
  WHERE status <> 'PROCESSING';

  WITH expired AS MATERIALIZED (
    SELECT id
    FROM public.inbox_messages
    WHERE "receivedAt" <= now() - interval '30 days'
      AND status <> 'PROCESSING'
    ORDER BY "receivedAt"
    LIMIT 1000
  )
  DELETE FROM public.inbox_messages AS inbox
  USING expired
  WHERE inbox.id = expired.id;
END;
$function$;

SELECT cron.schedule(
  'inbox-messages-ttl',
  '*/15 * * * *',
  'SELECT public.cleanup_expired_inbox_messages()'
);

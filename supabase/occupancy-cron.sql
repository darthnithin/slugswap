-- Run after deploying the function and saving slugswap_occupancy_cron_secret in Vault.
-- Scheduling the same named job updates it instead of creating a duplicate.
SELECT cron.schedule(
  'slugswap-facility-occupancy',
  '0,30 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://htaktvkkxeylaelyvxoz.supabase.co/functions/v1/facility-occupancy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'slugswap_occupancy_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

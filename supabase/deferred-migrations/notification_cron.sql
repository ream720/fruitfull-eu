create extension if not exists pg_net with schema extensions;

-- Before this job runs, create Vault secrets named fruitfull_project_url and
-- fruitfull_dispatch_secret. See README.md. The Edge Function independently
-- verifies the dispatch secret; it does not expose the service-role credential.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-fruitfull-order-emails') then
    perform cron.unschedule('send-fruitfull-order-emails');
  end if;
  perform cron.schedule(
    'send-fruitfull-order-emails',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'fruitfull_project_url') || '/functions/v1/send-order-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'fruitfull_dispatch_secret')
        ),
        body := '{}'::jsonb
      )
    $job$
  );
end;
$$;

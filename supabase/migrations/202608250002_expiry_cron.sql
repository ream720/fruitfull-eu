create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-fruitfull-reservations') then
    perform cron.unschedule('expire-fruitfull-reservations');
  end if;
  perform cron.schedule(
    'expire-fruitfull-reservations',
    '*/5 * * * *',
    'select public.expire_reservations()'
  );
end;
$$;

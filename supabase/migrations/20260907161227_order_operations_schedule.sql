-- Uses the existing Supabase project. Installation alone schedules nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.configure_order_operations_schedule(p_secret text) returns void
language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
  if length(p_secret)<43 or p_secret is null then raise exception 'Invalid operations secret'; end if;
  select id into secret_id from vault.secrets where name='hl_order_operations';
  if secret_id is null then
    perform vault.create_secret(p_secret,'hl_order_operations','Internal order operations bearer');
  else
    perform vault.update_secret(secret_id,p_secret);
  end if;
  perform cron.schedule('hl-order-operations','*/15 * * * *',
    $job$select net.http_get(
      url := 'https://honestlenses.com/api/internal/order-operations',
      headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='hl_order_operations')),
      timeout_milliseconds := 300000
    );$job$);
end;
$$;
revoke all on function public.configure_order_operations_schedule(text) from public,anon,authenticated;
grant execute on function public.configure_order_operations_schedule(text) to service_role;

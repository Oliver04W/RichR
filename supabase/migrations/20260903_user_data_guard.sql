-- Saving the user document with a stale-write guard.
-- The app keeps one JSONB document per user (user_data). Two saves can race
-- (debounced autosave vs. an explicit delete, two tabs, a flaky retry); with a
-- plain upsert the LAST request to arrive wins even if it carries an older
-- snapshot — which is how a deleted holding could come back. This RPC only
-- applies a document whose _ts is >= the stored one and reports what happened.
create or replace function public.save_user_data(doc jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); stored bigint; incoming bigint; applied boolean := false;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  incoming := coalesce((doc->>'_ts')::bigint, 0);
  select coalesce((data->>'_ts')::bigint, 0) into stored from public.user_data where user_id = me;
  if stored is null then
    insert into public.user_data (user_id, data, updated_at) values (me, doc, now());
    applied := true; stored := incoming;
  elsif incoming >= stored then
    update public.user_data set data = doc, updated_at = now() where user_id = me;
    applied := true; stored := incoming;
  end if;
  return jsonb_build_object('applied', applied, 'stored_ts', stored);
end $$;
grant execute on function public.save_user_data(jsonb) to authenticated;
notify pgrst, 'reload schema';

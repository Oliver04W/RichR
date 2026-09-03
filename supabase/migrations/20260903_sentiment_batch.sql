-- One round-trip for a screen full of sentiment cards (feed, Discover, communities):
-- the "everyone" tally for up to 40 assets at once. Same numbers as sentiment_for.
create or replace function public.sentiment_for_many(tickers text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(t, public.sentiment_for(t, 'everyone', null)), '{}'::jsonb)
  from (select distinct upper(x) as t from unnest(coalesce(tickers, '{}'::text[])) x where x <> '' limit 40) u;
$$;
grant execute on function public.sentiment_for_many(text[]) to authenticated;
notify pgrst, 'reload schema';

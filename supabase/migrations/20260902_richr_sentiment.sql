-- RichR Sentiment: one global Buy/Hold/Sell pool per asset, one vote per user,
-- server-side tallies (everyone / friends / community / holders), weekly change,
-- history, top assets, and 30-day staleness. Safe to re-run.

-- A re-affirmed vote ("still agree?") is a new row that keeps the vote fresh
-- without showing up as new activity in feeds.
alter table public.stock_calls add column if not exists reaffirmed boolean not null default false;
create index if not exists stock_calls_user_ticker_created on public.stock_calls (user_id, ticker, created_at desc);

-- Tally for one asset. scope: 'everyone' | 'friends' | 'community' (gid required).
-- Only the newest vote per user counts, and only if it is < 30 days old.
create or replace function public.sentiment_for(t text, scope text default 'everyone', gid uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tk text := upper(t);
  res jsonb;
begin
  if scope = 'community' and (gid is null or not public.is_group_member(gid)) then
    return jsonb_build_object('buy',0,'hold',0,'sell',0,'total',0);
  end if;
  with latest as (
    select distinct on (user_id) user_id, vote, reason, created_at
    from public.stock_calls where ticker = tk order by user_id, created_at desc
  ),
  scoped as (
    select l.* from latest l
    where l.created_at > now() - interval '30 days'
      and case scope
        when 'friends' then (l.user_id = me or public.is_mutual_friend(l.user_id))
        when 'community' then exists (select 1 from public.group_members gm where gm.group_id = gid and gm.user_id = l.user_id)
        else true end
  ),
  holders as (
    select s.* from scoped s join public.leaderboard lb on lb.user_id = s.user_id
    where exists (select 1 from jsonb_array_elements(coalesce(lb.top_holdings, '[]'::jsonb)) h where upper(h->>'ticker') = tk)
  ),
  week as (
    select distinct on (user_id) user_id, vote, created_at
    from public.stock_calls where ticker = tk and created_at <= now() - interval '7 days'
    order by user_id, created_at desc
  ),
  week_scoped as (
    select w.* from week w
    where w.created_at > now() - interval '37 days'
      and case scope
        when 'friends' then (w.user_id = me or public.is_mutual_friend(w.user_id))
        when 'community' then exists (select 1 from public.group_members gm where gm.group_id = gid and gm.user_id = w.user_id)
        else true end
  )
  select jsonb_build_object(
    'buy',   (select count(*) from scoped where vote = 'buy'),
    'hold',  (select count(*) from scoped where vote = 'hold'),
    'sell',  (select count(*) from scoped where vote = 'sell'),
    'total', (select count(*) from scoped),
    'holders', jsonb_build_object(
      'buy',   (select count(*) from holders where vote = 'buy'),
      'hold',  (select count(*) from holders where vote = 'hold'),
      'sell',  (select count(*) from holders where vote = 'sell'),
      'total', (select count(*) from holders)),
    'week_ago', jsonb_build_object(
      'buy',   (select count(*) from week_scoped where vote = 'buy'),
      'hold',  (select count(*) from week_scoped where vote = 'hold'),
      'sell',  (select count(*) from week_scoped where vote = 'sell'),
      'total', (select count(*) from week_scoped)),
    'mine', (select jsonb_build_object('vote', vote, 'reason', reason, 'created_at', created_at) from latest where user_id = me),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'vote', vote, 'reason', reason, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
                from (select * from scoped where reason is not null and reason <> '' order by created_at desc limit 6) r),
    'friends_voted', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'vote', vote) order by created_at desc), '[]'::jsonb)
                      from (select * from scoped where scope = 'everyone' and user_id <> me and public.is_mutual_friend(user_id) limit 8) f)
  ) into res;
  return res;
end $$;
grant execute on function public.sentiment_for(text, text, uuid) to authenticated;

-- Sentiment over time: `points` samples `step` apart, ending now. Each sample is
-- the tally of newest-vote-per-user as of that moment (30-day window).
create or replace function public.sentiment_history(t text, step interval, points int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('t', ts, 'buy', b, 'hold', h, 'sell', s, 'total', n) order by ts), '[]'::jsonb)
  from (
    select g.ts,
      count(l.vote) filter (where l.vote = 'buy')  as b,
      count(l.vote) filter (where l.vote = 'hold') as h,
      count(l.vote) filter (where l.vote = 'sell') as s,
      count(l.vote) as n
    from generate_series(now() - step * (least(greatest(points, 2), 60) - 1), now(), step) as g(ts)
    left join lateral (
      select distinct on (c.user_id) c.vote, c.created_at
      from public.stock_calls c
      where c.ticker = upper(t) and c.created_at <= g.ts
      order by c.user_id, c.created_at desc
    ) l on l.created_at > g.ts - interval '30 days'
    group by g.ts
  ) x;
$$;
grant execute on function public.sentiment_history(text, interval, int) to authenticated;

-- Most-voted assets (last 30 days), for Discover.
create or replace function public.top_sentiment(lim int default 8)
returns jsonb language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (user_id, ticker) user_id, ticker, vote, created_at
    from public.stock_calls order by user_id, ticker, created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object('ticker', ticker, 'buy', buy, 'hold', hold, 'sell', sell, 'total', n, 'recent', recent) order by recent desc, n desc), '[]'::jsonb)
  from (
    select ticker,
      count(*) filter (where vote = 'buy') buy, count(*) filter (where vote = 'hold') hold, count(*) filter (where vote = 'sell') sell,
      count(*) n, count(*) filter (where created_at > now() - interval '7 days') recent
    from latest where created_at > now() - interval '30 days'
    group by ticker order by recent desc, n desc limit least(greatest(lim, 1), 30)
  ) x;
$$;
grant execute on function public.top_sentiment(int) to authenticated;

-- My votes that are getting stale (for the "still agree?" nudge).
create or replace function public.my_stale_calls(days int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('ticker', ticker, 'vote', vote, 'reason', reason, 'created_at', created_at) order by created_at), '[]'::jsonb)
  from (
    select distinct on (ticker) ticker, vote, reason, created_at
    from public.stock_calls where user_id = auth.uid() order by ticker, created_at desc
  ) l
  where created_at < now() - (days || ' days')::interval;
$$;
grant execute on function public.my_stale_calls(int) to authenticated;

notify pgrst, 'reload schema';

-- Vote on ANY stock; ownership is a social signal, not a requirement.
--   stock_calls.owner  — "I hold this" at the time of voting (set by the app from
--                        the voter's own portfolio; never affects vote weight)
--   sentiment_for      — 'holders' now = owners-by-flag ∪ owners-by-shared-top-holdings,
--                        and reasons / friends_voted / mine carry an owner badge
--   discover_sentiment — Most voted · Trending · Most bullish · Most bearish ·
--                        Friends buying · Friends selling, in one call
-- Safe to re-run.
set check_function_bodies = off;
alter table public.stock_calls add column if not exists owner boolean not null default false;

create or replace function public.sentiment_for(t text, scope text default 'everyone', gid uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tk text := upper(t);
  res jsonb;
begin
  if scope = 'community' and (gid is null or not public.can_view_group(gid)) then
    return jsonb_build_object('buy',0,'hold',0,'sell',0,'total',0);
  end if;
  with latest as (
    select distinct on (user_id) user_id, vote, reason, created_at, coalesce(owner, false) as owner
    from public.stock_calls where ticker = tk order by user_id, created_at desc
  ),
  scoped as (
    select l.* from latest l
    where l.vote <> 'none' and l.created_at > now() - interval '30 days'
      and case scope
        when 'friends' then (l.user_id = me or public.is_mutual_friend(l.user_id))
        when 'community' then exists (select 1 from public.group_members gm where gm.group_id = gid and gm.user_id = l.user_id)
        else true end
  ),
  -- owners: said "I own it" when voting, or share it in their published top holdings
  holders as (
    select s.* from scoped s
    where s.owner or exists (select 1 from public.leaderboard lb, jsonb_array_elements(coalesce(lb.top_holdings, '[]'::jsonb)) h
                              where lb.user_id = s.user_id and upper(h->>'ticker') = tk)
  ),
  week as (
    select distinct on (user_id) user_id, vote, created_at
    from public.stock_calls where ticker = tk and created_at <= now() - interval '7 days'
    order by user_id, created_at desc
  ),
  week_scoped as (
    select w.* from week w
    where w.vote <> 'none' and w.created_at > now() - interval '37 days'
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
    'mine', (select jsonb_build_object('vote', vote, 'reason', reason, 'created_at', created_at, 'owner', owner) from latest where user_id = me and vote <> 'none'),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'vote', vote, 'reason', reason, 'created_at', created_at, 'owner', (user_id in (select user_id from holders))) order by created_at desc), '[]'::jsonb)
                from (select * from scoped where reason is not null and reason <> '' order by created_at desc limit 6) r),
    'friends_voted', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'vote', vote, 'owner', (user_id in (select user_id from holders))) order by created_at desc), '[]'::jsonb)
                      from (select * from scoped where scope = 'everyone' and user_id <> me and public.is_mutual_friend(user_id) limit 8) f)
  ) into res;
  return res;
end $$;


create or replace function public.discover_sentiment(lim int default 6)
returns jsonb language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (user_id, ticker) user_id, ticker, vote, coalesce(owner, false) as owner, created_at
    from public.stock_calls order by user_id, ticker, created_at desc
  ),
  active as (select * from latest where vote <> 'none' and created_at > now() - interval '30 days'),
  agg as (
    select a.ticker,
      count(*) filter (where vote = 'buy')  as buy,
      count(*) filter (where vote = 'hold') as hold,
      count(*) filter (where vote = 'sell') as sell,
      count(*) as total,
      count(*) filter (where created_at > now() - interval '7 days') as recent,
      count(*) filter (where owner) as owners,
      count(*) filter (where owner and vote = 'buy')  as owners_buy,
      count(*) filter (where owner and vote = 'hold') as owners_hold,
      count(*) filter (where owner and vote = 'sell') as owners_sell,
      max(case when a.user_id = auth.uid() then vote end) as mine
    from active a group by a.ticker
  ),
  rows_j as (
    select *, jsonb_build_object('ticker', ticker, 'buy', buy, 'hold', hold, 'sell', sell, 'total', total, 'recent', recent,
      'owners', owners, 'owners_buy', owners_buy, 'owners_hold', owners_hold, 'owners_sell', owners_sell, 'mine', mine) as j
    from agg
  ),
  friends as (
    select a.ticker, a.vote, jsonb_agg(a.user_id order by a.created_at desc) as users, count(*) as n, max(a.created_at) as at
    from active a where a.user_id <> auth.uid() and public.is_mutual_friend(a.user_id)
    group by a.ticker, a.vote
  ),
  lim_ok as (select least(greatest(lim, 1), 20) as n)
  select jsonb_build_object(
    'most_voted', (select coalesce(jsonb_agg(j order by total desc, recent desc, ticker), '[]'::jsonb) from (select * from rows_j order by total desc, recent desc, ticker limit (select n from lim_ok)) x),
    'trending',   (select coalesce(jsonb_agg(j order by recent desc, total desc, ticker), '[]'::jsonb) from (select * from rows_j where recent > 0 order by recent desc, total desc, ticker limit (select n from lim_ok)) x),
    'bullish',    (select coalesce(jsonb_agg(j order by (buy::float / total) desc, total desc, ticker), '[]'::jsonb) from (select * from rows_j where total >= 2 and buy > 0 order by (buy::float / total) desc, total desc, ticker limit (select n from lim_ok)) x),
    'bearish',    (select coalesce(jsonb_agg(j order by (sell::float / total) desc, total desc, ticker), '[]'::jsonb) from (select * from rows_j where total >= 2 and sell > 0 order by (sell::float / total) desc, total desc, ticker limit (select n from lim_ok)) x),
    'friends_buying',  (select coalesce(jsonb_agg(jsonb_build_object('ticker', ticker, 'users', users, 'n', n, 'at', at) order by n desc, at desc), '[]'::jsonb) from (select * from friends where vote = 'buy' order by n desc, at desc limit (select n from lim_ok)) f),
    'friends_selling', (select coalesce(jsonb_agg(jsonb_build_object('ticker', ticker, 'users', users, 'n', n, 'at', at) order by n desc, at desc), '[]'::jsonb) from (select * from friends where vote = 'sell' order by n desc, at desc limit (select n from lim_ok)) f)
  );
$$;
grant execute on function public.discover_sentiment(int) to authenticated;
notify pgrst, 'reload schema';

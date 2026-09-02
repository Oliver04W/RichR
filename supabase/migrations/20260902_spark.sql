-- RichR: sparkline on the leaderboard row (last ~30 daily % points, no amounts)
alter table public.leaderboard add column if not exists spark jsonb;

-- expose it on the public profile (function unchanged otherwise)
create or replace function public.get_public_profile(uname text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.is_public then jsonb_build_object(
      'username', p.username, 'name', l.name, 'profile', l.profile, 'portfolio', l.portfolio,
      'return_pct', l.return_pct, 'holdings', l.holdings, 'top_holdings', l.top_holdings,
      'realized_pct', l.realized_pct, 'win_rate', l.win_rate, 'avg_days', l.avg_days,
      'philosophy', l.philosophy, 'score', l.score, 'score_parts', l.score_parts, 'spark', l.spark,
      'updated_at', l.updated_at,
      'events', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'ticker', e.ticker, 'from_pct', e.from_pct, 'to_pct', e.to_pct, 'created_at', e.created_at) order by e.created_at desc), '[]'::jsonb)
        from (select * from public.portfolio_events where user_id = p.user_id order by created_at desc limit 10) e
      )
    ) else null end
  from public.profiles p
  left join public.leaderboard l on l.user_id = p.user_id
  where lower(p.username) = lower(uname)
  limit 1;
$$;

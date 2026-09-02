-- RichR: social-first layer — Buy/Hold/Sell sentiment, per-stock discussions,
-- rich chat cards. Votes and discussions are visible to every signed-in RichR
-- user (community sentiment); portfolio data stays mutual-friends-only.
-- Safe to re-run.

-- 1. Calls: append-only history of Buy/Hold/Sell opinions. The newest row per
--    (user, ticker) is the current vote; older rows are "historical calls".
--    price_at lets profiles show the stock's return since the call.
create table if not exists public.stock_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ticker     text not null check (ticker = upper(ticker) and char_length(ticker) between 1 and 12),
  vote       text not null check (vote in ('buy','hold','sell')),
  reason     text check (reason is null or char_length(reason) <= 140),
  price_at   numeric,
  currency   text,
  created_at timestamptz not null default now()
);
create index if not exists stock_calls_ticker_created on public.stock_calls (ticker, created_at desc);
create index if not exists stock_calls_user_created on public.stock_calls (user_id, created_at desc);
alter table public.stock_calls enable row level security;
drop policy if exists "calls visible to all users" on public.stock_calls;
create policy "calls visible to all users" on public.stock_calls
  for select to authenticated using (true);
drop policy if exists "call as self" on public.stock_calls;
create policy "call as self" on public.stock_calls
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own call" on public.stock_calls;
create policy "delete own call" on public.stock_calls
  for delete to authenticated using (user_id = auth.uid());

-- 2. Per-stock discussion: posts + replies, with reactions.
create table if not exists public.stock_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ticker     text not null check (ticker = upper(ticker) and char_length(ticker) between 1 and 12),
  parent_id  uuid references public.stock_posts(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists stock_posts_ticker_created on public.stock_posts (ticker, created_at desc);
create index if not exists stock_posts_user_created on public.stock_posts (user_id, created_at desc);
alter table public.stock_posts enable row level security;
drop policy if exists "posts visible to all users" on public.stock_posts;
create policy "posts visible to all users" on public.stock_posts
  for select to authenticated using (true);
drop policy if exists "post as self" on public.stock_posts;
create policy "post as self" on public.stock_posts
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own post" on public.stock_posts;
create policy "delete own post" on public.stock_posts
  for delete to authenticated using (user_id = auth.uid());

create table if not exists public.stock_post_reactions (
  post_id    uuid not null references public.stock_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','🚀','🤔','🔥')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
alter table public.stock_post_reactions enable row level security;
drop policy if exists "post reactions visible" on public.stock_post_reactions;
create policy "post reactions visible" on public.stock_post_reactions
  for select to authenticated using (true);
drop policy if exists "react to posts as self" on public.stock_post_reactions;
create policy "react to posts as self" on public.stock_post_reactions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "remove own post reaction" on public.stock_post_reactions;
create policy "remove own post reaction" on public.stock_post_reactions
  for delete to authenticated using (user_id = auth.uid());

-- 3. Rich cards inside group chats: {kind: 'stock'|'position'|'performance'|'vote', ...}
alter table public.group_posts add column if not exists card jsonb;

-- 4. Usernames must be readable by every signed-in user so votes/posts can be
--    attributed (the row only holds user_id + username + flags, never amounts).
drop policy if exists "profiles readable by users" on public.profiles;
create policy "profiles readable by users" on public.profiles
  for select to authenticated using (true);

-- 5. Public profile link also lists the person's current calls (opt-in page).
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
      ),
      'calls', (
        select coalesce(jsonb_agg(jsonb_build_object('ticker', c.ticker, 'vote', c.vote, 'reason', c.reason, 'price_at', c.price_at, 'currency', c.currency, 'created_at', c.created_at) order by c.created_at desc), '[]'::jsonb)
        from (select distinct on (ticker) * from public.stock_calls where user_id = p.user_id order by ticker, created_at desc) c
      )
    ) else null end
  from public.profiles p
  left join public.leaderboard l on l.user_id = p.user_id
  where lower(p.username) = lower(uname)
  limit 1;
$$;
grant execute on function public.get_public_profile(text) to anon, authenticated;

notify pgrst, 'reload schema';

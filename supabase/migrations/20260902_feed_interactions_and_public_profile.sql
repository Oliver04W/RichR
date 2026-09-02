-- RichR: feed milestones + reactions/comments, and opt-in public profile links
-- Safe to re-run.

-- 1. new event kinds (milestone: "reached +20% YTD")
alter table public.portfolio_events drop constraint if exists portfolio_events_kind_check;
alter table public.portfolio_events add constraint portfolio_events_kind_check
  check (kind in ('shared','added','removed','increased','decreased','score','milestone'));

-- 2. reactions on feed events
create table if not exists public.event_reactions (
  event_id   uuid not null references public.portfolio_events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','🚀','🤔','🔥')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, emoji)
);
alter table public.event_reactions enable row level security;
-- you can see/react to an event if you can see the event (author or mutual friend)
drop policy if exists "reactions visible with event" on public.event_reactions;
create policy "reactions visible with event" on public.event_reactions
  for select to authenticated using (
    exists (select 1 from public.portfolio_events e where e.id = event_id and (e.user_id = auth.uid() or public.is_mutual_friend(e.user_id)))
  );
drop policy if exists "react as self" on public.event_reactions;
create policy "react as self" on public.event_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.portfolio_events e where e.id = event_id and (e.user_id = auth.uid() or public.is_mutual_friend(e.user_id)))
  );
drop policy if exists "remove own reaction" on public.event_reactions;
create policy "remove own reaction" on public.event_reactions
  for delete to authenticated using (user_id = auth.uid());

-- 3. comments on feed events
create table if not exists public.event_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.portfolio_events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists event_comments_event on public.event_comments (event_id, created_at);
alter table public.event_comments enable row level security;
drop policy if exists "comments visible with event" on public.event_comments;
create policy "comments visible with event" on public.event_comments
  for select to authenticated using (
    exists (select 1 from public.portfolio_events e where e.id = event_id and (e.user_id = auth.uid() or public.is_mutual_friend(e.user_id)))
  );
drop policy if exists "comment as self" on public.event_comments;
create policy "comment as self" on public.event_comments
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.portfolio_events e where e.id = event_id and (e.user_id = auth.uid() or public.is_mutual_friend(e.user_id)))
  );
drop policy if exists "delete own comment" on public.event_comments;
create policy "delete own comment" on public.event_comments
  for delete to authenticated using (user_id = auth.uid());

-- 4. opt-in public profile: /u/<username>
alter table public.profiles add column if not exists is_public boolean not null default false;

-- Anyone (even signed out) can call this; it returns only what the user
-- has chosen to publish AND only if they switched the public link on.
-- No amounts are stored on the leaderboard row, so none can leak.
create or replace function public.get_public_profile(uname text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.is_public then jsonb_build_object(
      'username', p.username,
      'name', l.name,
      'profile', l.profile,
      'portfolio', l.portfolio,
      'return_pct', l.return_pct,
      'holdings', l.holdings,
      'top_holdings', l.top_holdings,
      'realized_pct', l.realized_pct,
      'win_rate', l.win_rate,
      'avg_days', l.avg_days,
      'philosophy', l.philosophy,
      'score', l.score,
      'score_parts', l.score_parts,
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
grant execute on function public.get_public_profile(text) to anon, authenticated;

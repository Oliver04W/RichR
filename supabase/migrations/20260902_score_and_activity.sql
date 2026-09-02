-- RichR: RichR Score on the leaderboard + activity feed of portfolio changes
-- Safe to re-run.

-- 1. score columns on the leaderboard row (nullable: shared only if the switch is on)
alter table public.leaderboard
  add column if not exists score int,
  add column if not exists score_parts jsonb;

-- 2. activity feed: "increased TSM 12% → 18%" — percentages only, never amounts.
create table if not exists public.portfolio_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('shared','added','removed','increased','decreased','score')),
  ticker     text,
  from_pct   numeric,
  to_pct     numeric,
  created_at timestamptz not null default now()
);
create index if not exists portfolio_events_user_created on public.portfolio_events (user_id, created_at desc);
create index if not exists portfolio_events_created on public.portfolio_events (created_at desc);
alter table public.portfolio_events enable row level security;

-- readable by the author and their MUTUAL friends (is_mutual_friend() from the group-chat migration)
drop policy if exists "feed visible to mutual friends" on public.portfolio_events;
create policy "feed visible to mutual friends" on public.portfolio_events
  for select to authenticated using (user_id = auth.uid() or public.is_mutual_friend(user_id));
drop policy if exists "write own events" on public.portfolio_events;
create policy "write own events" on public.portfolio_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own events" on public.portfolio_events;
create policy "delete own events" on public.portfolio_events
  for delete to authenticated using (user_id = auth.uid());

-- keep the table small: anything older than 90 days goes (runs with the existing daily cron if pg_cron is on)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'richr-prune-events';
    perform cron.schedule('richr-prune-events', '15 3 * * *', $c$ delete from public.portfolio_events where created_at < now() - interval '90 days' $c$);
  end if;
end $$;

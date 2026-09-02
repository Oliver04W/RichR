-- RichR: (1) leaderboard readable by self + MUTUAL friends only
--        (2) nudges table — "X wants to see your portfolio"
-- Safe to re-run.

-- 1. Replace the one-way "read self and friends" select policy.
--    Before: anyone who added you could read your row without you adding them back.
--    After:  both directions must exist in `friends`.
drop policy if exists "read self and friends" on public.leaderboard;
drop policy if exists "board is readable" on public.leaderboard;
create policy "read self and mutual friends" on public.leaderboard
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.friends a
      join public.friends b on b.user_id = a.friend_id and b.friend_id = a.user_id
      where a.user_id = auth.uid() and a.friend_id = leaderboard.user_id
    )
  );

-- 2. Nudges: one row per (from, to); re-nudging just bumps created_at.
create table if not exists public.nudges (
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.nudges enable row level security;
drop policy if exists "nudge mutual friends" on public.nudges;
create policy "nudge mutual friends" on public.nudges
  for insert to authenticated
  with check (
    from_id = auth.uid()
    and exists (
      select 1 from public.friends a
      join public.friends b on b.user_id = a.friend_id and b.friend_id = a.user_id
      where a.user_id = auth.uid() and a.friend_id = nudges.to_id
    )
  );
drop policy if exists "update own nudge" on public.nudges;
create policy "update own nudge" on public.nudges
  for update to authenticated using (from_id = auth.uid()) with check (from_id = auth.uid());
drop policy if exists "read nudges involving me" on public.nudges;
create policy "read nudges involving me" on public.nudges
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
drop policy if exists "dismiss nudges sent to me" on public.nudges;
create policy "dismiss nudges sent to me" on public.nudges
  for delete to authenticated using (to_id = auth.uid() or from_id = auth.uid());

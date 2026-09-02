-- RichR: private group chats between mutual friends
-- Tables: groups, group_members, group_posts, post_reactions
-- Rules (enforced by RLS, not just the UI):
--   * only a group's members can see the group, its members, posts and reactions
--   * only mutual friends of the person adding can be added to a group
--   * you can only post/react as yourself, and only in groups you belong to
--   * the creator can rename/delete the group and remove members; anyone can leave
-- Safe to re-run.

create extension if not exists pgcrypto;
-- helper bodies reference tables created further down; don't validate them at definition time
set check_function_bodies = off;

-- helpers (security definer so policies can consult tables without recursion)
create or replace function public.is_mutual_friend(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friends a
    join public.friends b on b.user_id = a.friend_id and b.friend_id = a.user_id
    where a.user_id = auth.uid() and a.friend_id = other
  );
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups where id = gid and created_by = auth.uid());
$$;

-- groups
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security;
drop policy if exists "members read groups" on public.groups;
create policy "members read groups" on public.groups
  for select to authenticated using (public.is_group_member(id) or created_by = auth.uid());
drop policy if exists "create own group" on public.groups;
create policy "create own group" on public.groups
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "owner updates group" on public.groups;
create policy "owner updates group" on public.groups
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "owner deletes group" on public.groups;
create policy "owner deletes group" on public.groups
  for delete to authenticated using (created_by = auth.uid());

-- members
create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  added_by  uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;
drop policy if exists "members read members" on public.group_members;
create policy "members read members" on public.group_members
  for select to authenticated using (public.is_group_member(group_id) or public.is_group_owner(group_id));
drop policy if exists "add self as creator or mutual friends as member" on public.group_members;
create policy "add self as creator or mutual friends as member" on public.group_members
  for insert to authenticated with check (
    added_by = auth.uid() and (
      -- creator joining their own new group
      (user_id = auth.uid() and public.is_group_owner(group_id))
      -- a member adding one of their mutual friends
      or (public.is_group_member(group_id) and public.is_mutual_friend(user_id))
    )
  );
drop policy if exists "leave or owner removes" on public.group_members;
create policy "leave or owner removes" on public.group_members
  for delete to authenticated using (user_id = auth.uid() or public.is_group_owner(group_id));

-- posts (a reply is a post with parent_id set)
create table if not exists public.group_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  parent_id  uuid references public.group_posts(id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 2000),
  tickers    text[] not null default '{}',
  position   jsonb,            -- shared position card: {ticker,name,buyDate,thesis,plPct,currency}
  created_at timestamptz not null default now()
);
create index if not exists group_posts_group_created on public.group_posts (group_id, created_at);
alter table public.group_posts enable row level security;
drop policy if exists "members read posts" on public.group_posts;
create policy "members read posts" on public.group_posts
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "members post as themselves" on public.group_posts;
create policy "members post as themselves" on public.group_posts
  for insert to authenticated with check (user_id = auth.uid() and public.is_group_member(group_id));
drop policy if exists "delete own post or owner" on public.group_posts;
create policy "delete own post or owner" on public.group_posts
  for delete to authenticated using (user_id = auth.uid() or public.is_group_owner(group_id));

-- reactions
create table if not exists public.post_reactions (
  post_id    uuid not null references public.group_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','🚀','🤔','🔥')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
alter table public.post_reactions enable row level security;
drop policy if exists "members read reactions" on public.post_reactions;
create policy "members read reactions" on public.post_reactions
  for select to authenticated using (
    exists (select 1 from public.group_posts p where p.id = post_id and public.is_group_member(p.group_id))
  );
drop policy if exists "react as self in own groups" on public.post_reactions;
create policy "react as self in own groups" on public.post_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.group_posts p where p.id = post_id and public.is_group_member(p.group_id))
  );
drop policy if exists "remove own reaction" on public.post_reactions;
create policy "remove own reaction" on public.post_reactions
  for delete to authenticated using (user_id = auth.uid());

-- profiles are already readable by all authenticated users (usernames for member lists).

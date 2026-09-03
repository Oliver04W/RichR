-- RichR: Public 🌐 and Private 🔒 communities on top of the existing groups tables.
--
--   public   anyone signed in can find, read and join it
--   private  invisible to non-members: metadata, members, posts, reactions,
--            invites and community sentiment are all refused by RLS / RPC
--   request  reserved for "🛡️ Request to join" (searchable like public, but
--            joining needs approval) — the constraint and the discoverability
--            checks already understand it; only the approval flow is missing.
--
-- Invites: random, revocable codes (group_invites). Any member can create
-- one; the creator or the owner can revoke it. The code itself is the only
-- thing that reveals a private community's name, and only to whoever holds it.
-- Safe to re-run.

create extension if not exists pgcrypto;
set check_function_bodies = off;

-- ---------- schema ----------
alter table public.groups add column if not exists visibility text not null default 'private';
alter table public.groups drop constraint if exists groups_visibility_check;
alter table public.groups add constraint groups_visibility_check check (visibility in ('public', 'private', 'request'));
alter table public.groups add column if not exists description text not null default '';
alter table public.groups drop constraint if exists groups_description_check;
alter table public.groups add constraint groups_description_check check (char_length(description) <= 280);
alter table public.groups add column if not exists topics text[] not null default '{}';
create index if not exists groups_visibility_idx on public.groups (visibility) where visibility <> 'private';

create table if not exists public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  code       text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  max_uses   int,
  uses       int not null default 0
);
create index if not exists group_invites_group_idx on public.group_invites (group_id);
alter table public.group_invites enable row level security;

-- ---------- helpers ----------
create or replace function public.group_visibility(gid uuid)
returns text language sql stable security definer set search_path = public as $$
  select visibility from public.groups where id = gid;
$$;
-- discoverable = readable by any signed-in user (public today, request later)
create or replace function public.is_group_discoverable(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups where id = gid and visibility <> 'private');
$$;
-- can this user read the community's content?
create or replace function public.can_view_group(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_group_discoverable(gid) or public.is_group_member(gid) or public.is_group_owner(gid);
$$;

-- ---------- RLS: groups ----------
drop policy if exists "members read groups" on public.groups;
create policy "members or anyone for discoverable" on public.groups
  for select to authenticated using (visibility <> 'private' or public.is_group_member(id) or created_by = auth.uid());
-- insert/update/delete policies from 20260902_group_chats stay as they are (owner only).

-- ---------- RLS: members ----------
drop policy if exists "members read members" on public.group_members;
create policy "members read members" on public.group_members
  for select to authenticated using (public.can_view_group(group_id));
drop policy if exists "add self as creator or mutual friends as member" on public.group_members;
create policy "join rules" on public.group_members
  for insert to authenticated with check (
    added_by = auth.uid() and (
      (user_id = auth.uid() and public.is_group_owner(group_id))                                   -- creator joins own group
      or (user_id = auth.uid() and public.group_visibility(group_id) = 'public')                    -- anyone joins a public one
      or (public.is_group_member(group_id) and public.is_mutual_friend(user_id))                   -- a member adds a mutual friend
    )
  );
-- "leave or owner removes" (delete) stays.

-- ---------- RLS: posts & reactions ----------
drop policy if exists "members read posts" on public.group_posts;
create policy "readers of the group read posts" on public.group_posts
  for select to authenticated using (public.can_view_group(group_id));
-- posting / deleting policies stay (members only, own or owner).
drop policy if exists "members read reactions" on public.post_reactions;
create policy "readers of the group read reactions" on public.post_reactions
  for select to authenticated using (
    exists (select 1 from public.group_posts p where p.id = post_id and public.can_view_group(p.group_id))
  );

-- ---------- RLS: invites (members see their group's invites; RPCs do the rest) ----------
drop policy if exists "members read invites" on public.group_invites;
create policy "members read invites" on public.group_invites
  for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "creator or owner revokes" on public.group_invites;
create policy "creator or owner revokes" on public.group_invites
  for update to authenticated using (created_by = auth.uid() or public.is_group_owner(group_id))
  with check (created_by = auth.uid() or public.is_group_owner(group_id));
-- no insert policy on purpose: codes are minted server-side by create_group_invite.

-- ---------- RPC: my communities (never "all groups I can see") ----------
create or replace function public.my_communities()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'visibility', g.visibility, 'description', g.description, 'topics', g.topics,
      'created_by', g.created_by, 'created_at', g.created_at,
      'member_count', (select count(*) from public.group_members m where m.group_id = g.id)
    ) order by g.created_at desc), '[]'::jsonb)
  from public.groups g
  where exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid());
$$;

-- ---------- RPC: directory (discoverable communities only) ----------
create or replace function public.search_communities(q text default '', lim int default 20)
returns jsonb language sql stable security definer set search_path = public as $$
  with hits as (
    select g.*,
      (select count(*) from public.group_members m where m.group_id = g.id) as member_count,
      (select count(*) from public.group_posts p where p.group_id = g.id and p.created_at > now() - interval '7 days') as recent_posts,
      exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()) as joined
    from public.groups g
    where g.visibility <> 'private'
      and (coalesce(trim(q), '') = ''
        or g.name ilike '%' || trim(q) || '%'
        or g.description ilike '%' || trim(q) || '%'
        or exists (select 1 from unnest(g.topics) t where t ilike trim(q) || '%'))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'visibility', visibility, 'description', description, 'topics', topics,
      'member_count', member_count, 'recent_posts', recent_posts, 'joined', joined, 'created_at', created_at
    ) order by (case when name ilike trim(q) || '%' then 0 else 1 end), recent_posts desc, member_count desc, created_at desc), '[]'::jsonb)
  from (select * from hits limit least(greatest(lim, 1), 50)) x;
$$;

-- ---------- RPC: invites ----------
create or replace function public.create_group_invite(gid uuid, expires_in_days int default null, max_uses_in int default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare code text; inv public.group_invites;
begin
  if auth.uid() is null or not public.is_group_member(gid) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  -- 24 random bytes → 32 url-safe chars (~190 bits): unguessable
  code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.group_invites (group_id, code, created_by, expires_at, max_uses)
    values (gid, code, auth.uid(), case when expires_in_days is not null then now() + (expires_in_days || ' days')::interval end, max_uses_in)
    returning * into inv;
  return jsonb_build_object('id', inv.id, 'code', inv.code, 'expires_at', inv.expires_at, 'max_uses', inv.max_uses);
end $$;

create or replace function public.revoke_group_invite(invite_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update public.group_invites set revoked_at = now()
    where id = invite_id and revoked_at is null
      and (created_by = auth.uid() or public.is_group_owner(group_id));
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- What the holder of a link may learn before joining: name, visibility, size.
create or replace function public.preview_group_invite(code_in text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when i.id is null then jsonb_build_object('valid', false, 'reason', 'invalid')
    when i.revoked_at is not null then jsonb_build_object('valid', false, 'reason', 'revoked')
    when i.expires_at is not null and i.expires_at < now() then jsonb_build_object('valid', false, 'reason', 'expired')
    when i.max_uses is not null and i.uses >= i.max_uses then jsonb_build_object('valid', false, 'reason', 'used_up')
    else jsonb_build_object('valid', true, 'group_id', g.id, 'name', g.name, 'visibility', g.visibility, 'description', g.description,
      'member_count', (select count(*) from public.group_members m where m.group_id = g.id),
      'joined', public.is_group_member(g.id))
  end
  from (select 1) s
  left join public.group_invites i on i.code = code_in
  left join public.groups g on g.id = i.group_id;
$$;

create or replace function public.accept_group_invite(code_in text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare inv public.group_invites; g public.groups;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into inv from public.group_invites where code = code_in for update;
  if inv.id is null then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if inv.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'revoked'); end if;
  if inv.expires_at is not null and inv.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then return jsonb_build_object('ok', false, 'reason', 'used_up'); end if;
  select * into g from public.groups where id = inv.group_id;
  if not exists (select 1 from public.group_members where group_id = inv.group_id and user_id = auth.uid()) then
    insert into public.group_members (group_id, user_id, added_by) values (inv.group_id, auth.uid(), inv.created_by);
    update public.group_invites set uses = uses + 1 where id = inv.id;
  end if;
  return jsonb_build_object('ok', true, 'group_id', g.id, 'name', g.name, 'visibility', g.visibility);
end $$;

-- ---------- sentiment: community scope readable by anyone who may view the community ----------
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
    select distinct on (user_id) user_id, vote, reason, created_at
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
    'mine', (select jsonb_build_object('vote', vote, 'reason', reason, 'created_at', created_at) from latest where user_id = me and vote <> 'none'),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'vote', vote, 'reason', reason, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
                from (select * from scoped where reason is not null and reason <> '' order by created_at desc limit 6) r),
    'friends_voted', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'vote', vote) order by created_at desc), '[]'::jsonb)
                      from (select * from scoped where scope = 'everyone' and user_id <> me and public.is_mutual_friend(user_id) limit 8) f)
  ) into res;
  return res;
end $$;

-- One call for the stock page: the same asset across every scope the user may see.
create or replace function public.sentiment_scopes(t text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'everyone', public.sentiment_for(t, 'everyone', null),
    'friends',  public.sentiment_for(t, 'friends', null),
    'communities', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'visibility', g.visibility, 's', public.sentiment_for(t, 'community', g.id)) order by g.name), '[]'::jsonb)
      from public.groups g
      where exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())
    )
  );
$$;

grant execute on function public.my_communities(), public.search_communities(text, int), public.create_group_invite(uuid, int, int),
  public.revoke_group_invite(uuid), public.preview_group_invite(text), public.accept_group_invite(text), public.sentiment_scopes(text),
  public.group_visibility(uuid), public.is_group_discoverable(uuid), public.can_view_group(uuid) to authenticated;
revoke execute on function public.preview_group_invite(text) from anon;   -- sign in first, then the link is previewed

notify pgrst, 'reload schema';

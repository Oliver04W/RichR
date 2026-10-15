-- RichR — App Store safety layer (Apple guideline 1.2 + 5.1.1(v)).
--
--   1. Blocking        user_blocks + block_user()/unblock_user(); blocked pairs
--                      can't see each other's posts, comments, calls or feed
--                      events, can't nudge or friend each other.
--   2. Reporting       reports + report_content(); whatever you report
--                      disappears for you immediately, and anything with 3+
--                      distinct reports is hidden for everyone pending review.
--   3. Filtering       moderation_terms + a trigger that rejects posts/comments
--                      containing listed terms (error 'objectionable_content').
--   4. Moderation      moderators table, mod_queue() / mod_resolve() RPCs,
--                      banned_users (banned accounts can't post).
--   5. Terms           terms_acceptance — the EULA gate on first sign-in.
--   6. Deletion        delete_my_account(): removes everything, hands owned
--                      communities to the longest-standing member, then deletes
--                      the auth user (all other tables cascade from it).
--
-- Hiding is done with RESTRICTIVE policies: they are AND-ed with the existing
-- permissive ones, so no existing policy needs rewriting.
-- Safe to re-run.

-- ---------------------------------------------------------------- tables
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked on public.user_blocks (blocked_id);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('group_post','stock_post','event_comment','stock_call','group','user')),
  content_id  uuid not null,
  author_id   uuid references auth.users(id) on delete set null,
  reason      text not null check (reason in ('spam','harassment','hate','sexual','violence','scam','misleading','other')),
  details     text check (char_length(details) <= 500),
  snapshot    text,                       -- the text as it was when reported
  status      text not null default 'open' check (status in ('open','removed','dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create unique index if not exists reports_one_per_reporter on public.reports (reporter_id, kind, content_id);
create index if not exists reports_content on public.reports (kind, content_id);
create index if not exists reports_open on public.reports (status, created_at);

-- Content taken down (by a moderator, or automatically at 3 reports).
create table if not exists public.moderation_hidden (
  kind       text not null,
  content_id uuid not null,
  reason     text not null default 'reports',
  created_at timestamptz not null default now(),
  primary key (kind, content_id)
);

create table if not exists public.moderation_terms (
  term text primary key
);

create table if not exists public.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.banned_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now()
);

create table if not exists public.terms_acceptance (
  user_id     uuid not null references auth.users(id) on delete cascade,
  version     text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.user_blocks       enable row level security;
alter table public.reports           enable row level security;
alter table public.moderation_hidden enable row level security;
alter table public.moderation_terms  enable row level security;
alter table public.moderators        enable row level security;
alter table public.banned_users      enable row level security;
alter table public.terms_acceptance  enable row level security;

drop policy if exists "see own blocks" on public.user_blocks;
create policy "see own blocks" on public.user_blocks for select using (blocker_id = auth.uid());
-- writes go through block_user()/unblock_user()

drop policy if exists "see own reports" on public.reports;
create policy "see own reports" on public.reports for select using (reporter_id = auth.uid());

drop policy if exists "own terms acceptance" on public.terms_acceptance;
create policy "own terms acceptance" on public.terms_acceptance for select using (user_id = auth.uid());
drop policy if exists "accept terms as self" on public.terms_acceptance;
create policy "accept terms as self" on public.terms_acceptance for insert with check (user_id = auth.uid());
-- moderation_hidden / moderation_terms / moderators / banned_users: no client policies (definer functions only)

-- ---------------------------------------------------------------- helpers
create or replace function public.is_blocked_pair(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  );
$$;

-- Can the current user see this piece of user-generated content?
create or replace function public.can_see_ugc(k text, cid uuid, author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select author = auth.uid()                       -- your own content is always visible to you
      or (
        not exists (select 1 from public.user_blocks
                     where (blocker_id = auth.uid() and blocked_id = author)
                        or (blocker_id = author and blocked_id = auth.uid()))
        and not exists (select 1 from public.reports r
                         where r.reporter_id = auth.uid() and r.kind = k and r.content_id = cid)
        and not exists (select 1 from public.moderation_hidden h
                         where h.kind = k and h.content_id = cid)
        and not exists (select 1 from public.banned_users b where b.user_id = author)
      );
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moderators where user_id = auth.uid());
$$;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.banned_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- restrictive read policies
drop policy if exists "hide blocked and reported" on public.group_posts;
create policy "hide blocked and reported" on public.group_posts as restrictive for select
  using (public.can_see_ugc('group_post', id, user_id));

drop policy if exists "hide blocked and reported" on public.stock_posts;
create policy "hide blocked and reported" on public.stock_posts as restrictive for select
  using (public.can_see_ugc('stock_post', id, user_id));

drop policy if exists "hide blocked and reported" on public.event_comments;
create policy "hide blocked and reported" on public.event_comments as restrictive for select
  using (public.can_see_ugc('event_comment', id, user_id));

drop policy if exists "hide blocked and reported" on public.stock_calls;
create policy "hide blocked and reported" on public.stock_calls as restrictive for select
  using (public.can_see_ugc('stock_call', id, user_id));

drop policy if exists "hide blocked" on public.portfolio_events;
create policy "hide blocked" on public.portfolio_events as restrictive for select
  using (user_id = auth.uid() or not public.is_blocked_pair(user_id));

-- ---------------------------------------------------------------- restrictive write policies
-- Banned accounts can't post; blocked pairs can't nudge or friend each other.
drop policy if exists "not banned" on public.group_posts;
create policy "not banned" on public.group_posts as restrictive for insert with check (not public.is_banned());
drop policy if exists "not banned" on public.stock_posts;
create policy "not banned" on public.stock_posts as restrictive for insert with check (not public.is_banned());
drop policy if exists "not banned" on public.event_comments;
create policy "not banned" on public.event_comments as restrictive for insert with check (not public.is_banned());
drop policy if exists "not banned" on public.stock_calls;
create policy "not banned" on public.stock_calls as restrictive for insert with check (not public.is_banned());
drop policy if exists "not banned" on public.groups;
create policy "not banned" on public.groups as restrictive for insert with check (not public.is_banned());

drop policy if exists "no nudging across a block" on public.nudges;
create policy "no nudging across a block" on public.nudges as restrictive for insert
  with check (not public.is_blocked_pair(to_id));
drop policy if exists "no friending across a block" on public.friends;
create policy "no friending across a block" on public.friends as restrictive for insert
  with check (not public.is_blocked_pair(friend_id));

-- ---------------------------------------------------------------- blocking RPCs
create or replace function public.block_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if target is null or target = auth.uid() then raise exception 'cannot block yourself'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
  -- a block ends the friendship both ways and clears pending nudges
  delete from public.friends where (user_id = auth.uid() and friend_id = target) or (user_id = target and friend_id = auth.uid());
  delete from public.nudges  where (from_id = auth.uid() and to_id = target)    or (from_id = target and to_id = auth.uid());
end $$;

create or replace function public.unblock_user(target uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = target;
$$;

create or replace function public.my_blocks()
returns table (user_id uuid, username text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked_id, p.username, b.created_at
  from public.user_blocks b left join public.profiles p on p.user_id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- ---------------------------------------------------------------- reporting RPC
create or replace function public.report_content(k text, cid uuid, why text, note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_author uuid; v_body text; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if k = 'group_post'    then select user_id, coalesce(body, '') into v_author, v_body from public.group_posts    where id = cid;
  elsif k = 'stock_post' then select user_id, body              into v_author, v_body from public.stock_posts    where id = cid;
  elsif k = 'event_comment' then select user_id, body           into v_author, v_body from public.event_comments where id = cid;
  elsif k = 'stock_call' then select user_id, coalesce(reason,'') into v_author, v_body from public.stock_calls  where id = cid;
  elsif k = 'group'      then select created_by, name || ' — ' || coalesce(description,'') into v_author, v_body from public.groups where id = cid;
  elsif k = 'user'       then v_author := cid; select username into v_body from public.profiles where user_id = cid;
  else raise exception 'unknown kind %', k;
  end if;
  if v_author is null and k <> 'user' then raise exception 'content not found'; end if;
  if v_author = auth.uid() then raise exception 'cannot report yourself'; end if;

  insert into public.reports (reporter_id, kind, content_id, author_id, reason, details, snapshot)
  values (auth.uid(), k, cid, v_author, why, left(note, 500), left(v_body, 2000))
  on conflict (reporter_id, kind, content_id) do nothing;

  -- three independent reports take a post down for everyone until a moderator looks
  if k not in ('user', 'group') then
    select count(distinct reporter_id) into n from public.reports where kind = k and content_id = cid and status = 'open';
    if n >= 3 then
      insert into public.moderation_hidden (kind, content_id, reason) values (k, cid, 'reports') on conflict do nothing;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- moderator RPCs
create or replace function public.mod_queue()
returns table (id uuid, kind text, content_id uuid, author_id uuid, author text, reason text, details text,
               snapshot text, reports int, hidden boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'not a moderator'; end if;
  return query
    select (array_agg(r.id order by r.created_at))[1], r.kind, r.content_id, r.author_id,
           max(p.username), string_agg(distinct r.reason, ', '), string_agg(r.details, ' · '),
           max(r.snapshot), count(*)::int,
           exists (select 1 from public.moderation_hidden h where h.kind = r.kind and h.content_id = r.content_id),
           min(r.created_at)
    from public.reports r left join public.profiles p on p.user_id = r.author_id
    where r.status = 'open'
    group by r.kind, r.content_id, r.author_id
    order by min(r.created_at);
end $$;

-- action: 'remove' (take content down), 'dismiss' (keep it), 'ban' (remove + ban author)
create or replace function public.mod_resolve(k text, cid uuid, action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  if not public.is_moderator() then raise exception 'not a moderator'; end if;
  select author_id into v_author from public.reports where kind = k and content_id = cid limit 1;
  if action in ('remove', 'ban') and k not in ('user') then
    insert into public.moderation_hidden (kind, content_id, reason) values (k, cid, 'moderator')
    on conflict (kind, content_id) do update set reason = 'moderator';
  elsif action = 'dismiss' then
    delete from public.moderation_hidden where kind = k and content_id = cid;
  end if;
  if action = 'ban' and v_author is not null then
    insert into public.banned_users (user_id, reason) values (v_author, 'moderator') on conflict do nothing;
  end if;
  update public.reports
     set status = case when action = 'dismiss' then 'dismissed' else 'removed' end,
         resolved_at = now(), resolved_by = auth.uid()
   where kind = k and content_id = cid and status = 'open';
end $$;

-- ---------------------------------------------------------------- objectionable-content filter
create or replace function public.has_objectionable(t text)
returns boolean language sql stable security definer set search_path = public as $$
  select t is not null and exists (
    select 1 from public.moderation_terms m
    where lower(t) ~ ('(^|[^a-z0-9])' || m.term || '([^a-z0-9]|$)')
  );
$$;

create or replace function public.reject_objectionable()
returns trigger language plpgsql as $$
declare txt text;
begin
  txt := coalesce(to_jsonb(new) ->> 'body', '') || ' ' || coalesce(to_jsonb(new) ->> 'reason', '')
      || ' ' || coalesce(to_jsonb(new) ->> 'name', '') || ' ' || coalesce(to_jsonb(new) ->> 'description', '');
  if public.has_objectionable(txt) then
    raise exception 'objectionable_content' using errcode = 'P0001',
      hint = 'This contains language that isn''t allowed on RichR.';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['group_posts','stock_posts','event_comments','stock_calls','groups'] loop
    execute format('drop trigger if exists reject_objectionable on public.%I', t);
    execute format('create trigger reject_objectionable before insert or update on public.%I
                    for each row execute function public.reject_objectionable()', t);
  end loop;
end $$;

-- Starter list of slurs (word-boundary, case-insensitive). Extend with:
--   insert into public.moderation_terms values ('…') on conflict do nothing;
insert into public.moderation_terms (term) values
  ('nigger'), ('nigga'), ('faggot'), ('fag'), ('retard'), ('kike'), ('spic'), ('chink'),
  ('tranny'), ('wetback'), ('raghead'), ('neger'), ('mutakuono'), ('ryssä'), ('homo-?huora')
on conflict do nothing;

-- ---------------------------------------------------------------- account deletion
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  g record; heir uuid;
begin
  if me is null then raise exception 'not signed in'; end if;

  -- Communities you own: hand them to the longest-standing other member so the
  -- conversation survives; delete the ones where you're the only member.
  for g in select id from public.groups where created_by = me loop
    select user_id into heir from public.group_members
      where group_id = g.id and user_id <> me order by joined_at limit 1;
    if heir is null then
      delete from public.groups where id = g.id;
    else
      update public.groups set created_by = heir where id = g.id;
      update public.group_members set added_by = heir where group_id = g.id and added_by = me;
      update public.group_invites set created_by = heir where group_id = g.id and created_by = me;
    end if;
  end loop;
  -- other communities: memberships you created for other people stay, credited to the owner
  update public.group_members gm set added_by = gr.created_by
    from public.groups gr where gm.group_id = gr.id and gm.added_by = me and gm.user_id <> me;

  -- tables created before migrations were tracked (may not cascade)
  delete from public.friends     where user_id = me or friend_id = me;
  delete from public.leaderboard where user_id = me;
  delete from public.user_data   where user_id = me;
  delete from public.profiles    where user_id = me;
  delete from public.reports     where reporter_id = me;

  -- everything else (posts, comments, votes, reactions, events, nudges,
  -- memberships, blocks, terms) cascades from the auth user
  delete from auth.users where id = me;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocks(),
              public.report_content(text, uuid, text, text), public.mod_queue(), public.mod_resolve(text, uuid, text)
  from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocks(),
              public.report_content(text, uuid, text, text), public.mod_queue(), public.mod_resolve(text, uuid, text),
              public.is_moderator()
  to authenticated;

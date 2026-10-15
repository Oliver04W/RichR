-- RichR — push notifications for the iOS app.
--
--   push_tokens    one row per device (APNs token), written by the app
--   push_outbox    notifications waiting to be sent; filled by triggers
--   triggers       nudge, new friend, reply to your post (community or
--                  stock discussion), comment on your activity
--   delivery       each insert pings the send-push edge function through
--                  pg_net; the function sends to APNs and marks rows sent.
--                  Needs two Vault secrets (see the end of this file); until
--                  they exist, rows just wait in the outbox.
-- Blocked pairs never notify each other. Safe to re-run.

create extension if not exists pg_net;

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null default 'ios',
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

drop policy if exists "own tokens read" on public.push_tokens;
create policy "own tokens read" on public.push_tokens for select using (user_id = auth.uid());
drop policy if exists "own tokens delete" on public.push_tokens;
create policy "own tokens delete" on public.push_tokens for delete using (user_id = auth.uid());

-- A device token belongs to whoever is signed in on that device now
-- (handles switching accounts on one phone).
create or replace function public.register_push_token(tok text, plat text default 'ios')
returns void language sql security definer set search_path = public as $$
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (tok, auth.uid(), coalesce(plat, 'ios'), now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create table if not exists public.push_outbox (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  body       text not null,
  path       text,                       -- opened when the notification is tapped
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);
create index if not exists push_outbox_pending on public.push_outbox (created_at) where sent_at is null;
alter table public.push_outbox enable row level security;   -- no client policies: server only

-- ---------------------------------------------------------------- enqueue
create or replace function public.push_enqueue(target uuid, actor uuid, t text, b text, p text default null)
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare fn_url text; secret text;
begin
  if target is null or target = actor then return; end if;
  if exists (select 1 from public.user_blocks
              where (blocker_id = target and blocked_id = actor) or (blocker_id = actor and blocked_id = target)) then
    return;
  end if;
  if not exists (select 1 from public.push_tokens where user_id = target) then return; end if;

  insert into public.push_outbox (user_id, title, body, path) values (target, t, left(b, 180), p);

  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'send_push_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'send_push_secret';
  if fn_url is not null and secret is not null then
    perform net.http_post(url := fn_url, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret));
  end if;
exception when others then
  -- never let a notification problem block the post / nudge itself
  raise warning 'push_enqueue failed: %', sqlerrm;
end $$;

create or replace function public.uname(u uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce('@' || (select username from public.profiles where user_id = u), 'Someone');
$$;

-- ---------------------------------------------------------------- triggers
create or replace function public.push_on_nudge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_enqueue(new.to_id, new.from_id, 'Nudge 👋', public.uname(new.from_id) || ' nudged you to update your portfolio.', '/');
  return new;
end $$;
drop trigger if exists push_on_nudge on public.nudges;
create trigger push_on_nudge after insert on public.nudges for each row execute function public.push_on_nudge();

create or replace function public.push_on_friend() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_enqueue(new.friend_id, new.user_id, 'New friend',
    public.uname(new.user_id) || ' added you on RichR. Add them back to compare portfolios.', '/');
  return new;
end $$;
drop trigger if exists push_on_friend on public.friends;
create trigger push_on_friend after insert on public.friends for each row execute function public.push_on_friend();

create or replace function public.push_on_group_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_author uuid; gname text;
begin
  if new.parent_id is null then return new; end if;
  select user_id into parent_author from public.group_posts where id = new.parent_id;
  select name into gname from public.groups where id = new.group_id;
  perform public.push_enqueue(parent_author, new.user_id, coalesce(gname, 'Community'),
    public.uname(new.user_id) || ' replied: ' || coalesce(nullif(new.body, ''), 'shared a card'), '/');
  return new;
end $$;
drop trigger if exists push_on_group_reply on public.group_posts;
create trigger push_on_group_reply after insert on public.group_posts for each row execute function public.push_on_group_reply();

create or replace function public.push_on_stock_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_author uuid;
begin
  if new.parent_id is null then return new; end if;
  select user_id into parent_author from public.stock_posts where id = new.parent_id;
  perform public.push_enqueue(parent_author, new.user_id, new.ticker || ' discussion',
    public.uname(new.user_id) || ' replied: ' || new.body, '/');
  return new;
end $$;
drop trigger if exists push_on_stock_reply on public.stock_posts;
create trigger push_on_stock_reply after insert on public.stock_posts for each row execute function public.push_on_stock_reply();

create or replace function public.push_on_event_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.portfolio_events where id = new.event_id;
  perform public.push_enqueue(owner, new.user_id, 'New comment',
    public.uname(new.user_id) || ' commented on your activity: ' || new.body, '/');
  return new;
end $$;
drop trigger if exists push_on_event_comment on public.event_comments;
create trigger push_on_event_comment after insert on public.event_comments for each row execute function public.push_on_event_comment();

-- ---------------------------------------------------------------- setup (run once, by hand)
-- After deploying the send-push edge function, store its URL and a random
-- shared secret in Vault (the same secret goes into the function's
-- PUSH_WEBHOOK_SECRET env var):
--
--   select vault.create_secret('https://exknelcubfqlzbkwfyic.supabase.co/functions/v1/send-push', 'send_push_url');
--   select vault.create_secret('<long random string>', 'send_push_secret');

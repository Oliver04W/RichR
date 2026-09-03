-- Privacy test for Public / Private communities. Run in the Supabase SQL editor
-- (as postgres). Impersonates two real accounts through RLS, creates one
-- private and one public community, checks what an outsider can and cannot
-- see, then deletes everything it created. Prints PASS lines; any failure
-- raises an exception (and rolls the whole thing back).
create or replace function pg_temp.act(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin execute 'reset role'; end $$;
create temp table if not exists richr_test_log (n serial, line text);
grant insert, select on richr_test_log to authenticated;
grant usage, select on sequence richr_test_log_n_seq to authenticated;

do $$
declare
  a uuid; b uuid; priv uuid; pub uuid; pid uuid; code text; inv uuid; n int; j jsonb;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  if b is null then raise exception 'need two users'; end if;

  -- A creates a private and a public community and posts in each
  perform pg_temp.act(a);
  insert into public.groups (name, created_by, visibility, description, topics) values ('__t private', a, 'private', 'secret plans', '{NVDA}') returning id into priv;
  insert into public.groups (name, created_by, visibility, description, topics) values ('__t public', a, 'public', 'chips and AI', '{NVDA,TSM}') returning id into pub;
  insert into public.group_members (group_id, user_id, added_by) values (priv, a, a), (pub, a, a);
  insert into public.group_posts (group_id, user_id, body) values (priv, a, 'private post') returning id into pid;
  insert into public.group_posts (group_id, user_id, body) values (pub, a, 'public post');
  insert into public.post_reactions (post_id, user_id, emoji) values (pid, a, '👍');
  j := public.create_group_invite(priv); code := j->>'code'; inv := (j->>'id')::uuid;
  if length(code) < 30 then raise exception 'invite code too short: %', code; end if;
  insert into richr_test_log(line) values (format('PASS create public + private, invite code %s chars', length(code)));

  -- B (outsider): private community must be invisible everywhere
  perform pg_temp.act(b);
  select count(*) into n from public.groups where id = priv;                                   if n <> 0 then raise exception 'FAIL private metadata visible'; end if;
  select count(*) into n from public.group_members where group_id = priv;                      if n <> 0 then raise exception 'FAIL private members visible'; end if;
  select count(*) into n from public.group_posts where group_id = priv;                        if n <> 0 then raise exception 'FAIL private posts visible'; end if;
  select count(*) into n from public.post_reactions where post_id = pid;                       if n <> 0 then raise exception 'FAIL private reactions visible'; end if;
  select count(*) into n from public.group_invites where group_id = priv;                      if n <> 0 then raise exception 'FAIL private invites visible'; end if;
  if (public.sentiment_for('NVDA', 'community', priv)->>'total')::int <> 0 or (public.sentiment_for('NVDA', 'community', priv) ? 'mine') then raise exception 'FAIL private sentiment leaks'; end if;
  select count(*) into n from jsonb_array_elements(public.search_communities('__t')) x where x->>'id' = priv::text; if n <> 0 then raise exception 'FAIL private in search'; end if;
  select count(*) into n from jsonb_array_elements(public.search_communities('secret')) x;    if n <> 0 then raise exception 'FAIL private description searchable'; end if;
  select count(*) into n from jsonb_array_elements(public.my_communities()) x where x->>'id' = priv::text; if n <> 0 then raise exception 'FAIL private in my_communities'; end if;
  begin
    insert into public.group_posts (group_id, user_id, body) values (priv, b, 'hack'); raise exception 'FAIL outsider posted in private';
  exception when insufficient_privilege or check_violation then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    insert into public.group_members (group_id, user_id, added_by) values (priv, b, b); raise exception 'FAIL outsider joined private';
  exception when insufficient_privilege or check_violation then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into richr_test_log(line) values ('PASS outsider sees nothing of the private community (metadata, members, posts, reactions, invites, sentiment, search) and cannot post or join');

  -- B: public community is discoverable, readable and joinable
  select count(*) into n from jsonb_array_elements(public.search_communities('chips')) x where x->>'id' = pub::text; if n <> 1 then raise exception 'FAIL public not found by description'; end if;
  select count(*) into n from jsonb_array_elements(public.search_communities('TS')) x where x->>'id' = pub::text;    if n <> 1 then raise exception 'FAIL public not found by ticker'; end if;
  select count(*) into n from public.group_posts where group_id = pub;                         if n <> 1 then raise exception 'FAIL public posts unreadable before joining'; end if;
  select count(*) into n from public.group_members where group_id = pub;                       if n <> 1 then raise exception 'FAIL public members unreadable'; end if;
  begin
    insert into public.group_posts (group_id, user_id, body) values (pub, b, 'not a member yet'); raise exception 'FAIL non-member posted in public';
  exception when insufficient_privilege or check_violation then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into public.group_members (group_id, user_id, added_by) values (pub, b, b);
  insert into public.group_posts (group_id, user_id, body) values (pub, b, 'hello from B');
  select count(*) into n from jsonb_array_elements(public.my_communities()) x where x->>'id' = pub::text; if n <> 1 then raise exception 'FAIL joined public missing from my_communities'; end if;
  delete from public.group_members where group_id = pub and user_id = b;
  select count(*) into n from public.group_members where group_id = pub and user_id = b;       if n <> 0 then raise exception 'FAIL could not leave'; end if;
  insert into richr_test_log(line) values ('PASS public: search by description + ticker, read before joining, join, post, leave');

  -- B: invite to the private community
  j := public.preview_group_invite('nope-' || code);                                           if (j->>'valid')::boolean then raise exception 'FAIL bogus invite previews'; end if;
  j := public.preview_group_invite(code);                                                      if not (j->>'valid')::boolean or j->>'name' <> '__t private' then raise exception 'FAIL valid invite preview'; end if;
  j := public.accept_group_invite(code);                                                       if not (j->>'ok')::boolean then raise exception 'FAIL accept invite'; end if;
  select count(*) into n from public.groups where id = priv;                                   if n <> 1 then raise exception 'FAIL member cannot see private'; end if;
  select count(*) into n from public.group_posts where group_id = priv;                        if n <> 1 then raise exception 'FAIL member cannot read private posts'; end if;
  if (public.sentiment_for('NVDA', 'community', priv)->>'total') is null then raise exception 'FAIL member sentiment'; end if;
  insert into richr_test_log(line) values ('PASS invite: bogus code rejected, valid code previews + joins');

  -- A removes B, revokes the invite; B is locked out again and the code is dead
  perform pg_temp.act(a);
  delete from public.group_members where group_id = priv and user_id = b;
  if not public.revoke_group_invite(inv) then raise exception 'FAIL revoke'; end if;
  perform pg_temp.act(b);
  select count(*) into n from public.groups where id = priv;                                   if n <> 0 then raise exception 'FAIL removed member still sees private'; end if;
  j := public.preview_group_invite(code);                                                      if (j->>'valid')::boolean or j->>'reason' <> 'revoked' then raise exception 'FAIL revoked invite still previews'; end if;
  j := public.accept_group_invite(code);                                                       if (j->>'ok')::boolean then raise exception 'FAIL revoked invite accepted'; end if;
  begin
    perform public.create_group_invite(priv); raise exception 'FAIL outsider minted invite';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  insert into richr_test_log(line) values ('PASS remove member + revoke invite: outsider locked out, revoked code refused');

  -- cleanup
  perform pg_temp.admin();
  delete from public.groups where id in (priv, pub);
  insert into richr_test_log(line) values ('ALL PASS — test communities deleted');
end $$;
select line from richr_test_log order by n;

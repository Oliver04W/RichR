# RichR — deploy guide

Track investments, write theses, share progress. React + Vite + Tailwind,
Supabase (Google auth, live prices, leaderboard), optional AI features via
a Vercel serverless proxy.

## One-time setup

### 1. Google OAuth → Supabase
In Google Cloud Console, open your **Web application** OAuth client and make
sure **Authorized redirect URIs** contains:

    https://exknelcubfqlzbkwfyic.supabase.co/auth/v1/callback

In Supabase (project `exknelcubfqlzbkwfyic`) → Authentication → Sign In / Up →
Auth Providers → **Google**: toggle on, paste the Client ID and Client Secret,
save. (The secret goes ONLY here — never into this repo.)

### 2. Leaderboard table (SQL editor, once)
```sql
create table if not exists leaderboard (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  profile    text default '',
  portfolio  text default '',
  return_pct numeric not null default 0,
  holdings   int not null default 0,
  updated_at timestamptz default now()
  -- every column except user_id/name is nullable: users pick what they share
);
alter table leaderboard enable row level security;
-- readable by yourself and MUTUAL friends only (both directions in `friends`)
create policy "read self and mutual friends" on leaderboard for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from friends a join friends b on b.user_id = a.friend_id and b.friend_id = a.user_id
    where a.user_id = auth.uid() and a.friend_id = leaderboard.user_id));
create policy "insert own row"     on leaderboard for insert to authenticated with check (auth.uid() = user_id);
create policy "update own row"     on leaderboard for update to authenticated using (auth.uid() = user_id);
```

### 3. Deploy on Vercel
Push this folder to a GitHub repo → vercel.com → Add New Project → import the
repo. Framework is auto-detected (Vite). Optional: add env var
`ANTHROPIC_API_KEY` (your own key from console.anthropic.com) to enable the
AI features — insights, news scan, screenshot import, company descriptions.
Without it, those buttons show a friendly error; everything else works.

### 4. Tell Supabase where the app lives
After the first deploy, in Supabase → Authentication → URL Configuration:
- **Site URL**: `https://<your-app>.vercel.app`
- **Redirect URLs**: add `https://<your-app>.vercel.app/*`

See `supabase/migrations/` for the sharing-controls and nudges migrations.

## Notes
- Portfolio data lives in `public.user_data` (JSONB, per-user RLS) with
  localStorage as an offline cache, so it follows you across devices.
- Prices/FX read the `prices` and `fx_rates` tables; anon SELECT policies
  are already in place.
- Local dev: `npm install && npm run dev`, and add `http://localhost:5173`
  to Supabase Redirect URLs if you want Google login locally.

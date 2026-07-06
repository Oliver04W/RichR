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
);
alter table leaderboard enable row level security;
create policy "board is readable"  on leaderboard for select to authenticated using (true);
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

## Notes
- Portfolio data is stored in the browser (localStorage), keyed per Google
  account. Different devices don't sync yet — that's the next milestone
  (move portfolios into Supabase with per-user RLS).
- Prices/FX read the `prices` and `fx_rates` tables; anon SELECT policies
  are already in place.
- Local dev: `npm install && npm run dev`, and add `http://localhost:5173`
  to Supabase Redirect URLs if you want Google login locally.

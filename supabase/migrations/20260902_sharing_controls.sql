-- RichR: per-item sharing controls
-- Run once in Supabase → SQL editor.
-- A user who turns an item off now writes NULL for that column, so the
-- columns must accept NULL. (DROP NOT NULL is a no-op on columns that
-- are already nullable, so this is safe to re-run.)
alter table public.leaderboard
  alter column return_pct  drop not null,
  alter column holdings    drop not null;

-- Newer columns — harmless if already nullable.
alter table public.leaderboard
  alter column top_holdings drop not null,
  alter column realized_pct drop not null,
  alter column avg_days     drop not null,
  alter column win_rate     drop not null,
  alter column philosophy   drop not null;

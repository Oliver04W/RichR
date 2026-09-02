# RichR — overnight polish & audit report (2–3 Sept 2026)

**Nothing was deployed to production.** All changes live on the `overnight-polish` branch on GitHub
(Vercel will build a *preview* URL for it; `main` and rich-r.vercel.app are untouched). Review,
then merge to `main` to ship.

## Executive summary

The app was exercised in two ways: the live production build (signed in, read-only) through Chrome,
and a local build in an offline sandbox at iPhone size (390×844) using a **localhost-only demo
session** I added (`?demo=1`, inert on the deployed host). The offline harness turned out to be the
most valuable tool of the night: it reproduces exactly what a user on bad mobile data sees, and it
exposed that most screens would sit on a skeleton **forever** when a request hangs. Those are fixed
throughout, plus a batch of smaller correctness and copy issues, a real security hole in the AI proxy
(`/api/openai` and `/api/claude` accepted anonymous callers — anyone could spend your OpenAI budget),
a first unit-test suite (19 tests, `npm test`), and the broker-connectivity research with isolated
interfaces and a draft migration.

Standard reached: the flows I could test behave sensibly for a new user with no portfolio, no
friends and no network. What I could **not** test tonight are write paths as a signed-in user
(I don't act on your live data), and anything that depends on the edge functions from inside the
sandbox (no network) — see "Please test tomorrow".

## Everything changed

### Reliability
- `withTimeout()` helper; applied to: cloud data-doc load (8 s → runs on local copy), Home feed
  (12 s guard + error card with Retry), friends/leaderboard load, communities list + mutual-friends
  lookup (so **New community** is never stuck disabled), Profile portfolio card, Calls list, public
  profile page, standing/friends benchmark, portfolio-history (20 s).
- Chart: clear "History unavailable — Retry" state instead of red text; the "+€0.00 (+0.00%)"
  headline is no longer shown while loading or after an error.
- Public profile (`/u/name`): distinguishes "couldn't load" (retry) from "private / doesn't exist";
  skeleton instead of "Loading…".
- Home feed results cached 60 s so switching tabs doesn't refire 8 queries; cache invalidated when
  you vote or post.

### Security
- `api/_auth.js`: both AI proxy routes now require a valid Supabase session token
  (`Authorization: Bearer …`), verified against Supabase Auth. Client sends it via new `aiFetch()`
  (7 call sites). Anonymous callers get 401. **Please test import/thesis/news after merging.**

### Correctness / copy
- Identity strip no longer shows "#1 friends" when your return isn't shared (leaderboard showed "–"
  at the same time).
- "1 days held" → "1 day held" (two places).
- Friends with no username showed as "@unknown" → "No username yet".
- Stale nav references: "Claim your username (top-right menu)", "Set your name (top right)",
  "Portfolio tab" → point to Profile / Home.
- News tab shows "· out of date" when the last scan is older than 3 days (yours was 10 Jul).
- Add-position sheet no longer shows an empty "Add to a position you hold" header when the only
  holdings are sample data.
- Uppercase ticker inputs no longer uppercase their placeholders.
- RichR Score label "Risk-adjusted return" truncated on phones → "Risk-adjusted".

### UI / mobile
- Empty-portfolio buttons "Add manually" / "Try sample data" had white text on pale green
  (unreadable) → standard secondary buttons.
- Every screen checked at 390 px: no horizontal overflow on Home (empty + populated), Holdings,
  Analysis, Discover, Communities (+ New sheet), Friends (Leaderboard + Activity), Profile (full),
  position detail sheet, Create menu / Create Post / Add Position / Add Transaction sheets, landing
  page, public profile.
- (Earlier tonight, already on main) safe-area padding for the tab bar and community composer,
  Create pill offsets.

### Tests
- `vitest` + `jsdom` (dev deps), `npm test`. `src/helpers.test.js` (18 tests: number
  formatting, FX incl. fallbacks, Nordnet-style CSV import, one-vote-per-user, stale-vote age,
  history maths ignoring leading zeros and deposits, exchange-from-suffix, `withTimeout`) and
  `src/broker.test.js` (snapshot diff). Helpers are exported as `__helpers` at the bottom
  of `RichR.jsx` for testing only.

### Broker integration (research only)
- `BROKER_INTEGRATION.md`, `src/broker-types.js` (typedefs + pure `diffSnapshot`, not imported
  by the app), `supabase/migrations/DRAFT_broker_connections.sql.txt` (not applied). Summary below.

## Bugs fixed (list)
1. Permanent skeletons when a request hangs (feed, friends, communities, profile card, calls,
   public profile, standing, cloud doc, chart).
2. Communities "New" button permanently disabled while mutual friends fail to load.
3. AI proxy routes callable without authentication.
4. Rank badge shown while return isn't shared.
5. "1 days held".
6. "@unknown" friend label.
7. Chart headline "+€0.00 (+0.00%)" during load/error.
8. Empty "Add to a position you hold" header with sample data.
9. Placeholder text uppercased.
10. Stale navigation copy (3 places).
11. Unreadable secondary buttons on the empty Home.
12. RichR Score label truncation.

## Files changed
`src/RichR.jsx`, `src/App.jsx` (demo gate), `api/openai.js`, `api/claude.js`, `api/_auth.js` (new),
`package.json`, `package-lock.json`, `vitest.config.js` (new), `src/helpers.test.js` (new),
`src/broker.test.js` (new), `src/broker-types.js` (new), `BROKER_INTEGRATION.md`
(new), `supabase/migrations/DRAFT_broker_connections.sql.txt` (new), `OVERNIGHT_REPORT.md` (new).

## Intentionally NOT changed
- **Jaan's leaderboard row** shows the sample portfolio (VOO/MSFT/AAPL, +0.00%) — shared before
  sample data was blocked from publishing. That's production data; ask Jaan to re-share (or unshare).
- **Your own positions are dated 2 Sept** (imported without buy dates), which is why the chart is
  one day long and all period returns are identical. Data, not code — set real buy dates on the
  large positions.
- Browser back button inside the SPA (tabs/sheets don't push history) — a behaviour change worth
  doing deliberately, not overnight.
- Desktop layout on Home (narrow header column vs wide chart) — cosmetic, and you said no redesigns.
- The `search-symbols` function's weak company-name search (not in the repo).
- `fx_rates` lacking CAD/CHF/NOK/DKK/JPY (the `refresh-prices` function is not in the repo;
  fallback rates are in place).
- No fabricated activity, votes or users anywhere; empty states are honest.

## Remaining known issues
- After merging, if the Vercel functions' Node runtime doesn't allow ESM `import` in `api/*.js`
  (it does today for `openai.js`), the new `_auth.js` import would need converting to `require`.
- `SentimentMini` inside many feed items each calls `sentiment_for` (cached 30 s per ticker); fine
  at current scale, batch it (one RPC for N tickers) before feeds get long.
- `RichR.jsx` is ~8,500 lines; splitting into modules (social, sentiment, portfolio, import) is the
  next code-quality step — not done tonight to keep the diff reviewable.
- Chart "Since 2 Sept" note text is long on small phones; acceptable but could be shortened.

## Broker integration research (summary — full detail in BROKER_INTEGRATION.md)
- **Provider:** SnapTrade, read-only (`connectionType: "read"`), hosted Connection Portal,
  free up to 5 accounts, then ≈ $1/connected user/month (daily data).
- **Supported of your list:** Interactive Brokers ✅, DEGIRO ✅ (credential login), Trading 212 ✅,
  eToro ✅ (no transaction history). **Not supported: Nordnet, Revolut** (and Avanza). Nordnet has
  no consumer API; only a partner API — keep CSV/screenshot as the Nordnet route and open a
  partner conversation.
- **Architecture:** Broker → SnapTrade → Supabase edge functions (secrets) → `broker_connections`
  / `broker_accounts` / `broker_snapshots` → existing import review → `user_data`.
- **Security:** provider keys + per-user secrets server-only (RLS with no client policies),
  read-only enforced, disconnect/account-deletion cleanup, never log secrets.
- **Sync:** daily cron + webhooks; manual sync capped; symbol matching via `search-symbols`;
  unsupported securities surfaced not dropped; deleted-at-broker flagged not removed.
- **Privacy:** SnapTrade enters the data path — reword the "stays on your device" promise for
  connected accounts; leaderboard/feeds stay percentages-only.

## Security concerns discovered
1. **Fixed:** unauthenticated `/api/openai` and `/api/claude` proxies.
2. Anon key + project URL are (correctly) public; all protection is RLS. Reviewed the new social
   tables' policies tonight: reads open to `authenticated`, writes/deletes owner-only — OK.
3. `profiles` is readable by every signed-in user (needed for usernames); it contains only
   `username`, `searchable`, `is_public` — OK, but never add PII columns to it.
4. `get_public_profile` is callable by anonymous users by design (opt-in public links) — it only
   returns the fields the user switched on; keep it that way.

## Top 10 recommended next actions
1. Merge `overnight-polish` → main after testing the AI features (import, thesis, news) once
   — the auth change is the only thing that can break an existing flow.
2. Set real buy dates on your main positions (fixes your chart and period returns immediately).
3. Ask Jaan to re-share (or unshare) — sample data on the leaderboard looks fake to new users.
4. Batch sentiment lookups (`sentiment_for_many`) before feeds/communities grow.
5. Split `RichR.jsx` into modules; keep `__helpers` exports and grow the test suite.
6. Add history entries for tabs/sheets so the phone back button behaves (Android especially).
7. Improve `search-symbols` (name search, Nordic listings) — most-felt friction in Add position.
8. Add CAD/CHF/NOK/DKK/JPY to the `refresh-prices` FX fetch.
9. Broker connect PoC on SnapTrade sandbox (Trading 212 / IBKR first); Nordnet via CSV.
10. Wrap the web app for TestFlight (Capacitor) once 1–3 are done; test push-less first.

## Please test manually tomorrow
- Sign in on your phone → Home loads (both good and poor connection).
- **Import a screenshot, generate a thesis, and rescan news** — these now send your session token
  to the AI proxy.
- Communities → New (with and without mutual friends).
- Add position → search, duplicate merge, Add another.
- `/u/oliver04` signed out (after switching the public link on).
- Toggle airplane mode mid-session: screens should show "Couldn't reach RichR — Retry", never spin.
- `npm test` locally.

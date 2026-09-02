# Broker connectivity for RichR — research & architecture (Sept 2026)

Status: **research + isolated interfaces only. Nothing is wired into the app, no provider
credentials exist in the repo, no migration has been applied.**

## 1. Recommended provider: SnapTrade (read-only)

| Criterion | SnapTrade | Alternatives considered |
|---|---|---|
| Self-serve developer product for *retail* brokerages | Yes — free Starter tier (5 connected accounts), then $1 / connected user / month for daily read-only data, $2 for real-time | Plaid Investments: US-only. Flanks / Wealth Reader: enterprise wealth-manager products, Spain/EU, sales-led. Tink / Salt Edge / Nordigen: PSD2 *payment* accounts, no custody positions. |
| Read-only enforceable | Yes — `connectionType: "read"` on the portal link; trading endpoints simply never called | — |
| Hosted connection UI | Yes — Connection Portal (new tab / iframe / in-app browser), redirect back with `status=SUCCESS&connection_id=…`, `reconnect=<id>` for broken links | — |
| Ops | Webhooks (`CONNECTION_BROKEN`, `ACCOUNT_HOLDINGS_UPDATED`), guaranteed ≥1 sync/day, SOC 2 Type II | — |

## 2. Target-broker coverage (verified Sept 2026)

| Broker | SnapTrade | Auth type | Notes |
|---|---|---|---|
| Interactive Brokers | ✅ | API token | read + trade available; we use read |
| DEGIRO | ✅ | login credentials (no OAuth) | works, weaker consent story — show a clear explainer |
| Trading 212 | ✅ | API token | EU; practice accounts supported |
| eToro | ✅ | OAuth | holdings only, **no transaction history** |
| Revolut | ❌ | — | not offered |
| **Nordnet** | ❌ | — | not offered by SnapTrade or any consumer aggregator found. Nordnet's own "nExt" API is partner/business only; its public JS client was archived Aug 2024; community integrations scrape with the customer's password — **not acceptable** for RichR. |
| Avanza | ❌ | — | same situation as Nordnet |

Implication: launch broker connect for IBKR / Trading 212 / DEGIRO / eToro; keep CSV + screenshot
import as the first-class route for Nordnet/Avanza (their CSV exports are already recognised by
`parseHoldingsCsv`); file broker requests with SnapTrade for Nordnet, Avanza, Revolut; consider
applying to Nordnet for partner API access as a business track.

## 3. Architecture

```
Broker ──(SnapTrade portal, read-only)──> SnapTrade
                                             │  REST (clientId + consumerKey + per-user secret) — SERVER ONLY
                                             ▼
                              Supabase Edge Functions  broker-connect / broker-callback / broker-sync / broker-webhook
                                             │
                                             ▼
                        Postgres: broker_connections · broker_accounts · broker_snapshots (RLS: service-role only for secrets)
                                             │  snapshot (normalised positions, no secrets)
                                             ▼
                              RichR UI: existing Import review → user confirms → holdings in user_data (client-owned JSON)
```

Design rule: **the server never edits `user_data` directly.** A sync produces a staged snapshot;
the client merges it through the existing import-review step (duplicate merge / separate lot,
currency confirmation, unsupported securities listed but unchecked). Holdings gain
`source: "broker"`, `broker_account_id`, `external_symbol` so later syncs update the right rows and
positions that vanished at the broker are *flagged* ("no longer at broker — remove?"), never
auto-deleted.

## 4. Authentication flow

1. User taps **Connect Broker** (in the Add/Import sheet).
2. Client calls edge function `broker-connect` (user JWT). Server registers a SnapTrade user
   (`userId = richr:<uuid>`) if none exists, stores `userSecret` in `broker_connections`
   (service-role only), and returns a portal URL generated with `connectionType: "read"`,
   `customRedirect: https://rich-r.vercel.app/?broker=callback`, optional `broker` slug.
3. Client opens the portal (new tab on web; SFSafariViewController / Custom Tabs in a wrapper).
4. User authenticates at the broker; SnapTrade redirects back with `status` + `connection_id`.
5. Client calls `broker-sync` with the connection id → server fetches accounts, balances,
   positions → normalises → writes a `broker_snapshots` row (status `pending`) → returns it.
6. Client opens the import review prefilled from the snapshot; on confirm, holdings are written to
   `user_data` with `source: "broker"` and the snapshot is marked `applied`.
7. Daily: cron calls `broker-sync` per active connection; webhook `CONNECTION_BROKEN` marks the
   connection `broken` and Home shows a Reconnect nudge.

## 5. Database changes (draft, not applied — see `supabase/migrations/DRAFT_broker_connections.sql.txt`)

- `broker_connections(id, user_id, provider, provider_user_id, provider_user_secret, authorization_id, broker_slug, broker_name, status, connection_type, last_synced_at, last_error, created_at)`
  — RLS: **no client policies at all**; only the service role reads/writes. A client-safe view
  `broker_connections_public` exposes everything except the secret, `select` restricted to the owner.
- `broker_accounts(id, connection_id, provider_account_id, name, number_masked, currency, portfolio_id, include)`.
- `broker_snapshots(id, account_id, fetched_at, positions jsonb, balances jsonb, status)`.
- Holdings JSON (client): optional `source`, `broker_account_id`, `external_symbol`, `last_synced_at`.

## 6. Security requirements

- `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY` only in Supabase edge-function secrets; never in Vite env.
- Per-user `userSecret` never leaves the server; never logged (redact in any error path).
- All provider calls in edge functions with the caller's JWT verified; rate-limit `broker-sync` per user.
- Read-only: `connectionType: "read"` + no trading endpoints in code; document this in the UI
  ("RichR cannot place trades or move money").
- Disconnect = SnapTrade `deleteBrokerageAuthorization` + our rows deleted + snapshots deleted.
- Account deletion must call SnapTrade `deleteSnapTradeUser`.
- Existing risk to close first: the unauthenticated `/api/openai` route (see report) — any broker
  work must not repeat that pattern.

## 7. Expected costs

Free up to 5 connected accounts (PoC). Then ≈ $1 per connected user per month (daily read-only);
100 connected users ≈ $100/month. Manual "Sync now" on the daily plan is $0.05 each — cap it
(e.g. 3/day/user) or use the real-time tier if usage grows.

## 8. Sync strategy

- Daily server-side sync (cron) + webhook-triggered refresh; manual "Sync now" capped.
- Symbol normalisation: SnapTrade symbol + exchange → RichR ticker via `search-symbols`; unmatched
  securities kept in the snapshot with `unsupported: true` and shown, unchecked, in review.
- Multi-account: each broker account maps to a RichR portfolio (default: one new portfolio named
  after the broker; user can point it at an existing one).
- Multi-currency: positions keep the broker's trading currency; FX via existing `fx_rates`
  (CAD/CHF/NOK/DKK/JPY still need adding to the `refresh-prices` function).
- Duplicates: same ticker already held manually → existing merge / separate-lot review.
- Deleted at broker: flagged, user decides.
- Re-connecting the same brokerage: match on `broker_slug` + `provider_account_id`; reuse the
  connection row, don't create a second one.
- Expired authorisation: `status = "broken"` → Reconnect (portal with `reconnect=<id>`).

## 9. Privacy implications

- A third party (SnapTrade) enters the data path; RichR's "amounts stay on your device" promise
  must be reworded for connected accounts (amounts are fetched server-side to build the snapshot,
  but are still never published — leaderboard/feeds remain percentages only).
- Store as little as possible server-side: snapshots can be deleted after being applied; keep only
  what the daily diff needs.
- Add "Connected brokers" to Profile with clear Disconnect + "delete synced data".

## 10. Implementation plan

0. Oliver creates the SnapTrade account and adds the two secrets to Supabase (not in repo).
1. Migration + `broker-connect` (register/lookup user, portal URL, read-only).
2. Callback + `broker-sync` → snapshot → prefilled import review (reuse `ImportModal` review step).
3. Profile › Connected brokers: status, last sync, Sync now, Reconnect, Disconnect.
4. Daily cron + webhook endpoint; broken-connection nudge on Home; deleted-position flagging.
5. "Connect Broker — Recommended" card in the Add/Import sheet with the read-only assurances.
PoC on SnapTrade's sandbox brokerage first, then Trading 212 practice / a real IBKR or DEGIRO account.

Sources: snaptrade.com/brokerage-integrations, snaptrade.com/pricing,
docs.snaptrade.com/docs/implement-connection-portal, docs.snaptrade.com/docs/faq,
wealthfolio.app/connect/brokerages (live SnapTrade customer list), nordnet.se/externalapi/docs/api,
github.com/nordnet/nordnet-next-api (archived), github.com/jippi/hass-nordnet.

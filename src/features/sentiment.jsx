/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CornerDownRight, Send, X } from "lucide-react";
import { useMyCommunities, visOf } from "./communities.jsx";
import { FEED_CACHE } from "./feed.jsx";
import { PostBody, REACTIONS, SOCIAL_ME, mutualIdsCached, useNames } from "./social.jsx";
import { daysOld, fmtDate, fmtTime, pctOf, timeAgo, withTimeout } from "../lib/format.js";
import { dataKey } from "../lib/storage.js";
import { Avatar, Logo, Ret, Skeleton } from "../ui/primitives.jsx";

// set by the main component on every render
export const VOTE_META = {
  buy:  { label: "Buy",  dot: "🟢", text: "text-emerald-700", chip: "bg-emerald-50 border-emerald-200 text-emerald-700", bar: "bg-emerald-500", solid: "bg-emerald-600 text-white" },
  hold: { label: "Hold", dot: "⚪", text: "text-slate-600",   chip: "bg-slate-50 border-slate-300 text-slate-700",     bar: "bg-slate-400",   solid: "bg-slate-600 text-white" },
  sell: { label: "Sell", dot: "🔴", text: "text-rose-700",    chip: "bg-rose-50 border-rose-200 text-rose-700",        bar: "bg-rose-500",    solid: "bg-rose-600 text-white" },
};

export const VOTE_ORDER = ["buy", "hold", "sell"];

/* Latest call per (user, ticker) from an append-only list sorted newest first. */
export const latestCalls = (rows, by = (r) => `${r.user_id}|${r.ticker}`) => {
  const seen = new Set(); const out = [];
  for (const r of rows || []) { const k = by(r); if (seen.has(k)) continue; seen.add(k); out.push(r); }
  return out;
};

/* Same, minus users whose latest row is a removal (vote = 'none'). */
export const activeCalls = (rows, by) => latestCalls(rows, by).filter((r) => r.vote !== "none");

/* Return of a stock since a call was made, from the shared prices table. */
export function useReturnsSince(calls) {
  const [prices, setPrices] = useState({});
  const tickers = [...new Set((calls || []).map((c) => c.ticker))].sort().join(",");
  useEffect(() => {
    if (!tickers) return;
    let dead = false;
    supabase.from("prices").select("ticker, price, currency").in("ticker", tickers.split(",")).then(({ data }) => {
      if (dead) return;
      const m = {}; (data || []).forEach((p) => { m[String(p.ticker).toUpperCase()] = p; }); setPrices(m);
    });
    return () => { dead = true; };
  }, [tickers]);
  return (c) => {
    const p = prices[c.ticker];
    if (!p || !(Number(c.price_at) > 0) || !(Number(p.price) > 0)) return null;
    if (c.currency && p.currency && String(c.currency).toUpperCase() !== String(p.currency).toUpperCase()) return null;
    return ((Number(p.price) - Number(c.price_at)) / Number(c.price_at)) * 100;
  };
}

/* Small vote chip: 🟢 Buy */
export function VoteChip({ vote, size = "xs", className = "" }) {
  const m = VOTE_META[vote]; if (!m) return null;
  return <span className={`inline-flex items-center gap-1 border rounded-full px-1.5 py-0.5 font-bold ${size === "xs" ? "text-[10px]" : "text-xs"} ${m.chip} ${className}`}>{m.dot} {m.label}</span>;
}

/* Sentiment bar + counts */
export function SentimentBar({ counts, total, compact = false }) {
  if (!total) return <p className="text-xs text-slate-400">No votes yet — be the first.</p>;
  const pctOf = (k) => Math.round((counts[k] / total) * 100);
  return (
    <div>
      <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100">
        {VOTE_ORDER.map((k) => counts[k] > 0 && <div key={k} className={`${VOTE_META[k].bar} h-full`} style={{ width: `${(counts[k] / total) * 100}%` }} />)}
      </div>
      <div className={`flex items-center justify-between mt-1.5 ${compact ? "text-[10px]" : "text-xs"} font-semibold tabular-nums`}>
        {VOTE_ORDER.map((k) => (
          <span key={k} className={VOTE_META[k].text}>{VOTE_META[k].dot} {VOTE_META[k].label} {pctOf(k)}%</span>
        ))}
        <span className="text-slate-400 font-medium">{total} vote{total === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

/* ---------- RichR Sentiment: one global pool per asset ---------- */
/* One vote per user per asset (the newest row in stock_calls); votes older
   than 30 days drop out of the tally until re-affirmed. Tallies come from
   the sentiment_for / sentiment_history RPCs so 1,000+ voters cost one call. */
export const MIN_SAMPLE = 5;

// below this, show counts, not percentages
export const STALE_DAYS = 30;

export const SENT_CACHE = new Map();

// `${ticker}|${scope}|${gid}` -> { at, data }
/* emit(ticker, "optimistic") → read the (already updated) cache, no network;
   emit(ticker, "settled")    → the server has the row(s); refetch. */
export const sentimentBus = { subs: new Set(), emit(t, phase = "settled") { this.subs.forEach((f) => f(t, phase)); } };

/* "Everyone" lookups that land in the same tick (a feed full of SentimentMini
   cards, Discover's list) are coalesced into ONE sentiment_for_many call. */
const SENT_BATCH = { waiting: new Map(), timer: null, delay: 15 };   // ticker -> [{resolve, reject}]
function flushSentimentBatch() {
  const waiting = SENT_BATCH.waiting; SENT_BATCH.waiting = new Map(); SENT_BATCH.timer = null;
  const tickers = [...waiting.keys()];
  const settle = (t, data, err) => waiting.get(t).forEach(({ resolve, reject }) => (err ? reject(err) : resolve(data)));
  const one = (t) => supabase.rpc("sentiment_for", { t, scope: "everyone", gid: null })
    .then(({ data, error }) => { if (error) throw error; SENT_CACHE.set(`${t}|everyone|`, { at: Date.now(), data }); settle(t, data); })
    .catch((e) => settle(t, null, e));
  if (tickers.length === 1) return one(tickers[0]);
  return supabase.rpc("sentiment_for_many", { tickers }).then(({ data, error }) => {
    if (error || !data || typeof data !== "object") throw error || new Error("no batch");
    for (const t of tickers) { const d = data[t] || null; if (d) SENT_CACHE.set(`${t}|everyone|`, { at: Date.now(), data: d }); settle(t, d); }
  }).catch(() => Promise.all(tickers.map(one)));   // older DB without the RPC → per-ticker
}
export async function fetchSentiment(ticker, scope = "everyone", gid = null, force = false) {
  const key = `${ticker}|${scope}|${gid || ""}`;
  const hit = SENT_CACHE.get(key);
  if (!force && hit && Date.now() - hit.at < 30000) return hit.data;
  if (scope === "everyone" && !gid) {
    const t = String(ticker).toUpperCase();
    return new Promise((resolve, reject) => {
      if (!SENT_BATCH.waiting.has(t)) SENT_BATCH.waiting.set(t, []);
      SENT_BATCH.waiting.get(t).push({ resolve, reject });
      if (!SENT_BATCH.timer) SENT_BATCH.timer = setTimeout(flushSentimentBatch, SENT_BATCH.delay);
    });
  }
  const { data, error } = await supabase.rpc("sentiment_for", { t: ticker, scope, gid });
  if (error) throw error;
  SENT_CACHE.set(key, { at: Date.now(), data });
  return data;
}

export function useSentiment(ticker, scope = "everyone", gid = null) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(false);
  const load = async (force) => {
    if (!ticker) return;
    try { setS(await fetchSentiment(ticker, scope, gid, force)); setErr(false); } catch (e) { setErr(true); }
  };
  useEffect(() => { setS(null); load(false); }, [ticker, scope, gid]);
  useEffect(() => {
    const f = (t, phase) => {
      if (t !== ticker) return;
      if (phase === "optimistic") { const hit = SENT_CACHE.get(`${ticker}|${scope}|${gid || ""}`); if (hit) setS(hit.data); return; }
      load(true);
    };
    sentimentBus.subs.add(f); return () => sentimentBus.subs.delete(f);
  }, [ticker, scope, gid]);
  return [s, err, () => load(true)];
}

/* Pure: one user's current vote moves prev → next (null = no vote) inside a
   sentiment_for tally. Only the counted vote is moved (a stale prev is null),
   so unvote → vote → unvote always lands back where it started. */
export const tallyAfterVote = (s, prev, next, { reason = null, userId = null, now = new Date().toISOString() } = {}) => {
  if (!s) return s;
  const out = { ...s };
  const n = (k) => Number(out[k] || 0);
  if (prev !== next) {
    if (prev) out[prev] = Math.max(0, n(prev) - 1);
    if (next) out[next] = n(next) + 1;
    out.total = n("buy") + n("hold") + n("sell");
  }
  out.mine = next ? { vote: next, reason: reason || null, created_at: now } : null;
  if (Array.isArray(out.reasons)) {
    out.reasons = out.reasons.filter((r) => !userId || r.user_id !== userId);
    if (next && reason && userId) out.reasons = [{ user_id: userId, vote: next, reason, created_at: now }, ...out.reasons];
  }
  return out;
};

/* Rapid taps on one asset are written in order and the tally is refetched
   once, after the last one — the final tap always wins. */
export const VOTE_CHAIN = new Map();

// ticker -> { p: Promise, n: pending count }
/* Cast, change, re-affirm ("buy" | "hold" | "sell") or remove ("none") your
   vote. Append-only: one row per change, newest wins; 'none' drops you from
   every tally. The UI updates instantly from the cache, the server confirms. */
export async function castVote(ticker, vote, { reason = null, price = null, currency = null, reaffirmed = false } = {}) {
  const tk = String(ticker).toUpperCase();
  const next = vote === "none" ? null : vote;
  const row = { user_id: SOCIAL_ME.id, ticker: tk, vote, reason: next && reason ? String(reason).slice(0, 140) : null,
    price_at: next && Number(price) > 0 ? Number(price) : null, currency: next ? currency || null : null, reaffirmed: !!next && reaffirmed };
  /* optimistic: every cached scope for this asset */
  for (const [k, hit] of [...SENT_CACHE.entries()]) {
    if (!k.startsWith(tk + "|") || !hit.data) continue;
    const m = hit.data.mine;
    const prev = m && m.vote !== "none" && daysOld(m.created_at) < STALE_DAYS ? m.vote : null;
    SENT_CACHE.set(k, { at: Date.now(), data: tallyAfterVote(hit.data, prev, next, { reason: row.reason, userId: SOCIAL_ME.id }) });
  }
  sentimentBus.emit(tk, "optimistic");
  /* serialised write */
  const chain = VOTE_CHAIN.get(tk) || { p: Promise.resolve(), n: 0 };
  chain.n += 1;
  const run = chain.p.then(async () => { const { error } = await supabase.from("stock_calls").insert(row); return !error; });
  chain.p = run.catch(() => false);
  VOTE_CHAIN.set(tk, chain);
  const ok = await run.catch(() => false);
  chain.n -= 1;
  if (chain.n === 0) {
    for (const k of [...SENT_CACHE.keys()]) if (k.startsWith(tk + "|")) SENT_CACHE.delete(k);
    FEED_CACHE.at = 0;
    sentimentBus.emit(tk, "settled");
  }
  return ok;
}

export const removeVote = (ticker) => castVote(ticker, "none");

/* Three rows: 🟢 Buy 58% ▇▇▇  — the canonical RichR Sentiment look. */
export function SentimentRows({ s, compact = false }) {
  const total = s ? Number(s.total) : 0;
  const small = total < MIN_SAMPLE;
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      {VOTE_ORDER.map((k) => {
        const n = s ? Number(s[k]) : 0; const p = pctOf(n, total);
        return (
          <div key={k} className="flex items-center gap-2 tabular-nums">
            <span className={`${compact ? "w-16 text-[12px]" : "w-20 text-[13px]"} font-semibold ${VOTE_META[k].text}`}>{VOTE_META[k].dot} {VOTE_META[k].label}</span>
            <div className={`flex-1 ${compact ? "h-1.5" : "h-2"} bg-slate-100 rounded-full overflow-hidden`}><div className={`${VOTE_META[k].bar} h-full rounded-full transition-all duration-500`} style={{ width: `${small ? 0 : p}%` }} /></div>
            <span className={`${compact ? "w-9 text-[12px]" : "w-11 text-[13px]"} text-right font-bold text-slate-800`}>{small ? (n || "–") : `${p}%`}</span>
          </div>
        );
      })}
    </div>
  );
}

/* "63% Buy ↑6% this week" */
export function WeekDelta({ s, className = "" }) {
  if (!s || Number(s.total) < MIN_SAMPLE || !s.week_ago || Number(s.week_ago.total) < MIN_SAMPLE) return null;
  const now = pctOf(Number(s.buy), Number(s.total)), then = pctOf(Number(s.week_ago.buy), Number(s.week_ago.total));
  const d = now - then;
  if (d === 0) return <span className={`text-slate-400 ${className}`}>unchanged this week</span>;
  return <span className={`${d > 0 ? "text-emerald-600" : "text-rose-500"} ${className}`}>{d > 0 ? "↑" : "↓"}{Math.abs(d)}% Buy this week</span>;
}

/* Vote buttons with the optional reason line. */
/* Tap an option to vote, another to change, the selected one again (or
   "Remove vote") to withdraw. Buttons never lock: the tally updates
   instantly and taps are written in order. */
export function VoteButtons({ ticker, mine, price, currency, size = "md", onVoted }) {
  const [pending, setPending] = useState(null);
  const [reason, setReason] = useState("");
  const cur = mine && mine.vote !== "none" ? mine.vote : null;
  const go = (v) => {
    const r = reason.trim() || null;
    setPending(null); setReason("");
    castVote(ticker, v, { reason: r, price, currency }).then((ok) => { if (ok && onVoted) onVoted(v); });
  };
  const remove = () => { setPending(null); setReason(""); removeVote(ticker).then((ok) => { if (ok && onVoted) onVoted(null); }); };
  const tap = (k) => {
    if (pending === k) { setPending(null); setReason(""); return; }   // deselect the option you were about to confirm
    if (!pending && cur === k) { remove(); return; }                 // tap your vote again → remove it
    if (size === "sm") { go(k); return; }                             // compact: change straight away
    setPending(k);                                                    // full size: ask for an optional reason
  };
  const h = size === "sm" ? "h-8 text-[12px]" : "h-10 text-sm";
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {VOTE_ORDER.map((k) => {
          const active = (pending || cur) === k;
          return (
            <button key={k} onClick={() => tap(k)} aria-pressed={active}
              title={!pending && cur === k ? "Tap again to remove your vote" : undefined}
              className={`${h} rounded-xl font-bold border transition ${active ? VOTE_META[k].solid + " border-transparent" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
              {VOTE_META[k].dot} {VOTE_META[k].label}
            </button>
          );
        })}
      </div>
      {pending && (
        <div className="mt-2 flex items-center gap-2" style={{ animation: "richr-in .15s ease-out both" }}>
          <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 140))} maxLength={140} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") go(pending); if (e.key === "Escape") setPending(null); }}
            placeholder="Why? (optional)" className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 h-10 text-sm bg-white outline-none focus:border-emerald-400" />
          <button onClick={() => go(pending)} className={`h-10 px-4 rounded-xl text-sm font-bold ${VOTE_META[pending].solid}`}>{cur ? "Update" : "Vote"}</button>
        </div>
      )}
      {cur && !pending && (
        <div className={`flex items-center justify-between ${size === "sm" ? "mt-1 text-[10px]" : "mt-1.5 text-[11px]"} text-slate-400`}>
          <span>Your vote: <b className={VOTE_META[cur].text}>{VOTE_META[cur].label}</b></span>
          <button onClick={remove} className="font-semibold text-slate-500 hover:text-rose-600">Remove vote</button>
        </div>
      )}
    </div>
  );
}

/* Full card: scope switch, rows, votes, holders, week delta, history. */
export function SentimentCard({ ticker, name, price, currency, communities = null, onOpenTicker, showHistory = true }) {
  const [scope, setScope] = useState("everyone");
  const [gid, setGid] = useState(null);
  const [holdersOnly, setHoldersOnly] = useState(false);
  const [range, setRange] = useState(null); // null | 24h | 1w | 1m | all
  const [s, err, reload] = useSentiment(ticker, scope, scope === "community" ? gid : null);
  const myComms = communities;
  useEffect(() => { if (scope === "community" && !gid && myComms && myComms.length) setGid(myComms[0].id); }, [scope, myComms]);
  const names = useNames([...((s && s.reasons) || []).map((r) => r.user_id), ...((s && s.friends_voted) || []).map((f) => f.user_id)]);
  const view = s && holdersOnly && s.holders ? s.holders : s;
  const total = view ? Number(view.total) : 0;
  const mine = s && s.mine;
  const stale = mine && daysOld(mine.created_at) >= STALE_DAYS;
  const lead = view && total >= MIN_SAMPLE ? VOTE_ORDER.slice().sort((a, b) => Number(view[b]) - Number(view[a]))[0] : null;
  return (
    <div className="bg-slate-50 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold tracking-wide text-slate-400">RICHR SENTIMENT</div>
          <div className="font-bold text-slate-900 text-[15px] leading-tight mt-0.5">{ticker}{name ? <span className="font-medium text-slate-500 text-[13px]"> · {name}</span> : null}</div>
        </div>
        {mine && !stale && <span className="text-[10px] text-slate-400 shrink-0">You: <VoteChip vote={mine.vote} /></span>}
      </div>

      {/* scope */}
      <div className="mt-3 bg-white border border-slate-200 rounded-xl p-0.5 flex text-[12px] font-semibold">
        {[["everyone", "Everyone"], ["friends", "Friends"], ["community", "Communities"]].map(([id, l]) => (
          <button key={id} onClick={() => setScope(id)} className={`flex-1 h-7 rounded-lg transition ${scope === id ? "bg-slate-900 text-white" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>
      {scope === "community" && (
        myComms === null ? <div className="skel h-6 w-1/2 mt-2" />
        : !myComms || !myComms.length ? <p className="text-[11px] text-slate-400 mt-2">You're not in a community yet.</p>
        : myComms.length > 1 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">{myComms.map((c) => (
            <button key={c.id} onClick={() => setGid(c.id)} className={`text-[11px] font-semibold px-2.5 h-7 rounded-full border ${gid === c.id ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-600"}`}>{visOf(c).icon} {c.name}</button>
          ))}</div>
        ) : <p className="text-[11px] text-slate-500 mt-2">{visOf(myComms[0]).icon} {myComms[0].name}</p>
      )}
      {scope === "everyone" && myComms && myComms.length > 0 && <ScopeSummary ticker={ticker} />}

      {/* tally */}
      <div className="mt-3">
        {err ? <p className="text-xs text-rose-500">Couldn't load sentiment.</p>
          : s === null ? <div className="space-y-2"><div className="skel h-2 w-full" /><div className="skel h-2 w-5/6" /><div className="skel h-2 w-4/6" /></div>
          : <SentimentRows s={view} />}
        <div className="flex items-center justify-between mt-2 text-[11px] tabular-nums">
          <span className="text-slate-500">
            {s === null ? "" : total === 0 ? (scope === "everyone" ? "No votes yet — be the first." : scope === "friends" ? "None of your friends have voted yet." : "No votes in this community yet.")
              : total < MIN_SAMPLE ? `${total} vote${total === 1 ? "" : "s"} so far — percentages show from ${MIN_SAMPLE}.`
              : <>{total.toLocaleString()} vote{total === 1 ? "" : "s"}{lead ? <> · leaning <b className={VOTE_META[lead].text}>{VOTE_META[lead].label}</b></> : null}</>}
          </span>
          {!holdersOnly && <WeekDelta s={s} className="font-semibold" />}
        </div>
        {s && s.holders && Number(s.holders.total) >= 3 && (
          <button onClick={() => setHoldersOnly((v) => !v)}
            className={`mt-2 text-[11px] font-semibold px-2.5 h-7 rounded-full border transition ${holdersOnly ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-600"}`}>
            {holdersOnly ? "Showing holders only" : `Holders only · ${Number(s.holders.total)}`}
          </button>
        )}
        {scope === "everyone" && s && Array.isArray(s.friends_voted) && s.friends_voted.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-600">
            <span className="font-semibold text-slate-500">Friends:</span>
            {s.friends_voted.slice(0, 6).map((f) => (
              <span key={f.user_id} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full pl-0.5 pr-2 py-0.5"><Avatar name={names[f.user_id] || "?"} size={16} /> @{names[f.user_id] || "…"} {VOTE_META[f.vote].dot}</span>
            ))}
          </div>
        )}
      </div>

      {/* stale nudge */}
      {stale && (
        <div className="mt-3 bg-white border border-amber-200 rounded-xl px-3 py-2 text-[12px] text-slate-700 flex items-center gap-2 flex-wrap">
          <span className="flex-1 min-w-[10rem]">Your <b>{VOTE_META[mine.vote].label}</b> is {daysOld(mine.created_at)} days old and no longer counted. Still agree?</span>
          <button onClick={() => castVote(ticker, mine.vote, { reason: mine.reason, price, currency, reaffirmed: true })} className={`text-[11px] font-bold px-2.5 h-7 rounded-lg ${VOTE_META[mine.vote].solid}`}>Still {VOTE_META[mine.vote].label}</button>
          <button onClick={() => removeVote(ticker)} className="text-[11px] font-semibold text-slate-500 px-1.5 h-7">Remove</button>
        </div>
      )}

      {/* vote */}
      <div className="mt-3"><VoteButtons ticker={ticker} mine={mine && !stale ? mine : null} price={price} currency={currency} /></div>
      {mine && mine.reason && !stale && <p className="text-[11px] text-slate-500 mt-2 italic">Your reason: “{mine.reason}”</p>}

      {/* reasons */}
      {s && Array.isArray(s.reasons) && s.reasons.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {s.reasons.slice(0, 4).map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px] text-slate-600">
              <VoteChip vote={r.vote} className="shrink-0 mt-0.5" />
              <span className="leading-snug">“{r.reason}” <span className="text-slate-400 text-[11px]">— @{names[r.user_id] || "…"} · {timeAgo(r.created_at)}</span></span>
            </div>
          ))}
        </div>
      )}

      {/* history */}
      {showHistory && s && Number(s.total) >= MIN_SAMPLE && (
        <div className="mt-3">
          <div className="flex items-center gap-1">
            {[["24h", "24H"], ["1w", "1W"], ["1m", "1M"], ["all", "ALL"]].map(([id, l]) => (
              <button key={id} onClick={() => setRange(range === id ? null : id)} className={`text-[11px] font-bold px-2 h-7 rounded-lg ${range === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}>{l}</button>
            ))}
            {!range && <span className="text-[10px] text-slate-400 ml-1">Sentiment over time</span>}
          </div>
          {range && <SentimentHistory ticker={ticker} range={range} />}
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-3">One person, one vote — portfolio size doesn't count. Opinions of RichR users, not advice. Votes expire after {STALE_DAYS} days unless re-affirmed.</p>
    </div>
  );
}

/* NVDA across every circle you belong to — one vote per person, different
   aggregations: 🌎 Everyone · 👥 Friends · 🌐/🔒 each community. */
export function ScopeSummary({ ticker }) {
  const [d, setD] = useState(null);
  const load = () => supabase.rpc("sentiment_scopes", { t: ticker }).then(({ data, error }) => setD(error ? null : data));
  useEffect(() => { setD(null); load(); }, [ticker]);
  useEffect(() => { const f = (t, phase) => { if (t === ticker && phase !== "optimistic") load(); }; sentimentBus.subs.add(f); return () => sentimentBus.subs.delete(f); }, [ticker]);
  if (!d) return null;
  const rows = [["🌎", "Everyone", d.everyone], ["👥", "Friends", d.friends], ...((d.communities || []).map((c) => [visOf(c).icon, c.name, c.s]))];
  const line = (s) => {
    const total = s ? Number(s.total) : 0;
    if (!total) return <span className="text-slate-400">no votes</span>;
    if (total < MIN_SAMPLE) return <span className="text-slate-500">{total} vote{total === 1 ? "" : "s"}</span>;
    const lead = VOTE_ORDER.slice().sort((a, b) => Number(s[b]) - Number(s[a]))[0];
    return <span className={`font-bold ${VOTE_META[lead].text}`}>{pctOf(Number(s[lead]), total)}% {VOTE_META[lead].label}</span>;
  };
  return (
    <div className="mt-2.5 bg-white rounded-xl border border-slate-100 px-3 py-2 text-[12px] tabular-nums divide-y divide-slate-50">
      {rows.map(([icon, name, s], i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <span className="text-slate-600 truncate min-w-0"><span className="mr-1">{icon}</span>{name}</span>
          <span className="shrink-0 ml-2">{line(s)}</span>
        </div>
      ))}
    </div>
  );
}

export const HIST_RANGES = { "24h": { step: "1 hour", points: 24 }, "1w": { step: "1 day", points: 7 }, "1m": { step: "1 day", points: 30 }, all: { step: "7 days", points: 26 } };

export function SentimentHistory({ ticker, range }) {
  const [pts, setPts] = useState(null);
  useEffect(() => {
    let dead = false; setPts(null);
    const r = HIST_RANGES[range] || HIST_RANGES["1m"];
    supabase.rpc("sentiment_history", { t: ticker, step: r.step, points: r.points }).then(({ data, error }) => { if (!dead) setPts(error ? [] : (data || [])); });
    return () => { dead = true; };
  }, [ticker, range]);
  if (pts === null) return <div className="skel h-16 w-full mt-2" />;
  const rows = pts.map((p) => ({ t: p.t, buy: Number(p.total) ? (Number(p.buy) / Number(p.total)) * 100 : null, hold: Number(p.total) ? (Number(p.hold) / Number(p.total)) * 100 : null, sell: Number(p.total) ? (Number(p.sell) / Number(p.total)) * 100 : null, n: Number(p.total) }));
  if (!rows.some((r) => r.n > 0)) return <p className="text-[11px] text-slate-400 mt-2">No history for this range yet.</p>;
  const first = rows.find((r) => r.buy != null), last = [...rows].reverse().find((r) => r.buy != null);
  const fmtT = (t) => (range === "24h" ? fmtTime(new Date(t)) : fmtDate(t));
  return (
    <div className="mt-2 bg-white rounded-xl p-2 border border-slate-100">
      <div style={{ height: 96 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <XAxis dataKey="t" tickFormatter={fmtT} minTickGap={36} tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} hide />
            <Tooltip content={({ active, payload, label }) => active && payload && payload.length ? (
              <div className="bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-[11px] tabular-nums">
                <div className="text-slate-400">{fmtT(label)} · {payload[0].payload.n} votes</div>
                <div>🟢 {Math.round(payload[0].payload.buy || 0)}% · ⚪ {Math.round(payload[0].payload.hold || 0)}% · 🔴 {Math.round(payload[0].payload.sell || 0)}%</div>
              </div>) : null} />
            <Line type="monotone" dataKey="buy" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="hold" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="sell" stroke="#f43f5e" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {first && last && (
        <div className="text-[11px] text-slate-500 tabular-nums mt-1">Buy {Math.round(first.buy)}% → <b className="text-slate-800">{Math.round(last.buy)}%</b> over this range</div>
      )}
    </div>
  );
}

/* Compact: for poll cards in feeds/chats, Discover lists, community sections. */
export function SentimentMini({ ticker, name, onOpenTicker, vote = true, headline = true }) {
  const [s, err] = useSentiment(ticker, "everyone", null);
  const total = s ? Number(s.total) : 0;
  const mine = s && s.mine && daysOld(s.mine.created_at) < STALE_DAYS ? s.mine : null;
  const lead = s && total >= MIN_SAMPLE ? VOTE_ORDER.slice().sort((a, b) => Number(s[b]) - Number(s[a]))[0] : null;
  return (
    <div className="tabular-nums">
      {headline && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <button onClick={() => onOpenTicker && onOpenTicker(ticker)} className="text-left min-w-0">
            <span className="text-[10px] font-bold tracking-wide text-slate-400">RICHR SENTIMENT</span>
            <div className="font-bold text-slate-900 text-[14px] leading-tight truncate">{ticker}{name ? <span className="font-medium text-slate-500 text-[12px]"> · {name}</span> : null}</div>
          </button>
          {lead && <span className={`text-[11px] font-bold shrink-0 ${VOTE_META[lead].text}`}>{pctOf(Number(s[lead]), total)}% {VOTE_META[lead].label}</span>}
        </div>
      )}
      {s === null && !err ? <div className="space-y-1.5"><div className="skel h-1.5 w-full" /><div className="skel h-1.5 w-4/5" /><div className="skel h-1.5 w-3/5" /></div> : <SentimentRows s={s} compact />}
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
        <span>{total === 0 ? "No votes yet" : total < MIN_SAMPLE ? `${total} vote${total === 1 ? "" : "s"} so far` : `${total.toLocaleString()} votes`}{mine ? <> · you: {VOTE_META[mine.vote].dot}</> : null}</span>
        <WeekDelta s={s} className="font-semibold" />
      </div>
      {vote && <div className="mt-2"><VoteButtons ticker={ticker} mine={mine} size="sm" /></div>}
    </div>
  );
}

/* Discover: the most-voted assets right now. */
export function DiscoverSentiment({ onOpenTicker }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { let dead = false; supabase.rpc("top_sentiment", { lim: 8 }).then(({ data, error }) => { if (!dead) setRows(error ? [] : (data || [])); }); return () => { dead = true; }; }, []);
  if (rows === null) return <Skeleton lines={4} />;
  if (!rows.length) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="section-title">RichR Sentiment</h3>
        <span className="text-[10px] font-semibold text-slate-400">MOST VOTED · 30 DAYS</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const total = Number(r.total); const small = total < MIN_SAMPLE;
          const lead = VOTE_ORDER.slice().sort((a, b) => Number(r[b]) - Number(r[a]))[0];
          return (
            <button key={r.ticker} onClick={() => onOpenTicker(r.ticker)} className="w-full flex items-center gap-3 py-2.5 text-left">
              <Logo h={{ ticker: r.ticker }} size={34} rounded="rounded-lg" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 text-sm">{r.ticker}</div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex mt-1">
                  {!small && VOTE_ORDER.map((k) => Number(r[k]) > 0 && <div key={k} className={`${VOTE_META[k].bar} h-full`} style={{ width: `${(Number(r[k]) / total) * 100}%` }} />)}
                </div>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                {small ? <div className="text-[12px] font-semibold text-slate-500">{total} vote{total === 1 ? "" : "s"}</div>
                  : <div className={`text-sm font-bold ${VOTE_META[lead].text}`}>{VOTE_META[lead].dot} {pctOf(Number(r[lead]), total)}% {VOTE_META[lead].label}</div>}
                <div className="text-[10px] text-slate-400">{Number(r.recent)} this week · {total} total</div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 mt-2">Buy / Hold / Sell opinions of RichR users — one person, one vote. Not advice.</p>
    </div>
  );
}

/* Home nudge: votes older than 30 days — still agree? */
export function RecheckCalls({ onOpenTicker }) {
  const [rows, setRows] = useState(null);
  const load = () => supabase.rpc("my_stale_calls", { days: STALE_DAYS }).then(({ data, error }) => setRows(error ? [] : (data || [])));
  useEffect(() => { load(); }, []);
  if (!rows || !rows.length) return null;
  const c = rows[0];
  return (
    <div className="card flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[12rem]">
        <div className="text-[10px] font-bold tracking-wide text-slate-400">STILL AGREE?</div>
        <div className="text-sm text-slate-800 mt-0.5">Your <b className={VOTE_META[c.vote].text}>{VOTE_META[c.vote].dot} {VOTE_META[c.vote].label}</b> on <b>{c.ticker}</b> is {daysOld(c.created_at)} days old{rows.length > 1 ? ` (+${rows.length - 1} more)` : ""}.</div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={async () => { await castVote(c.ticker, c.vote, { reason: c.reason, reaffirmed: true }); load(); }} className={`text-xs font-bold px-3 h-9 rounded-xl ${VOTE_META[c.vote].solid}`}>Still {VOTE_META[c.vote].label}</button>
        <button onClick={() => onOpenTicker(c.ticker)} className="btn-secondary h-9 text-xs">Change</button>
      </div>
    </div>
  );
}

/* Stock page: RichR Sentiment + the discussion underneath. */
export function StockSocial({ ticker: rawTicker, name, price, currency, onOpenTicker }) {
  const ticker = String(rawTicker || "").toUpperCase();
  const me = SOCIAL_ME.id;
  const [posts, setPosts] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [posterVotes, setPosterVotes] = useState({});
  const [friendIds, setFriendIds] = useState([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const communities = useMyCommunities(me);

  const load = async () => {
    if (!ticker) return;
    const [{ data: ps }, ids] = await Promise.all([
      supabase.from("stock_posts").select("id, user_id, parent_id, body, created_at").eq("ticker", ticker).order("created_at", { ascending: true }).limit(200),
      mutualIdsCached(me),
    ]);
    setFriendIds(ids);
    const list = ps || [];
    const postIds = list.map((p) => p.id);
    const posters = [...new Set(list.map((p) => p.user_id))];
    const [{ data: rs }, { data: cs }] = await Promise.all([
      postIds.length ? supabase.from("stock_post_reactions").select("post_id, user_id, emoji").in("post_id", postIds) : Promise.resolve({ data: [] }),
      posters.length ? supabase.from("stock_calls").select("user_id, vote, created_at").eq("ticker", ticker).in("user_id", posters).order("created_at", { ascending: false }).limit(400) : Promise.resolve({ data: [] }),
    ]);
    setReactions(rs || []);
    const pv = {}; activeCalls(cs || [], (r) => r.user_id).forEach((c) => { if (daysOld(c.created_at) < STALE_DAYS) pv[c.user_id] = c.vote; });
    setPosterVotes(pv);
    setPosts(list);
  };
  useEffect(() => { setPosts(null); load(); }, [ticker]);
  useEffect(() => { const f = (t, phase) => { if (t === ticker && phase !== "optimistic") load(); }; sentimentBus.subs.add(f); return () => sentimentBus.subs.delete(f); }, [ticker]);

  const names = useNames((posts || []).map((p) => p.user_id));
  const uname = (id) => (id === me ? (SOCIAL_ME.username || names[id] || "you") : (names[id] || "…"));

  const send = async () => {
    const body = text.trim().slice(0, 1000);
    if (!body || !me) return;
    setSending(true);
    const { error } = await supabase.from("stock_posts").insert({ user_id: me, ticker, body, parent_id: replyTo ? replyTo.id : null });
    setSending(false);
    if (error) return;
    setText(""); setReplyTo(null);
    await load();
  };
  const react = async (post, emoji) => {
    const mine = reactions.find((r) => r.post_id === post.id && r.user_id === me && r.emoji === emoji);
    setReactions((rs) => mine ? rs.filter((r) => r !== mine) : [...rs, { post_id: post.id, user_id: me, emoji }]);
    if (mine) await supabase.from("stock_post_reactions").delete().match({ post_id: post.id, user_id: me, emoji });
    else await supabase.from("stock_post_reactions").insert({ post_id: post.id, user_id: me, emoji });
  };
  const removePost = async (post) => { await supabase.from("stock_posts").delete().eq("id", post.id); await load(); };

  const tops = (posts || []).filter((p) => !p.parent_id);
  const shownTops = showAll ? tops : tops.slice(-6);
  const repliesOf = (id) => (posts || []).filter((p) => p.parent_id === id);

  const renderPost = (p, isReply) => {
    const mine = p.user_id === me;
    const rs = reactions.filter((r) => r.post_id === p.id);
    const v = posterVotes[p.user_id];
    return (
      <div key={p.id} className={isReply ? "ml-7 mt-2" : "pt-3 first:pt-0"}>
        <div className="flex items-center gap-2 mb-1">
          {isReply && <CornerDownRight size={11} className="text-slate-300" />}
          <Avatar name={uname(p.user_id)} size={22} />
          <span className={`text-xs font-bold ${mine ? "text-emerald-700" : "text-slate-700"}`}>@{uname(p.user_id)}</span>
          {friendIds.includes(p.user_id) && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">friend</span>}
          {v && <VoteChip vote={v} />}
          <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(p.created_at)}</span>
          {mine && <button onClick={() => removePost(p)} className="text-[10px] text-slate-300 hover:text-rose-400">delete</button>}
        </div>
        <div className="text-[14px] text-slate-700 leading-relaxed"><PostBody text={p.body} onTicker={onOpenTicker || (() => {})} /></div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {REACTIONS.map((e) => {
            const n = rs.filter((r) => r.emoji === e).length; const meR = rs.some((r) => r.emoji === e && r.user_id === me);
            if (isReply && n === 0) return null;
            return (
              <button key={e} onClick={() => react(p, e)}
                className={`text-[11px] px-1.5 py-0.5 rounded-full border ${meR ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-white border-slate-100 text-slate-500"} ${n === 0 ? "opacity-50" : ""}`}>
                {e}{n > 0 ? ` ${n}` : ""}
              </button>
            );
          })}
          {!isReply && <button onClick={() => setReplyTo(p)} className="text-[11px] font-semibold text-slate-400 px-1.5 py-0.5 ml-1">Reply</button>}
        </div>
        {!isReply && repliesOf(p.id).map((r) => renderPost(r, true))}
      </div>
    );
  };

  if (!ticker) return null;
  return (
    <div className="mt-4 space-y-4">
      <SentimentCard ticker={ticker} name={name} price={price} currency={currency} communities={communities} onOpenTicker={onOpenTicker} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-400">DISCUSSION{tops.length ? ` · ${tops.length}` : ""}</h4>
          {tops.length > 6 && !showAll && <button onClick={() => setShowAll(true)} className="text-[11px] font-semibold text-emerald-700">Show all</button>}
        </div>
        {posts === null ? (
          <div className="space-y-2"><div className="skel h-4 w-2/3" /><div className="skel h-4 w-1/2" /></div>
        ) : tops.length === 0 ? (
          <p className="text-sm text-slate-400">No one has posted about {ticker} yet. Why did you vote the way you did?</p>
        ) : (
          <div className="divide-y divide-slate-100">{shownTops.map((p) => renderPost(p, false))}</div>
        )}
        {replyTo && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 rounded-xl px-2.5 py-1.5 mt-3">
            <span className="truncate">Replying to <b>@{uname(replyTo.user_id)}</b>: {replyTo.body}</span>
            <button onClick={() => setReplyTo(null)} className="ml-2 text-slate-400"><X size={12} /></button>
          </div>
        )}
        <div className="flex items-end gap-2 mt-3">
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={replyTo ? "Write a reply…" : `Your take on ${ticker}… use $TICKER to tag others`}
            className="flex-1 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-[14px] resize-none max-h-32" />
          <button onClick={send} disabled={sending || !text.trim()}
            className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 disabled:opacity-40">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Profiles: a person's calls with the stock's return since ---------- */
export function CallsList({ userId, calls: given = null, limit = 8, title = "CALLS", onOpenTicker, emptyText = "No Buy/Hold/Sell calls yet." }) {
  const [rows, setRows] = useState(given);
  useEffect(() => {
    if (given) { setRows(given); return; }
    if (!userId) return;
    let dead = false;
    withTimeout(supabase.from("stock_calls").select("id, ticker, vote, reason, price_at, currency, created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(200))
      .then(({ data }) => { if (!dead) setRows(activeCalls(data || [], (r) => r.ticker)); });
    return () => { dead = true; };
  }, [userId, given]);
  const since = useReturnsSince(rows || []);
  if (rows === null) return <div className="skel h-4 w-1/2" />;
  if (!rows.length) return <p className="text-sm text-slate-400">{emptyText}</p>;
  const shown = rows.slice(0, limit);
  const graded = rows.map((c) => ({ c, r: since(c) })).filter((x) => x.r != null);
  const right = graded.filter((x) => (x.c.vote === "buy" && x.r > 0) || (x.c.vote === "sell" && x.r < 0)).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-semibold text-slate-400">{title} · {rows.length}</h4>
        {graded.length >= 3 && <span className="text-[10px] font-semibold text-slate-400 tabular-nums">{right}/{graded.length} calls in the right direction</span>}
      </div>
      <div className="divide-y divide-slate-100">
        {shown.map((c) => {
          const r = since(c);
          return (
            <div key={c.id || c.ticker} className="py-2 flex items-center gap-2.5">
              <VoteChip vote={c.vote} />
              <button onClick={() => onOpenTicker && onOpenTicker(c.ticker)} className="font-bold text-slate-800 text-sm">{c.ticker}</button>
              <span className="text-[11px] text-slate-400 truncate flex-1">{c.reason ? `“${c.reason}”` : timeAgo(c.created_at)}</span>
              <div className="text-right shrink-0">
                {r != null ? <Ret v={r} className="text-sm font-bold block" /> : <span className="text-slate-300 text-sm">—</span>}
                <div className="text-[10px] text-slate-400">since {fmtDate(c.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

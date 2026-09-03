/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { Activity, ChevronRight, Trophy, Vote, X } from "lucide-react";
import { PositionShareCard, SharePositionPicker } from "./communities.jsx";
import { MIN_SAMPLE, SentimentMini, VOTE_META, VOTE_ORDER, activeCalls } from "./sentiment.jsx";
import { REACTIONS, SOCIAL_ME, eventText, mutualIdsCached, useNames } from "./social.jsx";
import { fxConvert, money, pct, pctOf, timeAgo, withTimeout } from "../lib/format.js";
import { byValueDesc, holdingValue } from "../lib/portfolio.js";
import { Avatar, Logo, Ret, Skeleton } from "../ui/primitives.jsx";

/* ---------- Home feed: friends, communities, sentiment, rankings — one stream ---------- */
export const FEED_CACHE = { at: 0, user: null, items: null, trending: [], top: null, scope: "friends", groupNames: {} };

export function HomeFeed({ user, onOpenTicker, goFriends, goCommunities, rankMove = null, boardRanks = null }) {
  const fresh = FEED_CACHE.user === user.id && Date.now() - FEED_CACHE.at < 60000;
  const [items, setItems] = useState(fresh ? FEED_CACHE.items : null);
  const [trending, setTrending] = useState(fresh ? FEED_CACHE.trending : []);
  const [top, setTop] = useState(fresh ? FEED_CACHE.top : null);
  const [scope, setScope] = useState(fresh ? FEED_CACHE.scope : "friends"); // friends | community (when no friends yet)
  const [groupNames, setGroupNames] = useState(fresh ? FEED_CACHE.groupNames : {});
  const [loadErr, setLoadErr] = useState(false);
  useEffect(() => {
    if (fresh) return;
    let dead = false;
    const guard = setTimeout(() => { if (!dead) { setItems((i) => (i === null ? [] : i)); setLoadErr(true); } }, 12000);
    (async () => { try {
      const ids = await withTimeout(mutualIdsCached(user.id), 8000, []);
      const sinceIso = new Date(Date.now() - 14 * 86400000).toISOString();
      const who = ids.length ? ids : null;
      if (!who) setScope("community");
      const q = (t, sel) => {
        let b = supabase.from(t).select(sel).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(80);
        if (who) b = b.in("user_id", who); else b = b.neq("user_id", user.id);
        return b;
      };
      const [{ data: ev }, { data: cs }, { data: ps }, { data: gp }, { data: gs }, { data: ts }] = await Promise.all([
        who ? q("portfolio_events", "id, user_id, kind, ticker, from_pct, to_pct, created_at") : Promise.resolve({ data: [] }),
        q("stock_calls", "id, user_id, ticker, vote, reason, created_at, reaffirmed"),
        q("stock_posts", "id, user_id, ticker, body, parent_id, created_at"),
        // my communities' posts (RLS = member only): polls, calls, shares and plain posts
        supabase.from("group_posts").select("id, group_id, user_id, body, card, position, tickers, created_at").is("parent_id", null).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(40),
        supabase.rpc("my_communities"),
        supabase.rpc("top_sentiment", { lim: 5 }),
      ]);
      if (dead) return;
      const gn = {}; (Array.isArray(gs) ? gs : []).forEach((g) => { gn[g.id] = g.name; }); setGroupNames(gn);
      const gpMine = (gp || []).filter((p) => gn[p.group_id]);   // public communities I haven't joined stay out of my feed
      setTop(Array.isArray(ts) ? ts : []);
      /* Friends' leaderboard moves (from the last two rankings we saw). */
      const rankItems = [];
      if (boardRanks && boardRanks.cur && boardRanks.prev && boardRanks.at) {
        Object.keys(boardRanks.cur).forEach((id) => {
          const to = boardRanks.cur[id], from = boardRanks.prev[id];
          if (id !== user.id && from && to && from !== to) rankItems.push({ t: "rank", id: "r" + id, user_id: id, ticker: null, created_at: boardRanks.at, from, to });
        });
      }
      /* Never a dead feed: when friends are quiet, blend in what's happening on RichR. */
      let extra = [];
      const friendCount = (ev || []).length + (cs || []).length + (ps || []).length + gpMine.length;
      if (who && friendCount < 6) {
        const g = (t, sel) => supabase.from(t).select(sel).gte("created_at", sinceIso).neq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
        const [{ data: gcs }, { data: gps }] = await Promise.all([
          g("stock_calls", "id, user_id, ticker, vote, reason, created_at, reaffirmed"),
          g("stock_posts", "id, user_id, ticker, body, parent_id, created_at"),
        ]);
        if (dead) return;
        const notFriend = (x) => !who.includes(x.user_id);
        extra = [
          ...activeCalls((gcs || []).filter((c) => !c.reaffirmed && notFriend(c))).map((c) => ({ t: "call", id: "gc" + c.id, user_id: c.user_id, ticker: c.ticker, created_at: c.created_at, c, global: true })),
          ...(gps || []).filter((p) => !p.parent_id && notFriend(p)).map((p) => ({ t: "post", id: "gp" + p.id, user_id: p.user_id, ticker: p.ticker, created_at: p.created_at, p, global: true })),
        ];
      }
      const all = [
        ...rankItems,
        ...extra,
        ...(ev || []).map((e) => ({ t: "event", id: "e" + e.id, user_id: e.user_id, ticker: e.ticker, created_at: e.created_at, e })),
        ...activeCalls((cs || []).filter((c) => !c.reaffirmed)).map((c) => ({ t: "call", id: "c" + c.id, user_id: c.user_id, ticker: c.ticker, created_at: c.created_at, c })),
        ...(ps || []).filter((p) => !p.parent_id).map((p) => ({ t: "post", id: "p" + p.id, user_id: p.user_id, ticker: p.ticker, created_at: p.created_at, p })),
        ...gpMine.map((g) => ({ t: "group", id: "g" + g.id, user_id: g.user_id, ticker: (g.card && g.card.ticker) || (g.position && g.position.ticker) || (g.tickers && g.tickers[0]) || null, created_at: g.created_at, g })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(all.slice(0, 30));
      const weekAgo = Date.now() - 7 * 86400000;
      const cnt = {};
      all.filter((x) => x.ticker && new Date(x.created_at).getTime() > weekAgo).forEach((x) => { cnt[x.ticker] = (cnt[x.ticker] || 0) + 1; });
      const tr = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6);
      setTrending(tr);
      setLoadErr(false);
      Object.assign(FEED_CACHE, { at: Date.now(), user: user.id, items: all.slice(0, 30), trending: tr, top: Array.isArray(ts) ? ts : [], scope: who ? "friends" : "community", groupNames: gn });
    } catch (e) { if (!dead) { setItems([]); setLoadErr(true); } } finally { clearTimeout(guard); } })();
    return () => { dead = true; clearTimeout(guard); };
  }, [user.id]);
  const names = useNames((items || []).map((x) => x.user_id));
  const [showAll, setShowAll] = useState(false);
  const me = user.id;
  const who = (id) => (id === me ? "You" : "@" + (names[id] || "…"));

  if (items === null) return <Skeleton lines={4} />;

  const line = (x) => {
    if (x.t === "rank") return <>moved <b>#{x.from} → #{x.to}</b> on your leaderboard{x.to < x.from ? " ↑" : " ↓"}</>;
    if (x.t === "event") return <>{eventText(x.e)}</>;
    if (x.t === "call") return <>{VOTE_META[x.c.vote].dot} rated <b>{x.c.ticker}</b> a <b>{VOTE_META[x.c.vote].label}</b>{x.c.reason ? <span className="text-slate-500"> — “{x.c.reason}”</span> : ""}</>;
    if (x.t === "post") return <>on <b>{x.p.ticker}</b>: <span className="text-slate-600">{x.p.body.length > 160 ? x.p.body.slice(0, 160) + "…" : x.p.body}</span></>;
    const g = x.g, c = g.card;
    const where = groupNames[g.group_id] ? <span className="text-slate-400"> in {groupNames[g.group_id]}</span> : null;
    if (c && c.kind === "poll") return <>asked <b>what's your call on {c.ticker}?</b>{where}</>;
    if (c && c.kind === "vote") return <>shared their call {VOTE_META[c.vote].dot} <b>{VOTE_META[c.vote].label} on {c.ticker}</b>{where}{c.reason ? <span className="text-slate-500"> — “{c.reason}”</span> : ""}</>;
    if (c && c.kind === "performance") return <>shared their performance{where}: <b><Ret v={c.ret} /></b>{c.score != null ? <> · Score {c.score}</> : ""}</>;
    if (c && c.kind === "stock") return <>shared <b>{c.ticker}</b>{where}</>;
    if (g.position) return <>shared their <b>{g.position.ticker}</b> position{where}{g.position.thesis ? <span className="text-slate-500 italic"> — “{g.position.thesis.slice(0, 120)}”</span> : ""}</>;
    return <>{where ? <>posted{where}: </> : "posted: "}<span className="text-slate-600">{(g.body || "").length > 160 ? g.body.slice(0, 160) + "…" : g.body}</span></>;
  };
  const shown = showAll ? items : items.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* rank movement — reputation is performance */}
      {rankMove && (
        <button onClick={goFriends} className="w-full text-left flex items-center gap-3 bg-slate-900 text-white rounded-2xl px-4 py-3">
          <Trophy size={16} className="text-amber-300 shrink-0" />
          <span className="flex-1 text-sm"><b>You moved #{rankMove.from} → #{rankMove.to}</b> among friends{rankMove.up ? " — nice." : "."}</span>
          <ChevronRight size={16} className="text-slate-500" />
        </button>
      )}

      {/* RichR Sentiment — the app-wide pulse, horizontally */}
      {top && top.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold tracking-wide text-slate-400">RICHR SENTIMENT · MOST VOTED</span>
            <span className="text-[10px] text-slate-400">one person, one vote</span>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: "none" }}>
            {top.map((r) => {
              const total = Number(r.total); const small = total < MIN_SAMPLE;
              const lead = VOTE_ORDER.slice().sort((a, b) => Number(r[b]) - Number(r[a]))[0];
              return (
                <button key={r.ticker} onClick={() => onOpenTicker(r.ticker)} className="shrink-0 w-44 bg-white border border-slate-200 rounded-2xl p-3 text-left active:bg-slate-50">
                  <div className="flex items-center gap-2"><Logo h={{ ticker: r.ticker }} size={26} rounded="rounded-lg" /><span className="font-bold text-slate-900 text-sm">{r.ticker}</span></div>
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                    {!small && VOTE_ORDER.map((k) => Number(r[k]) > 0 && <div key={k} className={`${VOTE_META[k].bar} h-full`} style={{ width: `${(Number(r[k]) / total) * 100}%` }} />)}
                  </div>
                  <div className="mt-1.5 text-[11px] tabular-nums">
                    {small ? <span className="text-slate-500">{total} vote{total === 1 ? "" : "s"} · vote to reveal</span>
                      : <><b className={VOTE_META[lead].text}>{pctOf(Number(r[lead]), total)}% {VOTE_META[lead].label}</b><span className="text-slate-400"> · {total.toLocaleString()} votes</span></>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* trending among friends / on RichR */}
      {trending.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 mr-1">TRENDING{scope === "community" ? " ON RICHR" : " AMONG FRIENDS"}</span>
          {trending.map(([t, n]) => (
            <button key={t} onClick={() => onOpenTicker && onOpenTicker(t)} className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-full hover:border-slate-300">
              {t} <span className="text-slate-400 font-medium">{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* the stream */}
      {loadErr && items.length === 0 ? (
        <div className="card text-sm text-slate-500">Couldn't reach RichR right now — check your connection. <button onClick={() => window.location.reload()} className="font-semibold text-emerald-700">Retry</button></div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="text-sm font-semibold text-slate-800">Be the first to say something</div>
          <p className="text-sm text-slate-500 mt-1">Vote Buy / Hold / Sell on a stock you own, post a take, or ask your community a question — it'll show up here for everyone who follows you.</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => onOpenTicker && top && top[0] ? onOpenTicker(top[0].ticker) : goFriends()} className="btn-primary text-xs h-9">Vote on a stock</button>
            <button onClick={goFriends} className="btn-secondary text-xs h-9">Add friends</button>
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 py-1">
          {shown.map((x) => {
            const poll = x.t === "group" && x.g.card && x.g.card.kind === "poll";
            return (
              <div key={x.id} className="py-3 flex items-start gap-2.5">
                <Avatar name={x.user_id === me ? (SOCIAL_ME.username || "you") : (names[x.user_id] || "?")} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-700 leading-snug"><span className="font-bold text-slate-900">{who(x.user_id)}</span> {line(x)}{x.global && <span className="ml-1.5 text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full align-middle">RichR</span>}</div>
                  {poll && <div className="mt-2 bg-slate-50 rounded-xl p-3"><SentimentMini ticker={x.g.card.ticker} name={x.g.card.name} onOpenTicker={onOpenTicker} headline={false} /></div>}
                  {x.t === "group" && x.g.body && x.g.card && <div className="text-[13px] text-slate-600 mt-1">“{x.g.body}”</div>}
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                    <span>{timeAgo(x.created_at)}</span>
                    {x.ticker && <button onClick={() => onOpenTicker && onOpenTicker(x.ticker)} className="font-semibold text-emerald-700">open {x.ticker}</button>}
                    {x.t === "group" && goCommunities && <button onClick={goCommunities} className="font-semibold text-slate-500">reply in community</button>}
                    {x.t === "rank" && <button onClick={goFriends} className="font-semibold text-slate-500">leaderboard</button>}
                  </div>
                </div>
              </div>
            );
          })}
          {items.length > 10 && !showAll && <button onClick={() => setShowAll(true)} className="text-xs font-semibold text-emerald-700 py-2">Show more</button>}
        </div>
      )}
      {scope === "community" && items.length > 0 && (
        <p className="text-[11px] text-slate-400">Showing RichR-wide activity until you have mutual friends. <button onClick={goFriends} className="font-semibold text-emerald-700">Add friends →</button></p>
      )}
    </div>
  );
}

/* ---------- Chat cards: share a stock, position, performance or vote ---------- */
export function ChatCard({ card, onTicker }) {
  if (!card) return null;
  if (card.kind === "position") return <PositionShareCard pos={card} onTicker={onTicker} />;
  if (card.kind === "stock") {
    return (
      <button onClick={() => onTicker(card.ticker)} className="w-full text-left bg-white border border-slate-200 rounded-xl p-3 mb-2 active:bg-slate-50">
        <div className="text-[10px] font-bold text-slate-400 tracking-wide">STOCK</div>
        <div className="font-bold text-slate-800">{card.ticker} <span className="font-medium text-slate-400 text-sm">{card.name || ""}</span></div>
        {card.price > 0 && <div className="text-xs text-slate-500 tabular-nums mt-0.5">{money(card.price, card.currency || "USD")}{card.pct != null && <> · <Ret v={card.pct} /></>}</div>}
        <div className="text-[11px] text-emerald-700 font-semibold mt-1">Open → see what people think</div>
      </button>
    );
  }
  if (card.kind === "poll") {
    const m = card.vote ? VOTE_META[card.vote] : null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-2">
        <div className="text-[10px] font-bold text-slate-400 tracking-wide flex items-center gap-1 mb-1"><Vote size={11} /> POLL · What's your call on {card.ticker}?</div>
        <SentimentMini ticker={card.ticker} name={card.name} onOpenTicker={onTicker} />
        {m && <div className="text-[11px] text-slate-500 mt-2">Poster's call: <b className={m.text}>{m.dot} {m.label}</b>{card.reason ? <span className="italic"> — “{card.reason}”</span> : ""}</div>}
        <button onClick={() => onTicker(card.ticker)} className="text-[11px] text-emerald-700 font-semibold mt-1.5">Open {card.ticker} → full sentiment & discussion</button>
      </div>
    );
  }
  if (card.kind === "vote") {
    const m = VOTE_META[card.vote] || VOTE_META.hold;
    return (
      <button onClick={() => onTicker(card.ticker)} className={`w-full text-left border rounded-xl p-3 mb-2 ${m.chip}`}>
        <div className="text-[10px] font-bold tracking-wide opacity-70">MY CALL</div>
        <div className="font-bold text-slate-800 text-[15px]">{m.dot} {m.label} · {card.ticker}</div>
        {card.reason && <p className="text-[13px] text-slate-700 italic mt-1 leading-snug">“{card.reason}”</p>}
      </button>
    );
  }
  if (card.kind === "performance") {
    return (
      <div className="bg-slate-900 text-white rounded-xl p-3 mb-2">
        <div className="text-[10px] font-bold text-slate-400 tracking-wide">PERFORMANCE · {card.name || "Portfolio"}</div>
        <div className="flex items-end gap-4 mt-1">
          <div><div className={`text-2xl font-extrabold tabular-nums ${(card.ret || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{card.ret != null ? pct(card.ret) : "—"}</div><div className="text-[10px] text-slate-400">{card.label || "return"}</div></div>
          {card.score != null && <div><div className="text-lg font-bold tabular-nums">{card.score}</div><div className="text-[10px] text-slate-400">RichR Score</div></div>}
          {card.rank != null && <div><div className="text-lg font-bold tabular-nums">#{card.rank}</div><div className="text-[10px] text-slate-400">among friends</div></div>}
        </div>
        {Array.isArray(card.top) && card.top.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">{card.top.map((h) => <span key={h.ticker} className="text-[10px] font-semibold bg-white/10 px-1.5 py-0.5 rounded-md">{h.ticker} {h.pct}%</span>)}</div>
        )}
      </div>
    );
  }
  return null;
}

/* Composer attachment picker: what to drop into the conversation. */
export function CardPicker({ holdings, cur, fx, data, active, onPick, onClose }) {
  const [kind, setKind] = useState("stock");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [vote, setVote] = useState("buy");
  const [reason, setReason] = useState("");
  const timer = useRef(null);
  const search = (raw) => {
    setQ(raw);
    if (timer.current) clearTimeout(timer.current);
    const term = raw.trim();
    if (term.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const { data: d, error } = await supabase.functions.invoke("search-symbols", { body: { q: term } });
        setResults(!error && d && Array.isArray(d.results) ? d.results.slice(0, 5) : []);
      } catch (e) { setResults([]); }
    }, 300);
  };
  const perf = (() => {
    const hs = (holdings || []).filter((h) => !h.sample);
    let v = 0, c = 0;
    hs.forEach((h) => { const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice; v += fxConvert(h.shares * cp, h.currency || cur, cur, fx); c += fxConvert(h.shares * h.buyPrice, h.currency || cur, cur, fx); });
    const total = v;
    const top = byValueDesc(hs, cur, fx).slice(0, 3).map((h) => ({ ticker: h.ticker, pct: total > 0 ? Math.round((holdingValue(h, cur, fx) / total) * 100) : 0 }));
    const log = (data && data.scoreLog) || [];
    const score = log.length ? log[log.length - 1].s ?? log[log.length - 1].score ?? null : null;
    const rl = (data && data.rankLog) || [];
    const rank = rl.length ? rl[rl.length - 1].rank : null;
    return { kind: "performance", name: active ? active.name : "Portfolio", ret: c > 0 ? ((v - c) / c) * 100 : null, label: "unrealised return", score, rank, top };
  })();
  return (
    <div className="bg-slate-50 rounded-2xl p-2 mb-2">
      <div className="flex items-center gap-1 mb-2">
        {[["stock", "Stock"], ["position", "Position"], ["vote", "My call"], ["performance", "Performance"]].map(([id, l]) => (
          <button key={id} onClick={() => setKind(id)} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg ${kind === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
        ))}
        <button onClick={onClose} className="ml-auto text-slate-400 p-1"><X size={14} /></button>
      </div>
      {kind === "position" && (
        <SharePositionPicker holdings={holdings} cur={cur} fx={fx} onPick={(pos) => onPick({ ...pos, kind: "position" })} onClose={onClose} />
      )}
      {(kind === "stock" || kind === "vote") && (
        <div>
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Ticker or company…" className="w-full border border-slate-200 rounded-xl px-3 h-9 text-sm bg-white uppercase placeholder:normal-case" autoFocus />
          {results.length > 0 && (
            <div className="mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {results.map((r) => (
                <button key={r.symbol} onClick={() => {
                  if (kind === "stock") onPick({ kind: "stock", ticker: String(r.symbol).toUpperCase(), name: r.name || "", currency: r.currency || null });
                  else { setQ(String(r.symbol).toUpperCase()); setResults([]); }
                }} className="w-full text-left px-3 py-2 text-sm border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <b>{r.symbol}</b> <span className="text-slate-400 text-xs">{r.name}</span>
                </button>
              ))}
            </div>
          )}
          {kind === "vote" && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {VOTE_ORDER.map((k) => (
                  <button key={k} onClick={() => setVote(k)} className={`h-9 rounded-xl text-sm font-bold border ${vote === k ? VOTE_META[k].solid + " border-transparent" : "bg-white border-slate-200 text-slate-700"}`}>{VOTE_META[k].dot} {VOTE_META[k].label}</button>
                ))}
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 140))} placeholder="Why? (optional)" className="w-full border border-slate-200 rounded-xl px-3 h-9 text-sm bg-white" />
              <button disabled={!q.trim()} onClick={() => onPick({ kind: "vote", ticker: q.trim().toUpperCase().split(/[\s]/)[0], vote, reason: reason.trim() || null })}
                className="btn-primary w-full disabled:opacity-50">Share call{q.trim() ? ` on ${q.trim().toUpperCase()}` : ""}</button>
              <p className="text-[10px] text-slate-400">Also records your vote on the stock page.</p>
            </div>
          )}
        </div>
      )}
      {kind === "performance" && (
        <div>
          <ChatCard card={perf} onTicker={() => {}} />
          <button onClick={() => onPick(perf)} className="btn-primary w-full">Share performance card</button>
          <p className="text-[10px] text-slate-400 mt-1">Percentages only — never amounts.</p>
        </div>
      )}
    </div>
  );
}

/* ================= ACTIVITY FEED ================= */
export function ActivityFeed({ user, friends, names, myName, onOpenProfile, board, onOpenTicker }) {
  const [events, setEvents] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [reactions, setReactions] = useState([]); // {event_id,user_id,emoji}
  const [comments, setComments] = useState([]);   // {id,event_id,user_id,body,created_at}
  const [openComments, setOpenComments] = useState({}); // event id -> bool
  const [draft, setDraft] = useState({});
  const load = async () => {
    try {
      const { data: rows, error } = await supabase
        .from("portfolio_events").select("id, user_id, kind, ticker, from_pct, to_pct, created_at")
        .order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      const ids = (rows || []).map((r) => r.id);
      let rs = [], cs = [];
      if (ids.length) {
        const [{ data: r1 }, { data: c1 }] = await Promise.all([
          supabase.from("event_reactions").select("event_id, user_id, emoji").in("event_id", ids),
          supabase.from("event_comments").select("id, event_id, user_id, body, created_at").in("event_id", ids).order("created_at", { ascending: true }),
        ]);
        rs = r1 || []; cs = c1 || [];
      }
      setEvents(rows || []); setReactions(rs); setComments(cs);
    } catch (e) { setEvents([]); }
  };
  useEffect(() => { load(); }, [user.id, (friends || []).length]);

  const react = async (ev, emoji) => {
    const mine = reactions.find((r) => r.event_id === ev.id && r.user_id === user.id && r.emoji === emoji);
    setReactions((rs) => mine ? rs.filter((r) => r !== mine) : [...rs, { event_id: ev.id, user_id: user.id, emoji }]);
    if (mine) await supabase.from("event_reactions").delete().match({ event_id: ev.id, user_id: user.id, emoji });
    else await supabase.from("event_reactions").insert({ event_id: ev.id, user_id: user.id, emoji });
  };
  const comment = async (ev) => {
    const body = (draft[ev.id] || "").trim().slice(0, 500);
    if (!body) return;
    const { error } = await supabase.from("event_comments").insert({ event_id: ev.id, user_id: user.id, body });
    if (error) return;
    setDraft((d) => ({ ...d, [ev.id]: "" }));
    await load();
  };

  /* "3 of your friends own NVDA" — from mutual friends' shared top holdings. */
  const popular = (() => {
    const rows = (board || []).filter((b) => b.userId !== user.id && Array.isArray(b.topHoldings));
    const count = {};
    rows.forEach((b) => b.topHoldings.forEach((h) => { count[h.ticker] = (count[h.ticker] || 0) + 1; }));
    return Object.entries(count).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6);
  })();

  if (events === null) return null;
  const text = eventText;
  const shown = showAll ? events : events.slice(0, 8);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-1">
        <Activity size={16} className="text-emerald-500" /> Activity
      </h3>
      {popular.length > 0 && (
        <div className="bg-slate-50 rounded-2xl p-3 mb-2">
          <div className="text-[10px] font-bold text-slate-400 mb-1">POPULAR AMONG YOUR FRIENDS</div>
          <div className="flex flex-wrap gap-1.5">
            {popular.map(([t, n]) => (
              <button key={t} onClick={() => onOpenTicker && onOpenTicker(t)}
                className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded-full">
                {n} of your friends own <b>{t}</b>
              </button>
            ))}
          </div>
        </div>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing yet. When you or a friend changes a shared portfolio, it shows up here — as percentages, never amounts.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {shown.map((e) => {
            const me = e.user_id === user.id;
            const who = me ? "You" : `@${names[e.user_id] || "friend"}`;
            const rs = reactions.filter((r) => r.event_id === e.id);
            const cs = comments.filter((c) => c.event_id === e.id);
            const open = !!openComments[e.id];
            return (
              <div key={e.id} className="py-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0 text-sm text-slate-600">
                    <button onClick={() => !me && onOpenProfile(e.user_id, names[e.user_id])} className={`font-semibold ${me ? "text-slate-700" : "text-emerald-700"}`}>{who}</button>{" "}
                    {text(e)}
                  </div>
                  <div className="text-[10px] text-slate-400 shrink-0 mt-0.5">{timeAgo(e.created_at)}</div>
                </div>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {REACTIONS.map((em) => {
                    const n = rs.filter((r) => r.emoji === em).length;
                    const mine = rs.some((r) => r.emoji === em && r.user_id === user.id);
                    return (
                      <button key={em} onClick={() => react(e, em)}
                        className={`text-[11px] px-1.5 py-0.5 rounded-full border ${mine ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-100 text-slate-500"} ${n === 0 ? "opacity-50" : ""}`}>
                        {em}{n > 0 ? ` ${n}` : ""}
                      </button>
                    );
                  })}
                  <button onClick={() => setOpenComments((o) => ({ ...o, [e.id]: !open }))}
                    className="text-[11px] font-semibold text-slate-400 px-1.5 py-0.5 ml-1">
                    {cs.length ? `${cs.length} comment${cs.length === 1 ? "" : "s"}` : "Comment"}
                  </button>
                </div>
                {open && (
                  <div className="mt-2 ml-2 pl-3 border-l-2 border-slate-100 space-y-1.5">
                    {cs.map((c) => (
                      <div key={c.id} className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">@{c.user_id === user.id ? (myName || "you") : (names[c.user_id] || "friend")}</span>{" "}
                        <span className="whitespace-pre-wrap break-words">{c.body}</span>
                        <span className="text-slate-300 ml-1">{timeAgo(c.created_at)}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <input value={draft[e.id] || ""} onChange={(ev) => setDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                        onKeyDown={(ev) => { if (ev.key === "Enter") comment(e); }}
                        placeholder="Write a comment…" className="flex-1 min-w-0 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs" />
                      <button onClick={() => comment(e)} disabled={!(draft[e.id] || "").trim()}
                        className="text-xs font-semibold text-emerald-600 disabled:opacity-40">Post</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {events.length > 8 && (
        <button onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-emerald-600 mt-2">{showAll ? "Show less" : `Show all ${events.length}`}</button>
      )}
    </div>
  );
}

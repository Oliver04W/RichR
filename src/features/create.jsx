/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { ArrowLeftRight, ChevronRight, PenLine, Plus, Vote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useMyCommunities } from "./communities.jsx";
import { VOTE_META, VOTE_ORDER, castVote } from "./sentiment.jsx";
import { extractTickers, money, sym } from "../lib/format.js";
import { byValueDesc } from "../lib/portfolio.js";
import { BottomSheet, Logo } from "../ui/primitives.jsx";

export const CREATE_ACTIONS = [
  { id: "post", label: "Create Post", sub: "Share a take with a community or on a stock", icon: PenLine, tone: "bg-emerald-600 text-white", primary: true },
  { id: "poll", label: "Buy / Hold / Sell Poll", sub: "Ask what people think of a stock", icon: Vote, tone: "bg-slate-900 text-white", primary: true },
  { id: "position", label: "Add Position", sub: "A stock you hold — shares and price", icon: Plus, tone: "bg-slate-100 text-slate-700" },
  { id: "transaction", label: "Add Transaction", sub: "Bought more or sold some of a position", icon: ArrowLeftRight, tone: "bg-slate-100 text-slate-700" },
];

export function CreateMenu({ onPick, onClose }) {
  return (
    <BottomSheet title="Create" onClose={onClose}>
      <div className="px-3 pb-4">
        {CREATE_ACTIONS.map((a, i) => (
          <button key={a.id} onClick={() => onPick(a.id)}
            className={`w-full flex items-center gap-3.5 px-2.5 py-3 rounded-2xl text-left active:bg-slate-50 transition ${i === 2 ? "mt-2 border-t border-slate-100 pt-4 rounded-t-none" : ""}`}>
            <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${a.tone}`}><a.icon size={a.primary ? 20 : 18} /></span>
            <span className="flex-1 min-w-0">
              <span className={`block text-slate-900 ${a.primary ? "text-[16px] font-bold" : "text-[15px] font-semibold"}`}>{a.label}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{a.sub}</span>
            </span>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export function CreatePostSheet({ mode, user, cur, fx, holdings, richrData, active, onClose, onBack, onDone, onOpenTicker }) {
  const poll = mode === "poll";
  const communities = useMyCommunities(user.id);
  const [dest, setDest] = useState(null);          // {kind:'community', id, name} | {kind:'stock'}
  const [text, setText] = useState("");
  const [q, setQ] = useState(""); const [results, setResults] = useState([]); const [stock, setStock] = useState(null);
  const [vote, setVote] = useState(null); const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const timer = useRef(null);
  useEffect(() => { if (communities && communities.length && !dest) setDest({ kind: "community", id: communities[0].id, name: communities[0].name }); if (communities && !communities.length && !dest) setDest({ kind: "stock" }); }, [communities]);
  const search = (raw) => {
    setQ(raw); setStock(null);
    if (timer.current) clearTimeout(timer.current);
    const term = raw.trim(); if (term.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try { const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q: term } });
        const seen = new Set(); setResults(!error && data && Array.isArray(data.results) ? data.results.filter((r) => { const k = String(r.symbol).toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5) : []);
      } catch (e) { setResults([]); }
    }, 250);
  };
  const needStock = poll || (dest && dest.kind === "stock");
  const ticker = stock ? String(stock.symbol).toUpperCase() : "";
  const canSend = !busy && dest && (needStock ? !!ticker : true) && (poll ? true : text.trim().length > 0);
  const send = async () => {
    if (!canSend) return;
    setBusy(true); setErr("");
    try {
      if (poll) {
        // your own call is recorded (if you picked one) and the poll card goes to the community
        if (vote) await castVote(ticker, vote, { reason: reason.trim() || null });
        const card = { kind: "poll", ticker, name: stock.name || "", vote: vote || null, reason: reason.trim() || null };
        const body = text.trim() || `What's your call on $${ticker}?`;
        if (dest.kind === "community") {
          const { error } = await supabase.from("group_posts").insert({ group_id: dest.id, user_id: user.id, body, tickers: [ticker], card });
          if (error) throw error;
        } else {
          const { error } = await supabase.from("stock_posts").insert({ user_id: user.id, ticker, body: `${body}${vote ? ` My call: ${VOTE_META[vote].dot} ${VOTE_META[vote].label}${reason.trim() ? ` — ${reason.trim()}` : ""}` : ""}` });
          if (error) throw error;
        }
        onDone(dest.kind === "community" ? `Poll posted to ${dest.name}.` : `Poll posted on ${ticker}.`, ticker);
      } else {
        const body = text.trim().slice(0, 1000);
        if (dest.kind === "community") {
          const { error } = await supabase.from("group_posts").insert({ group_id: dest.id, user_id: user.id, body, tickers: extractTickers(body) });
          if (error) throw error;
          onDone(`Posted to ${dest.name}.`);
        } else {
          const { error } = await supabase.from("stock_posts").insert({ user_id: user.id, ticker, body });
          if (error) throw error;
          onDone(`Posted on ${ticker}.`, ticker);
        }
      }
    } catch (e) { setErr("Couldn't post — try again."); setBusy(false); }
  };
  const input = "w-full border border-slate-200 rounded-xl px-3.5 h-11 text-[15px] bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition";
  return (
    <BottomSheet title={poll ? "Buy / Hold / Sell poll" : "Create post"} onClose={onClose} back={onBack}>
      <div className="px-5 pb-5 space-y-4">
        {/* destination */}
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-1.5">Post to</div>
          {communities === null ? <div className="skel h-8 w-2/3" /> : (
            <div className="flex flex-wrap gap-1.5">
              {communities.map((c) => (
                <button key={c.id} onClick={() => setDest({ kind: "community", id: c.id, name: c.name })}
                  className={`text-xs font-semibold px-3 h-8 rounded-full border transition ${dest && dest.id === c.id ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700"}`}>{c.name}</button>
              ))}
              <button onClick={() => setDest({ kind: "stock" })}
                className={`text-xs font-semibold px-3 h-8 rounded-full border transition ${dest && dest.kind === "stock" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700"}`}>Stock discussion</button>
            </div>
          )}
          {communities && !communities.length && <p className="text-[11px] text-slate-400 mt-1.5">You're not in a community yet — this goes to the stock's public discussion.</p>}
        </div>

        {/* stock (poll always; post when destination is a stock) */}
        {needStock && (
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">{poll ? "Which stock?" : "Which stock's discussion?"}</div>
            {stock ? (
              <div className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2">
                <Logo h={{ ticker, name: stock.name }} size={30} rounded="rounded-lg" />
                <div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-900">{ticker}</div><div className="text-[11px] text-slate-500 truncate">{stock.name}</div></div>
                <button onClick={() => { setStock(null); setQ(""); }} className="text-xs font-semibold text-emerald-700">Change</button>
              </div>
            ) : (
              <div className="relative">
                <input value={q} onChange={(e) => search(e.target.value)} placeholder="Company or ticker" className={input + " uppercase placeholder:normal-case"} autoFocus={poll} />
                {holdings.length > 0 && !q && (
                  <div className="flex flex-wrap gap-1.5 mt-2">{byValueDesc(holdings.filter((h) => !h.sample), cur, fx).slice(0, 6).map((h) => (
                    <button key={h.id} onClick={() => setStock({ symbol: h.ticker, name: h.name })} className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">{h.ticker}</button>
                  ))}</div>
                )}
                {results.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {results.map((r) => (
                      <button key={r.symbol} onClick={() => { setStock(r); setResults([]); }} className="w-full text-left px-3 py-2 text-sm border-b border-slate-50 last:border-0 hover:bg-slate-50">
                        <b>{r.symbol}</b> <span className="text-slate-400 text-xs">{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* poll: your own call, optional */}
        {poll && (
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Your call <span className="font-normal text-slate-400">(optional)</span></div>
            <div className="grid grid-cols-3 gap-2">
              {VOTE_ORDER.map((k) => (
                <button key={k} onClick={() => setVote(vote === k ? null : k)}
                  className={`h-10 rounded-xl text-sm font-bold border transition ${vote === k ? VOTE_META[k].solid + " border-transparent" : "bg-white border-slate-200 text-slate-700"}`}>{VOTE_META[k].dot} {VOTE_META[k].label}</button>
              ))}
            </div>
            {vote && <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 140))} placeholder="Why? (optional, 140 chars)" className={input + " mt-2 h-10 text-sm"} />}
          </div>
        )}

        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={poll ? 2 : 4} autoFocus={!poll}
            placeholder={poll ? `What's your call on $${ticker || "…"}? (optional message)` : "What's on your mind? Tag tickers with $ — e.g. $NVDA"}
            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-[15px] bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-none leading-relaxed" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-slate-400">{poll ? "Members vote on the stock page; the tally shows in the community's Sentiment." : dest && dest.kind === "stock" ? "Visible to everyone on RichR." : "Visible to community members only."}</span>
            <span className="text-[11px] text-slate-300 tabular-nums">{text.length}/1000</span>
          </div>
        </div>
        {err && <p className="text-xs text-rose-500 font-medium">{err}</p>}
        <button onClick={send} disabled={!canSend} className="btn-primary w-full h-12 text-[15px] disabled:opacity-50">
          {busy ? "Posting…" : poll ? `Post poll${ticker ? ` on ${ticker}` : ""}` : "Post"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* Transaction: bought more of a position, or sold some/all of it. */
export function TransactionSheet({ holdings, cur, fx, onClose, onBack, onBuyMore, onSell, onDone }) {
  const [pick, setPick] = useState(null);   // holding
  const [kind, setKind] = useState("sell"); // buy | sell
  const [shares, setShares] = useState(""); const [price, setPrice] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const list = byValueDesc(holdings.filter((h) => !h.sample), cur, fx);
  const input = "w-full border border-slate-200 rounded-xl px-3.5 h-12 text-[18px] font-bold bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 tabular-nums";
  useEffect(() => { if (pick) { setPrice(pick.currentPrice > 0 ? pick.currentPrice : pick.buyPrice); setShares(""); } }, [pick && pick.id]);
  const n = Number(shares), p = Number(price);
  const all = pick && n >= Number(pick.shares) - 1e-9;
  const ok = pick && n > 0 && p > 0 && (kind === "buy" || n <= Number(pick.shares) + 1e-9);
  const confirm = () => {
    if (!ok) return;
    if (kind === "buy") { onBuyMore(pick, n, p, date); return; }
    onSell(pick, n, p, date);
    onDone(all ? `Sold all ${pick.ticker} — moved to closed trades.` : `Sold ${n} ${pick.ticker}.`);
  };
  return (
    <BottomSheet title="Add transaction" onClose={onClose} back={pick ? () => setPick(null) : onBack}>
      {!pick ? (
        <div className="px-3 pb-4">
          {list.length === 0 ? <p className="text-sm text-slate-400 px-2 py-6 text-center">No positions yet — add one first.</p> : (
            <>
              <div className="text-xs font-semibold text-slate-500 px-2 mb-1">Which position?</div>
              <div className="divide-y divide-slate-100">
                {list.map((h) => (
                  <button key={h.id} onClick={() => setPick(h)} className="w-full flex items-center gap-3 px-2 py-2.5 text-left active:bg-slate-50 rounded-xl">
                    <Logo h={h} size={36} rounded="rounded-lg" />
                    <div className="flex-1 min-w-0"><div className="font-bold text-slate-900 text-sm">{h.ticker}</div><div className="text-[11px] text-slate-500 truncate">{h.shares} shares · avg {money(h.buyPrice, h.currency || cur)}</div></div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="px-5 pb-5 space-y-4">
          <div className="flex items-center gap-2.5"><Logo h={pick} size={36} rounded="rounded-lg" /><div className="min-w-0"><div className="font-bold text-slate-900">{pick.ticker} <span className="font-medium text-slate-500 text-sm">{pick.name}</span></div><div className="text-[11px] text-slate-500 tabular-nums">You hold {pick.shares} · avg {money(pick.buyPrice, pick.currency || cur)}</div></div></div>
          <div className="bg-slate-100 rounded-xl p-1 flex">
            {[["buy", "Bought more"], ["sell", "Sold"]].map(([id, l]) => (
              <button key={id} onClick={() => setKind(id)} className={`flex-1 h-9 rounded-lg text-sm font-semibold transition ${kind === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Shares</label>
              <input type="text" inputMode="decimal" value={shares} onChange={(e) => setShares(e.target.value.replace(",", "."))} placeholder="0" autoFocus className={input} />
              {kind === "sell" && <button onClick={() => setShares(String(pick.shares))} className="text-[11px] font-semibold text-emerald-700 mt-1">Sell all {pick.shares}</button>}
              {kind === "sell" && n > Number(pick.shares) + 1e-9 && <p className="text-[11px] text-rose-500 mt-1">You only hold {pick.shares}.</p>}
            </div>
            <div><label className="block text-xs font-semibold text-slate-500 mb-1.5">Price per share ({sym(pick.currency || cur)})</label>
              <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(",", "."))} onFocus={(e) => e.target.select()} className={input} /></div>
          </div>
          <div className="flex items-center justify-between text-[13px] text-slate-600 tabular-nums">
            <span>{n > 0 && p > 0 ? <b className="text-slate-800">{n} × {money(p, pick.currency || cur)} = {money(n * p, pick.currency || cur)}</b> : <span className="text-slate-400">Enter shares to see the total.</span>}</span>
            <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="border border-slate-200 rounded-lg px-2 h-8 text-xs bg-white" />
          </div>
          {kind === "sell" && n > 0 && !all && <p className="text-[11px] text-slate-400">Partial sale: {Number(pick.shares) - n} shares stay open at the same average; the sold part becomes a closed trade.</p>}
          <button onClick={confirm} disabled={!ok} className="btn-primary w-full h-12 text-[15px] disabled:opacity-50">
            {kind === "buy" ? `Add ${n > 0 ? n + " " : ""}${pick.ticker}` : all && n > 0 ? `Sell all ${pick.ticker}` : `Record sale${n > 0 ? ` of ${n} ${pick.ticker}` : ""}`}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { BookOpen, Check, Plus, RefreshCw, Search, Sparkles, Star, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PositionModal } from "./holdings.jsx";
import { DiscoverSentiment, StockSocial } from "./sentiment.jsx";
import { DATE_LOCALE, daysHeld, money, pct, uid } from "../lib/format.js";
import { VERDICTS, byValueDesc } from "../lib/portfolio.js";
import { aiFetch, dataKey } from "../lib/storage.js";
import { Logo } from "../ui/primitives.jsx";

/* ================= THESES ================= */
export function ThesesTab({ active, cur, fx, onVerdict }) {
  if (!active.holdings.length)
    return (
      <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
        <BookOpen size={24} className="mx-auto text-slate-300 mb-3" />
        <p className="font-semibold text-slate-600 mb-1">No theses yet</p>
        <p className="text-sm text-slate-400">Add positions and write down your reasoning — then come back to grade your calls.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-slate-700">Your theses</h2>
        <p className="text-sm text-slate-400">Your reasoning next to what actually happened. Grade each call as it resolves.</p>
      </div>
      {byValueDesc(active.holdings, cur, fx).map((h) => {
        const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
        const plPct = h.buyPrice ? ((cp - h.buyPrice) / h.buyPrice) * 100 : 0;
        const up = plPct >= 0;
        return (
          <div key={h.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <Logo h={h} size={32} rounded="rounded-xl" />
                <div className="font-semibold text-slate-700 truncate">{h.name} <span className="text-slate-400 font-medium text-sm">· {h.ticker}</span></div>
              </div>
              <div className={`text-sm font-bold shrink-0 ${up ? "text-emerald-600" : "text-rose-500"}`}>{pct(plPct)}</div>
            </div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">{daysHeld(h.buyDate)} day{daysHeld(h.buyDate) === 1 ? "" : "s"} held</div>
            {h.thesis ? (
              <p className="text-[15px] text-slate-600 leading-relaxed mt-3 italic">“{h.thesis}”</p>
            ) : (
              <p className="text-sm text-slate-400 mt-3">No thesis written — edit this position to add one.</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-slate-100">
              {Object.entries(VERDICTS).map(([k, v]) => {
                const on = h.verdict === k;
                return (
                  <button key={k} onClick={() => onVerdict(h.id, k)}
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                      on ? v.chip + " border-transparent" : "bg-white text-slate-400 border-slate-200"}`}>
                    <v.icon size={12} /> {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= COMPANY INFO (Research) ================= */
/* "What it does" AI description for any searched instrument —
   the same research holdings get in their detail sheet, now for
   any company. Shares the companyInfo cache (keyed by ticker),
   so a description generated here is already there if you later
   buy the stock, and vice versa. Auto-loads once per ticker. */
export function CompanyInfoCard({ symbol, name, type, info, onSaveInfo }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ticker = (symbol || "").toUpperCase();

  const fetchInfo = async () => {
    setLoading(true); setError("");
    try {
      const isStock = !type || type === "Stock";
      const prompt =
        `In 2-3 plain, friendly sentences, explain what ${name || ticker} (${ticker}) ` +
        (isStock
          ? `does as a business: what it makes or sells, and who its customers are. `
          : `is as a ${type}: what it tracks or holds and what an investor gets exposure to. `) +
        `Write for someone new to investing. No numbers, no opinions on whether it's a good investment, no advice. ` +
        `Respond with ONLY the description text, nothing else.`;
      const res = await aiFetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await res.json();
      let text = "";
      if (typeof json.content === "string") text = json.content;
      else if (Array.isArray(json.content))
        text = json.content.map((b) => (b && typeof b.text === "string" ? b.text : "")).join(" ");
      text = text.trim();
      if (!text) throw new Error("empty");
      onSaveInfo(ticker, text.slice(0, 600));
    } catch (e) {
      setError("Couldn't load the description — try again.");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (!info && ticker) fetchInfo(); }, [ticker]);

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">What it does</div>
      {loading ? (
        <div className="text-sm text-slate-400 flex items-center gap-2 py-1">
          <RefreshCw size={13} className="animate-spin" /> Looking it up…
        </div>
      ) : error ? (
        <div className="text-sm">
          <span className="text-rose-500">{error}</span>{" "}
          <button onClick={fetchInfo} className="font-semibold text-slate-500 underline">Retry</button>
        </div>
      ) : info ? (
        <p className="text-sm text-slate-600 leading-relaxed">{info.text}</p>
      ) : null}
    </div>
  );
}

/* ================= AI THESIS (Research) ================= */
/* AI thesis card. Generates a balanced bull/bear thesis for the
   selected instrument via /api/openai (same route as the other AI
   features). Runs on demand only — nothing until the user taps. */
export function AiThesisCard({ symbol, name }) {
  const [thesis, setThesis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const generate = async () => {
    setLoading(true); setErr(null); setThesis(null);
    try {
      const prompt =
        `Write a concise, balanced investment thesis on ${name || symbol} (ticker: ${symbol}) ` +
        `for a personal research tool. Be specific (numbers, segments, competitors), not generic. ` +
        `Respond with ONLY JSON, no other text: ` +
        `{"company":"full name","one_liner":"what it does in one sentence",` +
        `"bull_case":["3-5 short bullets FOR owning it"],` +
        `"bear_case":["3-5 short bullets AGAINST owning it"],` +
        `"key_risks":["2-4 short bullets: biggest specific risks"],` +
        `"catalysts":["2-4 short bullets: upcoming events/drivers to watch"],` +
        `"verdict":"2-3 sentences. No buy/sell recommendation; describe what kind of investor this fits and what the debate hinges on."}`;
      const res = await aiFetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await res.json();
      const text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
      if (!match) throw new Error("The AI returned an unexpected format — try again.");
      setThesis(JSON.parse(match[0]));
    } catch (e) {
      setErr(e && e.message ? e.message : "Could not generate a thesis — try again.");
    }
    setLoading(false);
  };

  const Section = ({ title, items, tone }) => {
    if (!items || !items.length) return null;
    const dot = tone === "bull" ? "bg-emerald-500" : tone === "bear" ? "bg-rose-500" : "bg-slate-400";
    return (
      <div className="mt-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</div>
        <ul className="mt-1 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-slate-600 flex gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {!thesis && !loading && (
        <button onClick={generate}
          className="w-full bg-slate-100 text-slate-600 text-sm font-semibold py-2.5 rounded-full flex items-center justify-center gap-1.5">
          <Sparkles size={15} className="text-emerald-500" />
          {err ? "Try again" : "Generate AI thesis"}
        </button>
      )}
      {err && !loading && <div className="text-xs text-rose-500 mt-2 text-center">{err}</div>}
      {loading && (
        <div className="text-sm text-slate-400 flex items-center justify-center gap-2 py-2">
          <RefreshCw size={14} className="animate-spin" /> Writing thesis… this can take ~20 seconds
        </div>
      )}
      {thesis && (
        <div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-emerald-500" />
            <span className="text-sm font-bold text-slate-700">AI thesis</span>
          </div>
          {thesis.one_liner && <p className="text-sm text-slate-500 mt-1">{thesis.one_liner}</p>}
          <Section title="Bull case" items={thesis.bull_case} tone="bull" />
          <Section title="Bear case" items={thesis.bear_case} tone="bear" />
          <Section title="Key risks" items={thesis.key_risks} />
          <Section title="Catalysts to watch" items={thesis.catalysts} />
          {thesis.verdict && (
            <p className="text-sm text-slate-600 mt-3 bg-slate-50 rounded-xl px-3 py-2">{thesis.verdict}</p>
          )}
          <p className="text-[10px] text-slate-300 mt-2">
            AI-generated, may contain errors or be out of date. Not investment advice.
          </p>
          <button onClick={generate}
            className="mt-2 text-xs font-semibold text-slate-400 flex items-center gap-1">
            <RefreshCw size={11} /> Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

/* ================= RESEARCH ================= */
/* Look up any stock on demand: search → live quote (via the get-quote
   edge function) → add to portfolio or watch. No seed_tickers bloat;
   each lookup fetches its own price when you open it. */
export function ResearchTab({ cur, say, onUpsert, companyInfo, onSaveInfo, watchlist, onWatch, onUnwatch, initialQuery, onConsumeQuery, holdings = [], fx = null }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sel, setSel] = useState(null);        // chosen search result
  const [quote, setQuote] = useState(null);     // fetched quote
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [adding, setAdding] = useState(null);   // prefilled holding for the modal
  const timer = useRef(null);

  const inWatchlist = sel
    ? (watchlist || []).some((w) => w.ticker === String(sel.symbol || "").toUpperCase())
    : false;

  const search = (raw) => {
    setQ(raw);
    if (timer.current) clearTimeout(timer.current);
    const term = (raw || "").trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q: term } });
        setResults(!error && data && Array.isArray(data.results) ? data.results.slice(0, 8) : []);
      } catch (e) { setResults([]); }
      setSearching(false);
    }, 350);
  };

  /* Arrived here from a $TICKER chip in a group chat: search it and open
     the exact symbol match if there is one. */
  const openExact = async (raw) => {
    const t = String(raw || "").toUpperCase();
    if (!t) return;
    setQ(t); setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q: t } });
      const rs = !error && data && Array.isArray(data.results) ? data.results : [];
      const exact = rs.find((r) => String(r.symbol || "").toUpperCase() === t) || rs[0];
      if (exact) choose(exact); else setResults(rs.slice(0, 8));
    } catch (e) { /* leave the query typed for the user */ }
    setSearching(false);
  };
  useEffect(() => {
    if (!initialQuery) return;
    openExact(initialQuery).then(() => { if (onConsumeQuery) onConsumeQuery(); });
  }, [initialQuery]);

  const choose = async (r) => {
    setSel(r); setResults([]); setQuote(null); setLoadingQuote(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-quote", {
        body: { symbol: r.symbol, currency: r.currency },
      });
      setQuote(!error && data && data.ok ? data : null);
    } catch (e) { setQuote(null); }
    setLoadingQuote(false);
  };

  const watch = (r) => {
    const t = String(r.symbol || "").toUpperCase();
    if (inWatchlist) {
      onUnwatch(t);
      say(`${t} removed from your watchlist.`);
      return;
    }
    onWatch({
      id: uid(), ticker: t, name: r.name || t, domain: "",
      type: r.type || "Stock",
      currency: (quote && quote.currency) || r.currency || cur,
      addedAt: Date.now(),
      addedPrice: (quote && quote.price) || 0,
      currentPrice: (quote && quote.price) || 0,
    });
    say(`${t} added to your watchlist — track it under Positions.`);
  };

  const startAdd = (r) => {
    setAdding({
      id: uid(), ticker: r.symbol, name: r.name || r.symbol, domain: "",
      type: r.type || "Stock", currency: (quote && quote.currency) || r.currency || cur,
      shares: "", buyPrice: "", buyDate: new Date().toISOString().slice(0, 10),
      currentPrice: (quote && quote.price) || 0, thesis: "", verdict: "open",
    });
  };

  const up = quote && quote.pct != null ? quote.pct >= 0 : true;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2">
          <Search size={18} className="text-emerald-500" /> Research
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">Look up any stock or ETF and see a live quote — then add it or watch it.</p>
      </div>

      {/* search */}
      <div className="relative">
        <input value={q} onChange={(e) => search(e.target.value)}
          placeholder="Search any company or ticker — e.g. tesla, ENR.DE, ASML"
          className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm bg-white shadow-sm" />
        {(searching || results.length > 0) && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-[60] max-h-72 overflow-y-auto">
            {searching && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
            {results.map((r) => (
              <button key={r.symbol} type="button" onClick={() => choose(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100 border-b border-slate-50 last:border-0">
                <div className="text-sm font-semibold text-slate-700">{r.symbol}
                  <span className="ml-1.5 text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">{r.currency}</span>
                  <span className="ml-1 text-[10px] font-semibold text-slate-400">{r.type}</span>
                </div>
                <div className="text-xs text-slate-400 truncate">{r.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* quote card */}
      {sel && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-slate-700 truncate">{sel.name || sel.symbol}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {sel.symbol}
                <span className="ml-1.5 text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">{(quote && quote.currency) || sel.currency}</span>
                <span className="ml-1 text-[10px] font-semibold text-slate-400">{sel.type}</span>
              </div>
            </div>
            {loadingQuote ? (
              <div className="text-sm text-slate-400">Loading…</div>
            ) : quote ? (
              <div className="text-right shrink-0">
                <div className="font-bold text-lg text-slate-800">{money(quote.price, quote.currency)}</div>
                {quote.pct != null && (
                  <div className={`text-sm font-semibold flex items-center gap-1 justify-end ${up ? "text-emerald-600" : "text-rose-500"}`}>
                    {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {pct(Number(quote.pct))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-rose-500 text-right shrink-0">No live price</div>
            )}
          </div>

          {quote && quote.prevClose != null && (
            <div className="text-xs text-slate-400 mt-2">Prev close {money(quote.prevClose, quote.currency)}</div>
          )}

          <div className="mt-4">
            <PriceChart symbol={sel.symbol} currency={(quote && quote.currency) || sel.currency} />
          </div>

          <CompanyInfoCard key={"info-" + sel.symbol} symbol={sel.symbol} name={sel.name} type={sel.type}
            info={(companyInfo || {})[(sel.symbol || "").toUpperCase()]} onSaveInfo={onSaveInfo} />

          <AiThesisCard key={sel.symbol} symbol={sel.symbol} name={sel.name} />

          <StockSocial key={"soc-" + sel.symbol} ticker={sel.symbol} name={sel.name}
            price={quote ? quote.price : null} currency={(quote && quote.currency) || sel.currency}
            onOpenTicker={openExact} />

          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => startAdd(sel)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-full shadow flex items-center justify-center gap-1.5">
              <Plus size={15} /> Add to portfolio
            </button>
            <button onClick={() => watch(sel)}
              className={`text-sm font-semibold px-4 py-2.5 rounded-full flex items-center gap-1.5 ${
                inWatchlist ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-600"}`}>
              {inWatchlist ? <Check size={15} /> : <Star size={15} />} {inWatchlist ? "Watching" : "Watch"}
            </button>
          </div>
        </div>
      )}

      {!sel && (
        <>
          <DiscoverSentiment onOpenTicker={openExact} />
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
            <Search size={24} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">Search any instrument above to see its price, RichR Sentiment and the discussion. Nothing is added until you choose to.</p>
          </div>
        </>
      )}

      {adding && (
        <PositionModal holding={adding} cur={cur} fx={fx} holdings={holdings}
          onClose={() => setAdding(null)}
          onSave={(h) => { onUpsert(h); say(`Added ${h.ticker} to your portfolio.`); }} />
      )}
    </div>
  );
}

/* ================= PRICE CHART ================= */
/* Reusable daily price chart backed by the get-history edge function
   (Yahoo, US + non-US). Used in the position detail sheet and the
   Research quote card. 1M / 6M / 1Y ranges. */
export function PriceChart({ symbol, currency }) {
  const RANGES = [["1d", "1D"], ["5d", "1W"], ["1mo", "1M"], ["6mo", "6M"], ["1y", "1Y"], ["5y", "5Y"], ["max", "Max"]];
  const [range, setRange] = useState("6mo");
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(false);
      try {
        const { data, error } = await supabase.functions.invoke("get-history", {
          body: { symbol, currency, range },
        });
        if (cancelled) return;
        if (!error && data && data.ok && Array.isArray(data.points) && data.points.length) {
          setPoints(data.points);
        } else { setPoints(null); setErr(true); }
      } catch (e) {
        if (!cancelled) { setPoints(null); setErr(true); }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [symbol, range, currency]);

  const first = points && points.length ? points[0].c : 0;
  const last = points && points.length ? points[points.length - 1].c : 0;
  const up = last >= first;
  const color = up ? "#10b981" : "#f43f5e";
  const gid = "g-" + String(symbol || "x").replace(/[^A-Za-z0-9]/g, "");

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-semibold text-slate-400">PRICE</h4>
        <div className="flex gap-1 flex-wrap justify-end">
          {RANGES.map(([r, lbl]) => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${range === r ? "bg-slate-800 text-white" : "text-slate-400 bg-slate-100"}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div className="h-40 w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">Loading chart…</div>
        ) : points && points.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip
                labelFormatter={(t) => new Date(t).toLocaleString(DATE_LOCALE, (range === "1d" || range === "5d")
                  ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                  : { year: "numeric", month: "short", day: "numeric" })}
                formatter={(v) => [money(v, currency), "Close"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Area type="monotone" dataKey="c" stroke={color} strokeWidth={2} fill={`url(#${gid})`} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-400 text-center px-4">
            {err ? "No chart data for this symbol." : "No data."}
          </div>
        )}
      </div>
    </div>
  );
}

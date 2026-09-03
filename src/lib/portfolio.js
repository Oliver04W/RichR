/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { Check, Clock, HelpCircle, X } from "lucide-react";
import { supabase } from "../supabase";
import { DEFAULT_FX, clamp01, daysHeld, fxConvert, pct, round6 } from "./format.js";

/* ---------- Supabase (live prices + FX) ---------- */
/* Prices and FX rates come from the Supabase backend (client configured in
   src/supabase.js), refreshed every minute by a cron + edge function.
   fx_rates.per_usd = units of that currency per 1 USD (EUR ≈ 0.92).   */

/* Investor types — each with an emoji mascot (no copyrighted characters) */
export const PROFILES = [
  { id: "holder",     label: "Holder",              mascot: "💎", tag: "Buys. Never sells." },
  { id: "lifesaver",  label: "Life Saver",          mascot: "🐿️", tag: "Stashes a bit of every paycheck" },
  { id: "longterm",   label: "Long-term",           mascot: "🐢", tag: "Slow, steady, unbothered" },
  { id: "retirement", label: "Saving for retirement", mascot: "🦉", tag: "Playing the decades game" },
  { id: "daytrader",  label: "Day Trader",          mascot: "🐆", tag: "In and out before lunch" },
  { id: "dividend",   label: "Dividend Hunter",     mascot: "🐝", tag: "Collects a little from every flower" },
  { id: "index",      label: "Index Believer",      mascot: "🐘", tag: "The market always wins" },
  { id: "moonshot",   label: "Moonshot Hunter",     mascot: "🚀", tag: "One big bet from glory" },
];

export const profileOf = (id) => PROFILES.find((p) => p.id === id) || null;

export const VERDICTS = {
  open:   { label: "Open",        chip: "bg-amber-100 text-amber-700",     icon: Clock },
  worked: { label: "Worked",      chip: "bg-emerald-100 text-emerald-700", icon: Check },
  wrong:  { label: "Didn't work", chip: "bg-rose-100 text-rose-600",       icon: X },
  early:  { label: "Too early",   chip: "bg-slate-200 text-slate-600",     icon: HelpCircle },
};

export const seed = () => ({
  userName: "",
  profile: "",
  currency: "USD",
  activeId: "p1",
  portfolios: [{ id: "p1", name: "My Portfolio", holdings: [], closed: [] }],
  goals: [],
  snapshots: {},
  fx: DEFAULT_FX,
  autoRefresh: false,
  philosophy: "",
});

export const SAMPLE = [
  { ticker: "AAPL", name: "Apple", type: "Stock", currency: "USD", shares: 10, buyPrice: 180, thesis: "Durable ecosystem and growing services revenue — buying for long-term compounding." },
  { ticker: "MSFT", name: "Microsoft", type: "Stock", currency: "USD", shares: 5, buyPrice: 380, thesis: "Cloud plus enterprise AI distribution is a structural tailwind." },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", currency: "USD", shares: 8, buyPrice: 480, thesis: "Low-cost broad-market core position to anchor the portfolio." },
];

export const holdingValue = (h, cur, fx) => {
  const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
  return fxConvert(h.shares * cp, h.currency || cur, cur, fx);
};

export const byValueDesc = (holdings, cur, fx) =>
  [...holdings].sort((a, b) => holdingValue(b, cur, fx) - holdingValue(a, cur, fx));

export const cleanHolding = (h) => ({
  ...h,
  shares: round6(Math.max(0, Number(h.shares) || 0)),
  buyPrice: Math.max(0, Number(h.buyPrice) || 0),
  currency: String(h.currency || "").toUpperCase() || undefined,
});

/* Change any fields of one holding (shares, buyPrice, buyDate, currency, …). */
export const editHolding = (holdings, id, patch) =>
  (holdings || []).map((h) => (h.id === id ? cleanHolding({ ...h, ...patch, sample: false }) : h));

/* Remove one or many holdings by id. */
export const removeHoldings = (holdings, ids) => {
  const set = new Set(Array.isArray(ids) ? ids : [ids]);
  return (holdings || []).filter((h) => !set.has(h.id));
};

/* Set the share count; zero (or less) removes the holding. */
export const setHoldingShares = (holdings, id, n) =>
  round6(n) > 0 ? editHolding(holdings, id, { shares: n }) : removeHoldings(holdings, id);

/* Add shares bought at `price` (weighted average buy price); a negative
   delta simply reduces the count without changing the average. */
export const addHoldingShares = (holdings, id, delta, price = null) => {
  const h = (holdings || []).find((x) => x.id === id);
  if (!h) return holdings;
  const s0 = Number(h.shares) || 0, d = Number(delta) || 0, total = round6(s0 + d);
  if (total <= 0) return removeHoldings(holdings, id);
  if (d <= 0 || !(Number(price) > 0)) return editHolding(holdings, id, { shares: total });
  return editHolding(holdings, id, { shares: total, buyPrice: (s0 * Number(h.buyPrice) + d * Number(price)) / total });
};

/* Value, cost and return of a holdings array in the display currency. */
export const portfolioTotals = (holdings, cur, fx) => {
  let value = 0, cost = 0;
  (holdings || []).forEach((h) => {
    value += holdingValue(h, cur, fx);
    cost += fxConvert(Number(h.shares) * Number(h.buyPrice), h.currency || cur, cur, fx);
  });
  return { value, cost, pl: value - cost, plPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
};

/* Social metrics from a portfolio's open (holdings) + closed trades. */
export const socialStats = (p, cur, fx) => {
  const open = (p && p.holdings) || [];
  const closed = (p && p.closed) || [];
  // realized return over closed trades
  let rCost = 0, rProceeds = 0;
  closed.forEach((h) => {
    const hc = h.currency || cur;
    rCost += fxConvert(h.shares * h.buyPrice, hc, cur, fx);
    rProceeds += fxConvert(h.shares * (h.sellPrice || 0), hc, cur, fx);
  });
  const realizedPct = rCost > 0 ? ((rProceeds - rCost) / rCost) * 100 : null;
  // average holding duration in days (open: to today; closed: buy→sell)
  const durs = [];
  open.forEach((h) => durs.push(daysHeld(h.buyDate)));
  closed.forEach((h) => {
    const b = h.buyDate ? new Date(h.buyDate).getTime() : 0;
    const s = h.sellDate ? new Date(h.sellDate).getTime() : 0;
    if (b && s) durs.push(Math.max(0, Math.round((s - b) / 86400000)));
  });
  const avgDays = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  // win rate: open judged by current price, closed by sell price
  let winners = 0, total = 0;
  open.forEach((h) => { const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice; total++; if (cp > h.buyPrice) winners++; });
  closed.forEach((h) => { total++; if ((h.sellPrice || 0) > h.buyPrice) winners++; });
  const winRate = total ? Math.round((winners / total) * 100) : null;
  return { realizedPct, avgDays, winRate, closedCount: closed.length };
};

/* ---------- sharing controls ----------
   Everything a friend can see about you goes through ONE row in the
   leaderboard table, written from this device. Each item below is a
   switch: off means the field is written as NULL, so the data never
   leaves your phone. Settings live in your synced user document
   (data.share); a missing key means "on" so existing users keep the
   behaviour they already agreed to. Your name is always shared — it's
   how friends find you on the board. */
export const SHARE_ITEMS = [
  { id: "returnPct",     label: "Return %",              hint: "Time-weighted YTD return — the leaderboard number" },
  { id: "realized",      label: "Realized return",       hint: "Return on positions you've closed" },
  { id: "winRate",       label: "Win rate",              hint: "Share of positions that are up" },
  { id: "avgHold",       label: "Average hold time",     hint: "How long you keep positions, in days" },
  { id: "positions",     label: "Number of positions",   hint: "How many holdings you have" },
  { id: "topHoldings",   label: "Top-10 holdings",       hint: "Tickers and their weight in your portfolio" },
  { id: "badge",         label: "Investor badge",        hint: "Your investor-type mascot and label" },
  { id: "portfolioName", label: "Portfolio name",        hint: "The name of the portfolio you share" },
  { id: "philosophy",    label: "Investing philosophy",  hint: "The text on your profile" },
  { id: "score",         label: "RichR Score",           hint: "Your 0–100 score and its four parts" },
  { id: "activity",      label: "Activity feed",         hint: "“Increased TSM 12% → 18%” updates in friends' feeds (percentages only)" },
];

export const shareOf = (data) => {
  const s = (data && data.share) || {};
  const out = {};
  SHARE_ITEMS.forEach((it) => { out[it.id] = s[it.id] !== false; });
  return out;
};

export const SCORE_WEIGHTS = { performance: 0.35, riskAdjusted: 0.25, diversification: 0.2, concentration: 0.2 };

export function computeScore({ holdings, cur, fx, series, bench }) {
  const parts = {}, notes = {}, inputs = {};
  // --- weights
  const total = (holdings || []).reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  const ws = total > 0 ? (holdings || []).map((h) => holdingValue(h, cur, fx) / total).filter((w) => w > 0) : [];
  if (ws.length) {
    const hhi = ws.reduce((a, w) => a + w * w, 0);
    const effN = 1 / hhi;
    const top1 = Math.max(...ws) * 100;
    inputs.top1 = Number(top1.toFixed(1)); inputs.effN = Number(effN.toFixed(1)); inputs.n = ws.length;
    parts.diversification = clamp01(100 * (1 - Math.exp(-(effN - 1) / 6)));
    notes.diversification = `≈ ${effN.toFixed(1)} equally-weighted positions across ${ws.length}. More, and more evenly sized, positions score higher (10+ effective ≈ 80).`;
    parts.concentration = clamp01(100 - Math.max(0, top1 - 8) * 1.4);
    notes.concentration = `Your biggest position is ${top1.toFixed(0)}% of the portfolio. Under ~15% scores near 90; over 40% drags the score hard.`;
  }
  // --- performance & risk from the daily series (value/cost, cash-flow adjusted)
  const live = (series || []).filter((p) => p.value > 0);
  if (live.length >= 2) {
    const a = live[0], b = live[live.length - 1];
    const mine = (((b.value - a.value) - ((b.cost || 0) - (a.cost || 0))) / a.value) * 100;
    let bret = null;
    if (bench && bench.length) {
      const i0 = idxOnOrBefore(bench, new Date(a.t).getTime());
      const b0 = i0 >= 0 ? bench[i0] : bench[0];
      const b1 = bench[bench.length - 1];
      if (b0 && b1 && b0.c > 0) bret = ((b1.c - b0.c) / b0.c) * 100;
    }
    const days = Math.max(1, (new Date(b.t) - new Date(a.t)) / 86400000);
    const edge = bret != null ? mine - bret : mine;
    // annualise the edge so a 2-month-old portfolio isn't judged on 2 months
    const edgeAnn = edge * Math.min(1, 365 / days) ;
    inputs.mine = Number(mine.toFixed(1)); inputs.bench = bret != null ? Number(bret.toFixed(1)) : null; inputs.edge = Number(edge.toFixed(1));
    parts.performance = clamp01(50 + edgeAnn * 2.5);
    notes.performance = bret != null
      ? `${pct(mine, 1)} vs S&P 500 ${pct(bret, 1)} over ${days >= 300 ? "the past year" : `${Math.round(days)} days`} (money you added doesn't count). Matching the index = 50; each point ahead ≈ +2.5.`
      : `${pct(mine, 1)} over ${Math.round(days)} days.`;
    // daily returns for volatility
    if (live.length >= 20) {
      const rets = [];
      for (let k = 1; k < live.length; k++) {
        const p0 = live[k - 1], p1 = live[k];
        if (p0.value > 0) rets.push(((p1.value - p0.value) - ((p1.cost || 0) - (p0.cost || 0))) / p0.value);
      }
      const mean = rets.reduce((a, r) => a + r, 0) / rets.length;
      const varc = rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / Math.max(1, rets.length - 1);
      const volAnn = Math.sqrt(varc) * Math.sqrt(252) * 100;
      const retAnn = mean * 252 * 100;
      const sharpe = volAnn > 0 ? (retAnn - 2) / volAnn : 0; // 2% risk-free
      inputs.sharpe = Number(sharpe.toFixed(2)); inputs.vol = Number(volAnn.toFixed(0));
      parts.riskAdjusted = clamp01(50 + sharpe * 20);
      notes.riskAdjusted = `Annualised ${pct(retAnn, 0)} at ${volAnn.toFixed(0)}% volatility → Sharpe ≈ ${sharpe.toFixed(2)}. Steadier gains score higher; 1.0 ≈ 70, 2.5 ≈ 100.`;
    } else {
      notes.riskAdjusted = "Needs about a month of daily history.";
    }
  } else {
    notes.performance = "Needs a few days of price history.";
    notes.riskAdjusted = "Needs about a month of daily history.";
  }
  const keys = Object.keys(parts);
  if (!keys.length) return { score: null, parts, notes, inputs };
  const wsum = keys.reduce((a, k) => a + SCORE_WEIGHTS[k], 0);
  const score = clamp01(keys.reduce((a, k) => a + parts[k] * SCORE_WEIGHTS[k], 0) / wsum);
  return { score, parts, notes, inputs };
}

/* "Your concentration score fell because your largest position grew from
   21% to 31%." — one sentence per part that moved, from the logged inputs. */
export function explainScoreChange(prev, cur) {
  if (!prev || !cur || !prev.parts || !cur.parts) return [];
  const pi = prev.inputs || {}, ci = cur.inputs || {};
  const out = [];
  const moved = (k) => cur.parts[k] != null && prev.parts[k] != null && cur.parts[k] !== prev.parts[k];
  const dir = (k) => (cur.parts[k] > prev.parts[k] ? "rose" : "fell");
  if (moved("concentration") && pi.top1 != null && ci.top1 != null && pi.top1 !== ci.top1)
    out.push(`Your concentration score ${dir("concentration")} because your largest position went from ${pi.top1}% to ${ci.top1}% of the portfolio.`);
  if (moved("diversification") && pi.effN != null && ci.effN != null)
    out.push(`Diversification ${dir("diversification")}: you now hold the equivalent of ${ci.effN} equally-weighted positions (was ${pi.effN})${pi.n !== ci.n ? `, ${ci.n} positions in total (was ${pi.n})` : ""}.`);
  if (moved("performance") && pi.edge != null && ci.edge != null)
    out.push(`Performance ${dir("performance")}: you're now ${ci.edge >= 0 ? "+" : ""}${ci.edge} points vs the S&P 500 (was ${pi.edge >= 0 ? "+" : ""}${pi.edge}).`);
  if (moved("riskAdjusted") && pi.sharpe != null && ci.sharpe != null)
    out.push(`Risk-adjusted return ${dir("riskAdjusted")}: Sharpe ${ci.sharpe} (was ${pi.sharpe})${pi.vol !== ci.vol ? `, volatility ${ci.vol}% (was ${pi.vol}%)` : ""}.`);
  return out;
}

export const SCORE_LABEL = { performance: "Performance", riskAdjusted: "Risk-adjusted", diversification: "Diversification", concentration: "Concentration" };

export const scoreTone = (n) => n == null ? "text-slate-300" : n >= 75 ? "text-emerald-600" : n >= 50 ? "text-amber-500" : "text-rose-500";

/* Winning streak: consecutive calendar weeks (ending with the current one)
   where the cash-flow-adjusted weekly return was positive. Computed from
   the same daily series the dashboard uses. */
export function winningStreak(series) {
  const live = (series || []).filter((p) => p.value > 0);
  if (live.length < 6) return 0;
  const weekOf = (t) => { const d = new Date(t); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const byWeek = new Map();
  live.forEach((p) => { const w = weekOf(p.t); if (!byWeek.has(w)) byWeek.set(w, []); byWeek.get(w).push(p); });
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  let streak = 0;
  for (let i = weeks.length - 1; i > 0; i--) {
    const cur = byWeek.get(weeks[i]), prev = byWeek.get(weeks[i - 1]);
    const a = prev[prev.length - 1], b = cur[cur.length - 1];
    const r = a.value > 0 ? ((b.value - a.value) - ((b.cost || 0) - (a.cost || 0))) / a.value : 0;
    if (r > 0) streak++; else break;
  }
  return streak;
}

/* Turn two top-holdings lists (ticker + weight %) into feed events.
   Threshold 3 points so daily price drift doesn't spam the feed. */
export function diffHoldingsEvents(prev, next) {
  const P = {}; (prev || []).forEach((h) => { P[h.ticker] = Number(h.pct) || 0; });
  const N = {}; (next || []).forEach((h) => { N[h.ticker] = Number(h.pct) || 0; });
  const ev = [];
  Object.keys(N).forEach((t) => {
    if (!(t in P)) ev.push({ kind: "added", ticker: t, from_pct: null, to_pct: N[t] });
    else if (N[t] - P[t] >= 3) ev.push({ kind: "increased", ticker: t, from_pct: P[t], to_pct: N[t] });
    else if (P[t] - N[t] >= 3) ev.push({ kind: "decreased", ticker: t, from_pct: P[t], to_pct: N[t] });
  });
  Object.keys(P).forEach((t) => { if (!(t in N)) ev.push({ kind: "removed", ticker: t, from_pct: P[t], to_pct: null }); });
  return ev;
}

/* Build + upsert my leaderboard row, honouring the sharing switches.
   Used by the Friends tab (Share / Update share) and by the Profile tab
   (auto-refresh when a switch changes and I'm already on the board).
   Returns { twrUsed } or throws. */
export async function publishBoard({ data, active, totals, cur, user }) {
  const share = shareOf(data);
  const fx = data.fx || DEFAULT_FX;
  const totalVal = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  const topHoldings = byValueDesc(active.holdings, cur, fx)
    .slice(0, 10)
    .map((h) => ({
      ticker: h.ticker,
      pct: totalVal > 0 ? Number(((holdingValue(h, cur, fx) / totalVal) * 100).toFixed(1)) : 0,
    }));
  /* Fair leaderboard number: TIME-WEIGHTED return (YTD), computed
     server-side from real price history. Adding money or buying more
     can't inflate it — each day's return is measured after stripping
     that day's cash flow. Falls back to the simple cost-based return
     only if the performance service is unavailable. Skipped entirely
     when return % isn't shared — no need to send holdings anywhere. */
  let returnPct = Number(totals.plPct.toFixed(2));
  let twrUsed = false;
  if (share.returnPct) {
    try {
      const { data: perf, error: pe } = await supabase.functions.invoke("portfolio-performance", {
        body: {
          display: cur,
          holdings: active.holdings.map((h) => ({
            ticker: h.ticker, shares: h.shares, buyPrice: h.buyPrice,
            buyDate: h.buyDate || null, currency: h.currency || cur,
          })),
          closed: (active.closed || []).map((h) => ({
            ticker: h.ticker, shares: h.shares, buyPrice: h.buyPrice,
            buyDate: h.buyDate || null, sellPrice: h.sellPrice,
            sellDate: h.sellDate || null, currency: h.currency || cur,
          })),
        },
      });
      const t = (!pe && perf && perf.ok)
        ? (perf.twrYtd != null ? perf.twrYtd : perf.twrAll)
        : null;
      if (t != null && isFinite(t)) { returnPct = Number(Number(t).toFixed(2)); twrUsed = true; }
    } catch (_) { /* fall back to simple return */ }
  }
  const stats = socialStats(active, cur, fx);
  // score (needs the daily series; skipped if the switch is off)
  let scoreRes = null;
  if (share.score) {
    try {
      const { portfolio, bench } = await loadDailySeries(active.holdings, cur, DEFAULT_BENCH.symbol);
      const series = portfolio ? [...portfolio, { t: new Date().toISOString(), value: totals.value, cost: totals.cost }] : null;
      scoreRes = computeScore({ holdings: active.holdings, cur, fx, series, bench });
    } catch (_) { scoreRes = null; }
  }
  // previous row → feed events (only when the activity switch is on)
  let events = [];
  let prevRow = null;
  try {
    const { data: pr } = await supabase.from("leaderboard").select("top_holdings, score, return_pct").eq("user_id", user.id).maybeSingle();
    prevRow = pr || null;
  } catch (_) {}
  if (share.activity) {
    if (!prevRow) events.push({ kind: "shared", ticker: null, from_pct: null, to_pct: null });
    else if (share.topHoldings && Array.isArray(prevRow.top_holdings)) events = diffHoldingsEvents(prevRow.top_holdings, topHoldings);
    if (scoreRes && scoreRes.score != null && prevRow && prevRow.score != null && Math.abs(scoreRes.score - prevRow.score) >= 3)
      events.push({ kind: "score", ticker: null, from_pct: prevRow.score, to_pct: scoreRes.score });
    // milestone: YTD return crossed a round threshold upwards since the last publish
    if (share.returnPct && prevRow && prevRow.return_pct != null) {
      const was = Number(prevRow.return_pct), now = returnPct;
      const crossed = [10, 20, 30, 50, 75, 100, 200].filter((t) => was < t && now >= t);
      if (crossed.length) events.push({ kind: "milestone", ticker: null, from_pct: was, to_pct: crossed[crossed.length - 1] });
    }
  }
  // 30-point sparkline of cash-flow-adjusted % change (last ~6 weeks) for the
  // portfolio card friends see — no amounts, just the shape.
  let spark = null;
  if (share.returnPct) {
    try {
      const { portfolio } = await loadDailySeries(active.holdings, cur, DEFAULT_BENCH.symbol);
      const live = (portfolio || []).filter((p) => p.value > 0).slice(-30);
      if (live.length >= 5) {
        const a = live[0];
        spark = live.map((p) => Number(((((p.value - a.value) - ((p.cost || 0) - (a.cost || 0))) / a.value) * 100).toFixed(2)));
      }
    } catch (_) {}
  }
  const row = {
    user_id: user.id,
    name: data.userName.trim(),
    spark,
    score: scoreRes && scoreRes.score != null ? scoreRes.score : null,
    score_parts: scoreRes && scoreRes.score != null ? scoreRes.parts : null,
    profile: share.badge ? (data.profile || "") : "",
    portfolio: share.portfolioName ? active.name : "",
    return_pct: share.returnPct ? returnPct : null,
    holdings: share.positions ? active.holdings.length : null,
    top_holdings: share.topHoldings ? topHoldings : null,
    realized_pct: share.realized && stats.realizedPct != null ? Number(stats.realizedPct.toFixed(2)) : null,
    avg_days: share.avgHold ? stats.avgDays : null,
    win_rate: share.winRate ? stats.winRate : null,
    philosophy: share.philosophy ? (data.philosophy || "").slice(0, 280) : "",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("leaderboard").upsert(row);
  if (error) throw error;
  if (events.length) {
    try {
      await supabase.from("portfolio_events").insert(events.slice(0, 12).map((e) => ({ ...e, user_id: user.id })));
    } catch (_) { /* the feed is best-effort */ }
  }
  return { twrUsed, events: events.length };
}

/* Performance theme: green when the portfolio is up, red when down, grey when flat */
export const perfTheme = (plPct) => {
  if (plPct > 0.005)
    return { grad: "bg-gradient-to-br from-emerald-500 to-teal-600", shadow: "shadow-emerald-200",
             chip: "text-emerald-600 bg-emerald-50", stat: "text-emerald-600", hex: "#10b981" };
  if (plPct < -0.005)
    return { grad: "bg-gradient-to-br from-rose-500 to-red-600", shadow: "shadow-rose-200",
             chip: "text-rose-600 bg-rose-50", stat: "text-rose-500", hex: "#f43f5e" };
  return { grad: "bg-gradient-to-br from-slate-400 to-slate-500", shadow: "shadow-slate-200",
           chip: "text-slate-600 bg-slate-100", stat: "text-slate-500", hex: "#94a3b8" };
};

/* ================= DASHBOARD CARDS ================= */
/* Cash-flow-adjusted period return: what your money did, ignoring what you
   put in or took out during the window.  r = (Δvalue − Δcost) / value₀  */
export const periodReturn = (series, fromIdx) => {
  if (!series || fromIdx < 0) return null;
  // the history is zero before the first purchase — start measuring from
  // the first day the portfolio actually existed
  while (fromIdx < series.length && !(series[fromIdx].value > 0)) fromIdx++;
  if (fromIdx >= series.length - 1) return null;
  const a = series[fromIdx], b = series[series.length - 1];
  if (!a || !b || !(a.value > 0)) return null;
  return (((b.value - a.value) - ((b.cost || 0) - (a.cost || 0))) / a.value) * 100;
};

/* index of the last point on/before a given time */
export const idxOnOrBefore = (series, t) => {
  let i = -1;
  for (let k = 0; k < series.length; k++) { if (new Date(series[k].t).getTime() <= t) i = k; else break; }
  return i;
};

/* Benchmarks the user can compare against. Symbols are what the
   get-history function (Yahoo) understands; all verified to return data. */
export const BENCHMARKS = [
  { symbol: "SPY",     label: "S&P 500",         short: "S&P" },
  { symbol: "QQQ",     label: "Nasdaq-100",      short: "NDX" },
  { symbol: "URTH",    label: "MSCI World",      short: "World" },
  { symbol: "^OMXH25", label: "OMX Helsinki 25", short: "OMXH" },
  { symbol: "FEZ",     label: "Euro Stoxx 50",   short: "STOXX" },
  { symbol: "^GDAXI",  label: "DAX",             short: "DAX" },
  { symbol: "BTC-USD", label: "Bitcoin",         short: "BTC" },
];

export const DEFAULT_BENCH = BENCHMARKS[0];

/* data.benchmark may be a preset symbol or a custom {symbol,label}. */
export const benchOf = (data) => {
  const b = data && data.benchmark;
  if (!b) return DEFAULT_BENCH;
  if (typeof b === "string") return BENCHMARKS.find((x) => x.symbol === b) || { symbol: b, label: b, short: b.replace(/^\^/, "").slice(0, 6) };
  if (b.symbol) return BENCHMARKS.find((x) => x.symbol === b.symbol) || { symbol: b.symbol, label: b.label || b.symbol, short: (b.short || b.symbol).replace(/^\^/, "").slice(0, 6) };
  return DEFAULT_BENCH;
};

/* Cache the daily series per holdings signature so switching tabs doesn't
   refetch; benchmark closes are cached per symbol. */
export const histCache = { key: "", portfolio: null, at: 0, bench: {} };

export const holdingsKey = (holdings, cur) => cur + "|" + (holdings || []).map((h) => `${h.ticker}:${h.shares}:${h.buyPrice}:${h.buyDate || ""}`).join(",");

export async function loadDailySeries(holdings, cur, benchSymbol) {
  const key = holdingsKey(holdings, cur);
  const fresh = histCache.key === key && Date.now() - histCache.at < 10 * 60000 && histCache.portfolio;
  const needBench = !(histCache.bench[benchSymbol] && Date.now() - histCache.bench[benchSymbol].at < 10 * 60000);
  const body = {
    display: cur, range: "1y",
    holdings: (holdings || []).map((h) => ({
      ticker: h.ticker, shares: Number(h.shares) || 0, buyPrice: Number(h.buyPrice) || 0,
      buyDate: h.buyDate || null, sellDate: h.sellDate || null, currency: h.currency || cur,
    })),
  };
  const [pf, bm] = await Promise.all([
    fresh ? Promise.resolve(null) : supabase.functions.invoke("portfolio-history", { body }),
    needBench ? supabase.functions.invoke("get-history", { body: { symbol: benchSymbol, currency: "USD", range: "1y" } }) : Promise.resolve(null),
  ]);
  if (pf) {
    const portfolio = (!pf.error && pf.data && pf.data.ok && Array.isArray(pf.data.points)) ? pf.data.points : null;
    Object.assign(histCache, { key, portfolio, at: Date.now() });
  }
  if (bm) {
    const pts = (!bm.error && bm.data && bm.data.ok && Array.isArray(bm.data.points)) ? bm.data.points : null;
    histCache.bench[benchSymbol] = { pts, at: Date.now() };
  }
  return { portfolio: histCache.portfolio, bench: (histCache.bench[benchSymbol] || {}).pts || null };
}

/* ================= ADD / EDIT POSITION ================= */
/* Progressive disclosure: search → pick a stock → shares & price → add.
   Everything derivable (value, currency, name, current price) is filled in
   for you; date, type, currency and thesis live behind "More details". */
export const EXCHANGE_BY_SUFFIX = {
  HE: "Nasdaq Helsinki", ST: "Nasdaq Stockholm", CO: "Nasdaq Copenhagen", OL: "Oslo Børs",
  AS: "Euronext Amsterdam", PA: "Euronext Paris", BR: "Euronext Brussels", LS: "Euronext Lisbon", MI: "Borsa Italiana",
  DE: "Xetra", F: "Frankfurt", VI: "Vienna", SW: "SIX Swiss", L: "London", TO: "Toronto", V: "TSX Venture",
  T: "Tokyo", HK: "Hong Kong", AX: "ASX", SA: "B3 São Paulo", MC: "Madrid", IR: "Dublin", TA: "Tel Aviv",
};

export const exchangeOf = (symbol, currency) => {
  const s = String(symbol || "").toUpperCase();
  const i = s.lastIndexOf(".");
  if (i > 0) return EXCHANGE_BY_SUFFIX[s.slice(i + 1)] || s.slice(i + 1);
  return currency === "USD" ? "US" : "";
};

export const isFund = (r) => /fund|etf/i.test(r.type || "") || /\bETF\b|UCITS|Index/i.test(r.name || "");

/* ================= PORTFOLIO HISTORY SHEET ================= */
/* Full-screen portfolio history with 1D/1W/1M/6M/1Y horizons.
   Fetches an accurate reconstructed series from the
   portfolio-history edge function, and appends the LIVE current
   value as the last point — the tip moves with each refresh. */
export const PH_RANGES = [
  { id: "1d",  label: "1D",  sub: "Today" },
  { id: "1w",  label: "1W",  sub: "Past week" },
  { id: "1mo", label: "1M",  sub: "Past month" },
  { id: "ytd", label: "YTD", sub: "This year" },
  { id: "1y",  label: "1Y",  sub: "Past year" },
  { id: "all", label: "ALL", sub: "Since your first position" },
];

/* The history service speaks 1d/1w/1mo/6mo/1y; YTD and ALL are the 1y
   daily series cut client-side. ALL shows at most a year — the service
   doesn't go further back yet. */
export const PH_SERVICE_RANGE = { "1d": "1d", "1w": "1w", "1mo": "1mo", "ytd": "1y", "1y": "1y", "all": "1y" };

export const cutSeries = (points, range) => {
  if (!points) return points;
  if (range === "ytd") {
    const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
    // start at the last close before Jan 1 so the first day's move counts
    const i = points.findIndex((p) => new Date(p.t).getTime() >= jan1);
    return i <= 0 ? points : points.slice(i - 1);
  }
  if (range === "all") {
    const i = points.findIndex((p) => p.value > 0);
    return i <= 0 ? points : points.slice(i - 1);
  }
  return points;
};

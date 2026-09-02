
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, RefreshCw, Trash2, Users, BookOpen, Home, Briefcase, Check, X,
  Clock, HelpCircle, Pencil, Trophy, Share2, TrendingUp, TrendingDown,
  ChevronDown, ChevronLeft, ChevronRight, Lock, Target, Sparkles, Flag, Activity, Calendar, Camera, Upload, Search, Star, ExternalLink, User, MessageCircle, Send, UserPlus, LogOut, CornerDownRight, UsersRound, Handshake
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  ComposedChart, Line, PieChart, Pie, Cell
} from "recharts";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase";

/* ------------------------------------------------------------------ */
/*  RichR — track investments, write theses, share progress with      */
/*  friends. Sibling app to LightR: same light, friendly, mobile-     */
/*  first card UI with one gradient accent and a bottom tab bar.      */
/* ------------------------------------------------------------------ */

const CURRENCIES = [
  { code: "USD", sym: "$" },
  { code: "EUR", sym: "€" },
  { code: "GBP", sym: "£" },
  { code: "SEK", sym: "kr" },
  { code: "CAD", sym: "C$" },
  { code: "CHF", sym: "CHF" },
  { code: "NOK", sym: "kr" },
  { code: "DKK", sym: "kr" },
  { code: "JPY", sym: "¥" },
];
const TYPES = ["Stock", "Fund", "ETF"];

/* ---------- Supabase (live prices + FX) ---------- */
/* Prices and FX rates come from the Supabase backend (client configured in
   src/supabase.js), refreshed every minute by a cron + edge function.
   fx_rates.per_usd = units of that currency per 1 USD (EUR ≈ 0.92).   */

/* Investor types — each with an emoji mascot (no copyrighted characters) */
const PROFILES = [
  { id: "holder",     label: "Holder",              mascot: "💎", tag: "Buys. Never sells." },
  { id: "lifesaver",  label: "Life Saver",          mascot: "🐿️", tag: "Stashes a bit of every paycheck" },
  { id: "longterm",   label: "Long-term",           mascot: "🐢", tag: "Slow, steady, unbothered" },
  { id: "retirement", label: "Saving for retirement", mascot: "🦉", tag: "Playing the decades game" },
  { id: "daytrader",  label: "Day Trader",          mascot: "🐆", tag: "In and out before lunch" },
  { id: "dividend",   label: "Dividend Hunter",     mascot: "🐝", tag: "Collects a little from every flower" },
  { id: "index",      label: "Index Believer",      mascot: "🐘", tag: "The market always wins" },
  { id: "moonshot",   label: "Moonshot Hunter",     mascot: "🚀", tag: "One big bet from glory" },
];
const profileOf = (id) => PROFILES.find((p) => p.id === id) || null;

/* ---------- company logos ---------- */
/* Logos load from each company's website favicon (via Google's favicon service —
   free, no API key). Domain comes from: an explicit domain on the holding →
   a built-in map of common tickers → a guess from the company name.
   If nothing loads, we fall back to the ticker-initials tile.               */
const TICKER_DOMAINS = {
  AAPL: "apple.com", MSFT: "microsoft.com", GOOGL: "abc.xyz", GOOG: "abc.xyz",
  AMZN: "amazon.com", META: "meta.com", NVDA: "nvidia.com", TSLA: "tesla.com",
  AMD: "amd.com", INTC: "intel.com", NFLX: "netflix.com", AVGO: "broadcom.com",
  LITE: "lumentum.com", PLTR: "palantir.com", SNPS: "synopsys.com",
  VRT: "vertiv.com", MPWR: "monolithicpower.com", FIX: "comfortsystemsusa.com",
  NVT: "nvent.com", PWR: "quantaservices.com", GEV: "gevernova.com",
  CEG: "constellationenergy.com", ETN: "eaton.com", WDC: "westerndigital.com",
  RHM: "rheinmetall.com", "RHM.DE": "rheinmetall.com", SAAB: "saab.com",
  "SAAB-B": "saab.com", EXENS: "exosens.com", NOK: "nokia.com", NOKIA: "nokia.com",
  NDA: "nordea.com", SAMPO: "sampo.com", KNEBV: "kone.com", NESTE: "neste.com",
  FORTUM: "fortum.com", UPM: "upm.com", WSP: "wsp.com", STN: "stantec.com",
  ENR: "siemens-energy.com", "ENR.DE": "siemens-energy.com", ASML: "asml.com",
  SCYR: "sacyr.com", MHID: "mahindra.com", "EXENS.PA": "exosens.com",
  VOO: "vanguard.com", VTI: "vanguard.com", VXUS: "vanguard.com",
  SPY: "ssga.com", IVV: "ishares.com", QQQ: "invesco.com", EUNL: "ishares.com",
  IUSQ: "ishares.com", SXR8: "ishares.com",
};
const guessDomain = (h) => {
  if (h.domain && h.domain.trim()) return h.domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const t = (h.ticker || "").toUpperCase();
  if (TICKER_DOMAINS[t]) return TICKER_DOMAINS[t];
  const base = (h.name || "").toLowerCase()
    .replace(/\b(inc|corp|corporation|company|co|plc|oyj|ab|oy|ag|sa|sas|se|nv|asa|spa|ltd|limited|group|holdings?|class [a-z]|etf|fund|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return base ? `${base}.com` : null;
};

/* Brand colors for the monogram tiles (used in this sandboxed prototype,
   where external images are blocked; the <img> below starts working
   automatically once the app is deployed outside the sandbox). */
const BRAND_COLORS = {
  AAPL: "#1d1d1f", MSFT: "#0078d4", GOOGL: "#4285f4", GOOG: "#4285f4",
  AMZN: "#ff9900", META: "#0866ff", NVDA: "#76b900", TSLA: "#e82127",
  AMD: "#ed1c24", INTC: "#0068b5", NFLX: "#e50914", AVGO: "#cc092f",
  LITE: "#c8102e", PLTR: "#101113", SNPS: "#5a2a82", VRT: "#ff9e18",
  MPWR: "#00539b", GEV: "#026937", CEG: "#0f2b5b", ETN: "#0055a4",
  WDC: "#0074c8", RHM: "#2d3a45", SAAB: "#0058a3", NOK: "#124191",
  NOKIA: "#124191", NDA: "#0000a0", SAMPO: "#003755", KNEBV: "#005eb8",
  NESTE: "#78be20", FORTUM: "#5ac37d", UPM: "#5f2469", WSP: "#ff372f",
  STN: "#e57200", VOO: "#96151d", VTI: "#96151d", VXUS: "#96151d",
  SPY: "#00539f", IVV: "#000000", QQQ: "#003765",
};
const hashColor = (s) => {
  let h = 0;
  for (const c of s || "?") h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 42%)`;
};

function Logo({ h, size = 44, rounded = "rounded-2xl" }) {
  const [loaded, setLoaded] = useState(false);
  const domain = guessDomain(h);
  const t = (h.ticker || "?").toUpperCase();
  const bg = BRAND_COLORS[t] || hashColor(t + (h.name || ""));
  return (
    <div className={`${rounded} flex items-center justify-center shrink-0 overflow-hidden relative`}
      style={{ width: size, height: size, background: loaded ? "#fff" : bg }}>
      {!loaded && (
        <span className="font-bold text-white" style={{ fontSize: size * 0.3, letterSpacing: "0.02em" }}>
          {t.slice(0, 3)}
        </span>
      )}
      {domain && (
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt={h.name || h.ticker} width={Math.round(size * 0.62)} height={Math.round(size * 0.62)}
          style={{ objectFit: "contain", position: loaded ? "static" : "absolute", opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
      )}
    </div>
  );
}
const VERDICTS = {
  open:   { label: "Open",        chip: "bg-amber-100 text-amber-700",     icon: Clock },
  worked: { label: "Worked",      chip: "bg-emerald-100 text-emerald-700", icon: Check },
  wrong:  { label: "Didn't work", chip: "bg-rose-100 text-rose-600",       icon: X },
  early:  { label: "Too early",   chip: "bg-slate-200 text-slate-600",     icon: HelpCircle },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const slug = (s) =>
  (s || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "anon";

const seed = () => ({
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

const SAMPLE = [
  { ticker: "AAPL", name: "Apple", type: "Stock", currency: "USD", shares: 10, buyPrice: 180, thesis: "Durable ecosystem and growing services revenue — buying for long-term compounding." },
  { ticker: "MSFT", name: "Microsoft", type: "Stock", currency: "USD", shares: 5, buyPrice: 380, thesis: "Cloud plus enterprise AI distribution is a structural tailwind." },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF", currency: "USD", shares: 8, buyPrice: 480, thesis: "Low-cost broad-market core position to anchor the portfolio." },
];

/* ---------- storage (cloud-first via Supabase, localStorage as offline cache) ---------- */
/* The whole app state lives in one document per user:
     - Source of truth: public.user_data (JSONB, protected by RLS)
     - localStorage keeps a copy so the app opens instantly and works offline
   Every saved copy carries a _ts timestamp; on load the newer of
   cloud vs. local wins, so no edit is ever silently rolled back. */
const dataKey = (userId) => `richr:data:${userId}`;

function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* first run */ }
  return null;
}
function saveLocal(key, d) {
  try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { console.error(e); }
}
/* returns the document, null (signed in but no cloud row yet),
   or undefined (cloud unreachable — offline mode) */
async function loadCloud(userId) {
  try {
    const { data: row, error } = await supabase
      .from("user_data").select("data").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return row ? row.data : null;
  } catch (e) { return undefined; }
}
async function saveCloud(userId, d) {
  try {
    const { error } = await supabase.from("user_data").upsert(
      { user_id: userId, data: d, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return !error;
  } catch (e) { return false; }
}

/* ---------- price pipeline ---------- */
/* Every ticker anyone holds gets registered in seed_tickers (feeding the
   watched_tickers view), which the
   refresh-prices edge function polls once a minute. Duplicate inserts are
   ignored; failures are silent (worst case the price just stays manual). */
const watchTicker = async (t) => {
  const ticker = String(t || "").trim().toUpperCase();
  if (!ticker) return;
  try {
    await supabase.from("seed_tickers").upsert({ ticker }, { onConflict: "ticker", ignoreDuplicates: true });
  } catch (e) { /* non-fatal */ }
};

/* ---------- formatting ---------- */
/* One locale for every date in the UI. The copy is English, so dates are
   too — otherwise a Swedish/Finnish browser shows "7 juli" next to English
   labels. Numbers keep the browser locale (€1 234,56 is fine). */
const DATE_LOCALE = "en-GB";
const fmtDate = (t, opts) => new Date(t).toLocaleDateString(DATE_LOCALE, opts || { day: "numeric", month: "short" });
const fmtTime = (t, opts) => new Date(t).toLocaleTimeString(DATE_LOCALE, opts || { hour: "2-digit", minute: "2-digit" });
const fmtDateTime = (t) => `${fmtDate(t)} ${fmtTime(t)}`;
/* How old is the newest price row we've seen? Weekends are quiet, so
   anything under ~26h is "fresh"; beyond that we say so, in plain words. */
const priceStaleness = (at) => {
  if (!at) return { stale: false, label: "", age: "", title: "" };
  const ms = Date.now() - at;
  const h = ms / 3600000;
  if (h < 26) return { stale: false, label: "", age: "", title: `Prices as of ${fmtDateTime(at)}` };
  const d = Math.floor(h / 24);
  const age = d >= 2 ? `${d} days` : `${Math.round(h)} hours`;
  return { stale: true, label: `Prices ${age} old`, age, title: `Newest price is from ${fmtDateTime(at)}` };
};
const sym = (cur) => (CURRENCIES.find((c) => c.code === cur) || CURRENCIES[0]).sym;
const money = (n, cur) => {
  const v = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}${sym(cur)}${v}`;
};
const moneyShort = (n, cur) => {
  const v = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : ""}${sym(cur)}${v}`;
};
/* One convention for every performance number: sign always shown (a real
   minus, not a hyphen), tabular digits, 2 decimals by default. */
const pct = (n, d = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}%`;
/* Coloured performance number — the single way to render a return anywhere. */
function Ret({ v, d = 2, className = "", plain = false }) {
  if (v == null || Number.isNaN(Number(v))) return <span className={`text-slate-300 tabular-nums ${className}`}>—</span>;
  const n = Number(v);
  return <span className={`tabular-nums ${plain ? "" : n >= 0 ? "text-emerald-600" : "text-rose-500"} ${className}`}>{pct(n, d)}</span>;
}
const daysHeld = (d) => (d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : 0);

/* ---------- FX ---------- */
/* Rates are stored as units of currency per 1 USD. Defaults are rough
   fallbacks; real rates are fetched with every "Update prices".        */
const DEFAULT_FX = { at: 0, rates: { USD: 1, EUR: 0.92, GBP: 0.79, SEK: 10.5, CAD: 1.36, CHF: 0.88, NOK: 10.6, DKK: 6.9, JPY: 150 } };
const holdingValue = (h, cur, fx) => {
  const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
  return fxConvert(h.shares * cp, h.currency || cur, cur, fx);
};
const byValueDesc = (holdings, cur, fx) =>
  [...holdings].sort((a, b) => holdingValue(b, cur, fx) - holdingValue(a, cur, fx));

/* Social metrics from a portfolio's open (holdings) + closed trades. */
const socialStats = (p, cur, fx) => {
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
const SHARE_ITEMS = [
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
const shareOf = (data) => {
  const s = (data && data.share) || {};
  const out = {};
  SHARE_ITEMS.forEach((it) => { out[it.id] = s[it.id] !== false; });
  return out;
};

/* ---------- RichR Score ----------
   One number (0–100) built from four parts, each 0–100, so people have
   something to improve and compare. All inputs are things the app already
   knows; nothing leaves the device unless the "RichR Score" switch is on.
     performance     — cash-flow-adjusted return vs the S&P 500 over the
                       last year (or since the portfolio began)
     riskAdjusted    — Sharpe-style: annualised return ÷ annualised
                       volatility of daily returns
     diversification — effective number of positions (1 / Σw²)
     concentration   — how much the single biggest position dominates
   Missing parts (young portfolio) are left out and the rest re-weighted. */
const clamp01 = (x) => Math.max(0, Math.min(100, Math.round(x)));
const SCORE_WEIGHTS = { performance: 0.35, riskAdjusted: 0.25, diversification: 0.2, concentration: 0.2 };

function computeScore({ holdings, cur, fx, series, bench }) {
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
function explainScoreChange(prev, cur) {
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
const SCORE_LABEL = { performance: "Performance", riskAdjusted: "Risk-adjusted return", diversification: "Diversification", concentration: "Concentration" };
const scoreTone = (n) => n == null ? "text-slate-300" : n >= 75 ? "text-emerald-600" : n >= 50 ? "text-amber-500" : "text-rose-500";

/* Winning streak: consecutive calendar weeks (ending with the current one)
   where the cash-flow-adjusted weekly return was positive. Computed from
   the same daily series the dashboard uses. */
function winningStreak(series) {
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
function diffHoldingsEvents(prev, next) {
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
async function publishBoard({ data, active, totals, cur, user }) {
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

const fxConvert = (amount, from, to, fx) => {
  if (!from || !to || from === to) return amount;
  const r = { ...DEFAULT_FX.rates, ...((fx && fx.rates) || {}) }; // live rates win, defaults fill gaps
  const f = r[from], t = r[to];
  if (!f || !t) return amount;
  return amount * (t / f);
};

/* Performance theme: green when the portfolio is up, red when down, grey when flat */
const perfTheme = (plPct) => {
  if (plPct > 0.005)
    return { grad: "bg-gradient-to-br from-emerald-500 to-teal-600", shadow: "shadow-emerald-200",
             chip: "text-emerald-600 bg-emerald-50", stat: "text-emerald-600", hex: "#10b981" };
  if (plPct < -0.005)
    return { grad: "bg-gradient-to-br from-rose-500 to-red-600", shadow: "shadow-rose-200",
             chip: "text-rose-600 bg-rose-50", stat: "text-rose-500", hex: "#f43f5e" };
  return { grad: "bg-gradient-to-br from-slate-400 to-slate-500", shadow: "shadow-slate-200",
           chip: "text-slate-600 bg-slate-100", stat: "text-slate-500", hex: "#94a3b8" };
};

/* ================================================================== */
export default function RichR({ user, onSignOut }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("portfolio");
  /* Where you were before opening Profile (from the name button top-right,
     or "Edit" on the Friends share card) — so its Back control returns you
     there instead of always to Portfolio. */
  const prevTabRef = useRef("portfolio");
  const [researchQuery, setResearchQuery] = useState(""); // prefilled when a $TICKER chip is tapped
  const [importOnce, setImportOnce] = useState(false);    // open the import modal on arrival in Holdings
  const openTicker = (t) => { setResearchQuery(String(t || "").toUpperCase()); setTab("research"); };
  // Social components (votes, discussions, feed) read the signed-in user from here.
  SOCIAL_ME.id = user.id; SOCIAL_ME.username = (data && data.username) || "";
  const openProfile = () => { if (tab !== "profile") prevTabRef.current = tab; setTab("profile"); };
  const closeProfile = () => setTab(prevTabRef.current === "profile" ? "portfolio" : prevTabRef.current);
  const [sub, setSub] = useState("overview"); // Portfolio tab sections: overview | holdings | analysis
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");
  const loaded = useRef(false);

  /* ---- "X has added you!" banner ---- */
  const [friendAlert, setFriendAlert] = useState(null); // { id, username, more }
  const alertChecked = useRef(false);
  useEffect(() => {
    if (!data || alertChecked.current) return;
    alertChecked.current = true;
    (async () => {
      try {
        const { data: inc } = await supabase
          .from("friends").select("user_id").eq("friend_id", user.id);
        const incIds = (inc || []).map((r) => r.user_id);
        if (!incIds.length) return;
        const { data: out } = await supabase
          .from("friends").select("friend_id").eq("user_id", user.id);
        const outSet = new Set((out || []).map((r) => r.friend_id));
        const seen = new Set(data.seenRequests || []);
        const fresh = incIds.filter((id) => !outSet.has(id) && !seen.has(id));
        if (!fresh.length) return;
        const { data: p } = await supabase
          .from("profiles").select("user_id, username").in("user_id", fresh);
        const first = (p || []).find((x) => fresh.includes(x.user_id));
        if (!first) return;
        setFriendAlert({
          id: first.user_id,
          username: first.username || "someone",
          more: fresh.length - 1,
        });
      } catch (_) { /* banner is best-effort — never block the app */ }
    })();
  }, [data]);

  const dismissFriendAlert = () => {
    if (friendAlert) patch((d) => ({ seenRequests: [...(d.seenRequests || []), friendAlert.id] }));
    setFriendAlert(null);
  };
  const addBackFromAlert = async () => {
    if (!friendAlert) return;
    const { error } = await supabase.from("friends")
      .insert({ user_id: user.id, friend_id: friendAlert.id });
    if (error && error.code !== "23505") { say("Couldn't add back — try again."); return; }
    say(`You and @${friendAlert.username} are now friends!`);
    patch((d) => ({ seenRequests: [...(d.seenRequests || []), friendAlert.id] }));
    setFriendAlert(null);
  };

  /* ---- "X wants to see your portfolio" banner (nudges table) ----
     A friend who can't see your board yet can nudge you once a day.
     Shown until you share or dismiss; dismiss deletes the row. */
  const [nudge, setNudge] = useState(null); // { fromId, username, more }
  const nudgeChecked = useRef(false);
  useEffect(() => {
    if (!data || nudgeChecked.current) return;
    nudgeChecked.current = true;
    (async () => {
      try {
        const { data: rows } = await supabase
          .from("nudges").select("from_id, created_at").eq("to_id", user.id)
          .order("created_at", { ascending: false });
        if (!rows || !rows.length) return;
        const { data: p } = await supabase
          .from("profiles").select("user_id, username").in("user_id", rows.map((r) => r.from_id));
        const first = rows[0];
        const prof = (p || []).find((x) => x.user_id === first.from_id);
        setNudge({ fromId: first.from_id, username: (prof && prof.username) || "a friend", more: rows.length - 1 });
      } catch (_) { /* best-effort */ }
    })();
  }, [data]);
  const dismissNudge = async () => {
    if (!nudge) return;
    setNudge(null);
    try { await supabase.from("nudges").delete().eq("to_id", user.id); } catch (_) {}
  };

  /* ---- keep my leaderboard row (and the activity feed) current ----
     If I've shared my portfolio, a change to holdings re-publishes the row
     ~6s later so friends see the update — and the feed gets its
     "increased X 12% → 18%" events — without tapping "Update share". */
  const lastPubKey = useRef(null);
  const pubTimer = useRef(null);
  useEffect(() => {
    if (!data) return;
    const act = data.portfolios.find((p) => p.id === data.activeId) || data.portfolios[0];
    if (!act) return;
    const k = holdingsKey(act.holdings, data.currency || "USD");
    if (lastPubKey.current === null) { lastPubKey.current = k; return; } // initial load
    if (lastPubKey.current === k) return;
    lastPubKey.current = k;
    if (pubTimer.current) clearTimeout(pubTimer.current);
    pubTimer.current = setTimeout(async () => {
      try {
        const { data: row } = await supabase.from("leaderboard").select("user_id").eq("user_id", user.id).maybeSingle();
        if (!row) return;
        if (!act.holdings.length || act.holdings.some((h) => h.sample)) return;
        const fx = data.fx || DEFAULT_FX;
        const cur = data.currency || "USD";
        let value = 0, cost = 0;
        act.holdings.forEach((h) => {
          const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
          value += fxConvert(h.shares * cp, h.currency || cur, cur, fx);
          cost += fxConvert(h.shares * h.buyPrice, h.currency || cur, cur, fx);
        });
        const plPct = cost > 0 ? ((value - cost) / cost) * 100 : 0;
        await publishBoard({ data, active: act, totals: { value, cost, pl: value - cost, plPct }, cur, user });
      } catch (_) { /* silent — the manual button still works */ }
    }, 6000);
    return () => { if (pubTimer.current) clearTimeout(pubTimer.current); };
  }, [data && data.portfolios, data && data.activeId]);

  const storageKey = dataKey(user.id);
  const cloudOk = useRef(false);

  /* ---- initial load: newest of cloud vs. local cache wins ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadLocal(storageKey);
      const cloud = await loadCloud(user.id);
      let d;
      if (cloud === undefined) {
        // offline / cloud unreachable — run on the local cache for now
        d = local || seed();
        cloudOk.current = false;
      } else if (cloud === null) {
        // first cloud-era login on this account: migrate whatever this
        // device has (or start fresh) up to Supabase
        d = local || seed();
        cloudOk.current = true;
        saveCloud(user.id, { ...d, _ts: Date.now() });
      } else {
        // both exist — keep whichever copy was saved most recently
        const newerLocal = local && (local._ts || 0) > (cloud._ts || 0);
        d = newerLocal ? local : cloud;
        cloudOk.current = true;
        if (newerLocal) saveCloud(user.id, local);
        else saveLocal(storageKey, cloud);
      }
      if (cancelled) return;
      if (!d.userName && user.user_metadata && user.user_metadata.full_name)
        d.userName = user.user_metadata.full_name;
      setData(d);
      loaded.current = true;
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  /* ---- write-through: localStorage immediately, cloud debounced ---- */
  const cloudTimer = useRef(null);
  const pendingRef = useRef(null); // doc waiting for the debounced cloud save
  useEffect(() => {
    if (!loaded.current || !data) return;
    const stamped = { ...data, _ts: Date.now() };
    saveLocal(storageKey, stamped);
    pendingRef.current = stamped;
    if (cloudTimer.current) clearTimeout(cloudTimer.current);
    cloudTimer.current = setTimeout(async () => {
      pendingRef.current = null;
      const ok = await saveCloud(user.id, stamped);
      if (ok) cloudOk.current = true;
    }, 1200);
    return () => { if (cloudTimer.current) clearTimeout(cloudTimer.current); };
  }, [data, storageKey]);

  /* If the tab is hidden or closed while a save is still pending, flush it
     right away (keepalive so the request survives navigation). Otherwise a
     quick edit-then-leave could vanish from the cloud copy. */
  useEffect(() => {
    const flush = () => {
      const d = pendingRef.current;
      if (!d) return;
      pendingRef.current = null;
      if (cloudTimer.current) clearTimeout(cloudTimer.current);
      try {
        const sess = JSON.parse(localStorage.getItem(`sb-${new URL(SUPABASE_URL).host.split(".")[0]}-auth-token`) || "null");
        const token = sess && sess.access_token;
        if (!token) return;
        fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
          method: "POST", keepalive: true,
          headers: {
            "content-type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${token}`,
            prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({ user_id: user.id, data: d, updated_at: new Date().toISOString() }),
        }).catch(() => {});
      } catch (e) { /* best effort */ }
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", flush); };
  }, [user.id]);

  // pull my claimed username from Supabase so it survives devices
  useEffect(() => {
    supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle()
      .then(({ data: p }) => {
        if (p && p.username)
          setData((d) => (d && d.username !== p.username ? { ...d, username: p.username } : d));
      });
  }, [user.id]);

  const say = (m) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  // Derived state — computed before any early return so hook order never changes
  const active = data
    ? (data.portfolios.find((p) => p.id === data.activeId) || data.portfolios[0])
    : null;
  const cur = data ? data.currency : "USD";

  /* --- totals (converted into the display currency) --- */
  const totals = useMemo(() => {
    let cost = 0, value = 0;
    const fx = (data && data.fx) || DEFAULT_FX;
    if (active) {
      active.holdings.forEach((h) => {
        const hc = h.currency || cur;
        const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
        cost += fxConvert(h.shares * h.buyPrice, hc, cur, fx);
        value += fxConvert(h.shares * cp, hc, cur, fx);
      });
    }
    const pl = value - cost;
    return { cost, value, pl, plPct: cost ? (pl / cost) * 100 : 0 };
  }, [active, cur, data]);

  const chartData = useMemo(() => {
    if (!data || !active)
      return [{ label: "Cost", value: 0 }, { label: "Now", value: 0 }];
    const snaps = (data.snapshots || {})[active.id] || [];
    // one point per calendar day — keep the last value recorded that day
    const byDay = new Map();
    snaps.forEach((s) => byDay.set(new Date(s.t).toDateString(), s));
    const daily = [...byDay.values()].sort((a, b) => a.t - b.t);
    const pts = daily.map((s) => ({
      label: fmtDate(s.t),
      value: Math.round(s.value),
    }));
    if (!pts.length)
      return [
        { label: "Cost", value: Math.round(totals.cost) },
        { label: "Now", value: Math.round(totals.value) },
      ];
    return [{ label: "Cost", value: Math.round(totals.cost) }, ...pts];
  }, [data, active, totals]);

  // Total across ALL portfolios — goals measure your whole journey
  const allValue = useMemo(() => {
    let v = 0;
    const fx = (data && data.fx) || DEFAULT_FX;
    if (data)
      data.portfolios.forEach((p) =>
        p.holdings.forEach((h) => {
          const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
          v += fxConvert(h.shares * cp, h.currency || cur, cur, fx);
        })
      );
    return v;
  }, [data, cur]);

  /* --- price + FX refresh (reads live data from Supabase) --- */
  const failsRef = useRef(0);
  const busyRef = useRef(false);
  const refreshPrices = async (silent = false) => {
    if (busyRef.current || !active) return;
    const tickers = [...new Set([
      ...active.holdings.map((h) => h.ticker),
      ...(data.watchlist || []).map((w) => w.ticker),
    ].filter(Boolean))];
    if (!tickers.length) { if (!silent) say("Add a position first."); return; }
    busyRef.current = true;
    setRefreshing(true);
    try {
      const [pr, fr] = await Promise.all([
        supabase.from("prices").select("ticker,price,currency,updated_at")
          .in("ticker", tickers.map((t) => t.toUpperCase())),
        supabase.from("fx_rates").select("code,per_usd,updated_at"),
      ]);
      if (pr.error) throw pr.error;
      if (fr.error) throw fr.error;
      const priceRows = pr.data || [];
      const fxRows = fr.data || [];

      // Zero rows on both tables (with a 200 OK) almost always means RLS is
      // still blocking the anon role — the request "succeeds" but returns nothing.
      if (!priceRows.length && !fxRows.length) throw new Error("no rows — check anon SELECT policies");

      const priceMap = {};
      priceRows.forEach((r) => { priceMap[String(r.ticker).toUpperCase()] = r; });

      // fx_rates.per_usd = units of that currency per 1 USD, matching the
      // app's rate convention. Missing rates keep their old value; USD = 1.
      const newFx = { at: Date.now(), rates: { ...DEFAULT_FX.rates, ...(data.fx || DEFAULT_FX).rates, USD: 1 } };
      fxRows.forEach((r) => {
        const code = String(r.code || "").toUpperCase();
        const v = Number(r.per_usd);
        if (code && code !== "USD" && v > 0) newFx.rates[code] = v;
      });

      let hit = 0;
      // newest server-side update among the rows we actually use
      let priceDataAt = 0;
      const updated = active.holdings.map((h) => {
        const row = priceMap[h.ticker.toUpperCase()];
        if (row && Number(row.price) > 0) {
          hit++;
          const at = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          if (at > priceDataAt) priceDataAt = at;
          const pCur = row.currency && newFx.rates[String(row.currency).toUpperCase()]
            ? String(row.currency).toUpperCase() : h.currency;
          return { ...h, currentPrice: Number(row.price), currency: pCur || h.currency || cur };
        }
        return h;
      });

      // snapshot in display currency using the fresh rates
      let value = 0, cost = 0;
      updated.forEach((h) => {
        const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
        value += fxConvert(h.shares * cp, h.currency || cur, cur, newFx);
        cost += fxConvert(h.shares * h.buyPrice, h.currency || cur, cur, newFx);
      });

      setData((d) => {
        const snaps = { ...(d.snapshots || {}) };
        const arr = (snaps[active.id] || []).slice();
        const now = Date.now();
        const last = arr[arr.length - 1];
        // one snapshot per calendar day: replace today's point, else start a new day
        if (last && new Date(last.t).toDateString() === new Date(now).toDateString()) {
          arr[arr.length - 1] = { t: now, value, cost };
        } else {
          arr.push({ t: now, value, cost });
        }
        snaps[active.id] = arr.slice(-40);
        return {
          ...d, snapshots: snaps, fx: newFx, pricesAt: Date.now(), priceDataAt: priceDataAt || d.priceDataAt || 0,
          portfolios: d.portfolios.map((p) => (p.id === active.id ? { ...p, holdings: updated } : p)),
          watchlist: (d.watchlist || []).map((w) => {
            const row = priceMap[String(w.ticker || "").toUpperCase()];
            if (row && Number(row.price) > 0) {
              const pCur = row.currency && newFx.rates[String(row.currency).toUpperCase()]
                ? String(row.currency).toUpperCase() : w.currency;
              return { ...w, currentPrice: Number(row.price), currency: pCur || w.currency || cur };
            }
            return w;
          }),
        };
      });
      failsRef.current = 0;
      if (!silent) say(hit ? `Updated ${hit} of ${tickers.length} prices + FX rates.` : "No matching tickers in your database yet.");
    } catch (e) {
      failsRef.current += 1;
      if (failsRef.current >= 3) {
        setData((d) => ({ ...d, autoRefresh: false }));
        say("Live updates paused — lookups kept failing. Tap Update to retry.");
        failsRef.current = 0;
      } else if (!silent) {
        say("Price lookup failed — tap a price to set it manually.");
      }
    } finally { busyRef.current = false; setRefreshing(false); }
  };

  /* --- auto refresh every 30s while Live is on and the app is visible --- */
  const refreshRef = useRef(refreshPrices);
  refreshRef.current = refreshPrices;
  useEffect(() => {
    if (!data || !data.autoRefresh) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      refreshRef.current(true);
    }, 30000);
    return () => clearInterval(id);
  }, [data && data.autoRefresh, data && data.activeId]);

  if (!data)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-2xl font-bold text-slate-800">
          Rich<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">R</span>
        </div>
      </div>
    );

  /* --- mutations --- */
  const patch = (fn) => setData((d) => ({ ...d, ...fn(d) }));
  const patchActive = (fn) =>
    setData((d) => ({
      ...d,
      portfolios: d.portfolios.map((p) => (p.id === d.activeId ? { ...p, ...fn(p) } : p)),
    }));
  const addPortfolio = () => {
    const id = uid();
    patch((d) => ({
      portfolios: [...d.portfolios, { id, name: `Portfolio ${d.portfolios.length + 1}`, holdings: [], closed: [] }],
      activeId: id,
    }));
  };
  const deletePortfolio = () => {
    if (data.portfolios.length <= 1) return;
    setData((d) => {
      const rest = d.portfolios.filter((p) => p.id !== d.activeId);
      return { ...d, portfolios: rest, activeId: rest[0].id };
    });
  };
  const upsertHolding = (h) => {
    watchTicker(h.ticker);
    patchActive((p) => ({
      holdings: p.holdings.some((x) => x.id === h.id)
        ? p.holdings.map((x) => (x.id === h.id ? h : x))
        : [...p.holdings, h],
    }));
  };
  const removeHolding = (id) => patchActive((p) => ({ holdings: p.holdings.filter((h) => h.id !== id) }));
  const closePosition = (id, sellPrice, sellDate) =>
    patchActive((p) => {
      const h = (p.holdings || []).find((x) => x.id === id);
      if (!h) return {};
      const closedItem = {
        ...h,
        sellPrice: Number(sellPrice) || 0,
        sellDate: sellDate || new Date().toISOString().slice(0, 10),
        closedAt: Date.now(),
      };
      return {
        holdings: p.holdings.filter((x) => x.id !== id),
        closed: [...(p.closed || []), closedItem],
      };
    });
  const setVerdict = (id, verdict) =>
    patchActive((p) => ({ holdings: p.holdings.map((h) => (h.id === id ? { ...h, verdict } : h)) }));
  const setPrice = (id, currentPrice) =>
    patchActive((p) => ({ holdings: p.holdings.map((h) => (h.id === id ? { ...h, currentPrice } : h)) }));
  const loadSample = () => {
    const today = new Date().toISOString().slice(0, 10);
    // `sample: true` marks these so the Friends tab refuses to publish them.
    SAMPLE.forEach((s) => upsertHolding({ id: uid(), ...s, buyDate: today, currentPrice: 0, verdict: "open", sample: true }));
    say("Sample positions added — replace them with your own before sharing.");
  };

  /* --- watchlist (concept portfolio — assets you're keen on but don't own yet) --- */
  const addWatch = (item) => {
    watchTicker(item.ticker);
    patch((d) => {
      const wl = d.watchlist || [];
      if (wl.some((w) => w.ticker === item.ticker)) return {};
      return { watchlist: [...wl, item] };
    });
  };
  const removeWatch = (id) =>
    patch((d) => ({ watchlist: (d.watchlist || []).filter((w) => w.id !== id) }));
  const removeWatchByTicker = (t) =>
    patch((d) => ({ watchlist: (d.watchlist || []).filter((w) => w.ticker !== String(t || "").toUpperCase()) }));
  const setWatchPrice = (id, currentPrice) =>
    patch((d) => ({ watchlist: (d.watchlist || []).map((w) => (w.id === id ? { ...w, currentPrice } : w)) }));

  /* --- goals --- */
  const addGoal = (g) => patch((d) => ({ goals: [...(d.goals || []), g] }));
  const updateGoal = (g) => patch((d) => ({ goals: (d.goals || []).map((x) => (x.id === g.id ? g : x)) }));
  const removeGoal = (id) => patch((d) => ({ goals: (d.goals || []).filter((x) => x.id !== id) }));

  /* --- AI analysis persistence --- */
  const saveAnalysis = (a) =>
    patch((d) => ({ analysis: { ...(d.analysis || {}), [d.activeId]: a } }));
  const saveCompanyInfo = (ticker, text) =>
    patch((d) => ({ companyInfo: { ...(d.companyInfo || {}), [ticker]: { text, at: Date.now() } } }));
  const saveNews = (n) =>
    patch((d) => ({ news: { ...(d.news || {}), [d.activeId]: n } }));

  const tabs = [
    { id: "portfolio", label: "Home", icon: Home },
    { id: "research", label: "Discover", icon: Search },
    { id: "groups", label: "Communities", icon: UsersRound },
    { id: "friends", label: "Friends", icon: Handshake },
    { id: "profile", label: "Profile", icon: User },
  ];
  const SUBS = [
    { id: "overview", label: "Overview" },
    { id: "holdings", label: "Holdings" },
    { id: "analysis", label: "Analysis" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Phone-width everywhere, except the Overview on a big screen, which
          spreads into two columns (see HomeTab). */}
      <div className={`mx-auto px-4 pb-28 pt-6 transition-[max-width] ${
        tab === "portfolio" && sub === "overview" && active.holdings.length > 0 ? "max-w-md lg:max-w-5xl" : "max-w-md"}`}>
        {/* header: a restrained wordmark; the personality comes from the content */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-extrabold tracking-tight flex items-baseline text-slate-900">
            Rich<img src="/logo.png" alt="R" className="h-[1.1rem] w-auto inline-block translate-y-[1px]" />
          </h1>
          <div className="text-xs font-semibold text-slate-400">{TAB_LABEL[tab]}</div>
        </div>

        {/* friend request banner */}
        {friendAlert && (
          <div className="mb-4 bg-white border border-emerald-200 rounded-2xl p-3 shadow-sm flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <Users size={15} className="text-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-700 truncate">@{friendAlert.username} has added you!</div>
              {friendAlert.more > 0 && (
                <div className="text-[11px] text-slate-400">+{friendAlert.more} more in the Friends tab</div>
              )}
            </div>
            <button onClick={addBackFromAlert}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow shrink-0">
              Add back
            </button>
            <button onClick={dismissFriendAlert}
              className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        {/* nudge banner — a friend wants to see your portfolio */}
        {nudge && !friendAlert && (
          <div className="mb-4 bg-white border border-amber-200 rounded-2xl p-3 shadow-sm flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
              <Trophy size={15} className="text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-700 truncate">@{nudge.username} wants to see your portfolio</div>
              <div className="text-[11px] text-slate-400">{nudge.more > 0 ? `+${nudge.more} more · ` : ""}Share to join the leaderboard</div>
            </div>
            <button onClick={() => { setTab("friends"); dismissNudge(); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow shrink-0">
              Share
            </button>
            <button onClick={dismissNudge}
              className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        {tab === "portfolio" && (
          <div className="mb-4 bg-slate-200/60 rounded-full p-1 flex lg:max-w-md">
            {SUBS.map((s) => (
              <button key={s.id} onClick={() => setSub(s.id)}
                className={`flex-1 text-[13px] font-semibold py-1.5 rounded-full transition ${
                  sub === s.id ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {tab === "portfolio" && sub === "overview" && (
          <HomeTab
            data={data} active={active} cur={cur} totals={totals} chartData={chartData}
            refreshing={refreshing} onRefresh={refreshPrices}
            onSwitch={(id) => patch(() => ({ activeId: id }))}
            onAddPortfolio={addPortfolio} onDeletePortfolio={deletePortfolio}
            onRename={(name) => patchActive(() => ({ name }))}
            goPositions={() => setSub("holdings")} goImport={() => { setImportOnce(true); setSub("holdings"); }} onLoadSample={loadSample}
            goals={data.goals || []} allValue={allValue} fx={data.fx || DEFAULT_FX}
            autoRefresh={!!data.autoRefresh} onToggleAuto={() => patch((d) => ({ autoRefresh: !d.autoRefresh }))}
            pricesAt={data.pricesAt || 0} priceDataAt={data.priceDataAt || 0}
            onAddGoal={addGoal} onUpdateGoal={updateGoal} onRemoveGoal={removeGoal}
            onBenchmark={(benchmark) => patch(() => ({ benchmark }))}
            onScoreLog={(scoreLog) => patch(() => ({ scoreLog }))}
            user={user} goFriends={() => setTab("friends")}
            onDismissOnboarding={() => patch(() => ({ onboardingDismissed: true }))}
            onOpenProfile={openProfile}
            onRankLog={(rankLog) => patch(() => ({ rankLog }))}
            onOpenTicker={openTicker}
          />
        )}
        {tab === "portfolio" && sub === "holdings" && (
          <PositionsTab active={active} cur={cur} fx={data.fx || DEFAULT_FX}
            companyInfo={data.companyInfo || {}} onSaveInfo={saveCompanyInfo}
            onUpsert={upsertHolding} onRemove={removeHolding} onSetPrice={setPrice} onLoadSample={loadSample} onClosePosition={closePosition}
            watchlist={data.watchlist || []} onRemoveWatch={removeWatch} onSetWatchPrice={setWatchPrice}
            goResearch={() => setTab("research")}
            openImport={importOnce} onImportOpened={() => setImportOnce(false)} />
        )}
        {tab === "portfolio" && sub === "analysis" && (
          <InsightsTab active={active} totals={totals} cur={cur} fx={data.fx || DEFAULT_FX} say={say}
            onVerdict={setVerdict}
            analysis={(data.analysis || {})[active.id]} onSave={saveAnalysis}
            news={(data.news || {})[active.id]} onSaveNews={saveNews} />
        )}
        {tab === "research" && <ResearchTab cur={cur} say={say} onUpsert={upsertHolding} holdings={active.holdings} fx={data.fx || DEFAULT_FX}
          companyInfo={data.companyInfo || {}} onSaveInfo={saveCompanyInfo}
          watchlist={data.watchlist || []} onWatch={addWatch} onUnwatch={removeWatchByTicker}
          initialQuery={researchQuery} onConsumeQuery={() => setResearchQuery("")} />}
        {tab === "groups" && (
          <GroupsTab user={user} active={active} cur={cur} fx={data.fx || DEFAULT_FX} say={say} username={data.username} onOpenTicker={openTicker} richrData={data}
            goFriends={() => setTab("friends")} />
        )}
        {tab === "friends" && <FriendsTab data={data} active={active} totals={totals} cur={cur} say={say} user={user}
          onEditSharing={openProfile} onOpenTicker={openTicker}
          onBoardRanks={(boardRanks) => patch(() => ({ boardRanks }))} />}
        {tab === "profile" && (
          <ProfileTab data={data} user={user} say={say}
            onName={(userName) => patch(() => ({ userName }))}
            onUsername={(username) => patch(() => ({ username }))}
            cur={cur} onCurrency={(currency) => patch(() => ({ currency }))}
            onProfile={(profile) => patch(() => ({ profile }))}
            onPhilosophy={(philosophy) => patch(() => ({ philosophy }))}
            onShare={(share) => patch(() => ({ share }))}
            active={active} totals={totals}
            onBack={closeProfile} backLabel={TAB_LABEL[prevTabRef.current === "profile" ? "portfolio" : prevTabRef.current]}
            onSignOut={onSignOut} />
        )}
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 max-w-[90%] text-center">
          {toast}
        </div>
      )}

      {/* quick add / import — floats above the tab bar on Home */}
      {tab === "portfolio" && (
        <button onClick={() => { setSub("holdings"); setImportOnce(true); }} aria-label="Add or import positions"
          className="fixed right-4 bottom-[5.25rem] z-40 w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200 active:scale-95 transition lg:right-[max(1rem,calc(50%-32rem))]">
          <Plus size={22} />
        </button>
      )}

      {/* bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
        <div className="max-w-md mx-auto flex">
          {tabs.map((t) => {
            const on = tab === t.id;
            const I = t.icon;
            return (
              <button key={t.id} onClick={() => (t.id === "profile" ? openProfile() : setTab(t.id))}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 pb-4">
                <I size={20} className={on ? "text-slate-900" : "text-slate-400"} strokeWidth={on ? 2.4 : 2} />
                <span className={`text-[11px] font-semibold ${on ? "text-slate-900" : "text-slate-400"}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ================= PROFILE ================= */
const TAB_LABEL = { portfolio: "Home", research: "Discover", groups: "Communities", friends: "Friends", profile: "Profile" };

function OwnPortfolioCard({ user, data, active, cur }) {
  const [row, setRow] = useState(null);
  const [rank, setRank] = useState({ rank: null, n: null });
  useEffect(() => {
    let dead = false;
    (async () => {
      const [{ data: me }, { data: out }, { data: inc }, { data: board }] = await Promise.all([
        supabase.from("leaderboard").select("return_pct, top_holdings, score, spark").eq("user_id", user.id).maybeSingle(),
        supabase.from("friends").select("friend_id").eq("user_id", user.id),
        supabase.from("friends").select("user_id").eq("friend_id", user.id),
        supabase.from("leaderboard").select("user_id, return_pct"),
      ]);
      if (dead) return;
      setRow(me || {});
      const incSet = new Set((inc || []).map((r) => r.user_id));
      const mutual = new Set((out || []).map((r) => r.friend_id).filter((id) => incSet.has(id)));
      const rets = (board || []).filter((b) => mutual.has(b.user_id) && b.return_pct != null).map((b) => Number(b.return_pct));
      if (me && me.return_pct != null && rets.length) {
        const all = [...rets, Number(me.return_pct)].sort((a, b) => b - a);
        setRank({ rank: all.indexOf(Number(me.return_pct)) + 1, n: rets.length + 1 });
      }
    })();
    return () => { dead = true; };
  }, [user.id]);
  const prof = profileOf(data.profile);
  if (row === null) return <Skeleton lines={2} />;
  return (
    <PortfolioCard name={data.userName} username={data.username} mascot={prof ? prof.mascot : "🙂"} style={prof ? prof.label : ""}
      ytd={row.return_pct != null ? Number(row.return_pct) : null} rank={rank.rank} n={rank.n}
      top={Array.isArray(row.top_holdings) ? row.top_holdings : []} spark={row.spark} score={row.score} />
  );
}

function ProfileTab({ data, user, say, onName, onUsername, cur, onCurrency, onProfile, onPhilosophy, onShare, active, totals, onBack, backLabel, onSignOut }) {
  const prof = profileOf(data.profile);
  const share = shareOf(data);
  const [syncing, setSyncing] = useState(false);
  const syncTimer = useRef(null);

  /* Flip one sharing switch. Saved instantly to your synced document;
     if you're already on the leaderboard, your row is re-published a
     moment later so friends stop (or start) seeing that item right
     away — no need to go back and tap "Update share". */
  const toggleShare = (id) => applyShare({ ...share, [id]: !share[id] });
  const applyShare = (next) => {
    onShare(next);
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      const { data: row } = await supabase
        .from("leaderboard").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!row) return; // not on the board — nothing to update
      if (!active || !totals) return;
      setSyncing(true);
      try {
        await publishBoard({ data: { ...data, share: next }, active, totals, cur, user });
        say("Updated what your friends can see.");
      } catch (e) {
        say("Saved — but couldn't refresh your leaderboard row. Tap Update share in Friends.");
      }
      setSyncing(false);
    }, 900);
  };
  useEffect(() => () => clearTimeout(syncTimer.current), []);
  const sharedCount = SHARE_ITEMS.filter((it) => share[it.id]).length;

  /* Public profile link (opt-in, off by default). Lives in profiles.is_public;
     the page at /u/<username> is served by a security-definer function that
     returns nothing unless this is on. */
  const [isPublic, setIsPublic] = useState(null);
  const [copied, setCopied] = useState(false);
  const [cardPreview, setCardPreview] = useState(null);
  useEffect(() => {
    supabase.from("profiles").select("is_public").eq("user_id", user.id).maybeSingle()
      .then(({ data: p }) => setIsPublic(!!(p && p.is_public)));
  }, [user.id]);
  const togglePublic = async () => {
    const next = !isPublic;
    setIsPublic(next);
    const { error } = await supabase.from("profiles").update({ is_public: next }).eq("user_id", user.id);
    if (error) { setIsPublic(!next); say("Couldn't update — try again."); return; }
    say(next ? "Your profile link is live." : "Profile link switched off — the page now shows “private”.");
  };
  const profileUrl = data.username ? `${window.location.origin}/u/${data.username}` : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(profileUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch (e) { say(profileUrl); }
  };

  const claimUsername = async (raw) => {
    const u = (raw || "").trim().toLowerCase().replace(/^@/, "");
    if (!u || u === data.username) return;
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { say("Usernames are 3–20 characters: a–z, 0–9 and _"); return; }
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, username: u });
    if (error) {
      say(error.code === "23505" ? `@${u} is taken — try another.` : "Couldn't save username — try again.");
      return;
    }
    onUsername(u);
    say(`You're @${u} — friends can now add you.`);
  };

  return (
    <div className="space-y-4">
      {/* back to wherever Profile was opened from */}
      <div className="flex items-center justify-between -mt-1">
        <button onClick={onBack} className="flex items-center gap-0.5 text-sm font-semibold text-emerald-600 -ml-1 active:opacity-70">
          <ChevronLeft size={20} /> Back{backLabel ? ` to ${backLabel}` : ""}
        </button>
        <span className="text-[11px] text-slate-400">Changes save automatically</span>
      </div>

      {/* your RichR card — what friends see */}
      <OwnPortfolioCard user={user} data={data} active={active} cur={cur} />
      <div className="card">
        <CallsList userId={user.id} title="YOUR CALLS" limit={6} emptyText="You haven't rated any stocks yet — open any stock in Discover and vote Buy, Hold or Sell. Your calls, and how they've done since, show here and to friends." />
      </div>

      {/* identity card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-2xl">
            {prof ? prof.mascot : "🙂"}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-700 truncate">{data.userName || "Set your name"}</div>
            <div className="text-xs text-slate-400 truncate">
              {data.username ? `@${data.username}` : "No username yet"}
            </div>
          </div>
        </div>
        <label className="block text-xs font-semibold text-slate-400 mb-1.5">YOUR NAME</label>
        <input defaultValue={data.userName} placeholder="e.g. John"
          onBlur={(e) => onName(e.target.value.trim())}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-3" />
        <label className="block text-xs font-semibold text-slate-400 mb-1.5">USERNAME — SO FRIENDS CAN ADD YOU</label>
        <input defaultValue={data.username || ""} placeholder="e.g. scrooge_mcduck"
          onBlur={(e) => claimUsername(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-1 lowercase" />
        <p className="text-[10px] text-slate-400">3–20 characters: a–z, 0–9 and _. Unique across RichR.</p>
      </div>

      {/* preferences card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <label className="block text-xs font-semibold text-slate-400 mb-1.5">CURRENCY</label>
        <select value={cur} onChange={(e) => onCurrency(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white mb-4">
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <label className="block text-xs font-semibold text-slate-400 mb-1.5">WHAT KIND OF INVESTOR ARE YOU?</label>
        <div className="grid grid-cols-2 gap-2">
          {PROFILES.map((p) => {
            const on = data.profile === p.id;
            return (
              <button key={p.id} onClick={() => onProfile(on ? "" : p.id)}
                className={`text-left rounded-xl border p-2.5 transition ${
                  on ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <div className="text-xl leading-none mb-1">{p.mascot}</div>
                <div className={`text-xs font-semibold ${on ? "text-emerald-700" : "text-slate-600"}`}>{p.label}</div>
                <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{p.tag}</div>
              </button>
            );
          })}
        </div>
        <label className="block text-xs font-semibold text-slate-400 mb-1.5 mt-4">INVESTING PHILOSOPHY — SHOWN ON YOUR PROFILE</label>
        <textarea defaultValue={data.philosophy || ""} placeholder="e.g. Concentrated bets on AI infrastructure and defense. Hold winners, cut theses that break."
          onBlur={(e) => onPhilosophy(e.target.value.trim().slice(0, 280))}
          rows={3} maxLength={280}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none" />
        <p className="text-[10px] text-slate-400 mt-1">Up to 280 characters. Shown to friends only if “Investing philosophy” is on below.</p>
      </div>

      {/* sharing card — what friends can see */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Share2 size={16} className="text-emerald-500" /> What friends can see
          </h3>
          <span className="text-[11px] font-semibold text-slate-400">
            {syncing ? "Updating…" : `${sharedCount}/${SHARE_ITEMS.length} on`}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          Your name is always shown so friends can find you. Everything else is up to you — items that are off never leave your device.
          Amounts, buy prices and theses are never shared.
        </p>
        <div className="divide-y divide-slate-100">
          {SHARE_ITEMS.map((it) => {
            const on = share[it.id];
            return (
              <div key={it.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${on ? "text-slate-700" : "text-slate-400"}`}>{it.label}</div>
                  <p className="text-[11px] text-slate-400 leading-snug">{it.hint}</p>
                </div>
                <button onClick={() => toggleShare(it.id)} aria-pressed={on} aria-label={`${it.label}: ${on ? "shared" : "private"}`}
                  className={`w-11 h-6 rounded-full p-0.5 shrink-0 transition ${on ? "bg-emerald-500" : "bg-slate-200"}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition ${on ? "translate-x-5" : ""}`} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => { const all = {}; SHARE_ITEMS.forEach((it) => { all[it.id] = true; }); applyShare(all); }}
            disabled={sharedCount === SHARE_ITEMS.length}
            className="flex-1 bg-emerald-50 text-emerald-700 rounded-xl py-2 text-xs font-semibold disabled:opacity-40">Share everything</button>
          <button onClick={() => { const none = {}; SHARE_ITEMS.forEach((it) => { none[it.id] = false; }); applyShare(none); }}
            disabled={sharedCount === 0}
            className="flex-1 bg-slate-100 text-slate-600 rounded-xl py-2 text-xs font-semibold disabled:opacity-40">Only my name</button>
        </div>
      </div>

      {/* public profile link */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-700 flex items-center gap-2"><ExternalLink size={16} className="text-emerald-500" /> Public profile link</h3>
            <p className="text-[11px] text-slate-400 leading-snug mt-1">
              Anyone with the link sees your investing identity — name, badge, YTD %, RichR Score, top holdings by % and recent changes — exactly what your switches above allow. Never amounts. Off by default.
            </p>
          </div>
          {data.username ? (
            <button onClick={togglePublic} aria-pressed={!!isPublic} disabled={isPublic === null}
              className={`w-11 h-6 rounded-full p-0.5 shrink-0 transition ${isPublic ? "bg-emerald-500" : "bg-slate-200"}`}>
              <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition ${isPublic ? "translate-x-5" : ""}`} />
            </button>
          ) : null}
        </div>
        {!data.username ? (
          <p className="text-xs text-amber-600 mt-2">Claim a username first — the link is built from it.</p>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <div className={`flex-1 min-w-0 text-xs font-mono px-3 py-2 rounded-xl border truncate ${isPublic ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-slate-50 border-slate-100 text-slate-400"}`}>{profileUrl}</div>
            <button onClick={copyLink} className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-2 rounded-xl shrink-0">{copied ? "Copied!" : "Copy"}</button>
            <a href={profileUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-600 shrink-0">Open</a>
          </div>
        )}
        <button onClick={() => shareProfileCard({ user, data, active, cur, fx: data.fx || DEFAULT_FX, say, setPreview: setCardPreview })}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-slate-900 text-white text-sm font-semibold py-3 rounded-full shadow">
          <Share2 size={15} /> Share profile card
        </button>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">A picture for WhatsApp, Instagram or Discord — your YTD %, rank, score and top holdings. Never amounts.</p>
        {cardPreview && <ShareCardPreview url={cardPreview} username={data.username} onClose={() => { URL.revokeObjectURL(cardPreview); setCardPreview(null); }} />}
      </div>

      {/* account card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="text-xs text-slate-400 mb-3">
          Signed in{user && user.email ? ` as ${user.email}` : ""}. Your portfolio syncs to your account and follows you across devices.
        </div>
        <button onClick={onSignOut}
          className="w-full bg-rose-50 rounded-xl py-2.5 text-sm font-semibold text-rose-500">Sign out</button>
      </div>
    </div>
  );
}

/* ================= HOME ================= */
function HomeTab({ data, active, cur, totals, chartData, refreshing, onRefresh, onSwitch, onAddPortfolio, onDeletePortfolio, onRename, goPositions, goImport, onLoadSample, goals, allValue, fx, autoRefresh, onToggleAuto, pricesAt, priceDataAt, onAddGoal, onUpdateGoal, onRemoveGoal, onBenchmark, onScoreLog, user, goFriends, onDismissOnboarding, onOpenProfile, onRankLog, onOpenTicker }) {
  const [ytd, setYtd] = useState({ m: null, b: null });
  const [social, setSocial] = useState(null); // { mine, friendsAvg, rank, n, shared, friendsCount }
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    let dead = false;
    loadDailySeries(active.holdings, cur, DEFAULT_BENCH.symbol).then(({ portfolio }) => {
      if (dead || !portfolio) return;
      setStreak(winningStreak([...portfolio, { t: new Date().toISOString(), value: totals.value, cost: totals.cost }]));
    }).catch(() => {});
    return () => { dead = true; };
  }, [holdingsKey(active.holdings, cur)]);
  const [renaming, setRenaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const up = totals.pl >= 0;
  const flat = Math.abs(totals.plPct) <= 0.005;
  const th = perfTheme(totals.plPct);
  const empty = active.holdings.length === 0;
  // progress toward "growth" — like LightR's progress toward goal weight
  const progress = totals.cost > 0 ? Math.min(100, Math.max(0, 50 + (totals.plPct / 2))) : 50;
  /* Price freshness comes from the server's updated_at on the price rows
     (priceDataAt), not from when this device last fetched. Older than a
     day and the pill turns amber with the real age instead of a cheerful
     "Live" — a stale number is worse than no number. */
  const staleness = priceStaleness(priceDataAt);

  /* Portfolio switcher — shared by both the empty and the full layout. */
  const switcher = (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {data.portfolios.map((p) => {
        const on = p.id === active.id;
        return (
          <button key={p.id} onClick={() => onSwitch(p.id)}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium border ${
              on ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-500 border-slate-200"}`}>
            {p.name}
          </button>
        );
      })}
      <button onClick={onAddPortfolio}
        className="w-8 h-8 shrink-0 rounded-full border border-dashed border-slate-300 text-slate-400 flex items-center justify-center">
        <Plus size={15} />
      </button>
    </div>
  );

  /* No holdings yet: skip the €0 hero, the empty chart and the zero
     stat tiles — a first-time user should see one clear next step. */
  if (empty) {
    return (
      <div className="space-y-6 lg:max-w-md lg:mx-auto">
        {data.portfolios.length > 1 && switcher}
        <div className="card">
          <div className="flex items-center justify-between">
            {renaming ? (
              <input autoFocus defaultValue={active.name}
                onBlur={(e) => { onRename(e.target.value.trim() || active.name); setRenaming(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold w-44" />
            ) : (
              <button onClick={() => setRenaming(true)} className="section-title flex items-center gap-1.5">
                {active.name} <Pencil size={12} className="opacity-70" />
              </button>
            )}
            {data.portfolios.length > 1 && (
              <button onClick={onDeletePortfolio} className="text-slate-300"><Trash2 size={15} /></button>
            )}
          </div>
          <div className="w-12 h-12 mt-5 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <Sparkles size={22} />
          </div>
          <h3 className="font-bold text-xl text-slate-900">Start your journey</h3>
          <p className="text-sm text-slate-500 mt-1 mb-5 leading-relaxed">
            Add your first position and write down why you bought it. Prices update live, and once you have a few positions you can share your progress with friends.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={goImport}
              className="btn-primary">
              <Camera size={15} /> Import portfolio
            </button>
            <button onClick={goPositions}
              className="bg-emerald-700/40 text-white text-sm font-semibold px-5 py-2.5 rounded-full">
              Add manually
            </button>
            <button onClick={onLoadSample}
              className="bg-emerald-700/40 text-white text-sm font-semibold px-5 py-2.5 rounded-full">
              Try sample data
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Fastest: a screenshot or CSV export from your broker app (Nordnet, Avanza, Interactive Brokers…) — confirm the holdings and you’re done in about 20 seconds. Sample data is clearly marked and can't be shared.</p>
        </div>
        {!data.onboardingDismissed && (
          <OnboardingCard user={user} active={active} data={data} onImport={goImport} onAddManually={goPositions} goFriends={goFriends} onDismiss={onDismissOnboarding} />
        )}
        <GoalsSection goals={goals} allValue={allValue} cur={cur}
          onAdd={onAddGoal} onUpdate={onUpdateGoal} onRemove={onRemoveGoal} />
      </div>
    );
  }

  const best = (() => {
    const priced = active.holdings.filter((h) => h.currentPrice > 0 && h.buyPrice > 0).map((h) => ({ h, r: ((h.currentPrice - h.buyPrice) / h.buyPrice) * 100 }));
    return priced.length ? priced.sort((a, b) => b.r - a.r)[0] : null;
  })();

  return (
    <div className="space-y-10">
      <IdentityStrip data={data} active={active} cur={cur} fx={fx} social={social} streak={streak} onProfile={onOpenProfile} />
      {data.portfolios.length > 1 && switcher}
      {/* ===== anchor: the number, then performance, then the graph ===== */}
      <section>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {renaming ? (
              <input autoFocus defaultValue={active.name}
                onBlur={(e) => { onRename(e.target.value.trim() || active.name); setRenaming(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold w-44" />
            ) : (
              <button onClick={() => setRenaming(true)} className="section-title flex items-center gap-1.5 hover:text-slate-600">
                {active.name} <Pencil size={11} className="opacity-60" />
              </button>
            )}
            {data.portfolios.length > 1 && (
              <button onClick={onDeletePortfolio} className="text-slate-300 hover:text-rose-400" title="Delete this portfolio"><Trash2 size={13} /></button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onToggleAuto} title={staleness.title}
              className={`h-7 flex items-center gap-1.5 text-[10px] font-semibold px-2.5 rounded-full border transition ${
                staleness.stale ? "bg-amber-50 text-amber-700 border-amber-200"
                  : autoRefresh ? "bg-white text-slate-500 border-slate-200" : "bg-white text-slate-400 border-slate-200"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${staleness.stale ? "bg-amber-400" : autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
              {staleness.stale ? staleness.label : autoRefresh ? "Live" : "Live off"}
            </button>
            <button onClick={() => onRefresh(false)} disabled={refreshing} title={priceDataAt > 0 ? `Prices as of ${fmtTime(priceDataAt)}` : "Update prices"}
              className="w-7 h-7 rounded-full border border-slate-200 bg-white text-slate-500 flex items-center justify-center disabled:opacity-60">
              <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>
        </div>

        <div className="mt-3 num-hero text-slate-900">{money(totals.value, cur)}</div>
        <div className={`mt-2.5 flex items-baseline gap-2 tabular-nums ${flat ? "text-slate-500" : up ? "text-emerald-600" : "text-rose-500"}`}>
          <span className="text-2xl font-extrabold">{pct(totals.plPct)}</span>
          <span className="text-base font-semibold tabular-nums">{up ? "+" : "−"}{money(Math.abs(totals.pl), cur)}</span>
          <span className="text-xs font-medium text-slate-400 ml-0.5">all time</span>
        </div>
        {(staleness.stale) && (
          <p className="text-[11px] text-amber-600 mt-1">Prices are {staleness.age} old — tap ↻ to update.</p>
        )}

        <div className="mt-5">
          <PerformanceChart holdings={active.holdings} cur={cur} liveValue={totals.value} liveCost={totals.cost}
            bench={benchOf(data)} onBench={onBenchmark} height={260} compact initialRange="1mo" onExpand={() => setShowHistory(true)} />
        </div>
      </section>

      {/* ===== standing among friends — the RichR bit ===== */}
      <section className="border-t border-slate-100 pt-6">
        <Standing social={social} ytd={ytd} benchLabel={benchOf(data).short} avatars={social && social.avatars} onClick={goFriends} />
        {best && (
          <div className="mt-4 text-sm text-slate-500">
            Best performer <span className="font-semibold text-slate-800">{best.h.ticker}</span>{" "}
            <span className={`font-semibold tabular-nums ${best.r >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{pct(best.r)}</span>
          </div>
        )}
      </section>

      {!data.onboardingDismissed && (
        <OnboardingCard user={user} active={active} data={data} onImport={goImport} onAddManually={goPositions} goFriends={goFriends} onDismiss={onDismissOnboarding} />
      )}

      {/* ===== what friends are doing — activity is the content ===== */}
      <section className="border-t border-slate-100 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">Friends' activity</h3>
          <button onClick={goFriends} className="text-xs font-semibold text-emerald-700">Leaderboard →</button>
        </div>
        <HomeFeed user={user} onOpenTicker={onOpenTicker} goFriends={goFriends} />
      </section>

      <div className="lg:grid lg:grid-cols-2 lg:gap-10 space-y-8 lg:space-y-0">
        <div className="space-y-8">
          {/* ===== holdings, scannable ===== */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">Holdings</h3>
              <button onClick={goPositions} className="text-xs font-semibold text-emerald-700">All {active.holdings.length} →</button>
            </div>
            <HoldingsPreview active={active} cur={cur} fx={fx} onOpen={goPositions} />
          </section>

          {/* ===== periods vs benchmark ===== */}
          <section>
            <PeriodReturns active={active} cur={cur} liveValue={totals.value} liveCost={totals.cost} bench={benchOf(data)} onBench={onBenchmark}
              onYtd={(m, b) => setYtd({ m, b })} bare />
          </section>
          <FriendsBenchmark user={user} myYtd={ytd.m} benchYtd={ytd.b} benchLabel={benchOf(data).label} onGoFriends={goFriends}
            onSummary={(sm) => {
              // rank change vs the last rank recorded on a previous day
              const today = new Date().toISOString().slice(0, 10);
              const log = data.rankLog || [];
              const prev = [...log].reverse().find((e) => e.d !== today);
              const rankDelta = sm.rank != null && prev && prev.rank != null ? prev.rank - sm.rank : null;
              setSocial({ ...sm, rankDelta });
              if (sm.rank != null && onRankLog) {
                const last = log[log.length - 1];
                if (!last || last.d !== today) onRankLog([...log, { d: today, rank: sm.rank }].slice(-60));
                else if (last.rank !== sm.rank) onRankLog([...log.slice(0, -1), { d: today, rank: sm.rank }]);
              }
            }} hidden />
        </div>

        <div className="space-y-8">
          {/* ===== score ===== */}
          <section>
            <ScoreCard active={active} cur={cur} fx={fx} liveValue={totals.value} liveCost={totals.cost}
              log={data.scoreLog || []} onLog={onScoreLog} />
          </section>

          {/* ===== allocation + concentration ===== */}
          <section>
            <AllocationCard active={active} cur={cur} fx={fx} />
          </section>
          <section>
            <MoversCard active={active} cur={cur} fx={fx} />
          </section>

          <section>
            <GoalsSection goals={goals} allValue={allValue} cur={cur}
              onAdd={onAddGoal} onUpdate={onUpdateGoal} onRemove={onRemoveGoal} />
          </section>
        </div>
      </div>

      <PortfolioHistorySheet open={showHistory} onClose={() => setShowHistory(false)}
        holdings={active.holdings} cur={cur}
        liveValue={totals.value} liveCost={totals.cost} hex={th.hex}
        bench={benchOf(data)} onBench={onBenchmark} />

      <p className="text-[10px] text-slate-300">
        Foreign holdings converted at {fx && fx.at ? `live FX rates (updated ${fmtDateTime(fx.at)})` : "approximate FX rates"}. Excludes dividends and fees.
      </p>
    </div>
  );
}

/* Who you are on RichR, in one line: avatar, name, streak, rank, top tickers. */
function IdentityStrip({ data, active, cur, fx, social, streak, onProfile }) {
  const prof = profileOf(data.profile);
  const top = byValueDesc(active.holdings, cur, fx).slice(0, 3);
  const total = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  return (
    <button onClick={onProfile} className="w-full flex items-center gap-3 text-left">
      <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center text-2xl shrink-0">{prof ? prof.mascot : "🙂"}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-900">{data.userName || "Set up profile"}</span>
          {social && social.rank != null && (
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${social.rank === 1 ? "bg-amber-100 text-amber-800" : social.rank <= 3 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>#{social.rank} friends</span>
          )}
          {streak >= 2 && <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">🔥 {streak}-week streak</span>}
        </div>
        <div className="text-xs text-slate-400 truncate tabular-nums">
          {data.username ? `@${data.username}` : "no username yet"}
          {top.length ? " · " + top.map((h) => `${h.ticker} ${total > 0 ? Math.round((holdingValue(h, cur, fx) / total) * 100) : 0}%`).join(" · ") : ""}
        </div>
      </div>
    </button>
  );
}

/* Tiny inline sparkline (SVG) for the portfolio card. */
function Sparkline({ points, width = 120, height = 32, up = true }) {
  const pts = (points || []).filter((v) => typeof v === "number" && isFinite(v));
  if (pts.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(" ");
  const col = up ? "#059669" : "#f43f5e";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline points={d} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
const MEDAL = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

/* ===== The RichR Portfolio Card =====
   One signature component: who, how they're doing, where they stand, what
   they hold, and the shape of the last few weeks. Percentages only. Used
   on your Profile, friends' profiles, the public page and the share image. */
function PortfolioCard({ name, username, mascot, ytd, rank, n, top, spark, score, style, streak, compact = false, onClick }) {
  const up = (ytd || 0) >= 0;
  const medal = MEDAL(rank);
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper onClick={onClick} className={`w-full text-left bg-white rounded-2xl border border-slate-100 ${compact ? "p-4" : "p-5"} relative overflow-hidden`}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-2xl shrink-0">{mascot || "👤"}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold text-slate-900 truncate">{name || (username ? `@${username}` : "Investor")}</div>
            {streak >= 2 && <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">🔥 {streak}-wk streak</span>}
          </div>
          <div className="text-xs text-slate-400 truncate">{username ? `@${username}` : ""}{style ? ` · ${style}` : ""}</div>
        </div>
        <Sparkline points={spark} up={up} width={compact ? 84 : 110} height={compact ? 28 : 36} />
      </div>

      <div className={`mt-3 flex items-end justify-between gap-3`}>
        <div>
          <div className={`${compact ? "text-2xl" : "text-3xl"} font-extrabold tabular-nums leading-none ${ytd == null ? "text-slate-300" : up ? "text-emerald-600" : "text-rose-500"}`}>
            {ytd != null ? pct(ytd) : "—"} <span className="text-sm font-semibold text-slate-400">YTD {ytd != null ? (up ? "↗" : "↘") : ""}</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            {rank != null ? (<><span>{medal || `#${rank}`}</span> {medal ? `#${rank}` : ""} among {n != null ? n : ""} friends</>) : <span className="text-slate-400">not ranked yet</span>}
          </div>
        </div>
        {score != null && (
          <div className="text-right">
            <div className={`text-lg font-extrabold tabular-nums ${scoreTone(score)}`}>{score}</div>
            <div className="text-[10px] font-semibold text-slate-400">RichR Score</div>
          </div>
        )}
      </div>

      {Array.isArray(top) && top.length > 0 && (
        <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-mono font-semibold text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 max-w-full overflow-hidden">
          {top.slice(0, 3).map((h, i) => (
            <span key={h.ticker} className="whitespace-nowrap">{i > 0 && <span className="text-slate-300 mx-1">·</span>}{h.ticker} {Math.round(h.pct)}%</span>
          ))}
        </div>
      )}
    </Wrapper>
  );
}

/* ===== Standing: the social block on Home =====
   "#2 among friends ↑1 · +18.7% YTD · You · Friends · S&P 500" */
function Standing({ social, ytd, benchLabel, avatars, onClick }) {
  const rank = social && social.rank;
  const delta = social && social.rankDelta;
  const medal = MEDAL(rank);
  return (
    <button onClick={onClick} className="w-full text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            {rank != null ? (
              <>
                <span>{medal || "🏅"}</span>
                <span>#{rank} among friends</span>
                {delta != null && delta !== 0 && (
                  <span className={`text-sm font-bold ${delta > 0 ? "text-emerald-600" : "text-rose-500"}`}>{delta > 0 ? "↑" : "↓"}{Math.abs(delta)}</span>
                )}
              </>
            ) : (
              <span className="text-slate-400 text-base font-semibold">
                {social && social.friendsCount === 0 ? "Add friends to get ranked" : social && !social.shared ? "Share to get ranked" : "Comparing with friends…"}
              </span>
            )}
          </div>
          <div className={`text-lg font-bold tabular-nums ${ytd.m == null ? "text-slate-300" : ytd.m >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
            {ytd.m != null ? pct(ytd.m) : "—"} <span className="text-xs font-semibold text-slate-400">YTD</span>
          </div>
        </div>
        {avatars && avatars.length > 0 && (
          <div className="flex -space-x-2 shrink-0">
            {avatars.slice(0, 4).map((a, i) => (
              <div key={i} className="w-8 h-8 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center text-base" style={{ background: "#f8fafc" }}>{a}</div>
            ))}
            {avatars.length > 4 && <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white text-[10px] font-bold text-slate-500 flex items-center justify-center">+{avatars.length - 4}</div>}
          </div>
        )}
      </div>
      <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-mono font-semibold text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 tabular-nums">
        <span>You {(social && social.mine != null) ? pct(social.mine) : ytd.m != null ? pct(ytd.m) : "—"}</span>
        <span className="text-slate-300 mx-1">·</span>
        <span>Friends {social && social.friendsAvg != null ? pct(social.friendsAvg) : "—"}</span>
        <span className="text-slate-300 mx-1">·</span>
        <span>{benchLabel} {ytd.b != null ? pct(ytd.b) : "—"}</span>
      </div>
    </button>
  );
}

/* Top holdings as scannable rows: logo, name, weight bar, return. */
function HoldingsPreview({ active, cur, fx, onOpen, limit = 5 }) {
  const total = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  const rows = byValueDesc(active.holdings, cur, fx).slice(0, limit);
  if (!rows.length) return null;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((h) => {
        const w = total > 0 ? (holdingValue(h, cur, fx) / total) * 100 : 0;
        const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
        const r = h.buyPrice > 0 ? ((cp - h.buyPrice) / h.buyPrice) * 100 : 0;
        return (
          <button key={h.id} onClick={onOpen} className="w-full flex items-center gap-3 py-3 text-left hover:bg-slate-50 -mx-2 px-2 rounded-xl transition">
            <Logo h={h} size={40} rounded="rounded-xl" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 text-[15px] leading-tight">{h.ticker}</div>
              <div className="text-xs text-slate-400 truncate mt-0.5">{h.name}</div>
              <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-800 rounded-full" style={{ width: `${Math.min(100, w)}%` }} /></div>
            </div>
            <div className="text-right shrink-0">
              <Ret v={r} className="text-[15px] font-bold block leading-tight" />
              <div className="text-[11px] font-semibold text-slate-400 tabular-nums mt-0.5 whitespace-nowrap">{w.toFixed(1)}% of portfolio</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* Loading placeholder: a few shimmering lines in a card. */
function Skeleton({ lines = 3, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 ${className}`} aria-busy="true">
      <div className="skel h-4 w-1/3 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skel h-3 mb-2" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}

function StatCard({ label, value, tone = "text-slate-700" }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 text-center shadow-sm border border-slate-100">
      <div className={`font-bold text-sm ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-400 font-medium mt-0.5">{label}</div>
    </div>
  );
}

/* ================= DASHBOARD CARDS ================= */
/* Cash-flow-adjusted period return: what your money did, ignoring what you
   put in or took out during the window.  r = (Δvalue − Δcost) / value₀  */
const periodReturn = (series, fromIdx) => {
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
const idxOnOrBefore = (series, t) => {
  let i = -1;
  for (let k = 0; k < series.length; k++) { if (new Date(series[k].t).getTime() <= t) i = k; else break; }
  return i;
};
/* Benchmarks the user can compare against. Symbols are what the
   get-history function (Yahoo) understands; all verified to return data. */
const BENCHMARKS = [
  { symbol: "SPY",     label: "S&P 500",         short: "S&P" },
  { symbol: "QQQ",     label: "Nasdaq-100",      short: "NDX" },
  { symbol: "URTH",    label: "MSCI World",      short: "World" },
  { symbol: "^OMXH25", label: "OMX Helsinki 25", short: "OMXH" },
  { symbol: "FEZ",     label: "Euro Stoxx 50",   short: "STOXX" },
  { symbol: "^GDAXI",  label: "DAX",             short: "DAX" },
  { symbol: "BTC-USD", label: "Bitcoin",         short: "BTC" },
];
const DEFAULT_BENCH = BENCHMARKS[0];
/* data.benchmark may be a preset symbol or a custom {symbol,label}. */
const benchOf = (data) => {
  const b = data && data.benchmark;
  if (!b) return DEFAULT_BENCH;
  if (typeof b === "string") return BENCHMARKS.find((x) => x.symbol === b) || { symbol: b, label: b, short: b.replace(/^\^/, "").slice(0, 6) };
  if (b.symbol) return BENCHMARKS.find((x) => x.symbol === b.symbol) || { symbol: b.symbol, label: b.label || b.symbol, short: (b.short || b.symbol).replace(/^\^/, "").slice(0, 6) };
  return DEFAULT_BENCH;
};

/* Small select for choosing the benchmark; "Custom…" lets you type any
   ticker the price source knows (e.g. VT, EUNL.DE, ^OMXS30). */
function BenchPicker({ value, onChange, dark }) {
  const [custom, setCustom] = useState(false);
  const [txt, setTxt] = useState("");
  const isPreset = BENCHMARKS.some((b) => b.symbol === value.symbol);
  if (custom) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); const t = txt.trim().toUpperCase(); if (t) onChange({ symbol: t, label: t, short: t.replace(/^\^/, "").slice(0, 6) }); setCustom(false); setTxt(""); }}
        className="flex items-center gap-1">
        <input autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="ticker, e.g. VT"
          className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-xs uppercase" />
        <button type="submit" className="text-xs font-semibold text-emerald-600">OK</button>
        <button type="button" onClick={() => setCustom(false)} className="text-xs text-slate-400">✕</button>
      </form>
    );
  }
  return (
    <select value={isPreset ? value.symbol : "__custom_current"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__custom") { setCustom(true); return; }
        if (v === "__custom_current") return;
        onChange(BENCHMARKS.find((b) => b.symbol === v));
      }}
      className={`text-xs font-semibold rounded-lg px-2 py-1 border ${dark ? "bg-slate-800 text-white border-slate-700" : "bg-white text-slate-600 border-slate-200"}`}>
      {BENCHMARKS.map((b) => <option key={b.symbol} value={b.symbol}>vs {b.label}</option>)}
      {!isPreset && <option value="__custom_current">vs {value.label}</option>}
      <option value="__custom">Custom ticker…</option>
    </select>
  );
}

/* Cache the daily series per holdings signature so switching tabs doesn't
   refetch; benchmark closes are cached per symbol. */
const histCache = { key: "", portfolio: null, at: 0, bench: {} };
const holdingsKey = (holdings, cur) => cur + "|" + (holdings || []).map((h) => `${h.ticker}:${h.shares}:${h.buyPrice}:${h.buyDate || ""}`).join(",");

async function loadDailySeries(holdings, cur, benchSymbol) {
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

function PeriodReturns({ active, cur, liveValue, liveCost, bench: BENCH, onBench, onYtd, bare }) {
  const [rows, setRows] = useState(null); // [{label, mine, bench}]
  const [state, setState] = useState("loading");
  const key = holdingsKey(active.holdings, cur);
  useEffect(() => {
    let dead = false;
    (async () => {
      setState("loading");
      try {
        const { portfolio, bench } = await loadDailySeries(active.holdings, cur, BENCH.symbol);
        if (dead) return;
        if (!portfolio || !portfolio.length) { setState("none"); return; }
        const series = [...portfolio, { t: new Date().toISOString(), value: liveValue, cost: liveCost }];
        const bseries = bench && bench.length ? bench : null;
        const now = Date.now();
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
        const windows = [
          { label: "Today", from: startOfToday.getTime() - 1 },
          { label: "1 week", from: now - 7 * 86400000 },
          { label: "1 month", from: now - 30 * 86400000 },
          { label: "YTD", from: jan1 },
          { label: "All", from: 0 }, // since the first position (≤ 1 year of history)
        ];
        const bRet = (from) => {
          if (!bseries) return null;
          const i = idxOnOrBefore(bseries, from);
          const a = i >= 0 ? bseries[i] : bseries[0];
          const b = bseries[bseries.length - 1];
          return a && b && a.c > 0 ? ((b.c - a.c) / a.c) * 100 : null;
        };
        const computed = windows.map((w) => {
          let i = idxOnOrBefore(series, w.from);
          // portfolio younger than the window: measure from its first point
          if (i < 0) i = 0;
          while (i < series.length - 1 && !(series[i].value > 0)) i++;
          const mine = periodReturn(series, i);
          // benchmark over the SAME window the portfolio was measured on
          const from = series[i] ? new Date(series[i].t).getTime() : w.from;
          return { label: w.label, mine, bench: bRet(from), since: series[i] ? series[i].t : null };
        });
        setRows(computed);
        const y = computed.find((r) => r.label === "YTD");
        if (onYtd) onYtd(y ? (y.mine != null ? Number(y.mine.toFixed(2)) : null) : null, y ? (y.bench != null ? Number(y.bench.toFixed(2)) : null) : null);
        setState("ok");
      } catch (e) { if (!dead) setState("none"); }
    })();
    return () => { dead = true; };
  }, [key, Math.round(liveValue), BENCH.symbol]);

  return (
    <div className={bare ? "" : "card"}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="section-title">Periods</h3>
        <BenchPicker value={BENCH} onChange={onBench} />
      </div>
      {state === "loading" ? (
        <div className="grid grid-cols-5 gap-1.5" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="bg-slate-50 rounded-2xl p-2.5"><div className="skel h-2.5 w-2/3 mx-auto mb-2" /><div className="skel h-4 w-3/4 mx-auto mb-1.5" /><div className="skel h-2.5 w-1/2 mx-auto" /></div>)}
        </div>
      ) : state === "none" || !rows ? (
        <p className="text-sm text-slate-400">Not enough price history yet — check back after the next market day.</p>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {rows.map((r) => {
            const has = r.mine != null;
            const up = (r.mine || 0) >= 0;
            const beat = has && r.bench != null ? r.mine - r.bench : null;
            return (
              <div key={r.label} className="bg-slate-50 rounded-2xl p-2.5 text-center">
                <div className="text-[10px] font-semibold text-slate-400">{r.label}</div>
                <div className={`font-bold text-sm mt-0.5 ${!has ? "text-slate-300" : up ? "text-emerald-600" : "text-rose-500"}`}>{has ? pct(r.mine) : "—"}</div>
                <div className={`text-[10px] font-semibold mt-0.5 ${beat == null ? "text-slate-300" : beat >= 0 ? "text-emerald-500" : "text-slate-400"}`}
                  title={r.bench != null ? `${BENCH.label}: ${pct(r.bench)}` : `No data for ${BENCH.symbol}`}>
                  {beat == null ? "" : `${beat >= 0 ? "+" : "−"}${Math.abs(beat).toFixed(1)} vs ${BENCH.short}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-slate-300 mt-2">Returns exclude money you added or withdrew during the period. {BENCH.label} via {BENCH.symbol} in its own currency; “no data” means the price source doesn't know that ticker.</p>
    </div>
  );
}

/* First-run checklist: Add portfolio → Add friends → Compare. Lives on the
   Overview until all three are done (or dismissed). Status comes from
   what actually exists — holdings, mutual friends, a leaderboard row. */
function OnboardingCard({ user, active, data, onImport, onAddManually, goFriends, onDismiss }) {
  const [friendsN, setFriendsN] = useState(null);
  const [onBoard, setOnBoard] = useState(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ data: out }, { data: inc }, { data: row }] = await Promise.all([
          supabase.from("friends").select("friend_id").eq("user_id", user.id),
          supabase.from("friends").select("user_id").eq("friend_id", user.id),
          supabase.from("leaderboard").select("user_id").eq("user_id", user.id).maybeSingle(),
        ]);
        if (dead) return;
        const incSet = new Set((inc || []).map((r) => r.user_id));
        setFriendsN((out || []).filter((r) => incSet.has(r.friend_id)).length);
        setOnBoard(!!row);
      } catch (e) { if (!dead) { setFriendsN(0); setOnBoard(false); } }
    })();
    return () => { dead = true; };
  }, [user.id, active.holdings.length]);
  const real = active.holdings.filter((h) => !h.sample).length;
  const steps = [
    { id: "portfolio", title: "Add your portfolio", done: real > 0,
      hint: real > 0 ? `${real} position${real === 1 ? "" : "s"} added` : "Screenshot your broker app — RichR reads it in ~20 s.",
      actions: real > 0 ? [] : [["Import portfolio", onImport, true], ["Add manually", onAddManually, false]] },
    { id: "friends", title: "Add friends", done: (friendsN || 0) > 0,
      hint: friendsN == null ? "" : friendsN > 0 ? `${friendsN} mutual friend${friendsN === 1 ? "" : "s"}` : "Friends who add you back can see what you share — and you them.",
      actions: (friendsN || 0) > 0 ? [] : [["Find friends", goFriends, true]] },
    { id: "compare", title: "Compare", done: !!onBoard,
      hint: onBoard ? "You're on the leaderboard" : "Share your return % (never amounts) to see where you rank.",
      actions: onBoard ? [] : [["Share & compare", goFriends, true]] },
  ];
  const doneN = steps.filter((s) => s.done).length;
  if (friendsN === null || onBoard === null) return null;
  if (doneN === 3) return null;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-700">Get set up</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400">{doneN}/3</span>
          <button onClick={onDismiss} className="text-slate-300 hover:text-slate-500" aria-label="Hide"><X size={14} /></button>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(doneN / 3) * 100}%` }} />
      </div>
      <div className="space-y-3">
        {steps.map((st, i) => (
          <div key={st.id} className="flex items-start gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${st.done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
              {st.done ? <Check size={13} /> : i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${st.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{st.title}</div>
              <p className="text-[11px] text-slate-400 leading-snug">{st.hint}</p>
              {st.actions.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {st.actions.map(([label, fn, primary]) => (
                    <button key={label} onClick={fn}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full ${primary ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow" : "bg-slate-100 text-slate-600"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreCard({ active, cur, fx, liveValue, liveCost, log, onLog }) {
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const key = holdingsKey(active.holdings, cur);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { portfolio, bench } = await loadDailySeries(active.holdings, cur, DEFAULT_BENCH.symbol);
        if (dead) return;
        const series = portfolio ? [...portfolio, { t: new Date().toISOString(), value: liveValue, cost: liveCost }] : null;
        const r = computeScore({ holdings: active.holdings, cur, fx, series, bench });
        setRes(r);
        // keep one entry per day so "why it changed" has something to compare with
        if (r.score != null) {
          const today = new Date().toISOString().slice(0, 10);
          const last = log[log.length - 1];
          const entry = { d: today, score: r.score, parts: r.parts, inputs: r.inputs };
          if (!last || last.d !== today) onLog([...log, entry].slice(-60));
          else if (last.score !== r.score) onLog([...log.slice(0, -1), entry]);
        }
      } catch (e) { if (!dead) setRes({ score: null, parts: {}, notes: {} }); }
    })();
    return () => { dead = true; };
  }, [key, Math.round(liveValue)]);

  // compare with the most recent entry from a previous day
  const today = new Date().toISOString().slice(0, 10);
  const prev = [...log].reverse().find((e) => e.d !== today) || null;
  const delta = res && res.score != null && prev ? res.score - prev.score : null;
  const ring = res && res.score != null ? res.score : 0;
  const tone = scoreTone(res && res.score);
  const hex = ring >= 75 ? "#10b981" : ring >= 50 ? "#f59e0b" : "#f43f5e";

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-4 text-left">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={hex} strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={`${(ring / 100) * 97.4} 97.4`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-2xl font-extrabold leading-none ${tone}`}>{res && res.score != null ? res.score : "—"}</div>
            <div className="text-[9px] font-semibold text-slate-400 mt-0.5">/ 100</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-700">RichR Score</h3>
            {delta != null && delta !== 0 && (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${delta > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} since {fmtDate(prev.d)}
              </span>
            )}
          </div>
          {res == null ? (
            <div className="mt-2 space-y-1.5" aria-busy="true"><div className="skel h-3 w-3/4" /><div className="skel h-3 w-1/2" /></div>
          ) : res.score == null ? (
            <p className="text-xs text-slate-400 mt-1">Add a few positions and give it a day of price history.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1.5">
              {Object.keys(SCORE_LABEL).map((k) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 truncate">{SCORE_LABEL[k]}</span>
                  <span className={`font-bold ml-2 ${scoreTone(res.parts[k])}`}>{res.parts[k] != null ? res.parts[k] : "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="text-[10px] text-slate-400 mt-1.5">{open ? "Hide details" : "Tap for what each part means and how to improve it"}</div>
        </div>
      </button>
      {open && res && (
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
          {(() => {
            const why = explainScoreChange(prev, { parts: res.parts, inputs: res.inputs });
            return why.length ? (
              <div className="bg-slate-50 rounded-2xl p-3">
                <div className="text-[10px] font-bold text-slate-400 mb-1">WHY IT CHANGED SINCE {prev ? fmtDate(prev.d).toUpperCase() : ""}</div>
                {why.map((w, i) => <p key={i} className="text-xs text-slate-600 leading-snug mb-1 last:mb-0">{w}</p>)}
              </div>
            ) : null;
          })()}
          {Object.keys(SCORE_LABEL).map((k) => {
            const cur_ = res.parts[k], was = prev && prev.parts ? prev.parts[k] : null;
            const d = cur_ != null && was != null ? cur_ - was : null;
            return (
              <div key={k}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700">{SCORE_LABEL[k]} <span className="text-[10px] text-slate-400 font-medium">· {Math.round(SCORE_WEIGHTS[k] * 100)}% of score</span></div>
                  <div className="flex items-center gap-1.5">
                    {d != null && d !== 0 && <span className={`text-[10px] font-bold ${d > 0 ? "text-emerald-600" : "text-rose-500"}`}>{d > 0 ? "+" : ""}{d}</span>}
                    <span className={`font-bold text-sm ${scoreTone(cur_)}`}>{cur_ != null ? cur_ : "—"}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div className="h-full rounded-full" style={{ width: `${cur_ || 0}%`, background: cur_ >= 75 ? "#10b981" : cur_ >= 50 ? "#f59e0b" : "#f43f5e" }} />
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mt-1">{res.notes[k] || ""}</p>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-300">Score = weighted average of the parts you have data for. Performance is judged against the S&P 500 regardless of your chosen benchmark, so friends' scores are comparable. Shared with friends only if “RichR Score” is on in Profile.</p>
        </div>
      )}
    </div>
  );
}

/* "You +14.2% · Friends +9.7% · S&P 500 +8.4% · #2 among 8 friends".
   Friends' numbers are their published time-weighted YTD returns on the
   leaderboard (mutual friends only — RLS). Mine is my own published row
   if I've shared, otherwise my local cash-flow-adjusted YTD. */
function FriendsBenchmark({ user, myYtd, benchYtd, benchLabel, onGoFriends, onSummary, hidden }) {
  const [rows, setRows] = useState(null); // [{userId, name, ret}]
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ data: out }, { data: inc }, { data: board }] = await Promise.all([
          supabase.from("friends").select("friend_id").eq("user_id", user.id),
          supabase.from("friends").select("user_id").eq("friend_id", user.id),
          supabase.from("leaderboard").select("user_id, name, return_pct, profile"),
        ]);
        if (dead) return;
        const incSet = new Set((inc || []).map((r) => r.user_id));
        const mutual = new Set((out || []).map((r) => r.friend_id).filter((id) => incSet.has(id)));
        const rs = (board || []).filter((b) => b.return_pct != null && (mutual.has(b.user_id) || b.user_id === user.id))
          .map((b) => ({ userId: b.user_id, name: b.name, ret: Number(b.return_pct), mascot: (profileOf(b.profile) || {}).mascot || "🙂" }));
        setRows(rs);
      } catch (e) { if (!dead) setRows([]); }
    })();
    return () => { dead = true; };
  }, [user.id]);

  const meRow = rows ? rows.find((r) => r.userId === user.id) : null;
  const mine = meRow ? meRow.ret : myYtd;
  const friends = rows ? rows.filter((r) => r.userId !== user.id) : [];
  const friendsAvg = friends.length ? friends.reduce((a, r) => a + r.ret, 0) / friends.length : null;
  let rank = null;
  if (mine != null && friends.length) {
    const all = [...friends.map((f) => f.ret), mine].sort((a, b) => b - a);
    rank = all.indexOf(mine) + 1;
  }
  useEffect(() => {
    if (rows && onSummary) onSummary({ mine, friendsAvg, rank, n: friends.length + 1, shared: !!meRow, friendsCount: friends.length, avatars: friends.map((f) => f.mascot) });
  }, [rows, mine, friendsAvg, rank]);
  if (rows === null || hidden) return null;
  const Cell = ({ label, v, tone, hint }) => (
    <div className="bg-slate-50 rounded-2xl p-2.5 text-center min-w-0">
      <div className="text-[10px] font-semibold text-slate-400 truncate">{label}</div>
      <div className={`font-bold text-sm mt-0.5 ${v == null ? "text-slate-300" : tone || ((v >= 0) ? "text-emerald-600" : "text-rose-500")}`}>{v == null ? "—" : pct(v)}</div>
      {hint && <div className="text-[10px] text-slate-400 truncate">{hint}</div>}
    </div>
  );
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-700 flex items-center gap-2"><Users size={16} className="text-emerald-500" /> You vs friends</h3>
        <span className="text-[11px] text-slate-400">YTD, time-weighted</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="You" v={mine} hint={meRow ? "as shared" : "not shared yet"} />
        <Cell label={`Friends${friends.length ? ` (${friends.length})` : ""}`} v={friendsAvg} hint={friends.length ? "average" : "none sharing"} />
        <Cell label={benchLabel} v={benchYtd} tone="text-slate-700" hint="index" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {rank != null ? (
          <div className="text-sm font-semibold text-slate-700">
            <span className={`inline-block px-2 py-0.5 rounded-full text-white text-xs mr-1.5 ${rank === 1 ? "bg-amber-400" : rank <= 3 ? "bg-emerald-500" : "bg-slate-400"}`}>#{rank}</span>
            among {friends.length + 1} {friends.length + 1 === 1 ? "person" : "people"} sharing
          </div>
        ) : (
          <div className="text-xs text-slate-400">
            {friends.length === 0 ? "No friends are sharing a return yet — nudge them in the Friends tab." : "Share your portfolio to get ranked."}
          </div>
        )}
        <button onClick={onGoFriends} className="text-xs font-semibold text-emerald-600 shrink-0">Leaderboard →</button>
      </div>
    </div>
  );
}

function MoversCard({ active, cur, fx }) {
  const priced = active.holdings.filter((h) => h.currentPrice > 0 && h.buyPrice > 0)
    .map((h) => ({ h, r: ((h.currentPrice - h.buyPrice) / h.buyPrice) * 100 }));
  if (!priced.length) return null;
  const sorted = [...priced].sort((a, b) => b.r - a.r);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const total = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  const weights = byValueDesc(active.holdings, cur, fx).map((h) => total > 0 ? holdingValue(h, cur, fx) / total : 0);
  const top1 = (weights[0] || 0) * 100;
  const top3 = weights.slice(0, 3).reduce((a, b) => a + b, 0) * 100;
  const hhi = weights.reduce((a, w) => a + w * w, 0); // 1 = single position, 1/n = equal weights
  const effN = hhi > 0 ? 1 / hhi : 0;
  const conc = top1 >= 40 ? "Very concentrated" : top1 >= 25 ? "Concentrated" : top3 >= 50 ? "Focused" : "Diversified";
  const Row = ({ label, item, tone }) => (
    <div className="flex items-center gap-3">
      <Logo h={item.h} size={34} rounded="rounded-xl" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-slate-400">{label}</div>
        <div className="text-sm font-semibold text-slate-700 truncate">{item.h.name || item.h.ticker}</div>
      </div>
      <div className={`font-bold text-sm ${tone}`}>{pct(item.r)}</div>
    </div>
  );
  return (
    <div className="space-y-3">
      <h3 className="section-title">Movers</h3>
      <Row label="BEST PERFORMER" item={best} tone={best.r >= 0 ? "text-emerald-600" : "text-rose-500"} />
      {sorted.length > 1 && <Row label="WORST PERFORMER" item={worst} tone={worst.r >= 0 ? "text-emerald-600" : "text-rose-500"} />}
      <div className="border-t border-slate-100 pt-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold text-slate-400">CONCENTRATION</div>
          <div className="text-sm font-semibold text-slate-700">{conc}</div>
        </div>
        <div className="text-right text-[11px] text-slate-400 leading-snug">
          Top position {top1.toFixed(0)}% · top 3 {top3.toFixed(0)}%<br />
          ≈ {effN.toFixed(1)} equally-weighted positions
        </div>
      </div>
    </div>
  );
}

const ALLOC_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#14b8a6", "#94a3b8"];
function AllocationCard({ active, cur, fx }) {
  const total = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  if (!(total > 0)) return null;
  const sorted = byValueDesc(active.holdings, cur, fx);
  const top = sorted.slice(0, 7).map((h) => ({ name: h.ticker, value: holdingValue(h, cur, fx) }));
  const rest = sorted.slice(7).reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  const data = rest > 0 ? [...top, { name: "Other", value: rest }] : top;
  // by asset type too (Stock / ETF / …)
  const byType = {};
  active.holdings.forEach((h) => { const t = h.type || "Stock"; byType[t] = (byType[t] || 0) + holdingValue(h, cur, fx); });
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <h3 className="section-title mb-2">Allocation</h3>
      <div className="flex items-center gap-3">
        <div className="w-36 h-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none" isAnimationActive={false}>
                {data.map((_, i) => <Cell key={i} fill={ALLOC_COLORS[i % ALLOC_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(v, n) => [`${((v / total) * 100).toFixed(1)}%`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
              <span className="font-semibold text-slate-600 truncate flex-1">{d.name}</span>
              <span className="text-slate-500 font-semibold">{((d.value / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
      {types.length > 1 && (
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {types.map(([t, v]) => (
            <span key={t} className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{t} {((v / total) * 100).toFixed(0)}%</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= POSITIONS ================= */
function PositionsTab({ active, cur, fx, companyInfo, onSaveInfo, onUpsert, onRemove, onSetPrice, onLoadSample, onClosePosition, watchlist, onRemoveWatch, onSetWatchPrice, goResearch, openImport, onImportOpened }) {
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [dense, setDense] = useState(true); // compact rows by default; "Show details" expands
  const totalValue = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  useEffect(() => { if (openImport) { setImporting(true); if (onImportOpened) onImportOpened(); } }, [openImport]);
  const [detail, setDetail] = useState(null);
  const [view, setView] = useState("holdings"); // "holdings" | "watchlist"
  const [buying, setBuying] = useState(null);   // watchlist item being converted to a position

  const wl = watchlist || [];

  /* concept portfolio: equal-weight average of "since added" returns */
  const concept = useMemo(() => {
    const rets = wl
      .filter((w) => w.addedPrice > 0 && w.currentPrice > 0)
      .map((w) => ((w.currentPrice - w.addedPrice) / w.addedPrice) * 100);
    if (!rets.length) return null;
    return rets.reduce((a, b) => a + b, 0) / rets.length;
  }, [wl]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-slate-700">Positions</h2>
        {view === "holdings" && (
          <div className="flex gap-2">
            <button onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 text-sm font-semibold px-3.5 py-2 rounded-full shadow-sm">
              <Camera size={15} /> Import
            </button>
            <button onClick={() => setEditing("new")}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-full shadow">
              <Plus size={15} /> Add
            </button>
          </div>
        )}
      </div>

      {/* holdings / watchlist switcher */}
      <div className="bg-slate-100 rounded-2xl p-1 flex">
        {[["holdings", "Holdings"], ["watchlist", wl.length ? `Watchlist (${wl.length})` : "Watchlist"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 text-sm font-semibold py-2 rounded-xl transition ${
              view === id ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}>
            {lbl}
          </button>
        ))}
      </div>

      {view === "holdings" && (<>
      {active.holdings.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
          <p className="font-semibold text-slate-600 mb-1">Nothing here yet</p>
          <p className="text-sm text-slate-400 mb-4">Add positions manually, or import them straight from a screenshot of your bank or broker app.</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow">
              <Camera size={15} /> Import portfolio
            </button>
            <button onClick={onLoadSample} className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">
              Try sample data
            </button>
          </div>
        </div>
      ) : (<>
        {active.holdings.some((h) => h.sample) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-800">Sample positions</div>
              <p className="text-[11px] text-amber-700 leading-snug">These aren't real — edit one to keep it, or clear them and add your own. Sample data can't be shared with friends.</p>
            </div>
            <button onClick={() => active.holdings.filter((h) => h.sample).forEach((h) => onRemove(h.id))}
              className="shrink-0 bg-white border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full">
              Clear
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400 tabular-nums">{active.holdings.length} positions · {money(totalValue, cur)}</div>
          <button onClick={() => setDense((v) => !v)} className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">{dense ? "Show details" : "Compact"}</button>
        </div>
        <div className="card-tight divide-y divide-slate-100 !py-1">
          {byValueDesc(active.holdings, cur, fx).map((h) => (
            <PositionCard key={h.id} h={h} cur={cur} fx={fx} onOpen={() => setDetail(h)}
              weight={totalValue > 0 ? (holdingValue(h, cur, fx) / totalValue) * 100 : 0} expanded={!dense}
              onEdit={() => setEditing(h)} onRemove={() => onRemove(h.id)} onSetPrice={onSetPrice} />
          ))}
        </div>
      </>)}

      {(active.closed && active.closed.length > 0) && (
        <div className="pt-2">
          <h3 className="text-xs font-semibold text-slate-400 mb-2 mt-2">CLOSED TRADES</h3>
          <div className="space-y-2">
            {active.closed.slice().reverse().map((h) => {
              const rc = fxConvert(h.shares * h.buyPrice, h.currency || cur, cur, fx);
              const rp = fxConvert(h.shares * (h.sellPrice || 0), h.currency || cur, cur, fx);
              const pl = rc ? ((rp - rc) / rc) * 100 : 0;
              const win = pl >= 0;
              return (
                <div key={h.id + "-" + (h.closedAt || "")} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-slate-100">
                  <Logo h={h} size={32} rounded="rounded-xl" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-700 truncate">{h.name || h.ticker}</div>
                    <div className="text-[11px] text-slate-400">{money(h.buyPrice, h.currency || cur)} → {money(h.sellPrice, h.currency || cur)} · sold {h.sellDate}</div>
                  </div>
                  <div className={`text-sm font-bold ${win ? "text-emerald-600" : "text-rose-500"}`}>{pct(pl)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>)}

      {view === "watchlist" && (<>
      {wl.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
          <Star size={24} className="mx-auto text-amber-400 mb-3" />
          <p className="font-semibold text-slate-600 mb-1">Your watchlist is empty</p>
          <p className="text-sm text-slate-400 mb-4">Find assets you're keen on in Research and tap Watch — they'll show up here as a concept portfolio you can track before buying.</p>
          <button onClick={goResearch}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow mx-auto">
            <Search size={15} /> Go to Research
          </button>
        </div>
      ) : (<>
        {concept != null && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-400">CONCEPT PORTFOLIO</div>
              <div className="text-[11px] text-slate-400 mt-0.5">If you'd bought equal amounts when you added each</div>
            </div>
            <div className={`text-xl font-extrabold shrink-0 ${concept >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {pct(concept)}
            </div>
          </div>
        )}
        {wl.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).map((w) => (
          <WatchCard key={w.id} w={w} cur={cur}
            onBuy={() => setBuying(w)}
            onRemove={() => onRemoveWatch(w.id)}
            onSetPrice={onSetWatchPrice} />
        ))}
        <p className="text-[11px] text-slate-400 text-center pt-1">Watchlist prices refresh together with your positions.</p>
      </>)}
      </>)}

      {importing && (
        <ImportModal cur={cur} onClose={() => setImporting(false)}
          onImport={(rows) => { rows.forEach(onUpsert); setImporting(false); }} />
      )}

      {detail && (
        <DetailSheet h={active.holdings.find((x) => x.id === detail.id) || detail}
          cur={cur} fx={fx}
          info={companyInfo[(detail.ticker || "").toUpperCase()]}
          onSaveInfo={onSaveInfo}
          onClosePosition={(sellPrice, sellDate) => { onClosePosition(detail.id, sellPrice, sellDate); setDetail(null); }}
          onClose={() => setDetail(null)} />
      )}

      {editing && (
        <PositionModal holding={editing === "new" ? null : editing} cur={cur} fx={fx} holdings={active.holdings}
          onClose={() => setEditing(null)}
          onSave={(h) => { onUpsert(h); if (editing !== "new") setEditing(null); }} />
      )}

      {buying && (
        <PositionModal cur={cur} fx={fx} holdings={active.holdings} title="Buy — new position"
          holding={{
            id: uid(), ticker: buying.ticker, name: buying.name || buying.ticker, domain: "",
            type: buying.type || "Stock", currency: buying.currency || cur,
            shares: "", buyPrice: buying.currentPrice > 0 ? buying.currentPrice : "",
            buyDate: new Date().toISOString().slice(0, 10),
            currentPrice: buying.currentPrice || 0, thesis: "", verdict: "open",
          }}
          onClose={() => setBuying(null)}
          onSave={(h) => { onUpsert(h); onRemoveWatch(buying.id); }} />
      )}
    </div>
  );
}

/* one watched asset — tracks performance since you added it */
function WatchCard({ w, cur, onBuy, onRemove, onSetPrice }) {
  const [editPrice, setEditPrice] = useState(false);
  const wc = w.currency || cur;
  const cp = w.currentPrice > 0 ? w.currentPrice : 0;
  const sincePct = w.addedPrice > 0 && cp > 0 ? ((cp - w.addedPrice) / w.addedPrice) * 100 : null;
  const up = (sincePct || 0) >= 0;
  const days = w.addedAt ? Math.max(0, Math.floor((Date.now() - w.addedAt) / 86400000)) : 0;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Logo h={w} />
          <div className="min-w-0">
            <div className="font-semibold text-slate-700 truncate">{w.name || w.ticker}</div>
            <div className="text-xs text-slate-400 font-medium">
              {w.ticker} · {w.type || "Stock"}
              {wc !== cur && <span className="ml-1 text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">{wc}</span>}
              {" "}· watching {days}d
            </div>
            <button onClick={() => setEditPrice(true)}
              className={`text-xs font-semibold mt-0.5 underline decoration-dotted ${
                cp > 0 && w.addedPrice > 0
                  ? (cp > w.addedPrice ? "text-emerald-600" : cp < w.addedPrice ? "text-rose-500" : "text-slate-400")
                  : "text-slate-400"}`}>
              {cp > 0 ? `now ${money(cp, wc)}` : "set price"}
            </button>
            {w.addedPrice > 0 && (
              <div className="text-[11px] text-slate-400 mt-0.5">added at {money(w.addedPrice, wc)}</div>
            )}
            {editPrice && (
              <div className="mt-1.5">
                <input autoFocus type="number" defaultValue={w.currentPrice || ""}
                  placeholder={`Price in ${wc}`}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0) onSetPrice(w.id, v); setEditPrice(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm w-32" />
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {sincePct != null ? (
            <>
              <div className={`text-lg font-extrabold ${up ? "text-emerald-600" : "text-rose-500"}`}>{pct(sincePct)}</div>
              <div className="text-[10px] font-semibold text-slate-400">SINCE ADDED</div>
            </>
          ) : (
            <div className="text-xs text-slate-400">no price yet</div>
          )}
          <div className="flex gap-1.5 justify-end mt-2">
            <button onClick={onBuy}
              className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow">
              <Plus size={12} /> Buy
            </button>
            <button onClick={onRemove} className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionCard({ h, cur, fx, onOpen, onEdit, onRemove, onSetPrice, weight = null, expanded = false }) {
  const [editPrice, setEditPrice] = useState(false);
  const hc = h.currency || cur;
  const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
  const value = fxConvert(h.shares * cp, hc, cur, fx);
  const plPct = h.buyPrice ? ((cp - h.buyPrice) / h.buyPrice) * 100 : 0;
  const pl = fxConvert(h.shares * (cp - h.buyPrice), hc, cur, fx);
  const up = plPct >= 0;
  const V = VERDICTS[h.verdict] || VERDICTS.open;

  return (
    <div className="py-3 cursor-pointer" onClick={onOpen}>
      <div className="flex items-center gap-3">
        <Logo h={h} size={40} rounded="rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-bold text-slate-900 text-[15px] leading-tight flex items-center gap-1.5">
              {h.ticker}
              {h.sample && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">sample</span>}
              {hc !== cur && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{hc}</span>}
            </div>
            {weight != null && <div className="text-xs font-semibold text-slate-500 tabular-nums">{weight.toFixed(1)}%</div>}
          </div>
          <div className="text-xs text-slate-400 truncate">{h.name}</div>
          {weight != null && (
            <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-800 rounded-full" style={{ width: `${Math.min(100, weight)}%` }} /></div>
          )}
        </div>
        <div className="text-right shrink-0 w-24">
          <div className="font-bold text-slate-900 text-[15px] tabular-nums leading-tight">{money(value, cur)}</div>
          <Ret v={plPct} className="text-xs font-bold block mt-0.5" />
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 ml-[52px] flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500 tabular-nums">
            {h.shares} × {money(h.buyPrice, hc)} → <button onClick={(e) => { e.stopPropagation(); setEditPrice(true); }} className="font-semibold text-slate-700 underline decoration-dotted">{money(cp, hc)}</button>
            <span className="text-slate-400"> · {up ? "+" : "−"}{money(Math.abs(pl), cur)} · {daysHeld(h.buyDate)}d · {h.type}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded ${V.chip}`}><V.icon size={10} /> {V.label}</span>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"><Pencil size={12} /></button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
          </div>
          {editPrice && (
            <div className="w-full" onClick={(e) => e.stopPropagation()}>
              <input autoFocus type="number" defaultValue={h.currentPrice || ""} placeholder={`Price in ${hc}`}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0) onSetPrice(h.id, v); setEditPrice(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-36" />
            </div>
          )}
          {h.thesis && <p className="w-full text-xs text-slate-400 italic truncate">“{h.thesis}”</p>}
        </div>
      )}
    </div>
  );
}

/* ================= ADD / EDIT POSITION ================= */
/* Progressive disclosure: search → pick a stock → shares & price → add.
   Everything derivable (value, currency, name, current price) is filled in
   for you; date, type, currency and thesis live behind "More details". */
const EXCHANGE_BY_SUFFIX = {
  HE: "Nasdaq Helsinki", ST: "Nasdaq Stockholm", CO: "Nasdaq Copenhagen", OL: "Oslo Børs",
  AS: "Euronext Amsterdam", PA: "Euronext Paris", BR: "Euronext Brussels", LS: "Euronext Lisbon", MI: "Borsa Italiana",
  DE: "Xetra", F: "Frankfurt", VI: "Vienna", SW: "SIX Swiss", L: "London", TO: "Toronto", V: "TSX Venture",
  T: "Tokyo", HK: "Hong Kong", AX: "ASX", SA: "B3 São Paulo", MC: "Madrid", IR: "Dublin", TA: "Tel Aviv",
};
const exchangeOf = (symbol, currency) => {
  const s = String(symbol || "").toUpperCase();
  const i = s.lastIndexOf(".");
  if (i > 0) return EXCHANGE_BY_SUFFIX[s.slice(i + 1)] || s.slice(i + 1);
  return currency === "USD" ? "US" : "";
};
const isFund = (r) => /fund|etf/i.test(r.type || "") || /\bETF\b|UCITS|Index/i.test(r.name || "");

function PositionModal({ holding, cur, fx = null, holdings = [], onClose, onSave, title }) {
  const editing = !!(holding && holding.ticker && Number(holding.shares) > 0); // real edit, not a prefilled "buy"
  const blank = () => ({ id: uid(), ticker: "", name: "", domain: "", type: "Stock", currency: cur, shares: "", buyPrice: "", buyDate: new Date().toISOString().slice(0, 10), currentPrice: 0, thesis: "", verdict: "open" });
  const [f, setF] = useState(holding ? { ...blank(), ...holding } : blank());
  const [step, setStep] = useState(holding && holding.ticker ? "fields" : "search"); // search | fields | done
  const [more, setMore] = useState(editing);
  const [touched, setTouched] = useState({});
  const [dupChoice, setDupChoice] = useState("merge"); // merge | separate
  const [added, setAdded] = useState([]);              // this session's additions
  const [quote, setQuote] = useState(null);            // live price for the picked stock
  const [quoteState, setQuoteState] = useState("idle"); // idle | loading | ok | none
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const sharesRef = useRef(null), priceRef = useRef(null), searchRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, []);

  /* ---------- 1. search ---------- */
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);   // null = nothing searched yet
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState(false);
  const [hi, setHi] = useState(0);
  const timer = useRef(null);
  const reqId = useRef(0);
  const search = (raw) => {
    setQ(raw);
    if (timer.current) clearTimeout(timer.current);
    const term = raw.trim();
    if (term.length < 2) { setResults(null); setSearching(false); setSearchErr(false); return; }
    setSearching(true);
    const my = ++reqId.current;
    timer.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q: term } });
        if (my !== reqId.current) return;
        if (error) throw error;
        const seen = new Set();
        const rows = (data && Array.isArray(data.results) ? data.results : []).filter((r) => {
          const k = String(r.symbol || "").toUpperCase(); if (!k || seen.has(k)) return false; seen.add(k); return true;
        }).slice(0, 7);
        setResults(rows); setSearchErr(false); setHi(0);
      } catch (e) { if (my === reqId.current) { setResults([]); setSearchErr(true); } }
      if (my === reqId.current) setSearching(false);
    }, 250);
  };
  const pick = (r) => {
    const sym = String(r.symbol || "").toUpperCase();
    setF((s) => ({ ...s, ticker: sym, name: r.name || sym, currency: r.currency || s.currency, type: isFund(r) ? (/etf/i.test(r.type || r.name || "") ? "ETF" : "Fund") : "Stock", domain: "" }));
    setResults(null); setQ(""); setStep("fields"); setTouched({});
    setTimeout(() => sharesRef.current && sharesRef.current.focus(), 50);
  };
  const useTyped = () => pick({ symbol: q.trim().toUpperCase(), name: q.trim().toUpperCase(), currency: cur, type: "Stock" });
  const onSearchKey = (e) => {
    if (!results || !results.length) { if (e.key === "Enter" && q.trim().length >= 1 && searchErr) useTyped(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[hi] || results[0]); }
  };

  /* ---------- 2. live price → sensible default for "price paid" ---------- */
  useEffect(() => {
    if (step !== "fields" || !f.ticker) return;
    let dead = false;
    setQuoteState("loading"); setQuote(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-quote", { body: { symbol: f.ticker, currency: f.currency } });
        if (dead) return;
        if (!error && data && data.ok && Number(data.price) > 0) {
          setQuote(data); setQuoteState("ok");
          setF((s) => ({ ...s, currentPrice: Number(data.price), currency: data.currency || s.currency, buyPrice: editing || (Number(s.buyPrice) > 0) ? s.buyPrice : Number(data.price) }));
        } else setQuoteState("none");
      } catch (e) { if (!dead) setQuoteState("none"); }
    })();
    return () => { dead = true; };
  }, [step, f.ticker]);

  /* ---------- duplicates ---------- */
  const dup = step === "fields" && !editing
    ? (holdings || []).find((h) => h.id !== f.id && String(h.ticker).toUpperCase() === String(f.ticker).toUpperCase() && !h.sample) || null
    : null;

  /* ---------- validation & derived values ---------- */
  const shares = Number(f.shares), price = Number(f.buyPrice);
  const errs = {
    shares: !(shares > 0) ? "Enter how many shares you hold" : null,
    buyPrice: !(price > 0) ? "Enter the average price you paid" : null,
  };
  const valid = f.ticker.trim() && !errs.shares && !errs.buyPrice;
  const value = shares > 0 && price > 0 ? shares * price : 0;
  const ccy = f.currency || cur;
  const valueHome = fx && ccy !== cur ? fxConvert(value, ccy, cur, fx) : null;
  const liveVal = quote && shares > 0 ? shares * Number(quote.price) : null;

  const save = () => {
    setTouched({ shares: true, buyPrice: true });
    if (!valid) { (errs.shares ? sharesRef : priceRef).current?.focus(); return; }
    const { sample, ...rest } = f;
    let out = { ...rest, ticker: f.ticker.trim().toUpperCase(), name: (f.name || "").trim() || f.ticker.trim().toUpperCase(),
      currency: ccy, shares, buyPrice: price, currentPrice: Number(f.currentPrice) || 0, buyDate: f.buyDate || new Date().toISOString().slice(0, 10) };
    if (dup && dupChoice === "merge") {
      const s0 = Number(dup.shares) || 0, p0 = Number(dup.buyPrice) || 0;
      const total = s0 + shares;
      out = { ...dup, shares: total, buyPrice: total > 0 ? (s0 * p0 + shares * price) / total : price,
        currentPrice: Number(f.currentPrice) || dup.currentPrice || 0,
        buyDate: [dup.buyDate, out.buyDate].filter(Boolean).sort()[0] || out.buyDate,
        thesis: dup.thesis || out.thesis };
    }
    onSave(out, { another: true });
    if (editing) return; // parent closes
    setAdded((a) => [...a, { ticker: out.ticker, shares: dup && dupChoice === "merge" ? shares : out.shares, value, ccy, merged: !!(dup && dupChoice === "merge") }]);
    setStep("done");
  };
  const another = () => {
    setF(blank()); setQuote(null); setQuoteState("idle"); setDupChoice("merge"); setTouched({}); setMore(false);
    setStep("search");
    setTimeout(() => searchRef.current && searchRef.current.focus(), 50);
  };

  const label = "block text-xs font-semibold text-slate-500 mb-1.5";
  const input = "w-full border border-slate-200 rounded-xl px-3.5 h-12 text-[16px] bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition tabular-nums";
  const err = (k) => touched[k] && errs[k];
  const heading = title || (editing ? "Edit position" : step === "done" ? "Added" : "Add position");

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-lg text-slate-800">{heading}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"><X size={15} /></button>
        </div>

        {/* ---------- STEP 1: find the stock ---------- */}
        {step === "search" && (
          <div className="p-5">
            <div className="relative">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={searchRef} value={q} onChange={(e) => search(e.target.value)} onKeyDown={onSearchKey} autoFocus
                placeholder="Company or ticker — e.g. Nvidia, ASML, NOKIA.HE"
                className="w-full border border-slate-200 rounded-2xl pl-10 pr-3.5 h-14 text-[16px] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="search" />
              {q && <button onClick={() => search("")} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1"><X size={14} /></button>}
            </div>

            <div className="mt-3 min-h-[120px]">
              {searching && (
                <div className="space-y-2 py-1" aria-busy="true">
                  {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3 px-1 py-2"><div className="skel w-9 h-9 !rounded-xl" /><div className="flex-1 space-y-1.5"><div className="skel h-3 w-1/3" /><div className="skel h-2.5 w-2/3" /></div></div>)}
                </div>
              )}
              {!searching && results && results.length > 0 && (
                <div className="divide-y divide-slate-100 -mx-2" role="listbox">
                  {results.map((r, i) => {
                    const held = (holdings || []).find((h) => String(h.ticker).toUpperCase() === String(r.symbol).toUpperCase());
                    return (
                      <button key={r.symbol} role="option" aria-selected={i === hi} onMouseEnter={() => setHi(i)} onClick={() => pick(r)}
                        className={`w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-xl transition ${i === hi ? "bg-slate-50" : ""}`}>
                        <Logo h={{ ticker: r.symbol, name: r.name }} size={38} rounded="rounded-xl" />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 text-[15px] leading-tight truncate">{r.name || r.symbol}</div>
                          <div className="text-xs text-slate-500 mt-0.5 truncate">
                            <span className="font-semibold text-slate-700">{r.symbol}</span>
                            {exchangeOf(r.symbol, r.currency) && <> · {exchangeOf(r.symbol, r.currency)}</>}
                            {r.currency && <> · {r.currency}</>}
                            {isFund(r) && <> · {/etf/i.test(r.type || r.name) ? "ETF" : "Fund"}</>}
                          </div>
                        </div>
                        {held && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">Held</span>}
                        <ChevronRight size={16} className="text-slate-300 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
              {!searching && results && results.length === 0 && !searchErr && (
                <div className="text-center py-6">
                  <p className="text-sm font-semibold text-slate-600">No match for “{q.trim()}”</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">Try the ticker instead of the name — non-US listings need the exchange suffix, e.g. <b>NOKIA.HE</b>, <b>ASML.AS</b>, <b>VOLV-B.ST</b>.</p>
                  <button onClick={useTyped} className="btn-secondary mt-3 text-xs">Use “{q.trim().toUpperCase()}” as the ticker anyway</button>
                </div>
              )}
              {!searching && searchErr && (
                <div className="text-center py-6">
                  <p className="text-sm font-semibold text-rose-500">Search is unavailable right now</p>
                  <p className="text-xs text-slate-400 mt-1">You can still add the position by ticker.</p>
                  <button onClick={useTyped} disabled={!q.trim()} className="btn-secondary mt-3 text-xs disabled:opacity-50">Continue with “{q.trim().toUpperCase()}”</button>
                </div>
              )}
              {!searching && results === null && (
                <div className="text-center py-6 text-xs text-slate-400 leading-relaxed">
                  Stocks, ETFs and funds on US and European exchanges.<br />Pick one and you'll only need shares and price — value, currency and today's price are filled in for you.
                  {(holdings || []).length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                      <span className="w-full text-[10px] font-bold text-slate-400 mb-0.5">ADD TO A POSITION YOU HOLD</span>
                      {byValueDesc(holdings.filter((h) => !h.sample), cur, fx || DEFAULT_FX).slice(0, 6).map((h) => (
                        <button key={h.id} onClick={() => pick({ symbol: h.ticker, name: h.name, currency: h.currency, type: h.type })}
                          className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full">{h.ticker}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {added.length > 0 && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 mt-2">Added this time: {added.map((a) => a.ticker).join(", ")}</p>
            )}
          </div>
        )}

        {/* ---------- STEP 2: shares & price ---------- */}
        {step === "fields" && (
          <div className="p-5 pt-4 space-y-3.5" style={{ animation: "richr-in .2s ease-out both" }}>
            {/* picked stock — one compact row */}
            <div className="flex items-center gap-2.5">
              <Logo h={f} size={36} rounded="rounded-lg" />
              <div className="flex-1 min-w-0 leading-tight">
                <div className="font-bold text-slate-900 text-[15px] truncate">{f.ticker} <span className="font-medium text-slate-500 text-[13px]">{f.name && f.name !== f.ticker ? f.name : ""}</span></div>
                <div className="text-[11px] text-slate-500 truncate">
                  {exchangeOf(f.ticker, ccy) ? `${exchangeOf(f.ticker, ccy)} · ` : ""}{ccy}
                  {quoteState === "loading" && <span className="text-slate-400"> · price…</span>}
                  {quoteState === "ok" && quote && <> · now <span className="font-semibold text-slate-700 tabular-nums">{money(quote.price, quote.currency || ccy)}</span></>}
                </div>
              </div>
              {!editing && <button onClick={() => { setStep("search"); setTimeout(() => searchRef.current && searchRef.current.focus(), 50); }} className="text-xs font-semibold text-emerald-700 shrink-0">Change</button>}
            </div>

            {/* already own it: one line + two small controls */}
            {dup && (
              <div className="flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-700 tabular-nums">
                <span className="flex-1 min-w-[12rem]">You already own <b>{dup.shares} {dup.ticker}</b> · avg. {money(dup.buyPrice, dup.currency || cur)}</span>
                <div className="flex bg-white border border-amber-200 rounded-md p-0.5 shrink-0">
                  {[["merge", "Add to position"], ["separate", "Separate lot"]].map(([id, l]) => (
                    <button key={id} onClick={() => setDupChoice(id)}
                      className={`text-[11px] font-bold px-2 h-6 rounded transition ${dupChoice === id ? "bg-slate-900 text-white" : "text-slate-600"}`}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            {/* the two inputs that matter */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="pm-shares">Shares</label>
                <input id="pm-shares" ref={sharesRef} type="text" inputMode="decimal" value={f.shares} autoFocus={!editing}
                  onChange={(e) => set("shares", e.target.value.replace(",", "."))} onBlur={() => setTouched((t) => ({ ...t, shares: true }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); priceRef.current && priceRef.current.focus(); } }}
                  placeholder="0" enterKeyHint="next" className={input + " h-14 text-[22px] font-bold" + (err("shares") ? " border-rose-300" : "")} />
                {err("shares") && <p className="text-[11px] text-rose-500 mt-1">{errs.shares}</p>}
              </div>
              <div>
                <label className={label} htmlFor="pm-price">Price paid per share ({sym(ccy)})</label>
                <input id="pm-price" ref={priceRef} type="text" inputMode="decimal" value={f.buyPrice}
                  onChange={(e) => set("buyPrice", e.target.value.replace(",", "."))} onBlur={() => setTouched((t) => ({ ...t, buyPrice: true }))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
                  placeholder={quote ? String(quote.price) : "0.00"} enterKeyHint="done" className={input + " h-14 text-[22px] font-bold" + (err("buyPrice") ? " border-rose-300" : "")} />
                {err("buyPrice") ? <p className="text-[11px] text-rose-500 mt-1">{errs.buyPrice}</p>
                  : quote && Number(f.buyPrice) === Number(quote.price) ? <p className="text-[11px] text-slate-400 mt-1">Today's price · edit if you paid differently</p>
                  : quote ? <button onClick={() => set("buyPrice", Number(quote.price))} className="text-[11px] text-emerald-700 font-semibold mt-1">Use today's {money(quote.price, ccy)}</button> : null}
              </div>
            </div>

            {/* live calculation, one line */}
            <div className="text-[13px] text-slate-600 tabular-nums leading-snug">
              {shares > 0 && price > 0 ? (
                <>
                  <span className="font-semibold text-slate-800">{shares} share{shares === 1 ? "" : "s"} × {money(price, ccy)} = {money(value, ccy)}</span>
                  {valueHome != null && <span className="text-slate-400"> · ≈ {money(valueHome, cur)}</span>}
                  {liveVal != null && Math.abs(liveVal - value) > 0.005 && <span className="text-slate-400"> · worth {money(liveVal, ccy)} today (<Ret v={((liveVal - value) / value) * 100} />)</span>}
                  {dup && dupChoice === "merge" && <span className="text-slate-400"> · you'd own {Number(dup.shares) + shares} at {money(((Number(dup.shares) * Number(dup.buyPrice)) + shares * price) / (Number(dup.shares) + shares), ccy)} avg</span>}
                </>
              ) : <span className="text-slate-400">Enter shares to see the position value.</span>}
            </div>

            {/* optional details, collapsed */}
            <div className="border-t border-slate-100 pt-3">
              <button onClick={() => setMore((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <ChevronDown size={14} className={`transition ${more ? "rotate-180" : ""}`} /> Optional details
                {!more && <span className="font-normal text-slate-400"> · {fmtDate(f.buyDate)} · {f.type} · {ccy}</span>}
              </button>
              {more && (
                <div className="space-y-3 mt-3" style={{ animation: "richr-in .2s ease-out both" }}>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={label}>Bought on</label>
                      <input type="date" value={f.buyDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("buyDate", e.target.value)} className={input + " h-11 px-2 text-sm"} /></div>
                    <div><label className={label}>Type</label>
                      <select value={f.type} onChange={(e) => set("type", e.target.value)} className={input + " h-11 px-2 text-sm"}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                    <div><label className={label}>Currency</label>
                      <select value={ccy} onChange={(e) => set("currency", e.target.value)} className={input + " h-11 px-2 text-sm"}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div>
                  </div>
                  <div><label className={label}>Name</label>
                    <input value={f.name} onChange={(e) => set("name", e.target.value)} className={input + " h-11 text-sm"} /></div>
                  <div><label className={label}>Why did you buy it? <span className="font-normal text-slate-400">(you can write it later)</span></label>
                    <textarea value={f.thesis} onChange={(e) => set("thesis", e.target.value)} rows={3} placeholder="What has to be true for this to work?"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 resize-y leading-relaxed" /></div>
                </div>
              )}
            </div>

            <button onClick={save} disabled={!valid && Object.keys(touched).length > 0}
              className="btn-primary w-full h-12 text-[15px] tabular-nums disabled:opacity-50">
              {editing ? "Save changes"
                : shares > 0 && price > 0
                  ? `${dup && dupChoice === "merge" ? "Add" : "Add"} ${shares} ${f.ticker} · ${moneyShort(value, ccy)}`
                  : dup && dupChoice === "merge" ? `Add to ${f.ticker}` : "Add position"}
            </button>
            {added.length > 0 && <p className="text-[11px] text-slate-400 text-center -mt-1">Added this time: {added.map((a) => a.ticker).join(", ")}</p>}
          </div>
        )}

        {/* ---------- STEP 3: done ---------- */}
        {step === "done" && added.length > 0 && (() => {
          const a = added[added.length - 1];
          return (
            <div className="p-6 text-center" style={{ animation: "richr-in .2s ease-out both" }}>
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto"><Check size={26} /></div>
              <div className="font-bold text-slate-900 text-lg mt-3">{a.merged ? `Added to ${a.ticker}` : `${a.ticker} added`}</div>
              <div className="text-sm text-slate-500 mt-1 tabular-nums">{a.shares} share{a.shares === 1 ? "" : "s"} · {money(a.value, a.ccy)}</div>
              {added.length > 1 && <div className="text-[11px] text-slate-400 mt-2">{added.length} positions added: {added.map((x) => x.ticker).join(", ")}</div>}
              <div className="grid grid-cols-2 gap-2 mt-6">
                <button onClick={another} className="btn-secondary h-12 text-[15px]"><Plus size={15} /> Add another</button>
                <button onClick={onClose} className="btn-primary h-12 text-[15px]">Done</button>
              </div>
              <p className="text-[11px] text-slate-400 mt-4">Prices refresh automatically. Tap the position later to add your thesis.</p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ================= THESES ================= */
function ThesesTab({ active, cur, fx, onVerdict }) {
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
            <div className="text-xs text-slate-400 font-medium mt-0.5">{daysHeld(h.buyDate)} days held</div>
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

/* ================= FRIENDS ================= */
function FriendsTab({ data, active, totals, cur, say, user, onEditSharing, onOpenTicker, onBoardRanks }) {
  const [latest, setLatest] = useState({}); // user id -> most recent feed event
  const share = shareOf(data);
  const sharedCount = SHARE_ITEMS.filter((it) => share[it.id]).length;
  const [board, setBoard] = useState(null);
  const [friends, setFriends] = useState(null);
  const [incoming, setIncoming] = useState(null); // everyone who has added you (mutual or not)
  const [onBoard, setOnBoard] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [addName, setAddName] = useState("");
  const [sugs, setSugs] = useState([]); // live username suggestions
  const [searchable, setSearchable] = useState(true); // am I visible in friend search?
  const [adding, setAdding] = useState(false);

  // Load my own search-visibility flag once.
  useEffect(() => {
    (async () => {
      const { data: me } = await supabase
        .from("profiles").select("searchable").eq("user_id", user.id).maybeSingle();
      if (me) setSearchable(me.searchable !== false);
    })();
  }, []);

  const toggleSearchable = async () => {
    const next = !searchable;
    setSearchable(next); // optimistic
    const { error } = await supabase
      .from("profiles").update({ searchable: next }).eq("user_id", user.id);
    if (error) { setSearchable(!next); say("Couldn't update — try again."); return; }
    say(next
      ? "You now appear in friend search."
      : "Hidden from search — people can still add you with your exact username.");
  };

  // Suggest usernames as you type: prefix match, debounced 250ms,
  // excluding yourself and people you've already added.
  useEffect(() => {
    const q = addName.trim().toLowerCase().replace(/^@/, "");
    if (q.length < 2) { setSugs([]); return; }
    const t = setTimeout(async () => {
      const { data: rows } = await supabase
        .from("profiles").select("user_id, username")
        .ilike("username", q + "%").eq("searchable", true).limit(6);
      const mine = new Set([user.id, ...((friends || []).map((f) => f.id))]);
      setSugs((rows || []).filter((r) => r.username && !mine.has(r.user_id)));
    }, 250);
    return () => clearTimeout(t);
  }, [addName, friends]);

  // Add straight from a tapped suggestion.
  const addProfile = async (p) => {
    const { error } = await supabase.from("friends").insert({ user_id: user.id, friend_id: p.user_id });
    if (error && error.code !== "23505") { say("Couldn't add friend — try again."); return; }
    say(`Added @${p.username}!`);
    setAddName(""); setSugs([]);
    await loadAll();
  };
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    /* Friends + incoming — isolated so a leaderboard problem can never
       wipe your connections (the old shared catch caused exactly that). */
    try {
      // People I added (explicit filter — don't rely on RLS to scope this).
      const { data: fr, error: fErr } = await supabase
        .from("friends").select("friend_id").eq("user_id", user.id);
      if (fErr) throw fErr;
      const ids = (fr || []).map((r) => r.friend_id);

      // People who added ME (visible thanks to the incoming-select policy).
      const { data: inc } = await supabase
        .from("friends").select("user_id").eq("friend_id", user.id);
      const incIds = (inc || []).map((r) => r.user_id);
      const incSet = new Set(incIds);

      // Usernames for everyone involved, one query.
      const allIds = [...new Set([...ids, ...incIds])];
      let profs = [];
      if (allIds.length) {
        const { data: p } = await supabase.from("profiles").select("user_id, username").in("user_id", allIds);
        profs = p || [];
      }
      const uname = (id) => (profs.find((p) => p.user_id === id) || {}).username || "unknown";

      setFriends(ids.map((id) => ({ id, username: uname(id), mutual: incSet.has(id) })));
      setIncoming(incIds.map((id) => ({ id, username: uname(id), mutual: ids.includes(id) })));
    } catch (e) {
      console.error("RichR friends load failed:", e);
      setFriends([]); setIncoming([]);
    }

    /* Leaderboard — isolated. If this fails, only the board is empty. */
    try {
      const { data: rows, error: bErr } = await supabase
        .from("leaderboard")
        .select("user_id, name, profile, portfolio, return_pct, holdings, top_holdings, realized_pct, avg_days, win_rate, philosophy, score, score_parts, spark")
        .order("return_pct", { ascending: false, nullsFirst: false })
        .limit(100);
      if (bErr) throw bErr;
      /* null = that person chose not to share the field. Keep it null
         (not 0 / []) so the UI can say "private" instead of a fake value. */
      setBoard((rows || []).map((r) => ({
        userId: r.user_id,
        name: r.name || "anon",
        profile: r.profile || "",
        portfolio: r.portfolio || "",
        returnPct: r.return_pct != null ? Number(r.return_pct) : null,
        holdings: r.holdings != null ? Number(r.holdings) : null,
        topHoldings: Array.isArray(r.top_holdings) ? r.top_holdings : null,
        realizedPct: r.realized_pct != null ? Number(r.realized_pct) : null,
        avgDays: r.avg_days != null ? Number(r.avg_days) : null,
        winRate: r.win_rate != null ? Number(r.win_rate) : null,
        philosophy: r.philosophy || "",
        score: r.score != null ? Number(r.score) : null,
        scoreParts: r.score_parts || null,
        spark: Array.isArray(r.spark) ? r.spark : null,
      })));
      setOnBoard((rows || []).some((r) => r.user_id === user.id));
    } catch (e) {
      console.error("RichR leaderboard load failed:", e);
      setBoard([]);
    }

    /* Latest portfolio update per person, for the "alive" leaderboard rows. */
    try {
      const { data: ev } = await supabase
        .from("portfolio_events").select("user_id, kind, ticker, from_pct, to_pct, created_at")
        .order("created_at", { ascending: false }).limit(120);
      const m = {};
      (ev || []).forEach((e) => { if (!m[e.user_id]) m[e.user_id] = e; });
      setLatest(m);
    } catch (e) { /* feed is decoration here */ }
  };
  useEffect(() => { loadAll(); }, []);

  // Tap a friend -> open the same investor profile sheet as the leaderboard.
  const openFriendProfile = (id, username) => {
    const row = board.find((b) => b.userId === id);
    if (row) setViewing(row);
    else say(`@${username} hasn't shared their portfolio yet.`);
  };

  // Add back someone who added you — one tap, no typing.
  const addBack = async (id, username) => {
    const { error } = await supabase.from("friends").insert({ user_id: user.id, friend_id: id });
    if (error && error.code !== "23505") { say("Couldn't add back — try again."); return; }
    say(`You and @${username} are now friends!`);
    await loadAll();
  };

  const addFriend = async () => {
    const u = addName.trim().toLowerCase().replace(/^@/, "");
    if (!u) return;
    setAdding(true);
    try {
      const { data: p } = await supabase.from("profiles").select("user_id, username").eq("username", u).maybeSingle();
      if (!p) { say(`No one has claimed @${u} yet — check the spelling, or tell them to set a username.`); return; }
      if (p.user_id === user.id) { say("That's you!"); return; }
      const { error } = await supabase.from("friends").insert({ user_id: user.id, friend_id: p.user_id });
      if (error) {
        say(error.code === "23505" ? `@${p.username} is already your friend.` : "Couldn't add friend — try again.");
        return;
      }
      say(`Added @${p.username}!`);
      setAddName("");
      setSugs([]);
      await loadAll();
    } finally { setAdding(false); }
  };

  /* Outgoing nudges: friend id -> when I last nudged (for the 24h cooldown). */
  const [nudged, setNudged] = useState({});
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("nudges").select("to_id, created_at").eq("from_id", user.id);
      const m = {};
      (rows || []).forEach((r) => { m[r.to_id] = new Date(r.created_at).getTime(); });
      setNudged(m);
    })();
  }, []);
  const nudgeFriend = async (id, username) => {
    const { error } = await supabase.from("nudges")
      .upsert({ from_id: user.id, to_id: id, created_at: new Date().toISOString() }, { onConflict: "from_id,to_id" });
    if (error) { say("Couldn't send the nudge — try again."); return; }
    setNudged((m) => ({ ...m, [id]: Date.now() }));
    say(`Nudged @${username} — they'll see it next time they open RichR.`);
  };

  const removeFriend = async (id, username) => {
    // Unfriend removes BOTH directions: your row and theirs (the
    // incoming-delete policy lets you remove yourself from their list).
    await supabase.from("friends").delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${user.id})`);
    say(`Unfriended @${username}.`);
    await loadAll();
  };

  const publish = async () => {
    if (!data.userName.trim()) { say("Set your name (top right) before sharing."); return; }
    setBusy(true);
    try {
      const { twrUsed } = await publishBoard({ data, active, totals, cur, user });
      say(!share.returnPct
        ? "Shared! (Return % is private — see Profile › What friends can see.)"
        : twrUsed
          ? "Shared! Your time-weighted return is on the board."
          : "Shared! (Performance service unreachable — used simple return.)");
      await loadAll();
    } catch (e) { say(`Couldn't publish — ${(e && e.message) ? e.message.slice(0, 120) : "try again."}`); }
    setBusy(false);
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("leaderboard").delete().eq("user_id", user.id);
      if (error) throw error;
      say("Unshared — you're off the board.");
      await loadAll();
    } catch (e) { say("Couldn't unshare — try again."); }
    setBusy(false);
  };

  /* The board shows you + MUTUAL friends only (the database enforces the
     same rule, so a one-way add never exposes anyone's numbers). */
  const friendIds = new Set([user.id, ...((friends || []).filter((f) => f.mutual).map((f) => f.id))]);
  const shown = board === null ? null : board.filter((r) => friendIds.has(r.userId));

  /* Rank movement (#3 → #2): remember the last two distinct rankings in the
     user's data doc; a row shows an arrow until the board changes again. */
  const ranksNow = {};
  (shown || []).filter((r) => r.returnPct != null).forEach((r, i) => { ranksNow[r.userId] = i + 1; });
  const stored = data.boardRanks || { cur: {}, prev: {} };
  useEffect(() => {
    if (shown === null || !onBoardRanks) return;
    const cur = stored.cur || {};
    const same = Object.keys(ranksNow).length === Object.keys(cur).length && Object.keys(ranksNow).every((k) => cur[k] === ranksNow[k]);
    if (!same) onBoardRanks({ cur: ranksNow, prev: cur, at: new Date().toISOString() });
  }, [JSON.stringify(ranksNow)]);
  const rankMove = (id) => {
    const now = ranksNow[id], prev = (stored.prev || {})[id];
    if (!now || !prev || now === prev) return null;
    return { from: prev, to: now, up: now < prev };
  };
  const hasSample = active.holdings.some((h) => h.sample);
  const canShare = active.holdings.length > 0 && !hasSample;

  const [view, setView] = useState("board"); // board | activity

  return (
    <div className="space-y-4">
      <FriendsSwitcher view={view} setView={setView} />
      {view === "activity" && (
        <ActivityFeed user={user} friends={friends} names={(friends || []).reduce((m, f) => { m[f.id] = f.username; return m; }, {})}
          myName={data.username} onOpenProfile={openFriendProfile}
          board={shown || []} onOpenTicker={onOpenTicker} />
      )}
      {view === "board" && (<>
      {/* share card */}
      <div className="card">
        <div className="flex items-center gap-2 font-bold text-slate-800"><Share2 size={17} className="text-emerald-600" /> Share your progress</div>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
          Publish “{active.name}” to your friends. You choose exactly what they see — return % (time-weighted YTD, so adding money doesn’t inflate it), top holdings, win rate and more. Amounts, buy prices and theses always stay private. Unshare anytime.
        </p>
        <button onClick={onEditSharing}
          className="mt-3 w-full flex items-center justify-between bg-slate-50 rounded-xl px-3.5 py-2.5 text-left">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-700">
              {sharedCount === SHARE_ITEMS.length ? "Sharing everything" : sharedCount === 0 ? "Sharing only your name" : `Sharing ${sharedCount} of ${SHARE_ITEMS.length} items`}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {sharedCount === 0 ? "Turn things on in Profile" : SHARE_ITEMS.filter((it) => share[it.id]).map((it) => it.label).join(" · ")}
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-700 shrink-0 ml-2 flex items-center gap-0.5">Edit <ChevronRight size={14} /></span>
        </button>
        {!canShare && (
          <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
            {hasSample
              ? "You still have sample positions — clear or replace them in Portfolio › Holdings before sharing."
              : "Add a position in the Portfolio tab first — there's nothing to share yet."}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={publish} disabled={busy || !canShare}
            className="btn-primary">
            {busy ? "Working…" : onBoard ? "Update share" : "Share now"}
          </button>
          {onBoard && (
            <button onClick={unpublish} disabled={busy}
              className="btn-secondary">
              Unshare
            </button>
          )}
        </div>
      </div>

      {/* friends manager */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-1">
          <Plus size={16} className="text-emerald-500" /> Add friends
        </h3>
        {!data.username && (
          <p className="text-xs text-amber-600 font-medium mb-2">
            Claim your own username first (top-right menu) so friends can add you back.
          </p>
        )}
        <div className="flex gap-2 mb-3 mt-2">
          <input value={addName} onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addFriend(); }}
            placeholder="friend's username"
            className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm lowercase" />
          <button onClick={addFriend} disabled={adding || !addName.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 rounded-xl shadow disabled:opacity-50 shrink-0">
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {sugs.length > 0 && (
          <div className="mb-3 -mt-1 border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden">
            {sugs.map((s) => (
              <button key={s.user_id} onClick={() => addProfile(s)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white active:bg-slate-50">
                <span className="font-semibold text-slate-600">@{s.username}</span>
                <span className="text-xs font-semibold text-emerald-600">Add</span>
              </button>
            ))}
          </div>
        )}
        {data.username && (
          <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-600">Hide me from search</div>
              <p className="text-[11px] text-slate-400">You won't appear in suggestions. Friends can still add you with your exact username.</p>
            </div>
            <button onClick={toggleSearchable} aria-pressed={!searchable}
              className={`w-11 h-6 rounded-full p-0.5 shrink-0 transition ${!searchable ? "bg-emerald-500" : "bg-slate-200"}`}>
              <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition ${!searchable ? "translate-x-5" : ""}`} />
            </button>
          </div>
        )}
      </div>

      {/* friends list */}
      {(() => {
        const loadingLists = friends === null || incoming === null;
        const mutuals = (friends || []).filter((f) => f.mutual);
        const incomingPending = (incoming || []).filter((r) => !r.mutual);
        const outgoingPending = (friends || []).filter((f) => !f.mutual);
        return (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Users size={16} className="text-emerald-500" /> Your friends
              {mutuals.length > 0 && <span className="text-xs font-semibold text-slate-400">· {mutuals.length}</span>}
            </h3>

            {loadingLists ? (
              <div className="space-y-2" aria-busy="true"><div className="skel h-3 w-1/2" /><div className="skel h-3 w-2/5" /><div className="skel h-3 w-1/3" /></div>
            ) : (
              <>
                {/* rubric 1: mutual friends — tap to view profile */}
                {mutuals.length === 0 ? (
                  <p className="text-sm text-slate-400">No friends yet — when someone adds you back, they appear here.</p>
                ) : (
                  <div>
                    {mutuals.map((f) => {
                      const sharing = !!(board && board.some((b) => b.userId === f.id));
                      const nudgedAt = nudged[f.id] || 0;
                      const nudgedRecently = Date.now() - nudgedAt < 24 * 3600000;
                      return (
                        <div key={f.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-slate-50 last:border-0">
                          <button onClick={() => openFriendProfile(f.id, f.username)}
                            className="min-w-0 flex-1 text-left active:opacity-70">
                            <div className="text-sm font-semibold text-slate-700 truncate">@{f.username}</div>
                            {sharing ? (
                              <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                                <Check size={10} /> Sharing · tap to view profile
                              </div>
                            ) : (
                              <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                <Lock size={10} /> Not sharing yet
                              </div>
                            )}
                          </button>
                          {!sharing && (
                            <button onClick={() => nudgeFriend(f.id, f.username)} disabled={nudgedRecently}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 ${
                                nudgedRecently ? "bg-amber-50 text-amber-500" : "bg-amber-100 text-amber-700"}`}>
                              {nudgedRecently ? "Nudged" : "Nudge"}
                            </button>
                          )}
                          <button onClick={() => removeFriend(f.id, f.username)}
                            className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full shrink-0">
                            Unfriend
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* rubric 2: added you, awaiting your add-back */}
                {incomingPending.length > 0 && (
                  <>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1 mt-4 pt-3 border-t border-slate-100">
                      People who have added you · {incomingPending.length}
                    </div>
                    {incomingPending.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-slate-50 last:border-0">
                        <span className="text-sm font-semibold text-slate-700 truncate">@{r.username}</span>
                        <button onClick={() => addBack(r.id, r.username)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow shrink-0">
                          Add back
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* rubric 3: you added them, awaiting their add-back */}
                {outgoingPending.length > 0 && (
                  <>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1 mt-4 pt-3 border-t border-slate-100">
                      People you have added · {outgoingPending.length}
                    </div>
                    {outgoingPending.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-slate-50 last:border-0">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-700 truncate">@{f.username}</div>
                          <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                            <Clock size={10} /> Hasn't added you back yet
                          </div>
                        </div>
                        <button onClick={() => removeFriend(f.id, f.username)}
                          className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full shrink-0">
                          Cancel
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        );
      })()}

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg text-slate-700 flex items-center gap-2"><Trophy size={18} className="text-amber-400" /> Leaderboard</h2>
        <button onClick={loadAll} className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {shown === null ? (
        <Skeleton lines={4} />
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
          <Trophy size={24} className="mx-auto text-amber-300 mb-3" />
          <p className="font-semibold text-slate-600 mb-1">No shared returns yet</p>
          <p className="text-sm text-slate-400">
            Add friends above, tap Share, and nudge friends who haven't shared yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((r, i) => {
            const me = r.userId === user.id;
            const hasReturn = r.returnPct != null;
            const up = (r.returnPct || 0) >= 0;
            const prof = profileOf(r.profile);
            // Ranks only mean something for people who share a return %.
            const medal = !hasReturn ? "bg-slate-50 text-slate-300"
              : i === 0 ? "bg-amber-100 text-amber-600" : i === 1 ? "bg-slate-200 text-slate-500" : i === 2 ? "bg-orange-100 text-orange-500" : "bg-slate-100 text-slate-400";
            const sub = [prof ? prof.label : null, r.portfolio || null, r.holdings != null ? `${r.holdings} positions` : null].filter(Boolean).join(" · ");
            return (
              <div key={r.userId} onClick={() => setViewing({ ...r, rank: hasReturn ? i + 1 : null, rankN: shown.filter((x) => x.returnPct != null).length })}
                className={`bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border cursor-pointer active:bg-slate-50 ${me ? "border-emerald-300" : "border-slate-100"}`}>
                <div className="flex flex-col items-center gap-1 shrink-0 w-10">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm tabular-nums ${medal}`}>{hasReturn ? i + 1 : "–"}</div>
                  {(() => { const mv = rankMove(r.userId); return mv ? (
                    <div className={`text-[10px] font-bold tabular-nums ${mv.up ? "text-emerald-600" : "text-rose-500"}`} title={`Was #${mv.from}`}>
                      {mv.up ? "▲" : "▼"} #{mv.from}→#{mv.to}
                    </div>
                  ) : null; })()}
                </div>
                <Avatar name={r.name} mascot={prof ? prof.mascot : null} size={38} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm truncate">
                    {r.name} {me && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ml-1">YOU</span>}
                  </div>
                  {sub && <div className="text-xs text-slate-400 truncate">{sub}</div>}
                  {latest[r.userId] && (
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      <span className="text-emerald-600">●</span> {eventText(latest[r.userId])} <span className="text-slate-300">· {timeAgo(latest[r.userId].created_at)}</span>
                    </div>
                  )}
                  {r.score != null && (
                    <div className="text-[10px] font-bold mt-0.5"><span className={scoreTone(r.score)}>RichR Score {r.score}</span></div>
                  )}
                  {r.topHoldings && r.topHoldings.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {r.topHoldings.map((h) => (
                        <span key={h.ticker} className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          {h.ticker} {h.pct}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {hasReturn
                  ? <div className="text-right shrink-0">
                      <Ret v={r.returnPct} className="font-bold text-[15px] block" />
                      <div className="text-[10px] font-semibold text-slate-400">YTD</div>
                    </div>
                  : <div className="text-slate-300" title="Return % not shared"><Lock size={16} /></div>}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Your leaderboard shows only you and your mutual friends — there's no public list, and the database enforces it. Tap anyone to see their profile.
        Everyone picks what they share (Profile › What friends can see); a lock means that person keeps their return % private.
        Amounts, buy prices and theses always stay on your device.
      </p>
      </>)}
      {viewing && (
        <ProfileSheet r={viewing} me={viewing.userId === user.id} mine={(shown || []).find((x) => x.userId === user.id) || null}
          latest={latest[viewing.userId] || null} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function FriendsSwitcher({ view, setView }) {
  return (
    <div className="bg-slate-100 rounded-xl p-1 flex">
      {[["board", "Leaderboard"], ["activity", "Activity"]].map(([id, lbl]) => (
        <button key={id} onClick={() => setView(id)}
          className={`flex-1 text-[13px] font-semibold py-1.5 rounded-lg transition ${view === id ? "bg-white text-slate-800" : "text-slate-500"}`}>{lbl}</button>
      ))}
    </div>
  );
}

/* ================= GOALS ================= */
function GoalsSection({ goals, allValue, cur, onAdd, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(null); // goal object or "new"

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-slate-700 flex items-center gap-2">
          <Flag size={16} className="text-emerald-500" /> Your goals
        </h3>
        <button onClick={() => setEditing("new")}
          className="flex items-center gap-1 text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
          <Plus size={13} /> Add goal
        </button>
      </div>

      {goals.length === 0 ? (
        <p className="text-sm text-slate-400 mt-2">
          Write down what you're working toward — “financial freedom by 40”, “first {sym(cur)}10,000 saved”. Goals with a target amount show your progress.
        </p>
      ) : (
        <div className="space-y-3 mt-3">
          {goals.map((g) => {
            const hasTarget = Number(g.targetAmount) > 0;
            const prog = hasTarget ? Math.min(100, (allValue / g.targetAmount) * 100) : null;
            const reached = hasTarget && allValue >= g.targetAmount;
            return (
              <div key={g.id} className="border border-slate-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
                      {g.title}
                      {reached && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">REACHED 🎉</span>}
                    </div>
                    {g.note && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{g.note}</p>}
                    {g.targetDate && (
                      <div className="text-[11px] text-slate-400 font-medium mt-1 flex items-center gap-1">
                        <Calendar size={11} /> by {fmtDate(g.targetDate, { year: "numeric", month: "short" })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setEditing(g)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => onRemove(g.id)} className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {hasTarget && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] font-medium text-slate-400 mb-1">
                      <span>{moneyShort(allValue, cur)} of {moneyShort(g.targetAmount, cur)}</span>
                      <span>{prog.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">Progress counts the value of all your portfolios combined.</p>
        </div>
      )}

      {editing && (
        <GoalModal goal={editing === "new" ? null : editing} cur={cur}
          onClose={() => setEditing(null)}
          onSave={(g) => { editing === "new" ? onAdd(g) : onUpdate(g); setEditing(null); }} />
      )}
    </div>
  );
}

function GoalModal({ goal, cur, onClose, onSave }) {
  const [f, setF] = useState(goal || { id: uid(), title: "", note: "", targetAmount: "", targetDate: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim().length > 0;
  const label = "block text-xs font-semibold text-slate-400 mb-1.5";
  const input = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white";

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-700">{goal ? "Edit goal" : "New goal"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className={label}>WHAT DO YOU WANT TO ACHIEVE?</label>
            <input value={f.title} onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Financial freedom" className={input} /></div>
          <div><label className={label}>WHY / HOW? (OPTIONAL)</label>
            <textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={3}
              placeholder="e.g. Save and invest 20% of every paycheck so work becomes a choice, not a must."
              className={input + " resize-y leading-relaxed"} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>TARGET AMOUNT ({sym(cur)}, OPTIONAL)</label>
              <input type="number" value={f.targetAmount} onChange={(e) => set("targetAmount", e.target.value)}
                placeholder="10000" className={input} /></div>
            <div><label className={label}>TARGET DATE (OPTIONAL)</label>
              <input type="date" value={f.targetDate} onChange={(e) => set("targetDate", e.target.value)} className={input} /></div>
          </div>
        </div>
        <div className="p-5 pt-0">
          <button onClick={() => valid && onSave({ ...f, title: f.title.trim(), targetAmount: Number(f.targetAmount) || 0 })}
            disabled={!valid}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-2xl shadow disabled:opacity-50">
            {goal ? "Save changes" : "Add goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= INSIGHTS (AI risk analytics + news) ================= */
/*  Risk view — division of labor: the AI looks up each holding's beta and
    annualized volatility from public data. The APP does the math:
      - weights          w_i = value_i / total value            (exact)
      - portfolio beta   β_p = Σ w_i · β_i                      (exact)
      - portfolio σ      σ_p ≈ √( Σ_i Σ_j w_i w_j σ_i σ_j ρ )   (avg-correlation
        approximation, ρ = 0.55 — true σ_p needs a covariance matrix)
      - concentration    top-1 / top-3 weight                    (exact)
    News view — the AI web-searches recent news relevant to the holdings and
    returns short summaries written in its own words, tagged by likely impact. */
function InsightsTab({ active, totals, cur, fx, say, analysis, onSave, news, onSaveNews, onVerdict }) {
  const [mode, setMode] = useState("risk");
  const [busy, setBusy] = useState(false);
  const [newsBusy, setNewsBusy] = useState(false);

  const weights = useMemo(() => {
    if (!totals.value) return [];
    return active.holdings.map((h) => {
      const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
      const v = fxConvert(h.shares * cp, h.currency || cur, cur, fx);
      return { ticker: h.ticker, name: h.name, weight: v / totals.value };
    }).sort((a, b) => b.weight - a.weight);
  }, [active, totals, cur, fx]);

  /* ---------- risk analysis ---------- */
  const analyze = async () => {
    if (!weights.length) { say("Add positions first."); return; }
    setBusy(true);
    try {
      const tickers = weights.map((w) => w.ticker).join(", ");
      const prompt =
        `For each of these ticker symbols, look up (using web search) the stock's beta versus its main market index ` +
        `(e.g. S&P 500 for US stocks) and its approximate annualized volatility as a percentage. For broad index funds/ETFs, ` +
        `beta ≈ 1.0 and volatility ≈ the index's. Tickers: ${tickers}. ` +
        `Also write a 2-3 sentence plain-language note on this portfolio's diversification given these holdings. ` +
        `Respond with ONLY JSON, no other text: ` +
        `{"holdings":[{"ticker":"XXX","beta":1.2,"volatility":28.5}],"note":"..."}`;
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const json = await res.json();
      const text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
      if (!match) throw new Error("no json");
      const ai = JSON.parse(match[0]);
      const lookup = {};
      (ai.holdings || []).forEach((h) => {
        if (h.ticker) lookup[h.ticker.toUpperCase()] = { beta: Number(h.beta), vol: Number(h.volatility) };
      });

      const rows = weights.map((w) => {
        const d = lookup[w.ticker.toUpperCase()] || {};
        return { ...w, beta: isFinite(d.beta) ? d.beta : null, vol: isFinite(d.vol) ? d.vol : null };
      });
      const covered = rows.filter((r) => r.beta !== null && r.vol !== null);
      const covWeight = covered.reduce((s, r) => s + r.weight, 0);
      if (!covered.length || covWeight < 0.5) throw new Error("insufficient data");

      const norm = covered.map((r) => ({ ...r, w: r.weight / covWeight }));
      const beta = norm.reduce((s, r) => s + r.w * r.beta, 0);
      const RHO = 0.55;
      let variance = 0;
      norm.forEach((a) => norm.forEach((b) => {
        const rho = a.ticker === b.ticker ? 1 : RHO;
        variance += a.w * b.w * (a.vol / 100) * (b.vol / 100) * rho;
      }));
      const vol = Math.sqrt(variance) * 100;
      const top1 = weights[0] ? weights[0].weight * 100 : 0;
      const top3 = weights.slice(0, 3).reduce((s, w) => s + w.weight, 0) * 100;
      const risk = vol < 12 ? "Low" : vol < 20 ? "Moderate" : vol < 30 ? "High" : "Very high";

      onSave({
        at: Date.now(),
        beta: Number(beta.toFixed(2)),
        vol: Number(vol.toFixed(1)),
        risk, top1: Number(top1.toFixed(1)), top3: Number(top3.toFixed(1)),
        coverage: Number((covWeight * 100).toFixed(0)),
        note: typeof ai.note === "string" ? ai.note.slice(0, 400) : "",
        rows: rows.map((r) => ({ ticker: r.ticker, weight: Number((r.weight * 100).toFixed(1)), beta: r.beta, vol: r.vol })),
      });
      say("Analysis updated.");
    } catch (e) {
      say("Analysis failed — try again in a moment.");
    } finally { setBusy(false); }
  };

  /* ---------- news fetch ---------- */
  const fetchNews = async () => {
    if (!active.holdings.length) { say("Add positions first."); return; }
    setNewsBusy(true);
    try {
      /* 1) Real articles with links from the portfolio-news edge function
            (Finnhub company news for US names + Yahoo news for all). */
      const { data: nd, error: ne } = await supabase.functions.invoke("portfolio-news", {
        body: { tickers: active.holdings.map((h) => h.ticker), days: 7 },
      });
      const articles = (!ne && nd && nd.ok && Array.isArray(nd.articles)) ? nd.articles : [];
      if (!articles.length) throw new Error((nd && nd.error) || "no articles");

      /* 2) AI ranks + tags the REAL headlines — links stay intact. */
      const list = active.holdings.map((h) => `${h.ticker} (${h.name})`).join(", ");
      const feed = articles.slice(0, 30)
        .map((a, i) => `${i} | ${a.tickers.join(",")} | ${a.source} | ${a.when} | ${a.title}`)
        .join("\n");
      const prompt =
        `My holdings: ${list}.\n` +
        `Below is a numbered feed of real, recent headlines about them:\n${feed}\n\n` +
        `Pick at most 6 items most likely to materially affect this portfolio — earnings, guidance, ` +
        `analyst moves, regulation, major sector/macro news. Skip fluff, listicles and near-duplicates. ` +
        `For each pick, write a 1-2 sentence takeaway ENTIRELY IN YOUR OWN WORDS (do not copy the headline) ` +
        `and tag the likely impact on my portfolio. ` +
        `Respond with ONLY JSON, no other text: ` +
        `{"items":[{"index":0,"impact":"positive|negative|mixed","summary":"..."}]}`;

      let picked = null;
      try {
        const res = await fetch("/api/openai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 900,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const json = await res.json();
        const text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        const m = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
        if (m) picked = (JSON.parse(m[0]).items || []);
      } catch (_) { /* AI ranking is optional — fall back below */ }

      /* 3) Build cards. Fallback: 6 most recent raw headlines. */
      const chosen = (Array.isArray(picked) && picked.length)
        ? picked
        : articles.slice(0, 6).map((_, i) => ({ index: i, impact: "mixed", summary: "" }));

      const items = chosen
        .map((p) => {
          const a = articles[Number(p.index)];
          if (!a) return null;
          return {
            tickers: (a.tickers || []).slice(0, 4),
            title: String(a.title).slice(0, 160),
            summary: String(p.summary || "").slice(0, 320),
            impact: ["positive", "negative", "mixed"].includes(p.impact) ? p.impact : "mixed",
            source: a.source || "",
            when: a.when || "",
            url: a.url || "",
          };
        })
        .filter(Boolean)
        .slice(0, 6);

      if (!items.length) throw new Error("empty");
      onSaveNews({ at: Date.now(), items });
      say(`Found ${items.length} relevant stories.`);
    } catch (e) {
      say("News scan failed — try again in a moment.");
    } finally { setNewsBusy(false); }
  };

  if (!active.holdings.length)
    return (
      <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
        <Activity size={24} className="mx-auto text-slate-300 mb-3" />
        <p className="font-semibold text-slate-600 mb-1">Nothing to analyze yet</p>
        <p className="text-sm text-slate-400">Add positions first — then get your risk profile, a news scan, and your theses in one place.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-lg text-slate-700">Portfolio analysis</h2>
        <p className="text-sm text-slate-400">“{active.name}”</p>
      </div>

      {/* segmented control */}
      <div className="bg-slate-100 rounded-full p-1 flex">
        {[["risk", "Risk profile"], ["news", "News for you"], ["theses", "Theses"]].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)}
            className={`flex-1 text-sm font-semibold py-2 rounded-full transition ${
              mode === id ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === "risk" ? (
        <RiskView analysis={analysis} busy={busy} onAnalyze={analyze} />
      ) : mode === "news" ? (
        <NewsView news={news} busy={newsBusy} onFetch={fetchNews} />
      ) : (
        <ThesesTab active={active} cur={cur} fx={fx} onVerdict={onVerdict} />
      )}
    </div>
  );
}

/* ---------- Risk view ---------- */
function RiskView({ analysis, busy, onAnalyze }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={onAnalyze} disabled={busy}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-full shadow disabled:opacity-60">
          <Sparkles size={14} style={{ animation: busy ? "spin 1.2s linear infinite" : "none" }} />
          {busy ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze"}
        </button>
      </div>

      {!analysis ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 leading-relaxed">
            Tap <span className="font-semibold">Analyze</span> and the app will look up each holding's beta and volatility
            from public market data, then calculate your portfolio's beta, estimated standard deviation and concentration.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Portfolio beta" value={analysis.beta}
              hint={analysis.beta > 1 ? "Moves more than the market" : "Moves less than the market"} />
            <MetricCard label="Est. volatility (σ)" value={`${analysis.vol}%`} hint={`${analysis.risk} risk · annualized`} />
            <MetricCard label="Top holding" value={`${analysis.top1}%`} hint="of portfolio value" />
            <MetricCard label="Top 3 holdings" value={`${analysis.top3}%`}
              hint={analysis.top3 > 60 ? "Concentrated" : "Reasonably spread"} />
          </div>

          {analysis.note && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-700 text-sm mb-2">
                <Sparkles size={14} className="text-emerald-500" /> Diversification note
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">{analysis.note}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-700 text-sm mb-3">Per holding</h3>
            <div className="grid grid-cols-4 text-[11px] font-semibold text-slate-400 pb-2 border-b border-slate-100">
              <span>TICKER</span><span className="text-right">WEIGHT</span>
              <span className="text-right">BETA</span><span className="text-right">VOL</span>
            </div>
            {analysis.rows.map((r) => (
              <div key={r.ticker} className="grid grid-cols-4 text-sm py-2 border-b border-slate-50 last:border-0">
                <span className="font-semibold text-slate-700">{r.ticker}</span>
                <span className="text-right text-slate-500">{r.weight}%</span>
                <span className="text-right text-slate-500">{r.beta ?? "—"}</span>
                <span className="text-right text-slate-500">{r.vol != null ? `${r.vol}%` : "—"}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Last updated {fmtDateTime(analysis.at)}. Betas and volatilities are AI-retrieved estimates from
            public data ({analysis.coverage}% of portfolio covered); portfolio σ uses an average-correlation approximation
            (ρ = 0.55), not a full covariance matrix. Educational estimates only — not investment advice.
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- News view ---------- */
const IMPACT = {
  positive: { chip: "bg-emerald-100 text-emerald-700", label: "Positive", icon: TrendingUp },
  negative: { chip: "bg-rose-100 text-rose-600", label: "Negative", icon: TrendingDown },
  mixed:    { chip: "bg-slate-200 text-slate-600", label: "Mixed", icon: Activity },
};

function NewsView({ news, busy, onFetch }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {news ? `Scanned ${fmtDateTime(news.at)}` : "News affecting your holdings"}
        </p>
        <button onClick={onFetch} disabled={busy}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-full shadow disabled:opacity-60">
          <RefreshCw size={14} style={{ animation: busy ? "spin 1s linear infinite" : "none" }} />
          {busy ? "Scanning…" : news ? "Rescan" : "Scan news"}
        </button>
      </div>

      {!news ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 leading-relaxed">
            Tap <span className="font-semibold">Scan news</span> and the app pulls recent articles about your
            holdings from financial news sources, then highlights the ones most likely to move your portfolio —
            each with a link to the original story.
          </p>
        </div>
      ) : (
        <>
          {news.items.map((n, i) => {
            const imp = IMPACT[n.impact] || IMPACT.mixed;
            const card = (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 active:opacity-80 transition">
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${imp.chip}`}>
                    <imp.icon size={11} /> {imp.label}
                  </span>
                  {n.tickers.map((t) => (
                    <span key={t} className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{t}</span>
                  ))}
                </div>
                <h3 className="font-bold text-slate-700 leading-snug">{n.title}</h3>
                {n.summary && (
                  <p className="text-sm text-slate-500 leading-relaxed mt-1.5">{n.summary}</p>
                )}
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {[n.source, n.when].filter(Boolean).join(" · ")}
                  </span>
                  {n.url && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      Read at {n.source || "source"} <ExternalLink size={11} />
                    </span>
                  )}
                </div>
              </div>
            );
            return n.url ? (
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block">
                {card}
              </a>
            ) : (
              <div key={i}>{card}</div>
            );
          })}
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Headlines come from financial news feeds; the impact tag and takeaway are AI-generated — tap through
            and verify with the original outlet before acting. Not investment advice.
          </p>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="text-[11px] font-semibold text-slate-400">{label.toUpperCase()}</div>
      <div className="text-2xl font-extrabold text-slate-700 mt-1">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>
    </div>
  );
}

/* ================= SCREENSHOT IMPORT ================= */
/*  Works with any bank/broker app (OP, Nordnet, Nordea, Avanza, IBKR…):
    the AI reads the screenshot(s) — any layout, Finnish/Swedish/English —
    and extracts holdings. The user reviews and corrects everything before
    anything is added, because reading numbers off screenshots is never
    100% reliable. Screenshots are sent to the AI for parsing only and are
    not stored anywhere.                                                    */
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const isCsvFile = (f) =>
  ["text/csv", "text/plain", "text/tab-separated-values"].includes(f.type) || /\.(csv|txt|tsv)$/i.test(f.name);

/* ---------- CSV import (no AI needed) ----------
   Reads a broker export or our own template on-device. Delimiter and
   number format are detected; headers are matched in English, Swedish and
   Finnish. Returns { rows, unmapped } — rows ready for the review table,
   or an empty list with the header names when nothing could be mapped. */
const CSV_TEMPLATE = "ticker,name,shares,buy_price,currency,buy_date\nAAPL,Apple,10,180.5,USD,2025-03-14\nNOVO-B.CO,Novo Nordisk,25,620,DKK,2024-11-02\nVOO,Vanguard S&P 500 ETF,8,480,USD,\n";
const CSV_HEADERS = {
  ticker:   ["ticker", "symbol", "kod", "tunnus", "code", "isin", "instrument code"],
  name:     ["name", "namn", "nimi", "security", "instrument", "värdepapper", "vardepapper", "arvopaperi", "description", "asset", "holding", "product", "företag", "yhtiö", "osake", "aktie", "sijoitus", "kohde", "fond", "rahasto"],
  shares:   ["shares", "quantity", "qty", "antal", "määrä", "maara", "units", "amount", "position", "kpl", "lukumäärä", "no. of shares", "number of shares", "holdings"],
  buyPrice: ["buy price", "buy_price", "avg price", "average price", "avg cost", "average cost", "cost per share", "purchase price", "gav", "snittkurs", "inköpskurs", "hankintahinta", "keskihinta", "ostohinta", "avg. price", "entry price"],
  totalCost:["total cost", "cost basis", "anskaffningsvärde", "anskaffningsvarde", "hankinta-arvo", "hankintaarvo", "purchase value", "invested", "cost", "book value", "kostnad"],
  currentPrice: ["current price", "price", "last", "last price", "senast", "kurs", "hinta", "market price", "viimeisin", "close"],
  currency: ["currency", "valuta", "valuutta", "ccy", "cur"],
  buyDate:  ["buy date", "buy_date", "date", "purchase date", "köpdatum", "ostopäivä", "trade date", "datum", "päivä"],
  type:     ["type", "typ", "tyyppi", "asset type", "instrument type", "kind"],
};
const parseCsvNumber = (v) => {
  if (v == null) return NaN;
  let t = String(v).replace(/[\s\u00a0']/g, "").replace(/[€$£kr]/gi, "").trim();
  if (!t) return NaN;
  // "1.234,56" → 1234.56 ; "1,234.56" → 1234.56 ; "12,5" → 12.5
  if (/,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return isFinite(n) ? n : NaN;
};
function parseCsvText(text) {
  const src = String(text || "").replace(/^\ufeff/, "");
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = [";", "\t", ","].map((d) => [d, (firstLine.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const out = []; let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => String(c).trim() !== ""));
}
function parseHoldingsCsv(text, cur) {
  const table = parseCsvText(text);
  if (table.length < 2) return { rows: [], unmapped: [] };
  // header row = the first row with ≥2 recognisable headers (some exports have a title line first)
  const norm = (h) => String(h || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  const matchHeader = (h) => {
    const n = norm(h);
    for (const [k, alts] of Object.entries(CSV_HEADERS)) if (alts.some((a) => n === a)) return k;
    for (const [k, alts] of Object.entries(CSV_HEADERS)) if (alts.some((a) => n.includes(a))) return k;
    return null;
  };
  let hi = -1, map = null;
  for (let i = 0; i < Math.min(5, table.length); i++) {
    const m = table[i].map(matchHeader);
    const seen = {};
    m.forEach((k, idx) => { if (k && seen[k] === undefined) seen[k] = idx; });
    if (Object.keys(seen).length >= 2 && (seen.shares !== undefined)) { hi = i; map = seen; break; }
  }
  if (hi < 0) return { rows: [], unmapped: table[0].map(String) };
  const get = (r, k) => (map[k] !== undefined ? r[map[k]] : undefined);
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const shares = parseCsvNumber(get(r, "shares"));
    const ticker = String(get(r, "ticker") || "").trim().toUpperCase();
    const name = String(get(r, "name") || "").trim();
    if (!(shares > 0) || (!ticker && !name)) continue;
    let buyPrice = parseCsvNumber(get(r, "buyPrice"));
    const totalCost = parseCsvNumber(get(r, "totalCost"));
    if (!(buyPrice > 0) && totalCost > 0) buyPrice = totalCost / shares;
    const currentPrice = parseCsvNumber(get(r, "currentPrice"));
    const currency = String(get(r, "currency") || "").trim().toUpperCase();
    const rawDate = String(get(r, "buyDate") || "").trim();
    let buyDate = "";
    if (rawDate) {
      const iso = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const eu = rawDate.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
      if (iso) buyDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      else if (eu) buyDate = `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}`;
    }
    const t = String(get(r, "type") || "").toLowerCase();
    const type = /etf|fund|fond|rahasto/.test(t) ? "ETF" : /crypto|krypto/.test(t) ? "Crypto" : "Stock";
    rows.push({ ticker: ticker.slice(0, 12), name: name.slice(0, 60), shares, buyPrice: buyPrice > 0 ? buyPrice : "", currentPrice: currentPrice > 0 ? currentPrice : 0,
      currency: CURRENCIES.some((c) => c.code === currency) ? currency : cur, buyDate, type: TYPES.includes(type) ? type : "Stock" });
  }
  return { rows, unmapped: rows.length ? [] : table[hi].map(String) };
}

function ImportModal({ cur, onClose, onImport, initialMode = "shot" }) {
  const [mode, setMode] = useState(initialMode); // shot | csv
  const csvRef = useRef(null);
  const [csvNote, setCsvNote] = useState("");

  /* CSV path: parse on-device; if the headers can't be mapped, offer the
     AI reader (the same one screenshots use) as a fallback. */
  const handleCsv = async (fileList) => {
    const f = Array.from(fileList || [])[0];
    if (!f) return;
    setStage("parsing"); setProgress({ done: 0, total: 1 });
    try {
      const text = await toText(f);
      const { rows: parsed, unmapped } = parseHoldingsCsv(text, cur);
      if (!parsed.length) {
        setCsvNote(unmapped.length ? `Couldn't recognise the columns (${unmapped.slice(0, 6).join(", ")}${unmapped.length > 6 ? "…" : ""}).` : "The file looks empty.");
        setErrMsg("I couldn't map this CSV's columns myself. You can let the AI read it instead (works with most broker exports), or use the template below.");
        setStage("csv-fallback"); pendingCsv.current = f;
        return;
      }
      const found = parsed.slice(0, 200).map((h) => ({
        key: uid(), include: true, ticker: h.ticker, name: h.name, domain: "", type: h.type, currency: h.currency,
        shares: h.shares, buyPrice: h.buyPrice, currentPrice: h.currentPrice, buyDate: h.buyDate,
        note: !h.buyPrice ? "No buy price in file — enter it." : "",
      }));
      setCsvNote(`Read ${found.length} row${found.length === 1 ? "" : "s"} from ${f.name} on your device — nothing was uploaded.`);
      setRows(found); setStage("review"); verifyRows(found);
    } catch (e) {
      setErrMsg(`Couldn't read the file: ${String((e && e.message) || e)}`); setStage("error");
    }
  };
  const pendingCsv = useRef(null);
  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "richr-portfolio-template.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const [stage, setStage] = useState("pick");   // pick | parsing | review | error
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState({});   // row key -> ticker/name inputs open
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [verifying, setVerifying] = useState(0); // rows still being checked against market data
  const listRef = useRef(null);

  /* Let the market-data source decide what a security is: OCR finds the
     name/ticker, search-symbols confirms the listing and its trading
     currency (BDT on the TSX is CAD whatever the screenshot said). */
  const verifyRows = async (found) => {
    const root = (sym) => String(sym || "").toUpperCase().split(".")[0].split(":")[0];
    const lookup = async (q) => {
      try {
        const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q } });
        return !error && data && Array.isArray(data.results) ? data.results : [];
      } catch (e) { return []; }
    };
    const one = async (r) => {
      const t = root(r.ticker);
      let hit = null;
      if (r.name && r.name.length >= 3) {
        const res = await lookup(r.name);
        hit = res.find((x) => t && root(x.symbol) === t)
          || res.find((x) => !t && String(x.name || "").toLowerCase().startsWith(r.name.toLowerCase().slice(0, 8)))
          || null;
      }
      if (!hit && t) {
        const res = await lookup(t);
        const exact = res.filter((x) => root(x.symbol) === t);
        hit = exact.find((x) => x.currency === r.currency) || exact[0] || null;
      }
      return hit;
    };
    setVerifying(found.length);
    const queue = [...found];
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift();
        const hit = await one(r);
        setVerifying((n) => n - 1);
        if (!hit) continue;
        setRows((rs) => rs.map((x) => x.key !== r.key || x.touched ? x : ({
          ...x,
          ticker: hit.symbol ? String(hit.symbol).toUpperCase().slice(0, 12) : x.ticker,
          name: x.name || hit.name || "",
          currency: hit.currency && CURRENCIES.some((c) => c.code === hit.currency) ? hit.currency : x.currency,
          type: hit.type && TYPES.includes(hit.type) ? hit.type : x.type,
          verified: { exchange: hit.exchange || hit.exchDisp || "", currency: hit.currency || "" },
        })));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };
  const [errMsg, setErrMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const fileRef = useRef(null);

  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const toText = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).slice(0, 60000));
      r.onerror = () => rej(new Error("read failed"));
      r.readAsText(file);
    });

  /* Downscale/re-encode each screenshot to the vision model's sweet spot
     (max 1568px long edge, JPEG) — keeps text crisp while making 10-image
     imports fast and reliably under request-size limits. */
  const preprocessImage = (file) =>
    new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          // Step down size/quality until the payload is small enough for
          // mobile bridges (~700KB base64). Text tables survive this fine.
          const attempts = [[1400, 0.8], [1200, 0.7], [1000, 0.6], [850, 0.5]];
          let data = null;
          for (const [MAX, q] of attempts) {
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale), hpx = Math.round(img.height * scale);
            const c = document.createElement("canvas");
            c.width = w; c.height = hpx;
            c.getContext("2d").drawImage(img, 0, 0, w, hpx);
            data = c.toDataURL("image/jpeg", q).split(",")[1];
            if (data.length < 700000) break;
          }
          URL.revokeObjectURL(url);
          res({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
        } catch (e) { rej(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode failed")); };
      img.src = url;
    });

  // Fallback: raw base64 without canvas (used if preprocessing fails, e.g. WebView quirks)
  const rawImageBlock = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({
        type: "image",
        source: { type: "base64", media_type: OK_TYPES.includes(file.type) ? file.type : "image/png", data: String(r.result).split(",")[1] },
      });
      r.onerror = () => rej(new Error("file read failed"));
      r.readAsDataURL(file);
    });

  const imageBlock = async (file) => {
    try { return await preprocessImage(file); }
    catch (e) { return await rawImageBlock(file); }
  };

  const buildPrompt = (isCsv) =>
    `You are extracting investment holdings from ${isCsv ? "a bank/broker export file" : "a screenshot of a bank or brokerage app"} ` +
    `(any bank — OP, Nordnet, Nordea, Avanza, Danske, Interactive Brokers, Degiro, etc. — in Finnish, Swedish or English). ` +
    `Vocabulary: "kpl"/"st"/"määrä"/"antal"/"quantity" = number of shares/units; ` +
    `"hankintahinta"/"keskihinta"/"keskikurssi"/"GAV"/"snittkurs"/"avg price"/"cost basis" = average purchase price; ` +
    `"markkina-arvo"/"marknadsvärde"/"arvo"/"värde"/"market value" = current total value; ` +
    `"kurssi"/"kurs"/"hinta"/"price" = current price per share; ` +
    `"tuotto"/"avkastning"/"return"/"+/-%" = profit/return.\n` +
    `For EVERY holding, extract: ticker (uppercase; null for funds without one), full name, company website domain if you know it, ` +
    `type (Stock/Fund/ETF), shares (decimals allowed), average buy price per share, current price per share, market value if visible or derivable, confidence from 0 to 1, ` +
    `and the TRADING currency of the holding (USD/EUR/GBP/SEK). Infer the currency logically: an explicit currency code shown ` +
    `next to the position (e.g. OP-mobiili displays portfolio totals in EUR but marks foreign stocks with their trading ` +
    `currency like "USD" — report USD for those, with prices in USD), currency symbols in the prices, or exchange conventions ` +
    `(US listings → USD, Helsinki → EUR, Stockholm → SEK, London → GBP, Toronto → CAD). If unsure, still give your best guess — it is re-checked against market data.\n` +
    `DERIVE missing numbers when the data allows — show your derivation in "note":\n` +
    `- buy price = total purchase cost ÷ shares\n` +
    `- buy price = current price ÷ (1 + return% ÷ 100)\n` +
    `- current price = market value ÷ shares\n` +
    `Numbers may use comma as decimal separator ("1 234,56" = 1234.56) — normalize to plain numbers. ` +
    `NEVER invent numbers that can't be read or derived — use null and say what's missing in "note". ` +
    `If a row is cut off at the top or bottom edge and unreadable, skip it. ` +
    `Respond with ONLY compact single-line JSON, no other text, no markdown. Keep "note" under 8 words or omit it:\n` +
    `{"holdings":[{"ticker":"NVDA","name":"Nvidia","domain":"nvidia.com","type":"Stock","currency":"USD","shares":12.5,"buyPrice":95.2,"currentPrice":128.4,"note":"buy price derived from return %"}]}`;

  const callParse = async (content) => {
    const res = await fetch("/api/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content }],
      }),
    });
    let json = null;
    try { json = await res.json(); } catch (e) { throw new Error(`API returned non-JSON (HTTP ${res.status})`); }
    if (!res.ok || json.type === "error" || json.error) {
      const msg = (json.error && (json.error.message || json.error.type)) || `HTTP ${res.status}`;
      throw new Error(`API error: ${String(msg).slice(0, 160)}`);
    }
    let text = "";
    if (typeof json.content === "string") text = json.content;
    else if (Array.isArray(json.content))
      text = json.content.map((b) => (typeof b === "string" ? b : (b && typeof b.text === "string" ? b.text : ""))).join("\n");
    else if (typeof json.completion === "string") text = json.completion;
    if (!text.trim()) throw new Error("API returned an empty response");
    const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Model reply had no JSON (started: "${text.trim().slice(0, 80)}…")`);
    return JSON.parse(match[0]);
  };

  // One task per screenshot (full model attention each) + one per CSV, with a retry.
  const runTask = async (content) => {
    try { return await callParse(content); }
    catch (e) { return await callParse(content); }
  };

  /* Merge results across images/files: scrolled screenshots overlap, so the
     same holding can appear twice — dedupe by ticker (or name) and keep the
     most complete version of each row. */
  const richness = (h) =>
    (Number(h.buyPrice) > 0 ? 2 : 0) + (Number(h.currentPrice) > 0 ? 1 : 0) +
    (h.currency ? 1 : 0) + (h.domain ? 1 : 0) + (h.name ? 1 : 0);
  const mergeHoldings = (lists) => {
    const map = new Map();
    for (const list of lists)
      for (const h of list || []) {
        if (!h || (!h.ticker && !h.name) || !(Number(h.shares) > 0)) continue;
        const key = (h.ticker ? String(h.ticker).toUpperCase() : String(h.name).toLowerCase().replace(/[^a-z0-9]/g, ""));
        const prev = map.get(key);
        if (!prev || richness(h) > richness(prev)) map.set(key, h);
      }
    return [...map.values()];
  };

  const handleFiles = async (fileList) => {
    const all = Array.from(fileList || []);
    const imgs = all.filter((f) => OK_TYPES.includes(f.type) || (!f.type && /\.(png|jpe?g|webp|gif)$/i.test(f.name))).slice(0, 10);
    const csvs = all.filter(isCsvFile).slice(0, 3);
    if (!imgs.length && !csvs.length) {
      setErrMsg("Please choose PNG/JPG screenshots (up to 10) or a CSV export from your broker. (iPhone HEIC photos aren't supported — actual screenshots are PNG and work fine.)");
      setStage("error");
      return;
    }
    setStage("parsing");
    setProgress({ done: 0, total: imgs.length + (csvs.length ? 1 : 0) });
    try {
      const jobs = [];
      for (const f of imgs) {
        jobs.push(async () => {
          const block = await imageBlock(f);
          const r = await runTask([block, { type: "text", text: buildPrompt(false) }]);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return (r && r.holdings) || [];
        });
      }
      if (csvs.length) {
        jobs.push(async () => {
          const content = [];
          for (const f of csvs) content.push({ type: "text", text: `File "${f.name}" contents:\n${await toText(f)}` });
          content.push({ type: "text", text: buildPrompt(true) });
          const r = await runTask(content);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return (r && r.holdings) || [];
        });
      }
      // run at most 3 jobs concurrently to stay clear of rate limits
      const settled = [];
      for (let i = 0; i < jobs.length; i += 3) {
        const batch = await Promise.allSettled(jobs.slice(i, i + 3).map((j) => j()));
        settled.push(...batch);
      }
      const lists = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
      const errors = settled.filter((s) => s.status === "rejected").map((s) => String((s.reason && s.reason.message) || s.reason));
      const merged = mergeHoldings(lists);
      if (!merged.length && errors.length) throw new Error(errors[0]);

      const found = merged.slice(0, 60).map((h) => ({
        key: uid(),
        include: true,
        ticker: h.ticker ? String(h.ticker).toUpperCase().slice(0, 10) : "",
        name: h.name ? String(h.name).slice(0, 60) : "",
        domain: h.domain ? String(h.domain).slice(0, 60) : "",
        type: TYPES.includes(h.type) ? h.type : "Stock",
        currency: CURRENCIES.some((c) => c.code === String(h.currency).toUpperCase()) ? String(h.currency).toUpperCase() : cur,
        shares: Number(h.shares),
        buyPrice: Number(h.buyPrice) > 0 ? Number(h.buyPrice) : "",
        currentPrice: Number(h.currentPrice) > 0 ? Number(h.currentPrice) : 0,
        note: `${h.confidence !== undefined && Number(h.confidence) < 0.9 ? `Low confidence (${Number(h.confidence).toFixed(2)}). ` : ""}${h.note ? String(h.note).slice(0, 100) : ""}`.trim(),
      }));
      if (!found.length) throw new Error("none found");
      setRows(found);
      setStage("review");
      verifyRows(found);
    } catch (e) {
      const detail = String((e && e.message) || e || "unknown error");
      setErrMsg(
        detail === "none found"
          ? "The AI read the file but found no holdings in it. Make sure the screenshot shows your holdings list itself (names + amounts), uncropped."
          : `Technical cause: ${detail}. If this mentions an API error or empty response, it's likely a connection/limits issue — try again in a moment or with fewer images. Otherwise: screenshot the full holdings list uncropped, or use a CSV export (most accurate).`
      );
      setStage("error");
    }
  };

  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v, touched: r.touched || ["ticker", "name", "currency"].includes(k) } : r)));
  const selected = rows.filter((r) => r.include);
  const importable = selected.filter(
    (r) => (r.ticker.trim() || r.name.trim()) && Number(r.shares) > 0 && Number(r.buyPrice) > 0
  );
  const needsPrice = selected.length - importable.length;

  const confirm = () => {
    const today = new Date().toISOString().slice(0, 10);
    onImport(importable.map((r) => ({
      id: uid(),
      ticker: (r.ticker.trim() || r.name.trim().slice(0, 8)).toUpperCase(),
      name: r.name.trim() || r.ticker.trim(),
      domain: r.domain || "",
      type: r.type,
      currency: r.currency || cur,
      shares: Number(r.shares),
      buyPrice: Number(r.buyPrice),
      buyDate: r.buyDate || today,
      currentPrice: Number(r.currentPrice) || 0,
      thesis: "",
      verdict: "open",
    })));
  };

  const input = "border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white w-full";

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-lg text-slate-700">Import holdings</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={15} />
          </button>
        </div>

        {stage === "pick" && (
          <div className="px-6 pt-4">
            <div className="bg-slate-100 rounded-2xl p-1 flex">
              {[["shot", "Screenshot"], ["csv", "CSV file"]].map(([id, lbl]) => (
                <button key={id} onClick={() => setMode(id)}
                  className={`flex-1 text-sm font-semibold py-2 rounded-xl transition ${mode === id ? "bg-white text-slate-700 shadow-sm" : "text-slate-400"}`}>{lbl}</button>
              ))}
            </div>
          </div>
        )}

        {stage === "pick" && mode === "csv" && (
          <div className="p-6">
            <button onClick={() => csvRef.current && csvRef.current.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-emerald-300 transition">
              <Upload size={26} className="mx-auto text-emerald-500 mb-3" />
              <p className="font-semibold text-slate-600 text-sm">Choose a CSV export</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Nordnet, Avanza, Interactive Brokers, Degiro, OP, Nordea… or our template. Read on your device — the file is never uploaded.
                Columns recognised: ticker/symbol, name, shares/antal/määrä, buy price/GAV/hankintahinta (or total cost), current price, currency, buy date.
              </p>
            </button>
            <input ref={csvRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="hidden" onChange={(e) => handleCsv(e.target.files)} />
            <div className="mt-4 flex items-center justify-between gap-3 bg-slate-50 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-700">Starting from scratch?</div>
                <p className="text-[11px] text-slate-400">Download the template, fill it in a spreadsheet, upload it here.</p>
              </div>
              <button onClick={downloadTemplate} className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl shrink-0">Template.csv</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Tip: in Nordnet/Avanza open your holdings, choose Export → CSV. Semicolons and “1 234,56” numbers are fine.
            </p>
          </div>
        )}

        {stage === "csv-fallback" && (
          <div className="p-6 text-center">
            <p className="font-semibold text-slate-600 text-sm mb-1.5">Columns not recognised</p>
            <p className="text-xs text-slate-500 mb-1">{csvNote}</p>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">{errMsg}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => { const f = pendingCsv.current; pendingCsv.current = null; setStage("pick"); if (f) handleFiles([f]); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow">Let AI read it</button>
              <button onClick={downloadTemplate} className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">Get the template</button>
              <button onClick={() => setStage("pick")} className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">Back</button>
            </div>
          </div>
        )}

        {stage === "pick" && mode === "shot" && (
          <div className="p-6">
            <button onClick={() => fileRef.current && fileRef.current.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-emerald-300 transition">
              <Upload size={26} className="mx-auto text-emerald-500 mb-3" />
              <p className="font-semibold text-slate-600 text-sm">Choose screenshots</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Screenshots of your holdings from any bank app (OP, Nordnet, Nordea, Avanza…) — up to 10 images.
                Scrolled, overlapping screenshots are fine: duplicates are merged automatically.
              </p>
            </button>
            <input ref={fileRef} type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.csv,.tsv,.txt,text/csv" multiple
              className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              Your screenshot is read by AI to extract the holdings, then discarded — it isn't stored. You'll review
              everything before it's added.
            </p>
          </div>
        )}

        {stage === "parsing" && (
          <div className="p-10 text-center">
            <RefreshCw size={24} className="mx-auto text-emerald-500 mb-3" style={{ animation: "spin 1s linear infinite" }} />
            <p className="font-semibold text-slate-600 text-sm">Reading your holdings…</p>
            <p className="text-xs text-slate-400 mt-1">
              {progress.total > 1 ? `${progress.done} of ${progress.total} files done — each screenshot is read individually for accuracy.` : "This takes a few seconds."}
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="p-6 text-center">
            <p className="font-semibold text-slate-600 text-sm mb-1.5">Import didn't work</p>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">{errMsg}</p>
            {testResult && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 leading-relaxed break-words">
                {testResult}
              </p>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              <button onClick={() => setStage("pick")}
                className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">Try again</button>
              <button disabled={testing} onClick={async () => {
                setTesting(true); setTestResult("Testing connection…");
                try {
                  const r = await fetch("/api/openai", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000,
                      messages: [{ role: "user", content: "Reply with exactly: OK" }] }),
                  });
                  let j = null; let raw = "";
                  try { j = await r.json(); } catch (e) { raw = "(response was not JSON)"; }
                  const txt = j ? (typeof j.content === "string" ? j.content
                    : Array.isArray(j.content) ? j.content.map((b) => (b && b.text) || "").join("")
                    : typeof j.completion === "string" ? j.completion
                    : j.error ? `error: ${j.error.message || j.error.type}` : JSON.stringify(j).slice(0, 200)) : raw;
                  setTestResult(`Connection test → HTTP ${r.status}. Model said: "${String(txt).slice(0, 120)}". ` +
                    (String(txt).includes("OK") ? "Text calls WORK — the problem is image payloads." : "Text calls FAIL too — the AI pathway itself isn't available here."));
                } catch (e) {
                  setTestResult(`Connection test threw: ${String((e && e.message) || e).slice(0, 160)} — the AI pathway itself isn't available in this environment.`);
                }
                setTesting(false);
              }}
                className="bg-emerald-50 text-emerald-700 text-sm font-semibold px-4 py-2.5 rounded-full disabled:opacity-60">
                {testing ? "Testing…" : "Run connection test"}
              </button>
            </div>
          </div>
        )}

        {stage === "review" && (
          <>
            <div ref={listRef} className="px-4 pt-3 pb-2 space-y-2 overflow-y-auto">
              {csvNote && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{csvNote}</p>}
              <p className="text-xs text-slate-400 leading-relaxed">
                Found {rows.length} holding{rows.length === 1 ? "" : "s"}. Check shares and buy price — that's how returns are calculated.
                Current prices are fetched automatically.
                {verifying > 0 && <span className="text-slate-500"> Confirming listings & currencies with market data…</span>}
              </p>
              {onlyMissing && (
                <button onClick={() => setOnlyMissing(false)} className="text-xs font-semibold text-emerald-600">← Show all {rows.length}</button>
              )}
              {rows.filter((r) => !onlyMissing || !(Number(r.buyPrice) > 0)).map((r) => {
                const ok = (r.ticker.trim() || r.name.trim()) && Number(r.shares) > 0 && Number(r.buyPrice) > 0;
                const edit = !!editing[r.key] || (!r.ticker.trim() && !r.name.trim());
                return (
                  <div key={r.key}
                    className={`border rounded-xl px-3 py-2.5 ${r.include ? (ok ? "border-slate-200" : "border-amber-300 bg-amber-50/40") : "border-slate-100 opacity-50"}`}>
                    <div className="flex items-center gap-2.5">
                      <input type="checkbox" checked={r.include}
                        onChange={(e) => setRow(r.key, "include", e.target.checked)}
                        className="w-4 h-4 accent-emerald-500 shrink-0" />
                      {edit ? (
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <input value={r.ticker} onChange={(e) => setRow(r.key, "ticker", e.target.value)}
                            placeholder="TICKER" className={input + " uppercase font-semibold py-1"} style={{ maxWidth: 96 }} autoFocus />
                          <input value={r.name} onChange={(e) => setRow(r.key, "name", e.target.value)}
                            placeholder="Name" className={input + " py-1"} />
                          <button onClick={() => setEditing((m) => ({ ...m, [r.key]: false }))} className="text-xs font-semibold text-emerald-600 shrink-0">Done</button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 text-[15px] leading-tight flex items-center gap-1.5">
                              {r.ticker || "—"}
                              {r.verified && (
                                <span className="text-[9px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-full" title="Listing confirmed with market data">
                                  {[r.verified.exchange, r.verified.currency].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 truncate">{r.name}</div>
                          </div>
                          <button onClick={() => setEditing((m) => ({ ...m, [r.key]: true }))}
                            className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0" aria-label="Edit ticker or name">
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">SHARES</label>
                        <input type="number" value={r.shares} onChange={(e) => setRow(r.key, "shares", e.target.value)} className={input + " py-1"} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">BUY PRICE *</label>
                        <input type="number" value={r.buyPrice} onChange={(e) => setRow(r.key, "buyPrice", e.target.value)}
                          placeholder="required" className={input + " py-1" + (Number(r.buyPrice) > 0 ? "" : " border-amber-400")} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">CURRENCY</label>
                        <select value={r.currency} onChange={(e) => setRow(r.key, "currency", e.target.value)} className={input + " py-1"}>
                          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                      </div>
                    </div>
                    {r.note && !r.verified && (
                      <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">ⓘ {r.note}</p>
                    )}
                    {r.note && r.verified && /buy price|missing/i.test(r.note) && !(Number(r.buyPrice) > 0) && (
                      <p className="text-[10px] text-amber-600 mt-1.5 leading-snug">ⓘ Buy price wasn't in the screenshot — enter it.</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 shrink-0 bg-white">
              <div className="flex items-center justify-between text-xs font-semibold mb-2">
                <span className="text-slate-600 tabular-nums">
                  <span className="text-emerald-600">{importable.length} ready</span>
                  {needsPrice > 0 && <span className="text-amber-600"> · {needsPrice} need attention</span>}
                  {selected.length < rows.length && <span className="text-slate-400"> · {rows.length - selected.length} skipped</span>}
                </span>
                {needsPrice > 0 && !onlyMissing && (
                  <button onClick={() => { setOnlyMissing(true); if (listRef.current) listRef.current.scrollTop = 0; }}
                    className="text-amber-700">Review {needsPrice} missing →</button>
                )}
              </div>
              <button onClick={confirm} disabled={!importable.length}
                className="btn-primary w-full disabled:opacity-50">
                Add {importable.length} ready position{importable.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= POSITION DETAIL ================= */
/* Tap a position → what the company actually does, in plain language.
   The description is AI-written once per ticker and cached, so it's
   instant (and free) on every later open.                              */
function DetailSheet({ h, cur, fx, info, onSaveInfo, onClosePosition, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hc = h.currency || cur;
  const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
  const value = fxConvert(h.shares * cp, hc, cur, fx);
  const plPct = h.buyPrice ? ((cp - h.buyPrice) / h.buyPrice) * 100 : 0;
  const up = plPct >= 0;
  const V = VERDICTS[h.verdict] || VERDICTS.open;
  const ticker = (h.ticker || "").toUpperCase();
  const [closing, setClosing] = useState(false);
  const [sellP, setSellP] = useState(cp);
  const [sellD, setSellD] = useState(new Date().toISOString().slice(0, 10));

  // lock the page behind the sheet so only the sheet scrolls
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const fetchInfo = async () => {
    setLoading(true); setError("");
    try {
      const what = h.type === "Stock" ? "company" : "fund";
      const prompt =
        `In 2-3 plain, friendly sentences, explain what ${h.name || ticker} (${ticker}) ` +
        (h.type === "Stock"
          ? `does as a business: what it makes or sells, and who its customers are. `
          : `is as a ${h.type}: what it tracks or holds and what an investor gets exposure to. `) +
        `Write for someone new to investing. No numbers, no opinions on whether it's a good investment, no advice. ` +
        `Respond with ONLY the description text, nothing else.`;
      const res = await fetch("/api/openai", {
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
      setError("Couldn't load the description — check your connection and try again.");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (!info && ticker) fetchInfo(); }, [ticker]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 flex flex-col bg-white sm:static sm:inset-auto sm:w-full sm:max-w-md sm:rounded-2xl sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}>
        {/* back bar — fixed, always visible */}
        <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between sm:rounded-t-3xl"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <button onClick={onClose} className="flex items-center gap-0.5 text-sm font-semibold text-emerald-600 -ml-1">
            <ChevronLeft size={20} /> Back
          </button>
        </div>
        {/* scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-3">
          <Logo h={h} size={48} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg text-slate-700 truncate">{h.name}</div>
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate-500">{ticker}</span> · {h.type}
              <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">{hc}</span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* what they do */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 mb-2">WHAT {h.type === "Stock" ? "THE COMPANY DOES" : "THIS FUND HOLDS"}</h4>
            {info ? (
              <p className="text-[15px] text-slate-600 leading-relaxed">{info.text}</p>
            ) : loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Writing a short description…
              </div>
            ) : error ? (
              <div>
                <p className="text-sm text-slate-400 mb-2">{error}</p>
                <button onClick={fetchInfo} className="text-sm font-semibold text-emerald-600">Try again</button>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No ticker set — edit the position to add one.</p>
            )}
          </div>

          {/* price chart */}
          {ticker && <PriceChart symbol={ticker} currency={hc} />}

          {/* position numbers */}
          <div className="bg-slate-50 rounded-2xl p-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] font-semibold text-slate-400">SHARES</div>
              <div className="font-bold text-slate-700 text-sm mt-0.5">{h.shares}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400">BUY → NOW</div>
              <div className="font-bold text-slate-700 text-sm mt-0.5">{money(h.buyPrice, hc)} → {money(cp, hc)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-400">RETURN</div>
              <div className={`font-bold text-sm mt-0.5 ${up ? "text-emerald-600" : "text-rose-500"}`}>{pct(plPct)}</div>
            </div>
            <div className="col-span-3 border-t border-slate-200 pt-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400">VALUE ({cur}) · {daysHeld(h.buyDate)} DAYS HELD</span>
              <span className="font-bold text-slate-700">{money(value, cur)}</span>
            </div>
          </div>

          {/* thesis */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-2">
              YOUR THESIS
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${V.chip}`}>
                <V.icon size={10} /> {V.label}
              </span>
            </h4>
            {h.thesis ? (
              <p className="text-[15px] text-slate-600 leading-relaxed italic">“{h.thesis}”</p>
            ) : (
              <p className="text-sm text-slate-400">No thesis written yet — the best time is while you still remember why you bought it.</p>
            )}
          </div>

          {/* what people think */}
          <div className="border-t border-slate-100 pt-1">
            <StockSocial ticker={ticker} name={h.name} price={cp} currency={hc} />
          </div>

          {/* close position */}
          {onClosePosition && (
            <div className="border-t border-slate-100 pt-4">
              {!closing ? (
                <button onClick={() => setClosing(true)}
                  className="w-full bg-slate-100 text-slate-600 text-sm font-semibold py-2.5 rounded-xl">
                  Close position (record a sale)
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400">RECORD SALE</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">SELL PRICE ({hc})</label>
                      <input type="number" value={sellP} onChange={(e) => setSellP(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">SELL DATE</label>
                      <input type="date" value={sellD} onChange={(e) => setSellD(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onClosePosition(Number(sellP), sellD)}
                      disabled={!(Number(sellP) > 0)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
                      Confirm sale
                    </button>
                    <button onClick={() => setClosing(false)}
                      className="bg-slate-100 text-slate-500 text-sm font-semibold px-4 rounded-xl">Cancel</button>
                  </div>
                  <p className="text-[10px] text-slate-400">Moves it to Closed trades and counts toward your realized return.</p>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            AI-written summary for learning purposes — not investment advice.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

/* ================= COMPANY INFO (Research) ================= */
/* "What it does" AI description for any searched instrument —
   the same research holdings get in their detail sheet, now for
   any company. Shares the companyInfo cache (keyed by ticker),
   so a description generated here is already there if you later
   buy the stock, and vice versa. Auto-loads once per ticker. */
function CompanyInfoCard({ symbol, name, type, info, onSaveInfo }) {
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
      const res = await fetch("/api/openai", {
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
function AiThesisCard({ symbol, name }) {
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
      const res = await fetch("/api/openai", {
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

/* ================= PORTFOLIO HISTORY SHEET ================= */
/* Full-screen portfolio history with 1D/1W/1M/6M/1Y horizons.
   Fetches an accurate reconstructed series from the
   portfolio-history edge function, and appends the LIVE current
   value as the last point — the tip moves with each refresh. */
const PH_RANGES = [
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
const PH_SERVICE_RANGE = { "1d": "1d", "1w": "1w", "1mo": "1mo", "ytd": "1y", "1y": "1y", "all": "1y" };
const cutSeries = (points, range) => {
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

/* The performance chart: reconstructed daily history with 1D…ALL ranges,
   gain/loss for the range, and an optional benchmark overlay. Used on the
   Overview (compact) and in the fullscreen history sheet (tall). */
/* Custom hover/tap card for the portfolio chart: date, value and the
   change since the start of the range (or you vs benchmark in compare mode). */
function ChartTip({ active, payload, label, cur, first, compare, benchLabel }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload || {};
  return (
    <div className="bg-slate-900 text-white rounded-xl px-3 py-2 shadow-lg text-xs tabular-nums">
      <div className="text-slate-400 mb-0.5">{fmtDateTime(label)}</div>
      {compare ? (
        <>
          <div className="flex justify-between gap-4"><span>You</span><span className={`font-bold ${(row.mine || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{row.mine == null ? "—" : pct(row.mine)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-slate-300">{benchLabel}</span><span className="font-semibold text-slate-200">{row.spx == null ? "—" : pct(row.spx)}</span></div>
        </>
      ) : (
        <>
          <div className="font-bold text-sm">{money(row.value, cur)}</div>
          {first > 0 && row.value != null && (
            <div className={`font-semibold ${row.value >= first ? "text-emerald-400" : "text-rose-400"}`}>{pct(((row.value - first) / first) * 100)} since start</div>
          )}
          {row.cost > 0 && <div className="text-slate-400">Invested {money(row.cost, cur)}</div>}
        </>
      )}
    </div>
  );
}

function PerformanceChart({ holdings, cur, liveValue, liveCost, bench: BENCH = DEFAULT_BENCH, onBench, height = 256, compact = false, initialRange = "1mo", onExpand }) {
  const open = true;
  const [range, setRange] = useState(initialRange);
  const [pts, setPts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [compare, setCompare] = useState(false);   // overlay S&P 500
  const [bench, setBench] = useState(null);        // [{t, c}]

  /* Benchmark closes for the same range (SPY via get-history). */
  useEffect(() => {
    if (!open || !compare) return;
    let dead = false;
    const map = { "1d": "1d", "1w": "5d", "1mo": "1mo", "ytd": "ytd", "1y": "1y", "all": "1y" };
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-history", {
          body: { symbol: BENCH.symbol, currency: "USD", range: map[range] || "1y" },
        });
        if (dead) return;
        setBench(!error && data && data.ok && Array.isArray(data.points) ? data.points : null);
      } catch (e) { if (!dead) setBench(null); }
    })();
    return () => { dead = true; };
  }, [open, compare, range, BENCH.symbol]);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const body = {
          display: cur,
          range: PH_SERVICE_RANGE[range] || "1y",
          holdings: (holdings || []).map((h) => ({
            ticker: h.ticker, shares: Number(h.shares) || 0,
            buyPrice: Number(h.buyPrice) || 0, buyDate: h.buyDate || null,
            sellDate: h.sellDate || null, currency: h.currency || cur,
          })),
        };
        const { data, error } = await supabase.functions.invoke("portfolio-history", { body });
        if (dead) return;
        if (error || !data || !data.ok || !Array.isArray(data.points) || !data.points.length) {
          setErr((data && data.error) || "Could not load history."); setPts(null);
        } else {
          setPts(cutSeries(data.points, range));
        }
      } catch (e) { if (!dead) { setErr("Could not load history."); setPts(null); } }
      if (!dead) setLoading(false);
    })();
    return () => { dead = true; };
  }, [open, range, holdingsKey(holdings, cur)]); // key, not the array: price refreshes must not refetch

  const intraday = range === "1d" || range === "1w";
  const fmtTick = (t) => {
    const d = new Date(t);
    if (range === "1d") return fmtTime(d);
    if (range === "1w") return fmtDate(d, { weekday: "short" });
    return fmtDate(d);
  };

  const chart = (pts || []).map((p) => ({ t: p.t, value: p.value, cost: p.cost }));
  if (chart.length && liveValue > 0) {
    chart.push({ t: new Date().toISOString(), value: Math.round(liveValue * 100) / 100, cost: liveCost });
  }

  /* Headline gain for the range: measured from the first day the portfolio
     existed within the range, and cash-flow adjusted (money you added is
     not a gain). */
  const firstIdx = chart.findIndex((p) => p.value > 0);
  const firstPt = firstIdx >= 0 ? chart[firstIdx] : null;
  const lastPt = chart.length ? chart[chart.length - 1] : null;
  const first = firstPt ? firstPt.value : 0;
  const last = lastPt ? lastPt.value : 0;
  const diff = firstPt && lastPt ? (last - first) - ((lastPt.cost || 0) - (firstPt.cost || 0)) : 0;
  const diffPct = first ? (diff / first) * 100 : 0;
  const up = diff >= 0;
  const rangeSub = (PH_RANGES.find((r) => r.id === range) || {}).sub || "";
  const youngerThanRange = firstIdx > 0 && range !== "all";
  const sub = youngerThanRange && firstPt ? `Since ${fmtDate(firstPt.t)}` : rangeSub;

  /* Compare mode: both lines as % change from the start of the range.
     Portfolio is cash-flow adjusted (deposits don't count as gains);
     the benchmark's value at each portfolio timestamp is the last close
     on/before it. */
  let cmp = null, benchPct = null;
  const live0 = chart.findIndex((p) => p.value > 0); // skip the pre-purchase zeros
  if (compare && live0 >= 0 && chart.length - live0 > 1) {
    const c0 = chart[live0];
    const b0 = bench && bench.length ? (bench[idxOnOrBefore(bench, new Date(c0.t).getTime())] || bench[0]) : null;
    cmp = chart.slice(live0).map((p) => {
      const mine = c0.value > 0 ? (((p.value - c0.value) - ((p.cost || 0) - (c0.cost || 0))) / c0.value) * 100 : 0;
      let spx = null;
      if (b0 && b0.c > 0) {
        const i = idxOnOrBefore(bench, new Date(p.t).getTime());
        const b = i >= 0 ? bench[i] : null;
        if (b) spx = ((b.c - b0.c) / b0.c) * 100;
      }
      return { t: p.t, mine: Number(mine.toFixed(2)), spx: spx != null ? Number(spx.toFixed(2)) : null };
    });
    const lastB = [...cmp].reverse().find((x) => x.spx != null);
    benchPct = lastB ? lastB.spx : null;
  }

  return (
    <div>
    <div className="flex items-end justify-between gap-2">
      <div>
        {!compact && <div className="text-2xl font-bold text-slate-800 tabular-nums">{money(last, cur)}</div>}
        <div className={`text-sm font-semibold flex items-center gap-1 mt-0.5 tabular-nums ${up ? "text-emerald-600" : "text-rose-500"}`}>
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {up ? "+" : "−"}{money(Math.abs(diff), cur)} ({pct(diffPct)})
          <span className="text-slate-400 font-normal ml-1">{sub}</span>
        </div>
      </div>
      {onExpand && (
        <button onClick={onExpand} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 shrink-0">Expand ↗</button>
      )}
    </div>

    <div className="-mx-2 mt-3" style={{ height }}>
      {loading ? (
        <div className="h-full flex flex-col justify-end gap-2 px-2 pb-2" aria-busy="true">
          <div className="skel h-2 w-full" /><div className="skel h-2 w-11/12" /><div className="skel h-2 w-4/5" />
        </div>
      ) : err ? (
        <div className="h-full flex items-center justify-center text-sm text-rose-500 text-center px-6">{err}</div>
      ) : cmp ? (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={cmp} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
            <XAxis dataKey="t" tickFormatter={fmtTick} minTickGap={40}
              tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%`} width={44}
              tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
            <Tooltip content={<ChartTip cur={cur} compare benchLabel={BENCH.label} />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }} />
            <Line type="monotone" dataKey="spx" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls
              activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: "#94a3b8" }} />
            <Line type="monotone" dataKey="mine" stroke={up ? "#10b981" : "#f43f5e"} strokeWidth={2.5} dot={false} isAnimationActive={false}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: up ? "#10b981" : "#f43f5e" }} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="phg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={up ? "#10b981" : "#f43f5e"} stopOpacity={0.25} />
                <stop offset="100%" stopColor={up ? "#10b981" : "#f43f5e"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tickFormatter={fmtTick} minTickGap={40}
              tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide domain={["auto", "auto"]} />
            {!intraday && chart.length > 0 && (
              <ReferenceLine y={chart[chart.length - 1].cost} stroke="#cbd5e1" strokeDasharray="4 4" />
            )}
            <Tooltip content={<ChartTip cur={cur} first={first} />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }} />
            <Area type="monotone" dataKey="value" stroke={up ? "#10b981" : "#f43f5e"}
              strokeWidth={2.5} fill="url(#phg)" isAnimationActive={false}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: up ? "#10b981" : "#f43f5e" }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>

    {/* Range control: one segmented bar, the active range lifted in white. */}
    <div className="mt-3 bg-slate-100 rounded-xl p-1 flex" role="tablist" aria-label="Chart range">
      {PH_RANGES.filter((r) => !(compact && r.id === "1d")).map((r) => (
        <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)}
          className={`flex-1 h-8 text-[12px] font-bold rounded-lg transition tabular-nums ${
            range === r.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          {r.label}
        </button>
      ))}
    </div>
    <div className={`mt-2 w-full flex items-center justify-between gap-2 text-xs font-semibold px-3 py-2 rounded-xl border transition ${
        compare ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"}`}>
      <button onClick={() => setCompare((v) => !v)} className="flex items-center gap-2">
        <span className={`w-9 h-5 rounded-full p-0.5 ${compare ? "bg-emerald-500" : "bg-slate-200"}`}>
          <span className={`block w-4 h-4 bg-white rounded-full shadow transform transition ${compare ? "translate-x-4" : ""}`} />
        </span>
        Compare
      </button>
      {onBench && <BenchPicker value={BENCH} onChange={onBench} dark={compare} />}
      <span className={`ml-auto ${compare ? "text-slate-300" : "text-slate-400"}`}>
        {compare
          ? (benchPct == null ? (bench === null ? "loading…" : "no data") : `${BENCH.short} ${pct(benchPct)} · you ${pct(diffPct)}`)
          : ""}
      </span>
    </div>

    <p className="text-[10px] text-slate-300 mt-3">
      Reconstructed from official daily closes and intraday bars, converted at historical FX.
      Excludes dividends and fees. The last point is your live value.
      {compare ? " Compare mode shows % change from the start of the range; your line ignores money added or withdrawn." : ""}
    </p>
    </div>
  );
}

function PortfolioHistorySheet({ open, onClose, holdings, cur, liveValue, liveCost, hex, bench, onBench }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-slate-50 overflow-y-auto">
      <div className="max-w-md mx-auto p-4 pb-10">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onClose} className="p-2 -ml-2 text-slate-500"><ChevronLeft size={22} /></button>
          <h2 className="font-bold text-lg text-slate-700">Portfolio history</h2>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <PerformanceChart holdings={holdings} cur={cur} liveValue={liveValue} liveCost={liveCost} bench={bench} onBench={onBench} height={300} initialRange="1y" />
        </div>
      </div>
    </div>
  );
}

/* ================= RESEARCH ================= */
/* Look up any stock on demand: search → live quote (via the get-quote
   edge function) → add to portfolio or watch. No seed_tickers bloat;
   each lookup fetches its own price when you open it. */
function ResearchTab({ cur, say, onUpsert, companyInfo, onSaveInfo, watchlist, onWatch, onUnwatch, initialQuery, onConsumeQuery, holdings = [], fx = null }) {
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
  useEffect(() => {
    if (!initialQuery) return;
    const t = initialQuery.toUpperCase();
    setQ(t);
    (async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q: t } });
        const rs = !error && data && Array.isArray(data.results) ? data.results : [];
        const exact = rs.find((r) => String(r.symbol || "").toUpperCase() === t) || rs[0];
        if (exact) choose(exact); else setResults(rs.slice(0, 8));
      } catch (e) { /* leave the query typed for the user */ }
      setSearching(false);
      if (onConsumeQuery) onConsumeQuery();
    })();
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
            onOpenTicker={(t) => { search(t); }} />

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
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
          <Search size={24} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">Search any instrument above to see its current price. Nothing is added until you choose to.</p>
        </div>
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
function PriceChart({ symbol, currency }) {
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

/* ================= PROFILE SHEET ================= */
/* Tapping a leaderboard entry opens this: badge, philosophy, unrealized +
   realized return, win rate, average hold, and top-10 allocation. */
function ProfileSheet({ r, me, mine = null, latest = null, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const prof = profileOf(r.profile);
  const up = (r.returnPct || 0) >= 0;
  const rUp = (r.realizedPct || 0) >= 0;
  const Stat = ({ label, value, tone }) => (
    <div className="bg-slate-50 rounded-2xl p-3 text-center">
      <div className={`font-bold text-sm ${tone || "text-slate-700"}`}>{value}</div>
      <div className="text-[10px] font-semibold text-slate-400 mt-0.5">{label}</div>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 flex flex-col bg-white sm:static sm:inset-auto sm:w-full sm:max-w-md sm:rounded-2xl sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between sm:rounded-t-3xl"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <button onClick={onClose} className="flex items-center gap-0.5 text-sm font-semibold text-emerald-600 -ml-1">
            <ChevronLeft size={20} /> Back
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
          <PortfolioCard name={r.name} mascot={prof ? prof.mascot : "👤"} style={prof ? prof.label : "Investor"}
            ytd={r.returnPct} rank={r.rank} n={r.rankN} top={r.topHoldings || []} spark={r.spark} score={r.score} />
          {me && <div className="text-[10px] font-bold text-emerald-600">THIS IS YOU — what friends see</div>}

          {latest && (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <span className="text-emerald-500">●</span>
              <span className="truncate">{me ? "You" : r.name} {eventText(latest)}</span>
              <span className="text-slate-300 text-xs shrink-0">{timeAgo(latest.created_at)}</span>
            </div>
          )}

          {/* You vs them — the whole point of the app in one card. */}
          {!me && mine && (r.returnPct != null || r.score != null) && (() => {
            const rows = [
              ["YTD return", mine.returnPct, r.returnPct, (v) => <Ret v={v} />],
              ["RichR Score", mine.score, r.score, (v) => <span className={`tabular-nums ${scoreTone(v)}`}>{v}</span>],
              ["Win rate", mine.winRate, r.winRate, (v) => <span className="tabular-nums text-slate-700">{v}%</span>],
              ["Avg hold", mine.avgDays, r.avgDays, (v) => <span className="tabular-nums text-slate-700">{v}d</span>],
            ].filter(([, a, b]) => a != null || b != null);
            const overlap = Array.isArray(mine.topHoldings) && Array.isArray(r.topHoldings)
              ? mine.topHoldings.filter((h) => r.topHoldings.some((x) => x.ticker === h.ticker)).map((h) => h.ticker) : [];
            return (
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-2">
                  <span className="flex items-center gap-1.5"><Avatar name={mine.name} size={18} /> YOU</span>
                  <span>VS</span>
                  <span className="flex items-center gap-1.5">{String(r.name || "").toUpperCase()} <Avatar name={r.name} size={18} /></span>
                </div>
                <div className="space-y-1.5">
                  {rows.map(([label, a, b, f]) => {
                    const lead = a != null && b != null ? (label === "Avg hold" ? null : a > b ? "a" : b > a ? "b" : null) : null;
                    return (
                      <div key={label} className="flex items-center text-sm">
                        <div className={`w-20 text-left font-bold ${lead === "a" ? "" : "opacity-70"}`}>{a == null ? <span className="text-slate-300">—</span> : f(a)}</div>
                        <div className="flex-1 text-center text-[11px] font-semibold text-slate-400">{label}</div>
                        <div className={`w-20 text-right font-bold ${lead === "b" ? "" : "opacity-70"}`}>{b == null ? <span className="text-slate-300">—</span> : f(b)}</div>
                      </div>
                    );
                  })}
                </div>
                {overlap.length > 0 && (
                  <div className="text-[11px] text-slate-500 mt-2.5">You both hold <b>{overlap.join(", ")}</b>.</div>
                )}
              </div>
            );
          })()}

          {r.philosophy && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 mb-1.5">INVESTING PHILOSOPHY</h4>
              <p className="text-[15px] text-slate-600 leading-relaxed italic">"{r.philosophy}"</p>
            </div>
          )}

          {/* "—" = not shared by this person (or nothing to show yet) */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="UNREALIZED RETURN" value={r.returnPct != null ? pct(r.returnPct) : "—"} tone={r.returnPct == null ? "text-slate-400" : up ? "text-emerald-600" : "text-rose-500"} />
            <Stat label="REALIZED RETURN" value={r.realizedPct != null ? pct(r.realizedPct) : "—"} tone={r.realizedPct == null ? "text-slate-400" : rUp ? "text-emerald-600" : "text-rose-500"} />
            <Stat label="WIN RATE" value={r.winRate != null ? `${r.winRate}%` : "—"} />
            <Stat label="AVG HOLD" value={r.avgDays != null ? `${r.avgDays}d` : "—"} />
          </div>

          {r.score != null && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 mb-1.5">RICHR SCORE</h4>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-extrabold ${scoreTone(r.score)}`}>{r.score}</div>
                <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {Object.keys(SCORE_LABEL).map((k) => (
                    <div key={k} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 truncate">{SCORE_LABEL[k]}</span>
                      <span className={`font-bold ml-2 ${scoreTone(r.scoreParts && r.scoreParts[k])}`}>{r.scoreParts && r.scoreParts[k] != null ? r.scoreParts[k] : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <CallsList userId={r.userId} title={me ? "YOUR CALLS" : "CALLS"} emptyText={me ? "You haven't rated any stocks yet — open a stock and vote Buy, Hold or Sell." : `${r.name} hasn't rated any stocks yet.`} />

          <div>
            <h4 className="text-xs font-semibold text-slate-400 mb-2">TOP HOLDINGS · ALLOCATION{typeof r.holdings === "number" ? ` (${r.holdings} positions)` : ""}</h4>
            {r.topHoldings == null ? (
              <p className="text-sm text-slate-400 flex items-center gap-1.5"><Lock size={13} /> {me ? "You keep your holdings private." : `${r.name} keeps their holdings private.`}</p>
            ) : r.topHoldings.length > 0 ? (
              <div className="space-y-1.5">
                {r.topHoldings.map((h) => (
                  <div key={h.ticker} className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-700 w-20 shrink-0 truncate">{h.ticker}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${Math.min(100, h.pct)}%` }} />
                    </div>
                    <div className="text-xs font-semibold text-slate-500 w-12 text-right">{h.pct}%</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No holdings shared.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= SOCIAL LAYER ================= */
/* Portfolio = identity, activity = content, opinions = discussion,
   performance = reputation, chat connects everything.
   Buy/Hold/Sell is community sentiment — an opinion, never advice.
   Votes and discussions are visible to every signed-in RichR user
   (tables stock_calls / stock_posts); portfolio numbers stay
   mutual-friends-only exactly as before. */

const SOCIAL_ME = { id: null, username: "" };   // set by the main component on every render
const VOTE_META = {
  buy:  { label: "Buy",  dot: "🟢", text: "text-emerald-700", chip: "bg-emerald-50 border-emerald-200 text-emerald-700", bar: "bg-emerald-500", solid: "bg-emerald-600 text-white" },
  hold: { label: "Hold", dot: "🟡", text: "text-amber-700",   chip: "bg-amber-50 border-amber-200 text-amber-700",     bar: "bg-amber-400",   solid: "bg-amber-500 text-white" },
  sell: { label: "Sell", dot: "🔴", text: "text-rose-700",    chip: "bg-rose-50 border-rose-200 text-rose-700",        bar: "bg-rose-500",    solid: "bg-rose-600 text-white" },
};
const VOTE_ORDER = ["buy", "hold", "sell"];

/* Mutual-friend ids, cached for a minute so every card doesn't re-query. */
const _mutual = { at: 0, for: null, ids: [] };
async function mutualIdsCached(userId) {
  if (!userId) return [];
  if (_mutual.for === userId && Date.now() - _mutual.at < 60000) return _mutual.ids;
  try {
    const list = await loadMutualFriends(userId);
    _mutual.at = Date.now(); _mutual.for = userId; _mutual.ids = list.map((f) => f.id);
    NAME_CACHE.fill(list.map((f) => [f.id, f.username]));
  } catch (e) { /* keep old */ }
  return _mutual.ids;
}

/* username lookups, cached across components */
const NAME_CACHE = {
  m: {},
  fill(pairs) { pairs.forEach(([id, u]) => { if (u) this.m[id] = u; }); },
  async ensure(ids) {
    const missing = [...new Set(ids)].filter((id) => id && !this.m[id]);
    if (!missing.length) return this.m;
    const { data } = await supabase.from("profiles").select("user_id, username").in("user_id", missing);
    (data || []).forEach((p) => { this.m[p.user_id] = p.username || "unknown"; });
    missing.forEach((id) => { if (!this.m[id]) this.m[id] = "unknown"; });
    return this.m;
  },
};
function useNames(ids) {
  const [names, setNames] = useState({ ...NAME_CACHE.m });
  const key = (ids || []).filter(Boolean).sort().join(",");
  useEffect(() => {
    let dead = false;
    NAME_CACHE.ensure(ids || []).then((m) => { if (!dead) setNames({ ...m }); });
    return () => { dead = true; };
  }, [key]);
  return names;
}

/* Latest call per (user, ticker) from an append-only list sorted newest first. */
const latestCalls = (rows, by = (r) => `${r.user_id}|${r.ticker}`) => {
  const seen = new Set(); const out = [];
  for (const r of rows || []) { const k = by(r); if (seen.has(k)) continue; seen.add(k); out.push(r); }
  return out;
};

/* Return of a stock since a call was made, from the shared prices table. */
function useReturnsSince(calls) {
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
function VoteChip({ vote, size = "xs", className = "" }) {
  const m = VOTE_META[vote]; if (!m) return null;
  return <span className={`inline-flex items-center gap-1 border rounded-full px-1.5 py-0.5 font-bold ${size === "xs" ? "text-[10px]" : "text-xs"} ${m.chip} ${className}`}>{m.dot} {m.label}</span>;
}

/* Sentiment bar + counts */
function SentimentBar({ counts, total, compact = false }) {
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

/* ---------- Stock page: sentiment voting + discussion ---------- */
function StockSocial({ ticker: rawTicker, name, price, currency, onOpenTicker }) {
  const ticker = String(rawTicker || "").toUpperCase();
  const me = SOCIAL_ME.id;
  const [calls, setCalls] = useState(null);      // latest per user
  const [friendIds, setFriendIds] = useState([]);
  const [posts, setPosts] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [reason, setReason] = useState("");
  const [pendingVote, setPendingVote] = useState(null); // vote chosen, reason being typed
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    if (!ticker) return;
    const [{ data: cs }, { data: ps }, ids] = await Promise.all([
      supabase.from("stock_calls").select("id, user_id, vote, reason, price_at, currency, created_at").eq("ticker", ticker).order("created_at", { ascending: false }).limit(500),
      supabase.from("stock_posts").select("id, user_id, parent_id, body, created_at").eq("ticker", ticker).order("created_at", { ascending: true }).limit(200),
      mutualIdsCached(me),
    ]);
    setCalls(latestCalls(cs || [], (r) => r.user_id));
    setFriendIds(ids);
    const postIds = (ps || []).map((p) => p.id);
    if (postIds.length) {
      const { data: rs } = await supabase.from("stock_post_reactions").select("post_id, user_id, emoji").in("post_id", postIds);
      setReactions(rs || []);
    } else setReactions([]);
    setPosts(ps || []);
  };
  useEffect(() => { setCalls(null); setPosts(null); setPendingVote(null); setReason(""); load(); }, [ticker]);

  const names = useNames([...(calls || []).map((c) => c.user_id), ...(posts || []).map((p) => p.user_id)]);
  const uname = (id) => (id === me ? (SOCIAL_ME.username || names[id] || "you") : (names[id] || "…"));

  const myCall = (calls || []).find((c) => c.user_id === me) || null;
  const counts = { buy: 0, hold: 0, sell: 0 };
  (calls || []).forEach((c) => { counts[c.vote] = (counts[c.vote] || 0) + 1; });
  const total = (calls || []).length;
  const friendCalls = (calls || []).filter((c) => friendIds.includes(c.user_id));
  const voteOf = (id) => ((calls || []).find((c) => c.user_id === id) || {}).vote;

  const castVote = async (vote) => {
    if (!me) return;
    const row = { user_id: me, ticker, vote, reason: reason.trim().slice(0, 140) || null, price_at: Number(price) > 0 ? Number(price) : null, currency: currency || null };
    const optimistic = { ...row, id: "tmp", created_at: new Date().toISOString() };
    setCalls((cs) => [optimistic, ...(cs || []).filter((c) => c.user_id !== me)]);
    setPendingVote(null); setReason("");
    const { error } = await supabase.from("stock_calls").insert(row);
    if (error) { await load(); return; }
    await load();
  };

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
  const removePost = async (post) => {
    await supabase.from("stock_posts").delete().eq("id", post.id);
    await load();
  };

  const tops = (posts || []).filter((p) => !p.parent_id);
  const shownTops = showAll ? tops : tops.slice(-6);
  const repliesOf = (id) => (posts || []).filter((p) => p.parent_id === id);

  const renderPost = (p, isReply) => {
    const mine = p.user_id === me;
    const rs = reactions.filter((r) => r.post_id === p.id);
    const v = voteOf(p.user_id);
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
      {/* ---- sentiment ---- */}
      <div className="bg-slate-50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-semibold text-slate-400">COMMUNITY SENTIMENT · {ticker}</h4>
          {myCall && <span className="text-[10px] text-slate-400">You: <VoteChip vote={myCall.vote} /></span>}
        </div>
        {calls === null ? <div className="skel h-2.5 w-full" /> : <SentimentBar counts={counts} total={total} />}

        {friendCalls.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-600">
            <span className="font-semibold text-slate-500">Friends:</span>
            {friendCalls.slice(0, 6).map((c) => (
              <span key={c.user_id} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full pl-0.5 pr-2 py-0.5">
                <Avatar name={uname(c.user_id)} size={16} /> @{uname(c.user_id)} {VOTE_META[c.vote].dot}
              </span>
            ))}
            {friendCalls.length > 6 && <span className="text-slate-400">+{friendCalls.length - 6}</span>}
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          {VOTE_ORDER.map((k) => {
            const active = (pendingVote || (myCall && myCall.vote)) === k;
            return (
              <button key={k} onClick={() => setPendingVote(k)}
                className={`h-10 rounded-xl text-sm font-bold border transition ${active ? VOTE_META[k].solid + " border-transparent" : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"}`}>
                {VOTE_META[k].dot} {VOTE_META[k].label}
              </button>
            );
          })}
        </div>
        {pendingVote && (
          <div className="mt-2 flex items-center gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 140))} maxLength={140}
              onKeyDown={(e) => { if (e.key === "Enter") castVote(pendingVote); }}
              placeholder="Why? (optional, 140 chars)" className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 h-10 text-sm bg-white" autoFocus />
            <button onClick={() => castVote(pendingVote)} className={`h-10 px-4 rounded-xl text-sm font-bold ${VOTE_META[pendingVote].solid}`}>
              {myCall ? "Update" : "Vote"}
            </button>
          </div>
        )}
        {myCall && myCall.reason && !pendingVote && <p className="text-[11px] text-slate-500 mt-2 italic">Your reason: “{myCall.reason}”</p>}
        <p className="text-[10px] text-slate-400 mt-2">Opinions of RichR users, not financial advice. Your vote is public to other members; historical calls show on your profile.</p>
      </div>

      {/* ---- recent reasons ---- */}
      {(calls || []).some((c) => c.reason) && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 mb-1.5">WHY PEOPLE VOTED</h4>
          <div className="space-y-1.5">
            {(calls || []).filter((c) => c.reason).slice(0, 4).map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-[13px] text-slate-600">
                <VoteChip vote={c.vote} className="shrink-0 mt-0.5" />
                <span className="leading-snug">“{c.reason}” <span className="text-slate-400 text-[11px]">— @{uname(c.user_id)} · {timeAgo(c.created_at)}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- discussion ---- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-400">DISCUSSION{tops.length ? ` · ${tops.length}` : ""}</h4>
          {tops.length > 6 && !showAll && <button onClick={() => setShowAll(true)} className="text-[11px] font-semibold text-emerald-700">Show all</button>}
        </div>
        {posts === null ? (
          <div className="space-y-2"><div className="skel h-4 w-2/3" /><div className="skel h-4 w-1/2" /></div>
        ) : tops.length === 0 ? (
          <p className="text-sm text-slate-400">No one has posted about {ticker} yet. What's your take?</p>
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
            placeholder={replyTo ? "Write a reply…" : `Your opinion on ${ticker}… use $TICKER to tag others`}
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
function CallsList({ userId, calls: given = null, limit = 8, title = "CALLS", onOpenTicker, emptyText = "No Buy/Hold/Sell calls yet." }) {
  const [rows, setRows] = useState(given);
  useEffect(() => {
    if (given) { setRows(given); return; }
    if (!userId) return;
    let dead = false;
    supabase.from("stock_calls").select("id, ticker, vote, reason, price_at, currency, created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { if (!dead) setRows(latestCalls(data || [], (r) => r.ticker)); });
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

/* ---------- Home: what your friends are doing ---------- */
function HomeFeed({ user, onOpenTicker, goFriends }) {
  const [items, setItems] = useState(null);
  const [trending, setTrending] = useState([]);
  const [scope, setScope] = useState("friends"); // friends | community (when no friends yet)
  useEffect(() => {
    let dead = false;
    (async () => {
      const ids = await mutualIdsCached(user.id);
      const sinceIso = new Date(Date.now() - 14 * 86400000).toISOString();
      const who = ids.length ? ids : null;
      if (!who) setScope("community");
      const q = (t, sel, ord = "created_at") => {
        let b = supabase.from(t).select(sel).gte("created_at", sinceIso).order(ord, { ascending: false }).limit(80);
        if (who) b = b.in("user_id", who);
        else b = b.neq("user_id", user.id);
        return b;
      };
      const [{ data: ev }, { data: cs }, { data: ps }] = await Promise.all([
        who ? q("portfolio_events", "id, user_id, kind, ticker, from_pct, to_pct, created_at") : Promise.resolve({ data: [] }),
        q("stock_calls", "id, user_id, ticker, vote, reason, created_at"),
        q("stock_posts", "id, user_id, ticker, body, parent_id, created_at"),
      ]);
      if (dead) return;
      const all = [
        ...(ev || []).map((e) => ({ t: "event", id: "e" + e.id, user_id: e.user_id, ticker: e.ticker, created_at: e.created_at, e })),
        ...latestCalls(cs || []).map((c) => ({ t: "call", id: "c" + c.id, user_id: c.user_id, ticker: c.ticker, created_at: c.created_at, c })),
        ...(ps || []).filter((p) => !p.parent_id).map((p) => ({ t: "post", id: "p" + p.id, user_id: p.user_id, ticker: p.ticker, created_at: p.created_at, p })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(all.slice(0, 25));
      const weekAgo = Date.now() - 7 * 86400000;
      const cnt = {};
      all.filter((x) => x.ticker && new Date(x.created_at).getTime() > weekAgo).forEach((x) => { cnt[x.ticker] = (cnt[x.ticker] || 0) + 1; });
      setTrending(Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6));
    })();
    return () => { dead = true; };
  }, [user.id]);
  const names = useNames((items || []).map((x) => x.user_id));
  const [showAll, setShowAll] = useState(false);

  if (items === null) return <Skeleton lines={3} />;
  const line = (x) => {
    if (x.t === "event") return eventText(x.e);
    if (x.t === "call") return <>{VOTE_META[x.c.vote].dot} rated <b>{x.c.ticker}</b> a <b>{VOTE_META[x.c.vote].label}</b>{x.c.reason ? <span className="text-slate-500"> — “{x.c.reason}”</span> : ""}</>;
    return <>on <b>{x.p.ticker}</b>: <span className="text-slate-600">{x.p.body.length > 140 ? x.p.body.slice(0, 140) + "…" : x.p.body}</span></>;
  };
  const shown = showAll ? items : items.slice(0, 8);
  return (
    <div>
      {trending.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-[10px] font-bold text-slate-400 mr-1">TRENDING{scope === "community" ? " ON RICHR" : " AMONG FRIENDS"}</span>
          {trending.map(([t, n]) => (
            <button key={t} onClick={() => onOpenTicker && onOpenTicker(t)} className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-full hover:border-slate-300">
              {t} <span className="text-slate-400 font-medium">{n}</span>
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">
          {scope === "community" ? "It's quiet on RichR right now." : "Your friends have been quiet this fortnight."}{" "}
          <button onClick={goFriends} className="font-semibold text-emerald-700">{scope === "community" ? "Add friends →" : "See friends →"}</button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {shown.map((x) => (
            <div key={x.id} className="py-2.5 flex items-start gap-2.5">
              <Avatar name={names[x.user_id] || "?"} size={28} />
              <div className="flex-1 min-w-0 text-[13px] text-slate-700 leading-snug">
                <span className="font-bold">@{names[x.user_id] || "…"}</span> {line(x)}
                <div className="text-[10px] text-slate-400 mt-0.5">{timeAgo(x.created_at)}{x.ticker && <> · <button onClick={() => onOpenTicker && onOpenTicker(x.ticker)} className="font-semibold text-emerald-700">open {x.ticker}</button></>}</div>
              </div>
            </div>
          ))}
          {items.length > 8 && !showAll && <button onClick={() => setShowAll(true)} className="text-xs font-semibold text-emerald-700 pt-2">Show more</button>}
        </div>
      )}
      {scope === "community" && items.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-2">Showing RichR-wide activity until you have mutual friends. <button onClick={goFriends} className="font-semibold text-emerald-700">Add friends →</button></p>
      )}
    </div>
  );
}

/* ---------- Chat cards: share a stock, position, performance or vote ---------- */
function ChatCard({ card, onTicker }) {
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
function CardPicker({ holdings, cur, fx, data, active, onPick, onClose }) {
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
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Ticker or company…" className="w-full border border-slate-200 rounded-xl px-3 h-9 text-sm bg-white uppercase" autoFocus />
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

/* ================= COMMUNITIES (private spaces between mutual friends; tables are still called groups) ================= */
/* Everything here is gated by RLS in Supabase (see
   supabase/migrations/20260902_group_chats.sql): you only ever receive
   groups you belong to, and you can only add people who are your MUTUAL
   friends. The UI mirrors those rules but never has to enforce them. */

const TICKER_RE = /\$([A-Za-z][A-Za-z0-9.\-]{0,9})/g;
const extractTickers = (body) => {
  const out = new Set();
  String(body || "").replace(TICKER_RE, (_, t) => { out.add(t.toUpperCase()); return _; });
  return [...out];
};
const REACTIONS = ["👍", "🚀", "🤔", "🔥"];
/* One sentence per feed event — shared by the Activity feed and the
   leaderboard's "latest update" line. */
function eventText(e) {
  const p = (n) => `${Math.round(Number(n))}%`;
  switch (e.kind) {
    case "shared": return "started sharing their portfolio";
    case "added": return <>added <b>{e.ticker}</b>{e.to_pct != null ? ` (${p(e.to_pct)})` : ""}</>;
    case "removed": return <>sold out of <b>{e.ticker}</b></>;
    case "increased": return <>increased <b>{e.ticker}</b> from {p(e.from_pct)} → {p(e.to_pct)}</>;
    case "decreased": return <>trimmed <b>{e.ticker}</b> from {p(e.from_pct)} → {p(e.to_pct)}</>;
    case "score": return <>RichR Score {Number(e.to_pct) > Number(e.from_pct) ? "rose" : "fell"} {Math.round(e.from_pct)} → <b>{Math.round(e.to_pct)}</b></>;
    case "milestone": return <>portfolio reached <b>+{Math.round(e.to_pct)}% YTD</b> 🎉</>;
    default: return e.kind;
  }
}
/* Initials avatar with a stable colour per name — friends become faces, not rows. */
const AVATAR_BG = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-teal-500", "bg-indigo-500", "bg-orange-500"];
function Avatar({ name, mascot, size = 36, className = "" }) {
  const n = String(name || "?");
  let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  const bg = AVATAR_BG[h % AVATAR_BG.length];
  const initials = n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <div className={`relative shrink-0 rounded-full ${bg} text-white font-bold flex items-center justify-center ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {initials}
      {mascot && <span className="absolute -bottom-1 -right-1 text-[13px] leading-none">{mascot}</span>}
    </div>
  );
}
const timeAgo = (t) => {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return fmtDate(t);
};

/* Mutual friends = people in my list who also have me in theirs. */
async function loadMutualFriends(userId) {
  const [{ data: out }, { data: inc }] = await Promise.all([
    supabase.from("friends").select("friend_id").eq("user_id", userId),
    supabase.from("friends").select("user_id").eq("friend_id", userId),
  ]);
  const incSet = new Set((inc || []).map((r) => r.user_id));
  const ids = (out || []).map((r) => r.friend_id).filter((id) => incSet.has(id));
  if (!ids.length) return [];
  const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", ids);
  return ids.map((id) => ({ id, username: ((profs || []).find((p) => p.user_id === id) || {}).username || "unknown" }));
}

/* Body text with $TICKER turned into tappable chips. */
function PostBody({ text, onTicker }) {
  const parts = [];
  let last = 0, m;
  const re = new RegExp(TICKER_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[1].toUpperCase();
    parts.push(
      <button key={m.index} onClick={(e) => { e.stopPropagation(); onTicker(t); }}
        className="inline-block align-baseline text-[12px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md mx-0.5">
        ${t}
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}

function GroupsTab({ user, active, cur, fx, say, onOpenTicker, username, richrData = null, goFriends = null }) {
  const [groups, setGroups] = useState(null);   // [{id,name,created_by,members,lastPost}]
  const [open, setOpen] = useState(null);       // group object being viewed
  const [creating, setCreating] = useState(false);
  const [mutuals, setMutuals] = useState(null);
  const [menuFor, setMenuFor] = useState(null);     // group id with the ⋯ menu open
  const [confirmFor, setConfirmFor] = useState(null);

  /* Leave (member) or delete (creator) straight from the list. */
  const quickAction = async (g) => {
    const owner = g.created_by === user.id;
    const { error } = owner
      ? await supabase.from("groups").delete().eq("id", g.id)
      : await supabase.from("group_members").delete().match({ group_id: g.id, user_id: user.id });
    setMenuFor(null); setConfirmFor(null);
    if (error) { say(owner ? "Couldn't delete the community." : "Couldn't leave — try again."); return; }
    say(owner ? `Deleted “${g.name}”.` : `You left “${g.name}”.`);
    await loadGroups();
  };

  const loadGroups = async () => {
    try {
      const { data: gs, error } = await supabase.from("groups").select("id, name, created_by, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (gs || []).map((g) => g.id);
      let members = [], last = [];
      if (ids.length) {
        const [{ data: m }, { data: l }] = await Promise.all([
          supabase.from("group_members").select("group_id, user_id").in("group_id", ids),
          supabase.from("group_posts").select("group_id, body, position, card, created_at, user_id").in("group_id", ids).is("parent_id", null).order("created_at", { ascending: false }).limit(200),
        ]);
        members = m || []; last = l || [];
      }
      setGroups((gs || []).map((g) => ({
        ...g,
        members: members.filter((m) => m.group_id === g.id).map((m) => m.user_id),
        lastPost: last.find((p) => p.group_id === g.id) || null,
      })).sort((a, b) => {
        const ta = a.lastPost ? new Date(a.lastPost.created_at).getTime() : new Date(a.created_at).getTime();
        const tb = b.lastPost ? new Date(b.lastPost.created_at).getTime() : new Date(b.created_at).getTime();
        return tb - ta;
      }));
    } catch (e) {
      console.error("RichR groups load failed:", e);
      setGroups([]);
    }
  };
  useEffect(() => { loadGroups(); loadMutualFriends(user.id).then(setMutuals); }, []);

  const createGroup = async (name, memberIds) => {
    const { data: g, error } = await supabase.from("groups").insert({ name, created_by: user.id }).select("id, name, created_by, created_at").single();
    if (error || !g) { say("Couldn't create the community — try again."); return; }
    const { error: e1 } = await supabase.from("group_members").insert({ group_id: g.id, user_id: user.id, added_by: user.id });
    if (e1) { say("Couldn't join your own community — try again."); return; }
    if (memberIds.length) {
      const { error: e2 } = await supabase.from("group_members").insert(memberIds.map((id) => ({ group_id: g.id, user_id: id, added_by: user.id })));
      if (e2) say("Community created, but some friends couldn't be added (only mutual friends can join).");
    }
    setCreating(false);
    await loadGroups();
    setOpen({ ...g, members: [user.id, ...memberIds], lastPost: null });
    say(`“${name}” is ready — say hi!`);
  };

  if (open) {
    return (
      <GroupChat group={open} user={user} active={active} cur={cur} fx={fx} say={say} username={username} richrData={richrData}
        mutuals={mutuals || []} onOpenTicker={onOpenTicker}
        onBack={() => { setOpen(null); loadGroups(); }}
        onGroupChanged={(g) => { if (g) setOpen(g); else { setOpen(null); loadGroups(); } }} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Communities</h2>
          <p className="text-sm text-slate-500 mt-0.5">Where you and your friends talk stocks.</p>
        </div>
        <button onClick={() => setCreating(true)} disabled={!mutuals} className="btn-primary shrink-0 disabled:opacity-60">
          <Plus size={15} /> New
        </button>
      </div>
      {groups && groups.length === 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5">
          <div className="flex items-center gap-2 font-bold"><UsersRound size={17} /> Your own investing circle</div>
          <p className="text-sm text-slate-200 mt-1.5 leading-relaxed">
            A community is a private space for you and your friends: chat, share positions and Buy/Hold/Sell calls, see what everyone holds and what the group thinks of each stock.
            Only people you've both added can join, and only members can read it.
          </p>
        </div>
      )}

      {groups === null ? (
        <Skeleton lines={3} />
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
          <MessageCircle size={24} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-600 mb-1">No communities yet</p>
          <p className="text-sm text-slate-400">
            {mutuals && mutuals.length === 0
              ? "Add friends (and get added back) first — communities are for mutual friends."
              : "Start one with a few friends, or wait to be added to theirs."}
          </p>
          {mutuals && mutuals.length === 0 && goFriends && <button onClick={goFriends} className="btn-secondary mt-4 text-xs">Go to Friends →</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center">
            <button onClick={() => setOpen(g)}
              className="flex-1 min-w-0 text-left p-4 flex items-center gap-3 active:bg-slate-50 rounded-l-2xl">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg shrink-0">
                {g.name.trim().slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold text-slate-700 text-sm truncate">{g.name}</div>
                  <div className="text-[11px] text-slate-400 shrink-0">{timeAgo(g.lastPost ? g.lastPost.created_at : g.created_at)}</div>
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {g.lastPost
                    ? (g.lastPost.card ? `${g.lastPost.card.kind === "performance" ? "📊 shared their performance" : g.lastPost.card.kind === "vote" ? `${VOTE_META[g.lastPost.card.vote]?.dot || ""} ${VOTE_META[g.lastPost.card.vote]?.label || ""} on ${g.lastPost.card.ticker}` : `📈 shared ${g.lastPost.card.ticker}`}` : g.lastPost.position ? `📈 shared ${g.lastPost.position.ticker}` : g.lastPost.body)
                    : `${g.members.length} member${g.members.length === 1 ? "" : "s"} · no messages yet`}
                </div>
              </div>
            </button>
            <button onClick={() => setMenuFor(menuFor === g.id ? null : g.id)} aria-label="Community options"
              className="shrink-0 w-10 h-10 mr-2 rounded-full text-slate-400 flex items-center justify-center text-lg font-bold active:bg-slate-100">⋯</button>
            </div>
            {menuFor === g.id && (
              <div className="border-t border-slate-100 px-4 py-3 flex items-center gap-2 flex-wrap">
                {confirmFor === g.id ? (
                  <>
                    <span className="text-sm text-rose-600 font-semibold flex-1 min-w-0">
                      {g.created_by === user.id ? "Delete for everyone? Messages are gone for good." : "Leave this community?"}
                    </span>
                    <button onClick={() => quickAction(g)} className="bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                      Yes, {g.created_by === user.id ? "delete" : "leave"}
                    </button>
                    <button onClick={() => setConfirmFor(null)} className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setOpen(g)} className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">Open</button>
                    {g.created_by === user.id ? (
                      <button onClick={() => setConfirmFor(g.id)} className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full flex items-center gap-1"><Trash2 size={12} /> Delete community</button>
                    ) : (
                      <button onClick={() => setConfirmFor(g.id)} className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full flex items-center gap-1"><LogOut size={12} /> Leave community</button>
                    )}
                    <span className="text-[11px] text-slate-400 ml-auto">{g.created_by === user.id ? "You created this community" : `${g.members.length} members`}</span>
                  </>
                )}
              </div>
            )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Everything in a community is visible to its members only. Tap ⋯ to leave one (or delete it, if you created it). Sharing a position posts the ticker, your buy date, return % and thesis — never amounts.
        Nothing here is investment advice; it's friends talking.
      </p>

      {creating && (
        <NewGroupModal mutuals={mutuals || []} onClose={() => setCreating(false)} onCreate={createGroup} />
      )}
    </div>
  );
}

/* ================= ACTIVITY FEED ================= */
function ActivityFeed({ user, friends, names, myName, onOpenProfile, board, onOpenTicker }) {
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

function NewGroupModal({ mutuals, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const valid = name.trim().length > 0;
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-700">New community</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center"><X size={14} /></button>
        </div>
        <label className="block text-xs font-semibold text-slate-400 mb-1.5">COMMUNITY NAME</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="e.g. Nordic banks club"
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-4" />
        <label className="block text-xs font-semibold text-slate-400 mb-1.5">ADD FRIENDS · {picked.size} picked</label>
        {mutuals.length === 0 ? (
          <p className="text-sm text-slate-400 mb-4">You have no mutual friends yet. You can still create the community and add people later.</p>
        ) : (
          <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden mb-4">
            {mutuals.map((f) => {
              const on = picked.has(f.id);
              return (
                <button key={f.id} onClick={() => toggle(f.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm bg-white active:bg-slate-50">
                  <span className="font-semibold text-slate-600">@{f.username}</span>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${on ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}>
                    {on && <Check size={12} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <button onClick={async () => { setBusy(true); await onCreate(name.trim(), [...picked]); setBusy(false); }} disabled={!valid || busy}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm py-3 rounded-full shadow disabled:opacity-50">
          {busy ? "Creating…" : "Create community"}
        </button>
      </div>
    </div>
  );
}

function GroupChat({ group, user, active, cur, fx, say, username, mutuals, onOpenTicker, onBack, onGroupChanged, richrData = null }) {
  const [posts, setPosts] = useState(null);
  const [reactions, setReactions] = useState([]);   // [{post_id,user_id,emoji}]
  const [names, setNames] = useState({});          // user_id -> username
  const [members, setMembers] = useState(group.members || []);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);    // post being replied to
  const [sharing, setSharing] = useState(false);   // position picker open
  const [showMembers, setShowMembers] = useState(false);
  const [section, setSection] = useState("chat"); // chat | holdings | sentiment
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const isOwner = group.created_by === user.id;

  const load = async (silent) => {
    try {
      const [{ data: ps, error }, { data: ms }] = await Promise.all([
        supabase.from("group_posts").select("id, user_id, parent_id, body, tickers, position, card, created_at").eq("group_id", group.id).order("created_at", { ascending: true }).limit(500),
        supabase.from("group_members").select("user_id").eq("group_id", group.id),
      ]);
      if (error) throw error;
      const memberIds = (ms || []).map((m) => m.user_id);
      setMembers(memberIds);
      const ids = [...new Set([...memberIds, ...(ps || []).map((p) => p.user_id)])];
      const missing = ids.filter((id) => !names[id]);
      if (missing.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", missing);
        setNames((n) => { const c = { ...n }; (profs || []).forEach((p) => { c[p.user_id] = p.username; }); missing.forEach((id) => { if (!c[id]) c[id] = "unknown"; }); return c; });
      }
      const postIds = (ps || []).map((p) => p.id);
      if (postIds.length) {
        const { data: rs } = await supabase.from("post_reactions").select("post_id, user_id, emoji").in("post_id", postIds);
        setReactions(rs || []);
      } else setReactions([]);
      setPosts(ps || []);
    } catch (e) {
      console.error("RichR chat load failed:", e);
      if (!silent) say("Couldn't load this community.");
      setPosts((p) => p || []);
    }
  };
  useEffect(() => { load(); }, [group.id]);
  // Poll while the chat is open and the app is visible — simple, no realtime setup needed.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      load(true);
    }, 8000);
    return () => clearInterval(id);
  }, [group.id]);
  const firstScroll = useRef(true);
  useEffect(() => {
    if (posts && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: firstScroll.current ? "auto" : "smooth", block: "end" });
      firstScroll.current = false;
    }
  }, [posts && posts.length]);

  const send = async (extra) => {
    const body = text.trim();
    if (!body && !extra) return;
    setSending(true);
    const card = extra && extra.card ? extra.card : null;
    const row = {
      group_id: group.id, user_id: user.id, body,
      tickers: [...new Set([...extractTickers(body), ...(card && card.ticker ? [card.ticker] : [])])],
      parent_id: replyTo ? replyTo.id : null,
      ...(card && card.kind === "position" ? { position: card } : {}),
      ...(card ? { card } : {}),
    };
    // A shared call is also a real vote on the stock page.
    if (card && card.kind === "vote" && card.ticker) {
      await supabase.from("stock_calls").insert({ user_id: user.id, ticker: card.ticker, vote: card.vote, reason: card.reason || null });
    }
    const { error } = await supabase.from("group_posts").insert(row);
    setSending(false);
    if (error) { say("Couldn't send — try again."); return; }
    setText(""); setReplyTo(null); setSharing(false);
    await load(true);
  };

  const react = async (post, emoji) => {
    const mine = reactions.find((r) => r.post_id === post.id && r.user_id === user.id && r.emoji === emoji);
    // optimistic
    setReactions((rs) => mine ? rs.filter((r) => r !== mine) : [...rs, { post_id: post.id, user_id: user.id, emoji }]);
    if (mine) await supabase.from("post_reactions").delete().match({ post_id: post.id, user_id: user.id, emoji });
    else await supabase.from("post_reactions").insert({ post_id: post.id, user_id: user.id, emoji });
  };

  const removePost = async (post) => {
    const { error } = await supabase.from("group_posts").delete().eq("id", post.id);
    if (error) { say("Couldn't delete."); return; }
    await load(true);
  };

  const addMember = async (id, uname) => {
    const { error } = await supabase.from("group_members").insert({ group_id: group.id, user_id: id, added_by: user.id });
    if (error) { say(error.code === "23505" ? `@${uname} is already in the community.` : "Couldn't add — only mutual friends can join."); return; }
    say(`Added @${uname}.`);
    await load(true);
  };
  const removeMember = async (id, uname) => {
    const { error } = await supabase.from("group_members").delete().match({ group_id: group.id, user_id: id });
    if (error) { say("Couldn't remove."); return; }
    say(`Removed @${uname}.`);
    await load(true);
  };
  const leave = async () => {
    const { error } = await supabase.from("group_members").delete().match({ group_id: group.id, user_id: user.id });
    if (error) { say("Couldn't leave — try again."); return; }
    say(`You left “${group.name}”.`);
    onGroupChanged(null);
  };
  const deleteGroup = async () => {
    const { error } = await supabase.from("groups").delete().eq("id", group.id);
    if (error) { say("Couldn't delete the community."); return; }
    say(`Deleted “${group.name}”.`);
    onGroupChanged(null);
  };
  const rename = async (name) => {
    const n = (name || "").trim().slice(0, 60);
    if (!n || n === group.name) return;
    const { error } = await supabase.from("groups").update({ name: n }).eq("id", group.id);
    if (error) { say("Couldn't rename."); return; }
    onGroupChanged({ ...group, name: n });
  };

  // thread structure: top-level posts in order, replies grouped under their parent
  const tops = (posts || []).filter((p) => !p.parent_id);
  const repliesOf = (id) => (posts || []).filter((p) => p.parent_id === id);
  const uname = (id) => (id === user.id ? (username || names[id] || "you") : (names[id] || "…"));

  const renderPost = (p, isReply) => {
    const mine = p.user_id === user.id;
    const rs = reactions.filter((r) => r.post_id === p.id);
    const counts = REACTIONS.map((e) => ({ e, n: rs.filter((r) => r.emoji === e).length, me: rs.some((r) => r.emoji === e && r.user_id === user.id) })).filter((c) => c.n > 0 || !isReply);
    return (
      <div key={p.id} className={`${isReply ? "ml-6 mt-1.5" : "mt-3"} group`}>
        <div className="flex items-baseline gap-2 mb-0.5">
          {isReply && <CornerDownRight size={11} className="text-slate-300 self-center" />}
          <span className={`text-xs font-bold ${mine ? "text-emerald-700" : "text-slate-600"}`}>@{uname(p.user_id)}</span>
          <span className="text-[10px] text-slate-400">{timeAgo(p.created_at)}</span>
          {(mine || isOwner) && (
            <button onClick={() => removePost(p)} className="text-[10px] text-slate-300 hover:text-rose-400 ml-auto">delete</button>
          )}
        </div>
        <div className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${mine ? "bg-emerald-50 text-slate-700" : "bg-white border border-slate-100 text-slate-700"}`}>
          {p.card ? <ChatCard card={p.card} onTicker={onOpenTicker} /> : p.position && <PositionShareCard pos={p.position} onTicker={onOpenTicker} />}
          {p.body && <PostBody text={p.body} onTicker={onOpenTicker} />}
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {REACTIONS.map((e) => {
            const c = counts.find((x) => x.e === e) || { n: 0, me: false };
            if (isReply && c.n === 0) return null;
            return (
              <button key={e} onClick={() => react(p, e)}
                className={`text-[11px] px-1.5 py-0.5 rounded-full border ${c.me ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-white border-slate-100 text-slate-500"} ${c.n === 0 ? "opacity-50" : ""}`}>
                {e}{c.n > 0 ? ` ${c.n}` : ""}
              </button>
            );
          })}
          {!isReply && (
            <button onClick={() => { setReplyTo(p); setSharing(false); }}
              className="text-[11px] font-semibold text-slate-400 px-1.5 py-0.5 ml-1">Reply</button>
          )}
        </div>
        {!isReply && repliesOf(p.id).map((r) => renderPost(r, true))}
      </div>
    );
  };

  return (
    <div className="-mx-4 -mt-6 min-h-[calc(100vh-5rem)] flex flex-col">
      {/* sticky header */}
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200 px-4 py-2.5 flex items-center gap-2"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <button onClick={onBack} className="flex items-center gap-0.5 text-sm font-semibold text-emerald-700 -ml-1 shrink-0"><ChevronLeft size={20} /> Communities</button>
        <button onClick={() => setShowMembers(true)} className="flex-1 min-w-0 text-center">
          <div className="font-bold text-slate-700 text-sm truncate">{group.name}</div>
          <div className="text-[11px] text-slate-400">{members.length} member{members.length === 1 ? "" : "s"}</div>
        </button>
        <button onClick={() => setShowMembers(true)} title={isOwner ? "Members, leave or delete" : "Members or leave"}
          className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-2.5 py-1.5">
          <Users size={13} /> {isOwner ? "Manage" : "Leave…"}
        </button>
      </div>
      {/* sections */}
      <div className="sticky top-[3.1rem] z-20 bg-slate-50/95 backdrop-blur px-4 pt-2 pb-2">
        <div className="bg-slate-100 rounded-xl p-1 flex">
          {[["chat", "Chat"], ["holdings", "Holdings"], ["sentiment", "Sentiment"], ["members", "Members"]].map(([id, l]) => (
            <button key={id} onClick={() => (id === "members" ? setShowMembers(true) : setSection(id))}
              className={`flex-1 text-[12px] font-semibold h-8 rounded-lg transition ${section === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
      </div>

      {section === "holdings" && <CommunityHoldings members={members} names={names} user={user} onOpenTicker={onOpenTicker} />}
      {section === "sentiment" && <CommunitySentiment members={members} names={names} user={user} onOpenTicker={onOpenTicker} />}

      {/* messages */}
      {section === "chat" && <div className="flex-1 px-4 pb-3">
        {posts === null ? (
          <div className="mt-8 space-y-3" aria-busy="true"><div className="skel h-10 w-3/4" /><div className="skel h-10 w-2/3 ml-auto" /><div className="skel h-10 w-1/2" /></div>
        ) : tops.length === 0 ? (
          <div className="text-center mt-10">
            <MessageCircle size={24} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">Nothing yet</p>
            <p className="text-xs text-slate-400 mt-1">Say hi, or tap + to drop in a stock, a position, your Buy/Hold/Sell call or a performance card. Tag tickers with $ — “what do you think of $ASML?”</p>
          </div>
        ) : tops.map((p) => renderPost(p, false))}
        <div ref={bottomRef} />
      </div>}

      {/* composer */}
      {section === "chat" && <div className="sticky bottom-[4.5rem] z-30 bg-white border-t border-slate-200 px-3 pt-2 pb-2">
        {replyTo && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 rounded-xl px-2.5 py-1.5 mb-2">
            <span className="truncate">Replying to <b>@{uname(replyTo.user_id)}</b>: {replyTo.card ? `shared ${replyTo.card.kind === "performance" ? "their performance" : replyTo.card.ticker}` : replyTo.position ? `shared ${replyTo.position.ticker}` : replyTo.body}</span>
            <button onClick={() => setReplyTo(null)} className="ml-2 text-slate-400"><X size={12} /></button>
          </div>
        )}
        {sharing && (
          <CardPicker holdings={active.holdings} cur={cur} fx={fx} data={richrData} active={active}
            onPick={(card) => send({ card })} onClose={() => setSharing(false)} />
        )}
        <div className="flex items-end gap-2">
          <button onClick={() => { setSharing((v) => !v); }} title="Share a stock, position, call or performance card"
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${sharing ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            <Plus size={18} />
          </button>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={replyTo ? "Write a reply…" : "Message… use $TICKER to tag"}
            className="flex-1 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-[15px] resize-none max-h-32" />
          <button onClick={() => send()} disabled={sending || !text.trim()}
            className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 disabled:opacity-40">
            <Send size={16} />
          </button>
        </div>
      </div>}

      {showMembers && (
        <MembersSheet group={group} members={members} names={names} user={user} isOwner={isOwner} mutuals={mutuals}
          onAdd={addMember} onRemove={removeMember} onLeave={leave} onDelete={deleteGroup} onRename={rename}
          onClose={() => setShowMembers(false)} />
      )}
    </div>
  );
}

/* Community › Holdings: what the members hold, from their shared leaderboard
   rows (each member controls what they share; RLS only returns rows you may see). */
function CommunityHoldings({ members, names, user, onOpenTicker }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let dead = false;
    if (!members.length) { setRows([]); return; }
    supabase.from("leaderboard").select("user_id, name, return_pct, top_holdings, holdings, score").in("user_id", members)
      .then(({ data }) => { if (!dead) setRows(data || []); });
    return () => { dead = true; };
  }, [members.join(",")]);
  if (rows === null) return <div className="px-4 py-6"><Skeleton lines={4} /></div>;
  const count = {};
  rows.forEach((r) => (Array.isArray(r.top_holdings) ? r.top_holdings : []).forEach((h) => {
    const c = count[h.ticker] || (count[h.ticker] = { n: 0, w: 0, who: [] });
    c.n += 1; c.w += Number(h.pct) || 0; c.who.push(r.user_id);
  }));
  const popular = Object.entries(count).sort((a, b) => b[1].n - a[1].n || b[1].w - a[1].w).slice(0, 12);
  const sharing = rows.filter((r) => Array.isArray(r.top_holdings) && r.top_holdings.length);
  return (
    <div className="px-4 py-4 space-y-5">
      {popular.length === 0 ? (
        <div className="text-center py-8">
          <Briefcase size={22} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-600">No shared holdings yet</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">Members who publish their portfolio (Friends › Share, with top holdings on) show up here — percentages only, never amounts.</p>
        </div>
      ) : (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 mb-2">HELD IN THIS COMMUNITY · {sharing.length} of {members.length} sharing</h4>
          <div className="card divide-y divide-slate-100 py-1">
            {popular.map(([t, c]) => (
              <button key={t} onClick={() => onOpenTicker(t)} className="w-full flex items-center gap-3 py-2.5 text-left">
                <Logo h={{ ticker: t }} size={34} rounded="rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm">{t}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.who.map((id) => "@" + (id === user.id ? "you" : (names[id] || "…"))).join(", ")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-800 tabular-nums">{c.n} of {members.length}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">avg {Math.round(c.w / c.n)}% weight</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 mb-2">MEMBERS' PORTFOLIOS</h4>
          <div className="card divide-y divide-slate-100 py-1">
            {[...rows].sort((a, b) => (b.return_pct ?? -1e9) - (a.return_pct ?? -1e9)).map((r) => (
              <div key={r.user_id} className="flex items-center gap-3 py-2.5">
                <Avatar name={names[r.user_id] || r.name} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm truncate">@{r.user_id === user.id ? "you" : (names[r.user_id] || r.name)}</div>
                  <div className="text-[11px] text-slate-400 truncate">{Array.isArray(r.top_holdings) && r.top_holdings.length ? r.top_holdings.slice(0, 4).map((h) => `${h.ticker} ${h.pct}%`).join(" · ") : "holdings private"}{r.score != null ? ` · Score ${r.score}` : ""}</div>
                </div>
                {r.return_pct != null ? <Ret v={Number(r.return_pct)} className="text-sm font-bold" /> : <Lock size={14} className="text-slate-300" />}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400">Tap a stock to open it. Members choose what they share in Profile › What friends can see.</p>
    </div>
  );
}

/* Community › Sentiment: the members' Buy/Hold/Sell calls, per stock. */
function CommunitySentiment({ members, names, user, onOpenTicker }) {
  const [calls, setCalls] = useState(null);
  useEffect(() => {
    let dead = false;
    if (!members.length) { setCalls([]); return; }
    supabase.from("stock_calls").select("id, user_id, ticker, vote, reason, created_at").in("user_id", members)
      .order("created_at", { ascending: false }).limit(600)
      .then(({ data }) => { if (!dead) setCalls(latestCalls(data || [])); });
    return () => { dead = true; };
  }, [members.join(",")]);
  if (calls === null) return <div className="px-4 py-6"><Skeleton lines={4} /></div>;
  const by = {};
  calls.forEach((c) => { const t = by[c.ticker] || (by[c.ticker] = { buy: 0, hold: 0, sell: 0, list: [] }); t[c.vote] += 1; t.list.push(c); });
  const tickers = Object.entries(by).sort((a, b) => b[1].list.length - a[1].list.length || new Date(b[1].list[0].created_at) - new Date(a[1].list[0].created_at));
  return (
    <div className="px-4 py-4 space-y-4">
      {tickers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm font-semibold text-slate-600">No calls yet</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">When members vote 🟢 Buy, 🟡 Hold or 🔴 Sell on a stock (Discover › any stock, or the + in chat), the community's view of each stock shows up here.</p>
        </div>
      ) : tickers.map(([t, v]) => {
        const total = v.list.length;
        const lead = ["buy", "hold", "sell"].sort((a, b) => v[b] - v[a])[0];
        return (
          <div key={t} className="card">
            <div className="flex items-center gap-3">
              <Logo h={{ ticker: t }} size={34} rounded="rounded-lg" />
              <button onClick={() => onOpenTicker(t)} className="flex-1 min-w-0 text-left">
                <div className="font-bold text-slate-900 text-sm">{t}</div>
                <div className="text-[11px] text-slate-500">{total} member{total === 1 ? "" : "s"} · leaning <span className={VOTE_META[lead].text + " font-semibold"}>{VOTE_META[lead].dot} {VOTE_META[lead].label}</span></div>
              </button>
              <ChevronRight size={16} className="text-slate-300" />
            </div>
            <div className="mt-3"><SentimentBar counts={{ buy: v.buy, hold: v.hold, sell: v.sell }} total={total} compact /></div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {v.list.slice(0, 8).map((c) => (
                <span key={c.id} title={c.reason || ""} className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full pl-0.5 pr-2 py-0.5 ${VOTE_META[c.vote].chip}`}>
                  <Avatar name={names[c.user_id] || "?"} size={16} /> @{c.user_id === user.id ? "you" : (names[c.user_id] || "…")} {VOTE_META[c.vote].dot}
                </span>
              ))}
            </div>
            {v.list.find((c) => c.reason) && <p className="text-[12px] text-slate-500 italic mt-2 leading-snug">“{v.list.find((c) => c.reason).reason}” — @{names[v.list.find((c) => c.reason).user_id] || "…"}</p>}
          </div>
        );
      })}
      <p className="text-[11px] text-slate-400">Community opinion, not advice. Vote on any stock from Discover or share a call from the chat's + menu.</p>
    </div>
  );
}

/* A shared position inside a message: ticker, buy date, return %, thesis. No amounts. */
function PositionShareCard({ pos, onTicker }) {
  const up = (pos.plPct || 0) >= 0;
  return (
    <button onClick={() => onTicker(pos.ticker)} className="w-full text-left bg-white border border-emerald-100 rounded-xl p-3 mb-2 active:bg-emerald-50">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-emerald-600 tracking-wide">SHARED POSITION</div>
          <div className="font-bold text-slate-700 truncate">{pos.ticker} <span className="font-medium text-slate-400 text-sm">{pos.name}</span></div>
          <div className="text-[11px] text-slate-400">{pos.buyDate ? `Bought ${fmtDate(pos.buyDate, { day: "numeric", month: "short", year: "numeric" })}` : "Open position"}{pos.type ? ` · ${pos.type}` : ""}</div>
        </div>
        {pos.plPct != null && (
          <div className={`font-bold text-sm shrink-0 ${up ? "text-emerald-600" : "text-rose-500"}`}>{pct(pos.plPct)}</div>
        )}
      </div>
      {pos.thesis && <p className="text-[13px] text-slate-600 italic mt-1.5 leading-snug">“{pos.thesis}”</p>}
    </button>
  );
}

function SharePositionPicker({ holdings, cur, fx, onPick, onClose }) {
  if (!holdings.length) {
    return <p className="text-[11px] text-slate-400 bg-slate-50 rounded-xl px-2.5 py-2 mb-2">You have no positions to share yet.</p>;
  }
  return (
    <div className="bg-slate-50 rounded-2xl p-2 mb-2 max-h-48 overflow-y-auto">
      <div className="text-[10px] font-bold text-slate-400 px-1.5 pb-1">SHARE A POSITION — ticker, buy date, return % and your thesis (no amounts)</div>
      {byValueDesc(holdings.filter((h) => !h.sample), cur, fx).map((h) => {
        const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
        const plPct = h.buyPrice > 0 ? ((cp - h.buyPrice) / h.buyPrice) * 100 : null;
        return (
          <button key={h.id}
            onClick={() => onPick({ ticker: h.ticker, name: h.name || h.ticker, type: h.type || "Stock", buyDate: h.buyDate || null, thesis: (h.thesis || "").slice(0, 280), plPct: plPct != null ? Number(plPct.toFixed(2)) : null, currency: h.currency || cur })}
            className="w-full flex items-center justify-between px-2 py-2 rounded-xl text-sm bg-white mb-1 border border-slate-100 active:bg-emerald-50">
            <span className="font-semibold text-slate-700 truncate">{h.ticker} <span className="font-normal text-slate-400">{h.name}</span></span>
            {plPct != null && <span className={`text-xs font-bold shrink-0 ml-2 ${plPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{pct(plPct)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MembersSheet({ group, members, names, user, isOwner, mutuals, onAdd, onRemove, onLeave, onDelete, onRename, onClose }) {
  const [confirm, setConfirm] = useState(null); // "leave" | "delete"
  const addable = (mutuals || []).filter((f) => !members.includes(f.id));
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          {isOwner ? (
            <input defaultValue={group.name} onBlur={(e) => onRename(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
              className="font-bold text-lg text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-400 outline-none min-w-0 flex-1 mr-2" />
          ) : (
            <h3 className="font-bold text-lg text-slate-700 truncate">{group.name}</h3>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0"><X size={14} /></button>
        </div>
        {isOwner && <p className="text-[11px] text-slate-400 mb-3">You created this community — tap the name to rename it.</p>}

        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Members · {members.length}</div>
        <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden mb-4">
          {members.map((id) => (
            <div key={id} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="font-semibold text-slate-600">@{names[id] || "…"}{id === user.id ? " (you)" : ""}{id === group.created_by ? " · creator" : ""}</span>
              {isOwner && id !== user.id && (
                <button onClick={() => onRemove(id, names[id])} className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">Remove</button>
              )}
            </div>
          ))}
        </div>

        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1"><UserPlus size={12} /> Add friends</div>
        {addable.length === 0 ? (
          <p className="text-sm text-slate-400 mb-4">All your mutual friends are already here. Only people who've added you back can be added.</p>
        ) : (
          <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden mb-4">
            {addable.map((f) => (
              <button key={f.id} onClick={() => onAdd(f.id, f.username)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm bg-white active:bg-slate-50">
                <span className="font-semibold text-slate-600">@{f.username}</span>
                <span className="text-xs font-semibold text-emerald-700">Add</span>
              </button>
            ))}
          </div>
        )}

        {confirm ? (
          <div className="bg-rose-50 rounded-2xl p-3 text-sm">
            <p className="text-rose-700 font-semibold mb-2">{confirm === "delete" ? "Delete this community for everyone? Messages are gone for good." : "Leave this community?"}</p>
            <div className="flex gap-2">
              <button onClick={confirm === "delete" ? onDelete : onLeave} className="flex-1 bg-rose-500 text-white rounded-xl py-2 text-sm font-semibold">Yes, {confirm}</button>
              <button onClick={() => setConfirm(null)} className="flex-1 bg-white text-slate-600 rounded-xl py-2 text-sm font-semibold border border-slate-200">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setConfirm("leave")} className="flex-1 bg-slate-100 text-slate-600 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"><LogOut size={14} /> Leave community</button>
            {isOwner && (
              <button onClick={() => setConfirm("delete")} className="flex-1 bg-rose-50 text-rose-500 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"><Trash2 size={14} /> Delete community</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


/* ================= SHARE CARD (PNG) ================= */
/* Draws an "investing card" on a canvas — percentages only — and hands it
   to the phone's share sheet (WhatsApp, Instagram, Discord…) or downloads
   it. Everything is computed on-device from what the user already shares. */
async function buildShareCardBlob({ username, name, mascot, ytd, rank, n, holdings, top, score, isPublic, style, spark }) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  // background
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0f172a"); g.addColorStop(1, "#134e4a");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // soft glow
  const rg = x.createRadialGradient(W * 0.8, H * 0.15, 20, W * 0.8, H * 0.15, 520); rg.addColorStop(0, "rgba(16,185,129,0.35)"); rg.addColorStop(1, "rgba(16,185,129,0)");
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  const font = (w, size) => `${w} ${size}px Inter, system-ui, -apple-system, sans-serif`;
  x.textBaseline = "alphabetic";
  // brand
  x.fillStyle = "#ffffff"; x.font = font(800, 56); x.fillText("Rich", 80, 130);
  const rw = x.measureText("Rich").width; x.fillStyle = "#34d399"; x.fillText("R", 80 + rw, 130);
  x.fillStyle = "rgba(255,255,255,0.6)"; x.font = font(500, 26); x.fillText("Grow your wealth with friends", 80, 172);
  // identity
  x.font = font(400, 88); x.fillText(mascot || "👤", 80, 320);
  x.fillStyle = "#ffffff"; x.font = font(800, 54); x.fillText(name || `@${username}`, 200, 285);
  x.fillStyle = "rgba(255,255,255,0.7)"; x.font = font(500, 30); x.fillText(`@${username}`, 200, 330);
  // big YTD
  const up = (ytd || 0) >= 0;
  x.fillStyle = up ? "#34d399" : "#fb7185"; x.font = font(800, 150);
  x.fillText(ytd != null ? pct(ytd, 1) : "—", 80, 520);
  x.fillStyle = "rgba(255,255,255,0.7)"; x.font = font(600, 30); x.fillText("YTD · time-weighted return", 84, 570);
  // sparkline (last weeks, % change) top-right
  const sp = (spark || []).filter((v) => typeof v === "number");
  if (sp.length >= 2) {
    const L = 640, T = 400, Wd = 360, Hd = 150;
    const mn = Math.min(...sp), mx = Math.max(...sp), span = mx - mn || 1;
    x.beginPath();
    sp.forEach((v, i) => { const px = L + (i / (sp.length - 1)) * Wd, py = T + Hd - ((v - mn) / span) * Hd; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = up ? "#34d399" : "#fb7185"; x.lineWidth = 6; x.lineJoin = "round"; x.lineCap = "round"; x.stroke();
    x.fillStyle = "rgba(255,255,255,0.45)"; x.font = font(600, 22); x.textAlign = "right"; x.fillText("last 6 weeks", 1000, T + Hd + 34); x.textAlign = "left";
  }
  // rank line
  x.fillStyle = "#ffffff"; x.font = font(700, 40);
  x.fillText(rank != null ? `#${rank} among ${n} friends` : "Comparing with friends", 80, 650);
  // tiles
  const tiles = [["RichR Score", score != null ? String(score) : "—"], ["Holdings", holdings != null ? String(holdings) : "—"], ["Style", style || "Investor"]];
  tiles.forEach(([l, v], i) => {
    const tx = 80 + i * 310, ty = 700;
    x.fillStyle = "rgba(255,255,255,0.08)"; roundRect(x, tx, ty, 290, 130, 28); x.fill();
    x.fillStyle = "#ffffff"; x.font = font(800, v.length > 9 ? 34 : v.length > 6 ? 40 : 48); x.fillText(v, tx + 28, ty + 72);
    x.fillStyle = "rgba(255,255,255,0.6)"; x.font = font(600, 24); x.fillText(l, tx + 28, ty + 108);
  });
  // allocation
  x.fillStyle = "rgba(255,255,255,0.6)"; x.font = font(700, 24); x.fillText("TOP HOLDINGS · ALLOCATION", 80, 900);
  const rows = (top || []).slice(0, 5);
  rows.forEach((h, i) => {
    const y = 940 + i * 66;
    x.fillStyle = "#ffffff"; x.font = font(700, 30); x.fillText(h.ticker, 80, y + 30);
    x.fillStyle = "rgba(255,255,255,0.12)"; roundRect(x, 260, y + 6, 620, 26, 13); x.fill();
    x.fillStyle = "#34d399"; roundRect(x, 260, y + 6, Math.max(26, 620 * Math.min(1, (h.pct || 0) / 100)), 26, 13); x.fill();
    x.fillStyle = "rgba(255,255,255,0.8)"; x.font = font(600, 28); x.textAlign = "right"; x.fillText(`${h.pct}%`, 1000, y + 30); x.textAlign = "left";
  });
  if (!rows.length) { x.fillStyle = "rgba(255,255,255,0.5)"; x.font = font(500, 28); x.fillText("Holdings not shared", 80, 975); }
  // footer
  x.fillStyle = "rgba(255,255,255,0.5)"; x.font = font(500, 26);
  x.fillText(isPublic ? `rich-r.vercel.app/u/${username}` : "rich-r.vercel.app", 80, 1290);
  x.textAlign = "right"; x.fillText("Percentages only · no amounts", 1000, 1290); x.textAlign = "left";
  return new Promise((res) => c.toBlob(res, "image/png"));
}
function roundRect(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

/* Gather what the card needs (my published row + rank among mutual
   friends), draw it, and share/download. */
async function shareProfileCard({ user, data, active, cur, fx, say, setPreview }) {
  if (!data.username) { say("Claim a username first (Profile)."); return; }
  const share = shareOf(data);
  try {
    if (document.fonts && document.fonts.load) await document.fonts.load("800 50px Inter").catch(() => {});
    const [{ data: me }, { data: out }, { data: inc }, { data: board }, { data: prof }] = await Promise.all([
      supabase.from("leaderboard").select("return_pct, holdings, top_holdings, score, name, profile, spark").eq("user_id", user.id).maybeSingle(),
      supabase.from("friends").select("friend_id").eq("user_id", user.id),
      supabase.from("friends").select("user_id").eq("friend_id", user.id),
      supabase.from("leaderboard").select("user_id, return_pct"),
      supabase.from("profiles").select("is_public").eq("user_id", user.id).maybeSingle(),
    ]);
    const incSet = new Set((inc || []).map((r) => r.user_id));
    const mutual = new Set((out || []).map((r) => r.friend_id).filter((id) => incSet.has(id)));
    const friendRets = (board || []).filter((b) => mutual.has(b.user_id) && b.return_pct != null).map((b) => Number(b.return_pct));
    const ytd = me && me.return_pct != null ? Number(me.return_pct) : null;
    let rank = null;
    if (ytd != null && friendRets.length) rank = [...friendRets, ytd].sort((a, b) => b - a).indexOf(ytd) + 1;
    // local fallbacks when not published (what the user would share)
    const total = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
    const localTop = byValueDesc(active.holdings, cur, fx).slice(0, 5).map((h) => ({ ticker: h.ticker, pct: total > 0 ? Number(((holdingValue(h, cur, fx) / total) * 100).toFixed(1)) : 0 }));
    const p = profileOf(data.profile);
    const blob = await buildShareCardBlob({
      username: data.username, name: data.userName, mascot: p ? p.mascot : "👤",
      ytd, rank, n: friendRets.length + 1,
      holdings: share.positions ? active.holdings.length : null,
      top: share.topHoldings ? (me && Array.isArray(me.top_holdings) && me.top_holdings.length ? me.top_holdings : localTop) : [],
      score: share.score && me && me.score != null ? me.score : null,
      isPublic: !!(prof && prof.is_public),
      style: p ? p.label : "Investor",
      spark: me && Array.isArray(me.spark) ? me.spark : null,
    });
    const file = new File([blob], `richr-${data.username}.png`, { type: "image/png" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "My RichR profile", text: `@${data.username} on RichR` });
    } else {
      setPreview(URL.createObjectURL(blob));
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
    say("Couldn't build the card — try again.");
  }
}

/* Fallback when the share sheet isn't available (desktop): show + download. */
function ShareCardPreview({ url, username, onClose }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt="Your RichR card" className="rounded-2xl w-full" />
        <div className="flex gap-2 mt-3">
          <a href={url} download={`richr-${username}.png`} className="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-full shadow">Download PNG</a>
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 text-sm font-semibold py-2.5 rounded-full">Close</button>
        </div>
        <p className="text-[10px] text-slate-400 mt-2 text-center">On a phone this opens the share sheet directly.</p>
      </div>
    </div>
  );
}

/* ================= PUBLIC PROFILE (/u/<username>) ================= */
/* Served without sign-in. All data comes from get_public_profile(), which
   returns null unless the person switched their public link on. */
export function PublicProfile({ username }) {
  const [p, setP] = useState(undefined); // undefined loading, null private/missing
  useEffect(() => {
    let dead = false;
    supabase.rpc("get_public_profile", { uname: username }).then(({ data, error }) => {
      if (dead) return;
      setP(error ? null : (data || null));
    });
    return () => { dead = true; };
  }, [username]);

  const shell = (children) => (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <a href="/" className="text-2xl font-extrabold tracking-tight text-slate-800 flex items-baseline">
            Rich<img src="/logo.png" alt="R" className="h-[1.35rem] w-auto inline-block translate-y-[1px]" />
          </a>
          <a href="/" className="text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 rounded-full shadow">Create your own →</a>
        </div>
        {children}
        <p className="text-[11px] text-slate-400 text-center mt-8 leading-relaxed">
          Percentages only — RichR never shows amounts. Nothing here is investment advice.
        </p>
      </div>
    </div>
  );

  if (p === undefined) return shell(<div className="text-center text-sm text-slate-400 py-16">Loading…</div>);
  if (p === null) return shell(
    <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
      <Lock size={24} className="mx-auto text-slate-300 mb-3" />
      <p className="font-semibold text-slate-600">@{username} is private</p>
      <p className="text-sm text-slate-400 mt-1">This person hasn't switched on their public profile link, or the name doesn't exist.</p>
    </div>
  );

  const prof = profileOf(p.profile);
  const up = (p.return_pct || 0) >= 0;
  const events = Array.isArray(p.events) ? p.events : [];
  const pctS = (n) => `${Math.round(Number(n))}%`;
  const evText = (e) => {
    switch (e.kind) {
      case "shared": return "started sharing their portfolio";
      case "added": return `added ${e.ticker}${e.to_pct != null ? ` (${pctS(e.to_pct)})` : ""}`;
      case "removed": return `sold out of ${e.ticker}`;
      case "increased": return `increased ${e.ticker} from ${pctS(e.from_pct)} → ${pctS(e.to_pct)}`;
      case "decreased": return `trimmed ${e.ticker} from ${pctS(e.from_pct)} → ${pctS(e.to_pct)}`;
      case "score": return `RichR Score ${Number(e.to_pct) > Number(e.from_pct) ? "rose" : "fell"} ${Math.round(e.from_pct)} → ${Math.round(e.to_pct)}`;
      case "milestone": return `portfolio reached +${Math.round(e.to_pct)}% YTD`;
      default: return e.kind;
    }
  };
  return shell(
    <div className="space-y-4">
      <PortfolioCard name={p.name} username={p.username} mascot={prof ? prof.mascot : "👤"} style={prof ? prof.label : ""}
        ytd={p.return_pct != null ? Number(p.return_pct) : null} rank={null} top={Array.isArray(p.top_holdings) ? p.top_holdings : []}
        spark={Array.isArray(p.spark) ? p.spark : null} score={p.score} />
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">{prof ? prof.mascot : "👤"}</div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-lg text-slate-800 truncate">{p.name || `@${p.username}`}</div>
            <div className="text-xs text-slate-400">@{p.username}{prof ? ` · ${prof.label}` : ""}{p.portfolio ? ` · ${p.portfolio}` : ""}</div>
          </div>
          {p.return_pct != null && (
            <div className="text-right">
              <div className={`text-xl font-extrabold ${up ? "text-emerald-600" : "text-rose-500"}`}>{pct(Number(p.return_pct))}</div>
              <div className="text-[10px] font-semibold text-slate-400">YTD · time-weighted</div>
            </div>
          )}
        </div>
        {p.philosophy && <p className="text-[14px] text-slate-600 italic mt-3 leading-relaxed">“{p.philosophy}”</p>}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-slate-50 rounded-2xl p-2.5 text-center">
            <div className={`font-bold text-sm ${scoreTone(p.score)}`}>{p.score != null ? p.score : "—"}</div>
            <div className="text-[10px] font-semibold text-slate-400">RichR Score</div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-2.5 text-center">
            <div className="font-bold text-sm text-slate-700">{p.win_rate != null ? `${p.win_rate}%` : "—"}</div>
            <div className="text-[10px] font-semibold text-slate-400">Win rate</div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-2.5 text-center">
            <div className="font-bold text-sm text-slate-700">{p.holdings != null ? p.holdings : "—"}</div>
            <div className="text-[10px] font-semibold text-slate-400">Positions</div>
          </div>
        </div>
      </div>

      {Array.isArray(p.top_holdings) && p.top_holdings.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h4 className="text-xs font-semibold text-slate-400 mb-2">TOP HOLDINGS · ALLOCATION</h4>
          <div className="space-y-1.5">
            {p.top_holdings.map((h) => (
              <div key={h.ticker} className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-700 w-20 shrink-0 truncate">{h.ticker}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden"><div className="bg-emerald-400 h-full rounded-full" style={{ width: `${Math.min(100, h.pct)}%` }} /></div>
                <div className="text-xs font-semibold text-slate-500 w-12 text-right">{h.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {p.score_parts && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h4 className="text-xs font-semibold text-slate-400 mb-2">RICHR SCORE BREAKDOWN</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.keys(SCORE_LABEL).map((k) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{SCORE_LABEL[k]}</span>
                <span className={`font-bold ${scoreTone(p.score_parts[k])}`}>{p.score_parts[k] != null ? p.score_parts[k] : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(p.calls) && p.calls.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <CallsList calls={p.calls} title="CALLS" limit={10} />
          <p className="text-[10px] text-slate-400 mt-2">Buy/Hold/Sell are this person's opinions shared on RichR — not financial advice.</p>
        </div>
      )}

      {events.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h4 className="text-xs font-semibold text-slate-400 mb-2">RECENT CHANGES</h4>
          <div className="divide-y divide-slate-50">
            {events.map((e, i) => (
              <div key={i} className="py-1.5 flex items-start gap-2 text-sm text-slate-600">
                <div className="flex-1">{evText(e)}</div>
                <div className="text-[10px] text-slate-400 shrink-0 mt-0.5">{timeAgo(e.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {p.updated_at && <p className="text-[10px] text-slate-300 text-center">Last updated {fmtDateTime(p.updated_at)}</p>}
    </div>
  );
}

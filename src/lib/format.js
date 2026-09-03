/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */


/* ------------------------------------------------------------------ */
/*  RichR — track investments, write theses, share progress with      */
/*  friends. Sibling app to LightR: same light, friendly, mobile-     */
/*  first card UI with one gradient accent and a bottom tab bar.      */
/* ------------------------------------------------------------------ */

export const CURRENCIES = [
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

export const TYPES = ["Stock", "Fund", "ETF"];

export const uid = () => Math.random().toString(36).slice(2, 10);

export const slug = (s) =>
  (s || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "anon";

/* Network calls that hang (captive portals, flaky mobile data) must never
   leave a screen on a skeleton forever: race them against a timeout. */
export const withTimeout = (promise, ms = 10000, fallback = { data: null, error: new Error("timeout") }) =>
  Promise.race([promise, new Promise((res) => setTimeout(() => res(fallback), ms))]);

/* ---------- formatting ---------- */
/* One locale for every date in the UI. The copy is English, so dates are
   too — otherwise a Swedish/Finnish browser shows "7 juli" next to English
   labels. Numbers keep the browser locale (€1 234,56 is fine). */
export const DATE_LOCALE = "en-GB";

export const fmtDate = (t, opts) => new Date(t).toLocaleDateString(DATE_LOCALE, opts || { day: "numeric", month: "short" });

export const fmtTime = (t, opts) => new Date(t).toLocaleTimeString(DATE_LOCALE, opts || { hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (t) => `${fmtDate(t)} ${fmtTime(t)}`;

/* How old is the newest price row we've seen? Weekends are quiet, so
   anything under ~26h is "fresh"; beyond that we say so, in plain words. */
export const priceStaleness = (at) => {
  if (!at) return { stale: false, label: "", age: "", title: "" };
  const ms = Date.now() - at;
  const h = ms / 3600000;
  if (h < 26) return { stale: false, label: "", age: "", title: `Prices as of ${fmtDateTime(at)}` };
  const d = Math.floor(h / 24);
  const age = d >= 2 ? `${d} days` : `${Math.round(h)} hours`;
  return { stale: true, label: `Prices ${age} old`, age, title: `Newest price is from ${fmtDateTime(at)}` };
};

export const sym = (cur) => (CURRENCIES.find((c) => c.code === cur) || CURRENCIES[0]).sym;

export const money = (n, cur) => {
  const v = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}${sym(cur)}${v}`;
};

export const moneyShort = (n, cur) => {
  const v = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : ""}${sym(cur)}${v}`;
};

/* One convention for every performance number: sign always shown (a real
   minus, not a hyphen), tabular digits, 2 decimals by default. */
export const pct = (n, d = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}%`;

export const daysHeld = (d) => (d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : 0);

/* ---------- FX ---------- */
/* Rates are stored as units of currency per 1 USD. Defaults are rough
   fallbacks; real rates are fetched with every "Update prices".        */
export const DEFAULT_FX = { at: 0, rates: { USD: 1, EUR: 0.92, GBP: 0.79, SEK: 10.5, CAD: 1.36, CHF: 0.88, NOK: 10.6, DKK: 6.9, JPY: 150 } };

/* ---------- holdings maintenance (pure, unit-tested) ----------
   Every quick edit goes through these so the list, totals, chart key,
   leaderboard row and public profile all derive from one array. */
export const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

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
export const clamp01 = (x) => Math.max(0, Math.min(100, Math.round(x)));

export const fxConvert = (amount, from, to, fx) => {
  if (!from || !to || from === to) return amount;
  const r = { ...DEFAULT_FX.rates, ...((fx && fx.rates) || {}) }; // live rates win, defaults fill gaps
  const f = r[from], t = r[to];
  if (!f || !t) return amount;
  return amount * (t / f);
};

export const pctOf = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

export const daysOld = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

/* ================= COMMUNITIES (private spaces between mutual friends; tables are still called groups) ================= */
/* Everything here is gated by RLS in Supabase (see
   supabase/migrations/20260902_group_chats.sql): you only ever receive
   groups you belong to, and you can only add people who are your MUTUAL
   friends. The UI mirrors those rules but never has to enforce them. */

export const TICKER_RE = /\$([A-Za-z][A-Za-z0-9.\-]{0,9})/g;

export const extractTickers = (body) => {
  const out = new Set();
  String(body || "").replace(TICKER_RE, (_, t) => { out.add(t.toUpperCase()); return _; });
  return [...out];
};

export const timeAgo = (t) => {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return fmtDate(t);
};

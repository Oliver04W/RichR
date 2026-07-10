import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, RefreshCw, Trash2, Users, BookOpen, Home, Briefcase, Check, X,
  Clock, HelpCircle, Pencil, Trophy, Share2, TrendingUp, TrendingDown,
  ChevronDown, ChevronLeft, Target, Sparkles, Flag, Activity, Calendar, Camera, Upload, Search, Star, ExternalLink
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { supabase } from "./supabase";

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

/* ---------- storage (on this device, per signed-in account) ---------- */
const dataKey = (userId) => `richr:data:${userId}`;
function loadData(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* first run */ }
  return seed();
}
function saveData(key, d) {
  try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { console.error(e); }
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
const sym = (cur) => (CURRENCIES.find((c) => c.code === cur) || CURRENCIES[0]).sym;
const money = (n, cur) => {
  const v = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}${sym(cur)}${v}`;
};
const moneyShort = (n, cur) => {
  const v = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : ""}${sym(cur)}${v}`;
};
const pct = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
const daysHeld = (d) => (d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : 0);

/* ---------- FX ---------- */
/* Rates are stored as units of currency per 1 USD. Defaults are rough
   fallbacks; real rates are fetched with every "Update prices".        */
const DEFAULT_FX = { at: 0, rates: { USD: 1, EUR: 0.92, GBP: 0.79, SEK: 10.5 } };
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

const fxConvert = (amount, from, to, fx) => {
  if (!from || !to || from === to) return amount;
  const r = (fx && fx.rates) || DEFAULT_FX.rates;
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
  const [tab, setTab] = useState("home");
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

  const storageKey = dataKey(user.id);
  useEffect(() => {
    const d = loadData(storageKey);
    if (!d.userName && user.user_metadata && user.user_metadata.full_name)
      d.userName = user.user_metadata.full_name;
    setData(d);
    loaded.current = true;
  }, [storageKey]);
  useEffect(() => { if (loaded.current && data) saveData(storageKey, data); }, [data, storageKey]);

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
      label: new Date(s.t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
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
      const newFx = { at: Date.now(), rates: { ...(data.fx || DEFAULT_FX).rates, USD: 1 } };
      fxRows.forEach((r) => {
        const code = String(r.code || "").toUpperCase();
        const v = Number(r.per_usd);
        if (code && code !== "USD" && v > 0) newFx.rates[code] = v;
      });

      let hit = 0;
      const updated = active.holdings.map((h) => {
        const row = priceMap[h.ticker.toUpperCase()];
        if (row && Number(row.price) > 0) {
          hit++;
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
          ...d, snapshots: snaps, fx: newFx, pricesAt: Date.now(),
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
    SAMPLE.forEach((s) => upsertHolding({ id: uid(), ...s, buyDate: today, currentPrice: 0, verdict: "open" }));
    say("Sample positions added — replace them with your own.");
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
    { id: "home", label: "Home", icon: Home },
    { id: "positions", label: "Positions", icon: Briefcase },
    { id: "research", label: "Research", icon: Search },
    { id: "insights", label: "Insights", icon: Activity },
    { id: "friends", label: "Friends", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="max-w-md mx-auto px-4 pb-28 pt-6">
        {/* header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-baseline">
              Rich<img src="/logo.png" alt="R" className="h-[1.35rem] w-auto inline-block translate-y-[1px]" />
            </h1>
            <p className="text-xs text-slate-400 font-medium">Grow your money with friends</p>
          </div>
          <NamePill data={data} user={user} say={say}
            onName={(userName) => patch(() => ({ userName }))}
            onUsername={(username) => patch(() => ({ username }))}
            cur={cur} onCurrency={(currency) => patch(() => ({ currency }))}
            onProfile={(profile) => patch(() => ({ profile }))} onPhilosophy={(philosophy) => patch(() => ({ philosophy }))} onSignOut={onSignOut} />
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
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow shrink-0">
              Add back
            </button>
            <button onClick={dismissFriendAlert}
              className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        {tab === "home" && (
          <HomeTab
            data={data} active={active} cur={cur} totals={totals} chartData={chartData}
            refreshing={refreshing} onRefresh={refreshPrices}
            onSwitch={(id) => patch(() => ({ activeId: id }))}
            onAddPortfolio={addPortfolio} onDeletePortfolio={deletePortfolio}
            onRename={(name) => patchActive(() => ({ name }))}
            goPositions={() => setTab("positions")} onLoadSample={loadSample}
            goals={data.goals || []} allValue={allValue} fx={data.fx || DEFAULT_FX}
            autoRefresh={!!data.autoRefresh} onToggleAuto={() => patch((d) => ({ autoRefresh: !d.autoRefresh }))}
            pricesAt={data.pricesAt || 0}
            onAddGoal={addGoal} onUpdateGoal={updateGoal} onRemoveGoal={removeGoal}
          />
        )}
        {tab === "positions" && (
          <PositionsTab active={active} cur={cur} fx={data.fx || DEFAULT_FX}
            companyInfo={data.companyInfo || {}} onSaveInfo={saveCompanyInfo}
            onUpsert={upsertHolding} onRemove={removeHolding} onSetPrice={setPrice} onLoadSample={loadSample} onClosePosition={closePosition}
            watchlist={data.watchlist || []} onRemoveWatch={removeWatch} onSetWatchPrice={setWatchPrice}
            goResearch={() => setTab("research")} />
        )}
        {tab === "insights" && (
          <InsightsTab active={active} totals={totals} cur={cur} fx={data.fx || DEFAULT_FX} say={say}
            onVerdict={setVerdict}
            analysis={(data.analysis || {})[active.id]} onSave={saveAnalysis}
            news={(data.news || {})[active.id]} onSaveNews={saveNews} />
        )}
        {tab === "research" && <ResearchTab cur={cur} say={say} onUpsert={upsertHolding}
          companyInfo={data.companyInfo || {}} onSaveInfo={saveCompanyInfo}
          watchlist={data.watchlist || []} onWatch={addWatch} onUnwatch={removeWatchByTicker} />}
        {tab === "friends" && <FriendsTab data={data} active={active} totals={totals} cur={cur} say={say} user={user} />}
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 max-w-[90%] text-center">
          {toast}
        </div>
      )}

      {/* bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
        <div className="max-w-md mx-auto flex">
          {tabs.map((t) => {
            const on = tab === t.id;
            const I = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 pb-4">
                <I size={20} className={on ? "text-emerald-500" : "text-slate-400"} />
                <span className={`text-[11px] font-medium ${on ? "text-emerald-600" : "text-slate-400"}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ================= header pill ================= */
function NamePill({ data, user, say, onName, onUsername, cur, onCurrency, onProfile, onPhilosophy, onSignOut }) {
  const [open, setOpen] = useState(false);
  const prof = profileOf(data.profile);

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
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm">
        {prof && <span className="text-base leading-none">{prof.mascot}</span>}
        {data.userName || "Set name"} <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50 max-h-[70vh] overflow-y-auto">
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
          <p className="text-[10px] text-slate-400 mb-3">3–20 characters: a–z, 0–9 and _. Unique across RichR.</p>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">CURRENCY</label>
          <select value={cur} onChange={(e) => onCurrency(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white mb-3">
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
          <label className="block text-xs font-semibold text-slate-400 mb-1.5 mt-3">INVESTING PHILOSOPHY — SHOWN ON YOUR PROFILE</label>
          <textarea defaultValue={data.philosophy || ""} placeholder="e.g. Concentrated bets on AI infrastructure and defense. Hold winners, cut theses that break."
            onBlur={(e) => onPhilosophy(e.target.value.trim().slice(0, 280))}
            rows={3} maxLength={280}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none" />
          <p className="text-[10px] text-slate-400 mb-1">Up to 280 characters. Shared with friends when you tap Share.</p>
          <button onClick={() => setOpen(false)}
            className="mt-3 w-full bg-slate-100 rounded-xl py-2 text-sm font-semibold text-slate-600">Done</button>
          <button onClick={onSignOut}
            className="mt-2 w-full bg-rose-50 rounded-xl py-2 text-sm font-semibold text-rose-500">Sign out</button>
        </div>
      )}
    </div>
  );
}

/* ================= HOME ================= */
function HomeTab({ data, active, cur, totals, chartData, refreshing, onRefresh, onSwitch, onAddPortfolio, onDeletePortfolio, onRename, goPositions, onLoadSample, goals, allValue, fx, autoRefresh, onToggleAuto, pricesAt, onAddGoal, onUpdateGoal, onRemoveGoal }) {
  const [renaming, setRenaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const up = totals.pl >= 0;
  const flat = Math.abs(totals.plPct) <= 0.005;
  const th = perfTheme(totals.plPct);
  // progress toward "growth" — like LightR's progress toward goal weight
  const progress = totals.cost > 0 ? Math.min(100, Math.max(0, 50 + (totals.plPct / 2))) : 50;

  return (
    <div className="space-y-4">
      {/* portfolio switcher */}
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

      {/* hero card — gradient follows performance: green up, red down, grey flat */}
      <div className={`rounded-3xl ${th.grad} text-white p-6 shadow-lg ${th.shadow}`}>
        <div className="flex items-center justify-between">
          {renaming ? (
            <input autoFocus defaultValue={active.name}
              onBlur={(e) => { onRename(e.target.value.trim() || active.name); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
              className="bg-white/20 rounded-lg px-2 py-1 text-sm font-semibold text-white placeholder-white/60 w-40" />
          ) : (
            <button onClick={() => setRenaming(true)} className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
              {active.name} <Pencil size={12} className="opacity-70" />
            </button>
          )}
          {data.portfolios.length > 1 && (
            <button onClick={onDeletePortfolio} className="text-white/70"><Trash2 size={15} /></button>
          )}
        </div>

        <div className="mt-3 text-4xl font-extrabold tracking-tight">{money(totals.value, cur)}</div>
        <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
          {flat ? <Activity size={16} /> : up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          {money(totals.pl, cur)} ({pct(totals.plPct)})
        </div>

        {/* progress bar: cost basis at center, like distance-to-goal */}
        <div className="mt-5">
          <div className="flex justify-between text-[11px] font-medium text-white/80 mb-1.5">
            <span>Invested {moneyShort(totals.cost, cur)}</span>
            <span className="flex items-center gap-1"><Target size={11} /> Growth</span>
          </div>
          <div className="h-2.5 bg-white/25 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* chart card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
          <h3 className="font-bold text-slate-700">Your progress</h3>
          <div className="flex items-center gap-2">
            <button onClick={onToggleAuto}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                autoRefresh ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-400 border-slate-200"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-white animate-pulse" : "bg-slate-300"}`} />
              {autoRefresh ? "Live · 30s" : "Live off"}
            </button>
            <button onClick={() => onRefresh(false)} disabled={refreshing}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-60 ${th.chip}`}>
              <RefreshCw size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              {refreshing ? "Updating…" : "Update"}
            </button>
          </div>
        </div>
        {pricesAt > 0 && (
          <p className="text-[11px] text-slate-400 mb-1">Prices updated {new Date(pricesAt).toLocaleTimeString()}</p>
        )}
        <div className="h-40 -mx-2 cursor-pointer active:opacity-80" onClick={() => setShowHistory(true)}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={th.hex} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={th.hex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide domain={["auto", "auto"]} />
              <ReferenceLine y={Math.round(totals.cost)} stroke="#cbd5e1" strokeDasharray="4 4" />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(v) => [money(v, cur), "Value"]} />
              <Area type="monotone" dataKey="value" stroke={th.hex} strokeWidth={2.5} fill="url(#hg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Each price update adds a point. Dashed line is what you invested. Foreign holdings converted at{" "}
          {fx && fx.at ? `live FX rates (updated ${new Date(fx.at).toLocaleString()})` : "approximate FX rates — tap Update prices for live rates"}.
        </p>
      </div>

      <PortfolioHistorySheet open={showHistory} onClose={() => setShowHistory(false)}
        holdings={active.holdings} cur={cur}
        liveValue={totals.value} liveCost={totals.cost} hex={th.hex} />

      {/* quick stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Positions" value={active.holdings.length} />
        <StatCard label="Invested" value={moneyShort(totals.cost, cur)} />
        <StatCard label="Return" value={pct(totals.plPct)} tone={th.stat} />
      </div>

      {/* goals */}
      <GoalsSection goals={goals} allValue={allValue} cur={cur}
        onAdd={onAddGoal} onUpdate={onUpdateGoal} onRemove={onRemoveGoal} />

      {/* empty-state nudge */}
      {active.holdings.length === 0 && (
        <div className="bg-white rounded-3xl p-6 text-center shadow-sm border border-slate-100">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
            <Sparkles size={22} className="text-emerald-500" />
          </div>
          <h3 className="font-bold text-slate-700 mb-1">Start your journey</h3>
          <p className="text-sm text-slate-400 mb-4">Add your first position and write down why you bought it.</p>
          <div className="flex gap-2 justify-center">
            <button onClick={goPositions}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow">
              Add a position
            </button>
            <button onClick={onLoadSample}
              className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">
              Try sample data
            </button>
          </div>
        </div>
      )}
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

/* ================= POSITIONS ================= */
function PositionsTab({ active, cur, fx, companyInfo, onSaveInfo, onUpsert, onRemove, onSetPrice, onLoadSample, onClosePosition, watchlist, onRemoveWatch, onSetWatchPrice, goResearch }) {
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
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
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow">
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
        <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
          <p className="font-semibold text-slate-600 mb-1">Nothing here yet</p>
          <p className="text-sm text-slate-400 mb-4">Add positions manually, or import them straight from a screenshot of your bank or broker app.</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow">
              <Camera size={15} /> Import from screenshot
            </button>
            <button onClick={onLoadSample} className="bg-slate-100 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-full">
              Try sample data
            </button>
          </div>
        </div>
      ) : (
        byValueDesc(active.holdings, cur, fx).map((h) => (
          <PositionCard key={h.id} h={h} cur={cur} fx={fx} onOpen={() => setDetail(h)}
            onEdit={() => setEditing(h)} onRemove={() => onRemove(h.id)} onSetPrice={onSetPrice} />
        ))
      )}

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
        <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
          <Star size={24} className="mx-auto text-amber-400 mb-3" />
          <p className="font-semibold text-slate-600 mb-1">Your watchlist is empty</p>
          <p className="text-sm text-slate-400 mb-4">Find assets you're keen on in Research and tap Watch — they'll show up here as a concept portfolio you can track before buying.</p>
          <button onClick={goResearch}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow mx-auto">
            <Search size={15} /> Go to Research
          </button>
        </div>
      ) : (<>
        {concept != null && (
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex items-center justify-between gap-3">
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
        <PositionModal holding={editing === "new" ? null : editing} cur={cur}
          onClose={() => setEditing(null)}
          onSave={(h) => { onUpsert(h); setEditing(null); }} />
      )}

      {buying && (
        <PositionModal cur={cur} title="Buy — new position"
          holding={{
            id: uid(), ticker: buying.ticker, name: buying.name || buying.ticker, domain: "",
            type: buying.type || "Stock", currency: buying.currency || cur,
            shares: "", buyPrice: buying.currentPrice > 0 ? buying.currentPrice : "",
            buyDate: new Date().toISOString().slice(0, 10),
            currentPrice: buying.currentPrice || 0, thesis: "", verdict: "open",
          }}
          onClose={() => setBuying(null)}
          onSave={(h) => { onUpsert(h); onRemoveWatch(buying.id); setBuying(null); }} />
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
    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
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
              className="h-8 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold flex items-center gap-1 shadow">
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

function PositionCard({ h, cur, fx, onOpen, onEdit, onRemove, onSetPrice }) {
  const [editPrice, setEditPrice] = useState(false);
  const hc = h.currency || cur;
  const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
  const value = fxConvert(h.shares * cp, hc, cur, fx);
  const plPct = h.buyPrice ? ((cp - h.buyPrice) / h.buyPrice) * 100 : 0;
  const up = plPct >= 0;
  const V = VERDICTS[h.verdict] || VERDICTS.open;

  return (
    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 cursor-pointer active:bg-slate-50 transition"
      onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Logo h={h} />
          <div className="min-w-0">
            <div className="font-semibold text-slate-700 truncate">{h.name}</div>
            <div className="text-xs text-slate-400 font-medium">
              {h.shares} × {money(h.buyPrice, hc)} · {h.type}
              {hc !== cur && <span className="ml-1 text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">{hc}</span>}
              {" "}· {daysHeld(h.buyDate)}d
            </div>
            <button onClick={(e) => { e.stopPropagation(); setEditPrice(true); }}
              className={`text-xs font-semibold mt-0.5 underline decoration-dotted ${cp > h.buyPrice ? "text-emerald-600" : cp < h.buyPrice ? "text-rose-500" : "text-slate-400"}`}>
              now {money(cp, hc)}
            </button>
            {editPrice && (
              <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                <input autoFocus type="number" defaultValue={h.currentPrice || ""}
                  placeholder={`Price in ${hc}`}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0) onSetPrice(h.id, v); setEditPrice(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm w-32" />
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-slate-700">{money(value, cur)}</div>
          <div className={`text-sm font-bold ${up ? "text-emerald-600" : "text-rose-500"}`}>{pct(plPct)}</div>
          <div className="flex gap-1.5 justify-end mt-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <Pencil size={13} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${V.chip}`}>
          <V.icon size={11} /> {V.label}
        </span>
        {h.thesis && <span className="text-xs text-slate-400 truncate">“{h.thesis}”</span>}
      </div>
    </div>
  );
}

function PositionModal({ holding, cur, onClose, onSave, title }) {
  const [f, setF] = useState(
    holding || { id: uid(), ticker: "", name: "", domain: "", type: "Stock", currency: cur, shares: "", buyPrice: "", buyDate: new Date().toISOString().slice(0, 10), currentPrice: 0, thesis: "", verdict: "open" }
  );
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  /* global symbol search (stocks & ETFs via the search-symbols edge function) */
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);
  const searchSymbols = (raw) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = (raw || "").trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("search-symbols", { body: { q } });
        setResults(!error && data && Array.isArray(data.results) ? data.results.slice(0, 8) : []);
      } catch (e) { setResults([]); }
      setSearching(false);
    }, 350);
  };
  const pick = (r) => {
    setF((s) => ({
      ...s,
      ticker: r.symbol,
      name: r.name || s.name,
      currency: r.currency || s.currency,
      type: r.type || s.type,
    }));
    setResults([]);
  };
  const valid = f.ticker.trim() && Number(f.shares) > 0 && Number(f.buyPrice) > 0;
  const save = () => {
    if (!valid) return;
    onSave({ ...f, ticker: f.ticker.trim().toUpperCase(), name: f.name.trim() || f.ticker.trim().toUpperCase(),
      currency: f.currency || cur, shares: Number(f.shares), buyPrice: Number(f.buyPrice), currentPrice: Number(f.currentPrice) || 0 });
  };
  const label = "block text-xs font-semibold text-slate-400 mb-1.5";
  const input = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white";

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-700">{title || (holding ? "Edit position" : "New position")}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative"><label className={label}>TICKER — TYPE TO SEARCH</label>
              <input value={f.ticker}
                onChange={(e) => { set("ticker", e.target.value); searchSymbols(e.target.value); }}
                placeholder="NVDA or apple" className={input + " uppercase"} />
              {(searching || results.length > 0) && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-[60] max-h-56 overflow-y-auto">
                  {searching && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
                  {results.map((r) => (
                    <button key={r.symbol} type="button" onClick={() => pick(r)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 active:bg-slate-100 border-b border-slate-50 last:border-0">
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
            <div><label className={label}>TYPE</label>
              <select value={f.type} onChange={(e) => set("type", e.target.value)} className={input}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select></div>
          </div>
          <div><label className={label}>NAME (OPTIONAL)</label>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nvidia" className={input} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={label}>SHARES</label>
              <input type="number" value={f.shares} onChange={(e) => set("shares", e.target.value)} placeholder="10" className={input} /></div>
            <div><label className={label}>BUY ({sym(f.currency || cur)})</label>
              <input type="number" value={f.buyPrice} onChange={(e) => set("buyPrice", e.target.value)} placeholder="120" className={input} /></div>
            <div><label className={label}>DATE</label>
              <input type="date" value={f.buyDate} onChange={(e) => set("buyDate", e.target.value)} className={input} /></div>
          </div>
          <div><label className={label}>TRADING CURRENCY — THE CURRENCY THIS IS BOUGHT AND PRICED IN</label>
            <select value={f.currency || cur} onChange={(e) => set("currency", e.target.value)} className={input}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select></div>
          <div>
            <label className={label}>WHY DID YOU BUY IT?</label>
            <textarea value={f.thesis} onChange={(e) => set("thesis", e.target.value)} rows={4}
              placeholder="What has to be true for this to work? What's your edge or catalyst?"
              className={input + " resize-y leading-relaxed"} />
          </div>
        </div>
        <div className="p-5 pt-0">
          <button onClick={save} disabled={!valid}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-2xl shadow disabled:opacity-50">
            {holding ? "Save changes" : "Add position"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= THESES ================= */
function ThesesTab({ active, cur, fx, onVerdict }) {
  if (!active.holdings.length)
    return (
      <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
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
          <div key={h.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
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
function FriendsTab({ data, active, totals, cur, say, user }) {
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
        .select("user_id, name, profile, portfolio, return_pct, holdings, top_holdings, realized_pct, avg_days, win_rate, philosophy")
        .order("return_pct", { ascending: false })
        .limit(100);
      if (bErr) throw bErr;
      setBoard((rows || []).map((r) => ({
        userId: r.user_id,
        name: r.name || "anon",
        profile: r.profile || "",
        portfolio: r.portfolio || "",
        returnPct: Number(r.return_pct) || 0,
        holdings: r.holdings || 0,
        topHoldings: Array.isArray(r.top_holdings) ? r.top_holdings : [],
        realizedPct: r.realized_pct != null ? Number(r.realized_pct) : null,
        avgDays: r.avg_days != null ? Number(r.avg_days) : null,
        winRate: r.win_rate != null ? Number(r.win_rate) : null,
        philosophy: r.philosophy || "",
      })));
      setOnBoard((rows || []).some((r) => r.user_id === user.id));
    } catch (e) {
      console.error("RichR leaderboard load failed:", e);
      setBoard([]);
    }
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
    const fx = data.fx || DEFAULT_FX;
    const totalVal = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
    const topHoldings = byValueDesc(active.holdings, cur, fx)
      .slice(0, 10)
      .map((h) => ({
        ticker: h.ticker,
        pct: totalVal > 0 ? Number(((holdingValue(h, cur, fx) / totalVal) * 100).toFixed(1)) : 0,
      }));
    const entry = {
      name: data.userName.trim(),
      profile: data.profile || "",
      portfolio: active.name,
      returnPct: Number(totals.plPct.toFixed(2)),
      holdings: active.holdings.length,
      topHoldings,
      at: Date.now(),
    };
    const stats = socialStats(active, cur, fx);
    try {
      const { error } = await supabase.from("leaderboard").upsert({
        user_id: user.id,
        name: entry.name,
        profile: entry.profile,
        portfolio: entry.portfolio,
        return_pct: entry.returnPct,
        holdings: entry.holdings,
        top_holdings: entry.topHoldings,
        realized_pct: stats.realizedPct != null ? Number(stats.realizedPct.toFixed(2)) : null,
        avg_days: stats.avgDays,
        win_rate: stats.winRate,
        philosophy: (data.philosophy || "").slice(0, 280),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      say("Shared! Your profile is on the board.");
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

  const friendIds = new Set([user.id, ...((friends || []).map((f) => f.id))]);
  const shown = board === null ? null : board.filter((r) => friendIds.has(r.userId));

  return (
    <div className="space-y-4">
      {/* share card */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-6 shadow-lg shadow-emerald-200">
        <div className="flex items-center gap-2 font-bold"><Share2 size={17} /> Share your progress</div>
        <p className="text-sm text-emerald-50 mt-1.5 leading-relaxed">
          Publish “{active.name}” to your friends — your return %, position count and top 10 holdings (with their portfolio weight) show on their leaderboard. Amounts and theses stay private. Unshare anytime.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={publish} disabled={busy}
            className="bg-white text-emerald-600 font-semibold text-sm px-5 py-2.5 rounded-full shadow disabled:opacity-60">
            {busy ? "Working…" : onBoard ? "Update share" : "Share now"}
          </button>
          {onBoard && (
            <button onClick={unpublish} disabled={busy}
              className="bg-emerald-700/40 text-white font-semibold text-sm px-5 py-2.5 rounded-full disabled:opacity-60">
              Unshare
            </button>
          )}
        </div>
      </div>

      {/* friends manager */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
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
            className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 rounded-xl shadow disabled:opacity-50 shrink-0">
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
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Users size={16} className="text-emerald-500" /> Your friends
              {mutuals.length > 0 && <span className="text-xs font-semibold text-slate-400">· {mutuals.length}</span>}
            </h3>

            {loadingLists ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <>
                {/* rubric 1: mutual friends — tap to view profile */}
                {mutuals.length === 0 ? (
                  <p className="text-sm text-slate-400">No friends yet — when someone adds you back, they appear here.</p>
                ) : (
                  <div>
                    {mutuals.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-slate-50 last:border-0">
                        <button onClick={() => openFriendProfile(f.id, f.username)}
                          className="min-w-0 flex-1 text-left active:opacity-70">
                          <div className="text-sm font-semibold text-slate-700 truncate">@{f.username}</div>
                          <div className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                            <Check size={10} /> Friends · tap to view profile
                          </div>
                        </button>
                        <button onClick={() => removeFriend(f.id, f.username)}
                          className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full shrink-0">
                          Unfriend
                        </button>
                      </div>
                    ))}
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
                          className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow shrink-0">
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
        <div className="bg-white rounded-3xl p-6 text-center text-slate-400 text-sm shadow-sm border border-slate-100">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
          <Trophy size={24} className="mx-auto text-amber-300 mb-3" />
          <p className="font-semibold text-slate-600 mb-1">No shared returns yet</p>
          <p className="text-sm text-slate-400">
            Add friends above, and make sure you (and they) have tapped Share.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((r, i) => {
            const me = r.userId === user.id;
            const up = r.returnPct >= 0;
            const prof = profileOf(r.profile);
            const medal = i === 0 ? "bg-amber-100 text-amber-600" : i === 1 ? "bg-slate-200 text-slate-500" : i === 2 ? "bg-orange-100 text-orange-500" : "bg-slate-100 text-slate-400";
            return (
              <div key={r.userId} onClick={() => setViewing(r)}
                className={`bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm border cursor-pointer active:bg-slate-50 ${me ? "border-emerald-300" : "border-slate-100"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${medal}`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-700 text-sm truncate">
                    {prof && <span className="text-base leading-none mr-1" title={prof.label}>{prof.mascot}</span>}
                    {r.name} {me && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ml-1">YOU</span>}
                  </div>
                  <div className="text-xs text-slate-400">{prof ? `${prof.label} · ` : ""}{r.portfolio} · {r.holdings} positions</div>
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
                <div className={`font-bold ${up ? "text-emerald-600" : "text-rose-500"}`}>{pct(r.returnPct)}</div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Your leaderboard shows only you and the friends you've added — there's no public list. Tap anyone to see their profile.
        Shared with friends: name, badge, portfolio name, return %, realized %, win rate, average hold, top-10 allocation, and your philosophy.
        Amounts, buy prices and theses stay on your device.
      </p>
      {viewing && (
        <ProfileSheet r={viewing} me={viewing.userId === user.id} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/* ================= GOALS ================= */
function GoalsSection({ goals, allValue, cur, onAdd, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(null); // goal object or "new"

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
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
                        <Calendar size={11} /> by {new Date(g.targetDate).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
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
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto overscroll-contain"
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
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-2xl shadow disabled:opacity-50">
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
      <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
        <Activity size={24} className="mx-auto text-slate-300 mb-3" />
        <p className="font-semibold text-slate-600 mb-1">Nothing to analyze yet</p>
        <p className="text-sm text-slate-400">Add positions first — then get your risk profile, a news scan, and your theses in one place.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-lg text-slate-700">Portfolio insights</h2>
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
          className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow disabled:opacity-60">
          <Sparkles size={14} style={{ animation: busy ? "spin 1.2s linear infinite" : "none" }} />
          {busy ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze"}
        </button>
      </div>

      {!analysis ? (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
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
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-700 text-sm mb-2">
                <Sparkles size={14} className="text-emerald-500" /> Diversification note
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">{analysis.note}</p>
            </div>
          )}

          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
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
            Last updated {new Date(analysis.at).toLocaleString()}. Betas and volatilities are AI-retrieved estimates from
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
          {news ? `Scanned ${new Date(news.at).toLocaleString()}` : "News affecting your holdings"}
        </p>
        <button onClick={onFetch} disabled={busy}
          className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow disabled:opacity-60">
          <RefreshCw size={14} style={{ animation: busy ? "spin 1s linear infinite" : "none" }} />
          {busy ? "Scanning…" : news ? "Rescan" : "Scan news"}
        </button>
      </div>

      {!news ? (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
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
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 active:opacity-80 transition">
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

function ImportModal({ cur, onClose, onImport }) {
  const [stage, setStage] = useState("pick");   // pick | parsing | review | error
  const [rows, setRows] = useState([]);
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
    `(US listings → USD, Helsinki → EUR, Stockholm → SEK, London → GBP).\n` +
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

  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
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
      buyDate: today,
      currentPrice: Number(r.currentPrice) || 0,
      thesis: "",
      verdict: "open",
    })));
  };

  const input = "border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white w-full";

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto overscroll-contain flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-lg text-slate-700">Import from screenshot</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={15} />
          </button>
        </div>

        {stage === "pick" && (
          <div className="p-6">
            <button onClick={() => fileRef.current && fileRef.current.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-emerald-300 transition">
              <Upload size={26} className="mx-auto text-emerald-500 mb-3" />
              <p className="font-semibold text-slate-600 text-sm">Choose screenshots or a CSV export</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Screenshots of your holdings from any bank app (OP, Nordnet, Nordea, Avanza…) — up to 10 images.
                Scrolled, overlapping screenshots are fine: duplicates are merged automatically. You can also pick a CSV
                export from your broker.
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
            <div className="p-5 space-y-3 overflow-y-auto">
              <p className="text-sm text-slate-400 leading-relaxed">
                Found {rows.length} holding{rows.length === 1 ? "" : "s"}. Check the numbers — screenshot reading isn't
                perfect. Buy price is required (it's how returns are calculated); fill it in if your screenshot didn't show it.
              </p>
              {rows.map((r) => {
                const ok = (r.ticker.trim() || r.name.trim()) && Number(r.shares) > 0 && Number(r.buyPrice) > 0;
                return (
                  <div key={r.key}
                    className={`border rounded-2xl p-3.5 ${r.include ? (ok ? "border-slate-200" : "border-amber-300 bg-amber-50/40") : "border-slate-100 opacity-50"}`}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <input type="checkbox" checked={r.include}
                        onChange={(e) => setRow(r.key, "include", e.target.checked)}
                        className="w-4 h-4 accent-emerald-500" />
                      <input value={r.ticker} onChange={(e) => setRow(r.key, "ticker", e.target.value)}
                        placeholder="TICKER" className={input + " uppercase font-semibold"} style={{ maxWidth: 110 }} />
                      <input value={r.name} onChange={(e) => setRow(r.key, "name", e.target.value)}
                        placeholder="Name" className={input} />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">SHARES</label>
                        <input type="number" value={r.shares} onChange={(e) => setRow(r.key, "shares", e.target.value)} className={input} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">BUY PRICE *</label>
                        <input type="number" value={r.buyPrice} onChange={(e) => setRow(r.key, "buyPrice", e.target.value)}
                          placeholder="required" className={input} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">NOW (OPT.)</label>
                        <input type="number" value={r.currentPrice || ""} onChange={(e) => setRow(r.key, "currentPrice", e.target.value)} className={input} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">CCY</label>
                        <select value={r.currency} onChange={(e) => setRow(r.key, "currency", e.target.value)} className={input}>
                          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                        </select>
                      </div>
                    </div>
                    {r.note && (
                      <p className="text-[10px] text-slate-400 mt-2 leading-snug">ⓘ {r.note}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-5 pt-2 border-t border-slate-100 shrink-0">
              {needsPrice > 0 && (
                <p className="text-[11px] text-amber-600 font-medium mb-2">
                  {needsPrice} selected holding{needsPrice === 1 ? " is" : "s are"} missing a buy price and will be skipped.
                </p>
              )}
              <button onClick={confirm} disabled={!importable.length}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-2xl shadow disabled:opacity-50">
                Add {importable.length} position{importable.length === 1 ? "" : "s"}
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
      <div className="absolute inset-0 flex flex-col bg-white sm:static sm:inset-auto sm:w-full sm:max-w-md sm:rounded-3xl sm:max-h-[90vh]"
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
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50">
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
  { id: "6mo", label: "6M",  sub: "Past 6 months" },
  { id: "1y",  label: "1Y",  sub: "Past year" },
];

function PortfolioHistorySheet({ open, onClose, holdings, cur, liveValue, liveCost, hex }) {
  const [range, setRange] = useState("1d");
  const [pts, setPts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    let dead = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const body = {
          display: cur,
          range,
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
          setPts(data.points);
        }
      } catch (e) { if (!dead) { setErr("Could not load history."); setPts(null); } }
      if (!dead) setLoading(false);
    })();
    return () => { dead = true; };
  }, [open, range, cur, holdings]);

  if (!open) return null;

  const intraday = range === "1d" || range === "1w";
  const fmtTick = (t) => {
    const d = new Date(t);
    if (range === "1d") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (range === "1w") return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const chart = (pts || []).map((p) => ({ t: p.t, value: p.value, cost: p.cost }));
  if (chart.length && liveValue > 0) {
    chart.push({ t: new Date().toISOString(), value: Math.round(liveValue * 100) / 100, cost: liveCost });
  }

  const first = chart.length ? chart[0].value : 0;
  const last = chart.length ? chart[chart.length - 1].value : 0;
  const diff = last - first;
  const diffPct = first ? (diff / first) * 100 : 0;
  const up = diff >= 0;
  const sub = (PH_RANGES.find((r) => r.id === range) || {}).sub || "";

  return (
    <div className="fixed inset-0 z-[80] bg-slate-50 overflow-y-auto">
      <div className="max-w-md mx-auto p-4 pb-10">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onClose} className="p-2 -ml-2 text-slate-500"><ChevronLeft size={22} /></button>
          <h2 className="font-bold text-lg text-slate-700">Portfolio history</h2>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
          <div className="text-2xl font-bold text-slate-800">{money(last, cur)}</div>
          <div className={`text-sm font-semibold flex items-center gap-1 mt-0.5 ${up ? "text-emerald-600" : "text-rose-500"}`}>
            {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {up ? "+" : ""}{money(diff, cur)} ({up ? "+" : ""}{diffPct.toFixed(2)}%)
            <span className="text-slate-400 font-normal ml-1">{sub}</span>
          </div>

          <div className="h-64 -mx-2 mt-4">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                <RefreshCw size={15} className="animate-spin mr-2" /> Building accurate history…
              </div>
            ) : err ? (
              <div className="h-full flex items-center justify-center text-sm text-rose-500 text-center px-6">{err}</div>
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
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    labelFormatter={(t) => new Date(t).toLocaleString()}
                    formatter={(v, k) => [money(v, cur), k === "value" ? "Value" : "Invested"]} />
                  <Area type="monotone" dataKey="value" stroke={up ? "#10b981" : "#f43f5e"}
                    strokeWidth={2.5} fill="url(#phg)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-3">
            {PH_RANGES.map((r) => (
              <button key={r.id} onClick={() => setRange(r.id)}
                className={`flex-1 text-xs font-bold py-2 rounded-full transition ${
                  range === r.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>
                {r.label}
              </button>
            ))}
          </div>

          <p className="text-[10px] text-slate-300 mt-3">
            Reconstructed from official daily closes and intraday bars, converted at historical FX.
            Excludes dividends and fees. The last point is your live value.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================= RESEARCH ================= */
/* Look up any stock on demand: search → live quote (via the get-quote
   edge function) → add to portfolio or watch. No seed_tickers bloat;
   each lookup fetches its own price when you open it. */
function ResearchTab({ cur, say, onUpsert, companyInfo, onSaveInfo, watchlist, onWatch, onUnwatch }) {
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
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
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
                    {up ? "+" : ""}{quote.pct}%
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

          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => startAdd(sel)}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold py-2.5 rounded-full shadow flex items-center justify-center gap-1.5">
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
        <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-100">
          <Search size={24} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">Search any instrument above to see its current price. Nothing is added until you choose to.</p>
        </div>
      )}

      {adding && (
        <PositionModal holding={adding} cur={cur}
          onClose={() => setAdding(null)}
          onSave={(h) => { onUpsert(h); setAdding(null); say(`Added ${h.ticker} to your portfolio.`); }} />
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
                labelFormatter={(t) => new Date(t).toLocaleString([], (range === "1d" || range === "5d")
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
function ProfileSheet({ r, me, onClose }) {
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
      <div className="absolute inset-0 flex flex-col bg-white sm:static sm:inset-auto sm:w-full sm:max-w-md sm:rounded-3xl sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between sm:rounded-t-3xl"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <button onClick={onClose} className="flex items-center gap-0.5 text-sm font-semibold text-emerald-600 -ml-1">
            <ChevronLeft size={20} /> Back
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">{prof ? prof.mascot : "👤"}</div>
            <div className="min-w-0">
              <div className="font-bold text-lg text-slate-700 truncate">
                {r.name} {me && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ml-1">YOU</span>}
              </div>
              <div className="text-xs text-slate-400">{prof ? prof.label : "Investor"}{r.portfolio ? ` · ${r.portfolio}` : ""}</div>
            </div>
          </div>

          {r.philosophy && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 mb-1.5">INVESTING PHILOSOPHY</h4>
              <p className="text-[15px] text-slate-600 leading-relaxed italic">"{r.philosophy}"</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Stat label="UNREALIZED RETURN" value={pct(r.returnPct || 0)} tone={up ? "text-emerald-600" : "text-rose-500"} />
            <Stat label="REALIZED RETURN" value={r.realizedPct != null ? pct(r.realizedPct) : "—"} tone={r.realizedPct == null ? "text-slate-400" : rUp ? "text-emerald-600" : "text-rose-500"} />
            <Stat label="WIN RATE" value={r.winRate != null ? `${r.winRate}%` : "—"} />
            <Stat label="AVG HOLD" value={r.avgDays != null ? `${r.avgDays}d` : "—"} />
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-400 mb-2">TOP HOLDINGS · ALLOCATION{typeof r.holdings === "number" ? ` (${r.holdings} positions)` : ""}</h4>
            {r.topHoldings && r.topHoldings.length > 0 ? (
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

/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Minus, Plus, X } from "lucide-react";
import { fmtDateTime, money, pct, round6 } from "../lib/format.js";

/* ---------- company logos ---------- */
/* Logos load from each company's website favicon (via Google's favicon service —
   free, no API key). Domain comes from: an explicit domain on the holding →
   a built-in map of common tickers → a guess from the company name.
   If nothing loads, we fall back to the ticker-initials tile.               */
export const TICKER_DOMAINS = {
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

export const guessDomain = (h) => {
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
export const BRAND_COLORS = {
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

export const hashColor = (s) => {
  let h = 0;
  for (const c of s || "?") h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 42%)`;
};

export function Logo({ h, size = 44, rounded = "rounded-2xl" }) {
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

/* Coloured performance number — the single way to render a return anywhere. */
export function Ret({ v, d = 2, className = "", plain = false }) {
  if (v == null || Number.isNaN(Number(v))) return <span className={`text-slate-300 tabular-nums ${className}`}>—</span>;
  const n = Number(v);
  return <span className={`tabular-nums ${plain ? "" : n >= 0 ? "text-emerald-600" : "text-rose-500"} ${className}`}>{pct(n, d)}</span>;
}

/* Tiny inline sparkline (SVG) for the portfolio card. */
export function Sparkline({ points, width = 120, height = 32, up = true }) {
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

export const MEDAL = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

/* Loading placeholder: a few shimmering lines in a card. */
export function Skeleton({ lines = 3, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 ${className}`} aria-busy="true">
      <div className="skel h-4 w-1/3 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skel h-3 mb-2" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function StatCard({ label, value, tone = "text-slate-700" }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 text-center shadow-sm border border-slate-100">
      <div className={`font-bold text-sm ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-400 font-medium mt-0.5">{label}</div>
    </div>
  );
}

/* ================= QUICK HOLDINGS MAINTENANCE ================= */
/* The goal is speed: change or remove a holding in a few seconds, from the
   list (••• menu, swipe) or from a tap. Every change lands in the same
   holdings array, so totals, chart, leaderboard and profile follow at once. */

/* ••• dropdown — closes on any outside tap */
export function RowMenu({ items, onClose, anchor }) {
  /* Portalled: the rows are transformed (swipe) and clipped, so the menu
     lives on <body> at the button's screen position. */
  const r = anchor || { bottom: 0, right: 0 };
  const flipUp = typeof window !== "undefined" && r.bottom + 44 * items.length + 16 > window.innerHeight;
  const pos = { position: "fixed", right: Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 0) - r.right), ...(flipUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) };
  return createPortal(
    <>
      <div className="fixed inset-0 z-[55]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div role="menu" className="z-[56] w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1" style={{ ...pos, animation: "richr-in .12s ease-out both" }} onClick={(e) => e.stopPropagation()}>
        {items.map((it) => (
          <button key={it.label} role="menuitem" onClick={() => { onClose(); it.onClick(); }}
            className={`w-full flex items-center gap-2.5 px-3 h-10 text-sm font-semibold text-left ${it.danger ? "text-rose-600" : "text-slate-700"} hover:bg-slate-50`}>
            {it.icon && <it.icon size={15} className={it.danger ? "text-rose-500" : "text-slate-400"} />} {it.label}
          </button>
        ))}
      </div>
    </>, document.body);
}

/* Swipe left to reveal actions (touch only; mouse users get the ••• menu). */
export function SwipeRow({ open, onOpen, onClose, actions, children }) {
  const W = 72 * actions.length;
  const start = useRef(null);
  const st = useRef({ drag: false, dx: 0 });          // gesture truth lives in refs (touch events arrive faster than renders)
  const [, tick] = useState(0);
  const render = () => tick((n) => n + 1);
  const x = st.current.drag ? st.current.dx : open ? -W : 0;
  const onStart = (e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, dead: false }; };
  const onMove = (e) => {
    if (!start.current || start.current.dead) return;
    const t = e.touches[0]; const ddx = t.clientX - start.current.x, ddy = t.clientY - start.current.y;
    if (!st.current.drag) { if (Math.abs(ddy) > Math.abs(ddx)) { start.current.dead = true; return; } if (Math.abs(ddx) < 6) return; st.current.drag = true; }
    st.current.dx = Math.max(-W, Math.min(0, (open ? -W : 0) + ddx));
    render();
  };
  const onEnd = () => {
    if (st.current.drag) { if (st.current.dx < -W / 2) onOpen(); else onClose(); }
    st.current = { drag: false, dx: 0 }; start.current = null; render();
  };
  return (
    <div className="relative overflow-hidden" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: W }} aria-hidden={!open}>
        {actions.map((a) => (
          <button key={a.label} tabIndex={open ? 0 : -1} onClick={a.onClick} className={`flex-1 text-sm font-bold ${a.tone}`}>{a.label}</button>
        ))}
      </div>
      <div className="relative bg-white" style={{ transform: `translateX(${x}px)`, transition: st.current.drag ? "none" : "transform .2s cubic-bezier(.2,.8,.2,1)" }}>
        {children}
      </div>
    </div>
  );
}

/* One-tap confirmation: "Delete NVDA from your portfolio?"  Cancel / Delete */
export function ConfirmDialog({ text, label = "Delete", onCancel, onConfirm }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") onConfirm(); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, []);
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-6" onClick={onCancel}>
      <div role="alertdialog" className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-xl" style={{ animation: "richr-in .15s ease-out both" }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-bold text-slate-900 leading-snug">{text}</div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={onCancel} className="h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">Cancel</button>
          <button onClick={onConfirm} autoFocus className="h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold">{label}</button>
        </div>
      </div>
    </div>
  );
}

/* [ − ] 20 [ + ] with direct numeric input */
export function Stepper({ value, onChange, min = 0, step = 1, size = "md", ariaLabel = "Shares" }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = (raw) => { const n = parseFloat(String(raw).replace(",", ".")); onChange(Number.isFinite(n) ? round6(Math.max(min, n)) : value); };
  const bump = (d) => onChange(round6(Math.max(min, (Number(value) || 0) + d)));
  const h = size === "sm" ? "h-9" : "h-12";
  const btn = `${h} ${size === "sm" ? "w-9" : "w-12"} rounded-xl bg-slate-100 active:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 disabled:opacity-40`;
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => bump(-step)} disabled={Number(value) - step < min} aria-label={`Decrease ${ariaLabel}`} className={btn}><Minus size={16} /></button>
      <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} aria-label={ariaLabel}
        className={`${h} ${size === "sm" ? "w-14 text-sm" : "w-24 text-lg"} text-center font-bold tabular-nums border border-slate-200 rounded-xl bg-white outline-none focus:border-emerald-400`} />
      <button type="button" onClick={() => bump(step)} aria-label={`Increase ${ariaLabel}`} className={btn}><Plus size={16} /></button>
    </div>
  );
}

export function MetricCard({ label, value, hint }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="text-[11px] font-semibold text-slate-400">{label.toUpperCase()}</div>
      <div className="text-2xl font-extrabold text-slate-700 mt-1">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>
    </div>
  );
}

/* The performance chart: reconstructed daily history with 1D…ALL ranges,
   gain/loss for the range, and an optional benchmark overlay. Used on the
   Overview (compact) and in the fullscreen history sheet (tall). */
/* Custom hover/tap card for the portfolio chart: date, value and the
   change since the start of the range (or you vs benchmark in compare mode). */
export function ChartTip({ active, payload, label, cur, first, compare, benchLabel }) {
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

/* ================= CREATE (universal "+ Create" button) ================= */
/* One entry point for everything you can put into RichR: a post, a
   Buy/Hold/Sell poll, a position, a transaction. Social first. */

export function BottomSheet({ title, onClose, children, back = null }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, []);
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain flex flex-col"
        style={{ animation: "richr-up .22s cubic-bezier(.2,.8,.2,1) both" }} onClick={(e) => e.stopPropagation()}>
        <div className="sm:hidden w-9 h-1 rounded-full bg-slate-200 mx-auto mt-2.5" />
        <div className="px-5 pt-3 pb-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1">
            {back && <button onClick={back} className="w-8 h-8 -ml-2 rounded-xl flex items-center justify-center text-slate-500" aria-label="Back"><ChevronLeft size={18} /></button>}
            <h3 className="font-bold text-lg text-slate-900">{title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* Initials avatar with a stable colour per name — friends become faces, not rows. */
export const AVATAR_BG = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-teal-500", "bg-indigo-500", "bg-orange-500"];

export function Avatar({ name, mascot, size = 36, className = "" }) {
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

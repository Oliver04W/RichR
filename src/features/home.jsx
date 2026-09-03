/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useState } from "react";
import { Calendar, Camera, Check, ChevronLeft, Flag, Pencil, Plus, RefreshCw, Sparkles, Trash2, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { supabase } from "../supabase";
import { Area, AreaChart, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HomeFeed } from "./feed.jsx";
import { RecheckCalls } from "./sentiment.jsx";
import { fmtDate, fmtDateTime, fmtTime, money, moneyShort, pct, priceStaleness, sym, uid, withTimeout } from "../lib/format.js";
import { BENCHMARKS, DEFAULT_BENCH, PH_RANGES, PH_SERVICE_RANGE, SCORE_LABEL, SCORE_WEIGHTS, benchOf, byValueDesc, computeScore, cutSeries, explainScoreChange, holdingValue, holdingsKey, idxOnOrBefore, loadDailySeries, perfTheme, periodReturn, profileOf, scoreTone, winningStreak } from "../lib/portfolio.js";
import { dataKey } from "../lib/storage.js";
import { AsyncConfirm, ChartTip, Logo, MEDAL, Ret, Sparkline } from "../ui/primitives.jsx";

/* ================= HOME ================= */
export function HomeTab({ data, active, cur, totals, chartData, refreshing, onRefresh, onSwitch, onAddPortfolio, onDeletePortfolio, onRename, goPositions, goImport, onLoadSample, goals, allValue, fx, autoRefresh, onToggleAuto, pricesAt, priceDataAt, onAddGoal, onUpdateGoal, onRemoveGoal, onBenchmark, onScoreLog, user, goFriends, goCommunities = null, onDismissOnboarding, onOpenProfile, onRankLog, onOpenTicker }) {
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

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteModal = confirmDelete && (
    <AsyncConfirm title="Delete portfolio?" label="Delete portfolio"
      text={`This will permanently delete “${active.name}” and all of its holdings. This action cannot be undone.`}
      onCancel={() => setConfirmDelete(false)}
      action={async () => { await onDeletePortfolio(); setConfirmDelete(false); }} />
  );
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
        {deleteModal}
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
            <div className="flex items-center">
              <button onClick={onAddPortfolio} aria-label="New portfolio" title="New portfolio" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-emerald-600 hover:bg-emerald-50"><Plus size={15} /></button>
              <button onClick={() => setConfirmDelete(true)} aria-label="Delete this portfolio" title="Delete this portfolio" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button>
            </div>
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
            <button onClick={goPositions} className="btn-secondary">Add manually</button>
            <button onClick={onLoadSample} className="btn-secondary">Try sample data</button>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">Fastest: a screenshot or CSV export from your broker app (Nordnet, Avanza, Interactive Brokers…) — confirm the holdings and you’re done in about 20 seconds. Sample data is clearly marked and can't be shared.</p>
        </div>
        {!data.onboardingDismissed && (
          <OnboardingCard user={user} active={active} data={data} onImport={goImport} onAddManually={goPositions} goFriends={goFriends} onDismiss={onDismissOnboarding} />
        )}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">What's happening on RichR</h3>
            <button onClick={goFriends} className="text-xs font-semibold text-emerald-700">Friends →</button>
          </div>
          <HomeFeed user={user} onOpenTicker={onOpenTicker} goFriends={goFriends} goCommunities={goCommunities} boardRanks={data.boardRanks || null} />
        </section>
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
      {deleteModal}
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
            <button onClick={onAddPortfolio} aria-label="New portfolio" title="New portfolio" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-emerald-600 hover:bg-emerald-50"><Plus size={13} /></button>
            <button onClick={() => setConfirmDelete(true)} aria-label="Delete this portfolio" title="Delete this portfolio" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
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

      {/* ===== the feed — friends, communities, sentiment, rankings ===== */}
      <section className="border-t border-slate-100 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title">Feed</h3>
          <button onClick={goFriends} className="text-xs font-semibold text-emerald-700">Leaderboard →</button>
        </div>
        <HomeFeed user={user} onOpenTicker={onOpenTicker} goFriends={goFriends} goCommunities={goCommunities} boardRanks={data.boardRanks || null}
          rankMove={(() => { const br = data.boardRanks; if (!br || !br.cur || !br.prev) return null; const to = br.cur[user.id], from = br.prev[user.id]; return to && from && to !== from ? { from, to, up: to < from } : null; })()} />
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

      <RecheckCalls onOpenTicker={onOpenTicker} />


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
export function IdentityStrip({ data, active, cur, fx, social, streak, onProfile }) {
  const prof = profileOf(data.profile);
  const top = byValueDesc(active.holdings, cur, fx).slice(0, 3);
  const total = active.holdings.reduce((s, h) => s + holdingValue(h, cur, fx), 0);
  return (
    <button onClick={onProfile} className="w-full flex items-center gap-3 text-left">
      <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center text-2xl shrink-0">{prof ? prof.mascot : "🙂"}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-900">{data.userName || "Set up profile"}</span>
          {social && social.rank != null && social.shared && (
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

/* ===== The RichR Portfolio Card =====
   One signature component: who, how they're doing, where they stand, what
   they hold, and the shape of the last few weeks. Percentages only. Used
   on your Profile, friends' profiles, the public page and the share image. */
export function PortfolioCard({ name, username, mascot, ytd, rank, n, top, spark, score, style, streak, compact = false, onClick }) {
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
export function Standing({ social, ytd, benchLabel, avatars, onClick }) {
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
export function HoldingsPreview({ active, cur, fx, onOpen, limit = 5 }) {
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

/* Small select for choosing the benchmark; "Custom…" lets you type any
   ticker the price source knows (e.g. VT, EUNL.DE, ^OMXS30). */
export function BenchPicker({ value, onChange, dark }) {
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

export function PeriodReturns({ active, cur, liveValue, liveCost, bench: BENCH, onBench, onYtd, bare }) {
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
export function OnboardingCard({ user, active, data, onImport, onAddManually, goFriends, onDismiss }) {
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

export function ScoreCard({ active, cur, fx, liveValue, liveCost, log, onLog }) {
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
export function FriendsBenchmark({ user, myYtd, benchYtd, benchLabel, onGoFriends, onSummary, hidden }) {
  const [rows, setRows] = useState(null); // [{userId, name, ret}]
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [{ data: out }, { data: inc }, { data: board }] = await withTimeout(Promise.all([
          supabase.from("friends").select("friend_id").eq("user_id", user.id),
          supabase.from("friends").select("user_id").eq("friend_id", user.id),
          supabase.from("leaderboard").select("user_id, name, return_pct, profile"),
        ]), 10000, [{ data: [] }, { data: [] }, { data: [] }]);
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

export function MoversCard({ active, cur, fx }) {
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

export const ALLOC_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#0ea5e9", "#ec4899", "#8b5cf6", "#14b8a6", "#94a3b8"];

export function AllocationCard({ active, cur, fx }) {
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

/* ================= GOALS ================= */
export function GoalsSection({ goals, allValue, cur, onAdd, onUpdate, onRemove }) {
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

export function GoalModal({ goal, cur, onClose, onSave }) {
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

export function PerformanceChart({ holdings, cur, liveValue, liveCost, bench: BENCH = DEFAULT_BENCH, onBench, height = 256, compact = false, initialRange = "1mo", onExpand }) {
  const open = true;
  const [range, setRange] = useState(initialRange);
  const [pts, setPts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [compare, setCompare] = useState(false);   // overlay S&P 500
  const [reloadKey, setReloadKey] = useState(0);   // bumps to refetch after an error
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
        const { data, error } = await withTimeout(supabase.functions.invoke("portfolio-history", { body }), 20000, { data: null, error: new Error("timeout") });
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
  }, [open, range, holdingsKey(holdings, cur), reloadKey]); // key, not the array: price refreshes must not refetch

  const intraday = range === "1d" || range === "1w";
  const fmtTick = (t) => {
    const d = new Date(t);
    if (range === "1d") return fmtTime(d);
    if (range === "1w") return fmtDate(d, { weekday: "short" });
    return fmtDate(d);
  };

  /* The history service returns 0 for days before the first buy date. Those
     days are "no portfolio yet", not "worth nothing" — start the chart at the
     earliest real valuation instead of drawing a €0 / −100% floor. */
  const rawChart = (pts || []).map((p) => ({ t: p.t, value: p.value, cost: p.cost }));
  const firstLive = rawChart.findIndex((p) => p.value > 0);
  const chart = firstLive > 0 ? rawChart.slice(firstLive) : (firstLive === 0 ? rawChart : []);
  const trimmedStart = firstLive > 0;
  if (chart.length && liveValue > 0) {
    chart.push({ t: new Date().toISOString(), value: Math.round(liveValue * 100) / 100, cost: liveCost });
  } else if (!chart.length && liveValue > 0 && pts) {
    chart.push({ t: new Date().toISOString(), value: Math.round(liveValue * 100) / 100, cost: liveCost });
  }
  const spanDays = chart.length > 1 ? (new Date(chart[chart.length - 1].t) - new Date(chart[0].t)) / 86400000 : 0;
  const shortHistory = !loading && !err && pts && spanDays < 2;

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
  const youngerThanRange = trimmedStart && range !== "all";
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
        {(loading || err || !chart.length) ? (
          <div className="text-sm text-slate-400 mt-0.5">{loading ? "Loading history…" : err ? "" : sub}</div>
        ) : (
        <div className={`text-sm font-semibold flex items-center gap-1 mt-0.5 tabular-nums ${up ? "text-emerald-600" : "text-rose-500"}`}>
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {up ? "+" : "−"}{money(Math.abs(diff), cur)} ({pct(diffPct)})
          <span className="text-slate-400 font-normal ml-1">{sub}</span>
        </div>
        )}
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
        <div className="h-full flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-semibold text-slate-600">History unavailable</p>
          <p className="text-xs text-slate-400 mt-1">{/unreachable|network|fetch|timeout/i.test(String(err)) ? "Check your connection and try again." : err}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className="btn-secondary mt-3 text-xs h-8">Retry</button>
        </div>
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

    {shortHistory && (
      <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 mt-2 leading-snug">
        Your history starts {chart.length ? fmtDate(chart[0].t) : "today"}. Positions imported without a purchase date are dated today — set the real buy dates (Holdings › tap a position › edit) and the chart will reconstruct the months before.
      </p>
    )}
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

export function PortfolioHistorySheet({ open, onClose, holdings, cur, liveValue, liveCost, hex, bench, onBench }) {
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

/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { Activity, ExternalLink, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { ThesesTab } from "./research.jsx";
import { fmtDateTime, fxConvert } from "../lib/format.js";
import { aiFetch } from "../lib/storage.js";
import { MetricCard } from "../ui/primitives.jsx";

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
export function InsightsTab({ active, totals, cur, fx, say, analysis, onSave, news, onSaveNews, onVerdict }) {
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
      const res = await aiFetch("/api/openai", {
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
        const res = await aiFetch("/api/openai", {
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
export function RiskView({ analysis, busy, onAnalyze }) {
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
export const IMPACT = {
  positive: { chip: "bg-emerald-100 text-emerald-700", label: "Positive", icon: TrendingUp },
  negative: { chip: "bg-rose-100 text-rose-600", label: "Negative", icon: TrendingDown },
  mixed:    { chip: "bg-slate-200 text-slate-600", label: "Mixed", icon: Activity },
};

export function NewsView({ news, busy, onFetch }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {news ? (
            <>Scanned {fmtDateTime(news.at)}{Date.now() - new Date(news.at).getTime() > 3 * 86400000 && <span className="text-amber-600 font-semibold"> · out of date</span>}</>
          ) : "News affecting your holdings"}
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

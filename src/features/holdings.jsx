/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, MessageCircle, Minus, MoreHorizontal, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { supabase } from "../supabase";
import { ImportModal } from "./import.jsx";
import { PriceChart } from "./research.jsx";
import { StockSocial } from "./sentiment.jsx";
import { CURRENCIES, DEFAULT_FX, TYPES, daysHeld, fmtDate, fxConvert, money, moneyShort, pct, round6, sym, uid } from "../lib/format.js";
import { VERDICTS, byValueDesc, exchangeOf, holdingValue, isFund, portfolioTotals } from "../lib/portfolio.js";
import { aiFetch } from "../lib/storage.js";
import { AsyncConfirm, BottomSheet, Logo, Ret, RowMenu, Stepper, SwipeRow } from "../ui/primitives.jsx";

/* ================= POSITIONS ================= */
export function PositionsTab({ active, cur, fx, companyInfo, onSaveInfo, onUpsert, onRemove, onSetPrice, onLoadSample, onClosePosition,
  onEditFields, onSetShares, onAddShares, onRemoveMany, onSell, say, watchlist, onRemoveWatch, onSetWatchPrice, goResearch, openImport, onImportOpened }) {
  const [editing, setEditing] = useState(null);
  const [quick, setQuick] = useState(null);      // holding in the quick edit sheet
  const [shares, setSharesUi] = useState(null);  // { h, mode: "add" | "reduce" }
  const [confirm, setConfirm] = useState(null);  // { text, label, onYes }
  const [swipeOpen, setSwipeOpen] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const live = (h) => active.holdings.find((x) => x.id === h.id) || null;
  /* Every delete goes through the cloud first (onRemove resolves only once the
     server confirmed); the dialog shows progress and any error itself. */
  const askDelete = (h, after) => setConfirm({
    text: `Delete ${h.ticker} from your portfolio?`, label: "Delete",
    onYes: async () => { await onRemove(h.id); setConfirm(null); setSwipeOpen(null); if (after) after(); say && say(`${h.ticker} removed.`); },
  });
  const [clearing, setClearing] = useState(false);
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
        {view === "holdings" && editMode ? (
          <button onClick={() => setEditMode(false)} className="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-full">Done</button>
        ) : view === "holdings" && (
          <div className="flex gap-2">
            {active.holdings.length > 1 && (
              <button onClick={() => { setEditMode(true); setSwipeOpen(null); }} aria-label="Edit portfolio" title="Edit portfolio"
                className="w-9 h-9 flex items-center justify-center bg-white border border-slate-200 text-slate-600 rounded-full shadow-sm">
                <SlidersHorizontal size={16} />
              </button>
            )}
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
            <button disabled={clearing} onClick={async () => { setClearing(true); try { await onRemoveMany(active.holdings.filter((h) => h.sample).map((h) => h.id)); } catch (e) { say && say(e.message); } finally { setClearing(false); } }}
              className="shrink-0 bg-white border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50">
              {clearing ? "Clearing…" : "Clear"}
            </button>
          </div>
        )}
        {editMode ? (
          <EditPortfolio holdings={active.holdings} cur={cur} fx={fx} onEditFields={onEditFields} onRemoveMany={onRemoveMany}
            onConfirm={setConfirm} onDone={() => setEditMode(false)} />
        ) : (<>
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400 tabular-nums">{active.holdings.length} positions · {money(totalValue, cur)}</div>
          <button onClick={() => setDense((v) => !v)} className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">{dense ? "Show details" : "Compact"}</button>
        </div>
        <div className="card-tight divide-y divide-slate-100 !py-1 overflow-hidden">
          {byValueDesc(active.holdings, cur, fx).map((h) => (
            <SwipeRow key={h.id} open={swipeOpen === h.id} onOpen={() => setSwipeOpen(h.id)} onClose={() => setSwipeOpen((v) => (v === h.id ? null : v))}
              actions={[
                { label: "Edit", tone: "bg-slate-700 text-white", onClick: () => { setSwipeOpen(null); setQuick(h); } },
                { label: "Delete", tone: "bg-rose-500 text-white", onClick: () => askDelete(h) },
              ]}>
              <PositionCard h={h} cur={cur} fx={fx} onOpen={() => (swipeOpen ? setSwipeOpen(null) : setQuick(h))}
                weight={totalValue > 0 ? (holdingValue(h, cur, fx) / totalValue) * 100 : 0} expanded={!dense}
                onEdit={() => setQuick(h)} onRemove={() => askDelete(h)} onSetPrice={onSetPrice}
                menu={[
                  { label: "Edit", icon: Pencil, onClick: () => setQuick(h) },
                  { label: "Add shares", icon: Plus, onClick: () => setSharesUi({ h, mode: "add" }) },
                  { label: "Reduce shares", icon: Minus, onClick: () => setSharesUi({ h, mode: "reduce" }) },
                  { label: "Details & discussion", icon: MessageCircle, onClick: () => setDetail(h) },
                  { label: "Delete", icon: Trash2, danger: true, onClick: () => askDelete(h) },
                ]} />
            </SwipeRow>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 text-center">Tap a position to edit it · swipe left for Edit / Delete</p>
        </>)}
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

      {quick && live(quick) && (
        <QuickEditSheet h={live(quick)} cur={cur} fx={fx}
          onSave={(fields) => { onEditFields(quick.id, fields); setQuick(null); say && say(`${quick.ticker} updated.`); }}
          onRemove={() => askDelete(quick, () => setQuick(null))}
          onZero={() => setConfirm({ text: `Remove ${quick.ticker} entirely?`, label: "Remove", onYes: async () => { await onRemove(quick.id); setConfirm(null); setQuick(null); say && say(`${quick.ticker} removed.`); } })}
          onAdd={() => setSharesUi({ h: quick, mode: "add" })} onReduce={() => setSharesUi({ h: quick, mode: "reduce" })}
          onDetails={() => { setDetail(quick); setQuick(null); }}
          onClose={() => setQuick(null)} />
      )}
      {shares && live(shares.h) && (
        <SharesSheet h={live(shares.h)} mode={shares.mode} cur={cur}
          onAdd={(n, price) => { onAddShares(shares.h.id, n, price); setSharesUi(null); say && say(`Added ${n} ${shares.h.ticker}.`); }}
          onReduce={(n, price, asSale) => {
            const h = live(shares.h); const left = round6(Number(h.shares) - n);
            const apply = async () => { if (asSale) onSell(h.id, n, price, new Date().toISOString().slice(0, 10)); else if (left > 0) onSetShares(h.id, left); else await onRemove(h.id); setSharesUi(null); setConfirm(null); say && say(left > 0 ? `${h.ticker}: now ${left} shares.` : `${h.ticker} removed.`); };
            if (left > 0) apply(); else setConfirm({ text: `Remove ${h.ticker} entirely?`, label: "Remove", onYes: apply });
          }}
          onClose={() => setSharesUi(null)} />
      )}
      {confirm && <AsyncConfirm text={confirm.text} label={confirm.label} onCancel={() => setConfirm(null)} action={confirm.onYes} />}

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
export function WatchCard({ w, cur, onBuy, onRemove, onSetPrice }) {
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

export function PositionCard({ h, cur, fx, onOpen, onEdit, onRemove, onSetPrice, weight = null, expanded = false, menu = null }) {
  const [editPrice, setEditPrice] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null); // button rect while open
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
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-xs text-slate-400 truncate">{h.name}</div>
            {weight != null && <div className="text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">{weight.toFixed(1)}%</div>}
          </div>
          {weight != null && (
            <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-800 rounded-full" style={{ width: `${Math.min(100, weight)}%` }} /></div>
          )}
        </div>
        <div className="text-right shrink-0 w-24">
          <div className="font-bold text-slate-900 text-[15px] tabular-nums leading-tight">{money(value, cur)}</div>
          <Ret v={plPct} className="text-xs font-bold block mt-0.5" />
        </div>
        {menu && (
          <div className="relative shrink-0 -mr-1.5">
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => (v ? null : e.currentTarget.getBoundingClientRect())); }} aria-label={`More actions for ${h.ticker}`} aria-haspopup="menu"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 active:bg-slate-100"><MoreHorizontal size={18} /></button>
            {menuOpen && <RowMenu items={menu} anchor={menuOpen} onClose={() => setMenuOpen(null)} />}
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-2.5 ml-[52px] flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500 tabular-nums">
            {h.shares} × {money(h.buyPrice, hc)} → <button onClick={(e) => { e.stopPropagation(); setEditPrice(true); }} className="font-semibold text-slate-700 underline decoration-dotted">{money(cp, hc)}</button>
            <span className="text-slate-400"> · {up ? "+" : "−"}{money(Math.abs(pl), cur)} · {daysHeld(h.buyDate)}d · {h.type}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded ${V.chip}`}><V.icon size={10} /> {V.label}</span>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={`Edit ${h.ticker}`} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"><Pencil size={12} /></button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label={`Remove ${h.ticker}`} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
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

/* Tap a holding → change shares, price, date, currency; delete at the bottom. */
export function QuickEditSheet({ h, cur, fx, onSave, onRemove, onZero, onAdd, onReduce, onDetails, onClose }) {
  const hc = h.currency || cur;
  const [f, setF] = useState({ shares: Number(h.shares) || 0, buyPrice: Number(h.buyPrice) || 0, buyDate: h.buyDate || "", currency: hc });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const cp = h.currentPrice > 0 ? h.currentPrice : Number(f.buyPrice);
  const value = fxConvert(Number(f.shares) * cp, f.currency, cur, fx);
  const ret = Number(f.buyPrice) > 0 ? ((cp - Number(f.buyPrice)) / Number(f.buyPrice)) * 100 : 0;
  const dirty = round6(f.shares) !== round6(h.shares) || Number(f.buyPrice) !== Number(h.buyPrice) || (f.buyDate || "") !== (h.buyDate || "") || f.currency !== hc;
  const zero = round6(f.shares) <= 0;
  const save = () => {
    if (zero) { onZero(); return; }
    onSave({ shares: f.shares, buyPrice: Number(f.buyPrice) || 0, buyDate: f.buyDate || undefined, currency: f.currency });
  };
  const field = "w-full h-11 border border-slate-200 rounded-xl px-3 text-sm bg-white outline-none focus:border-emerald-400 tabular-nums";
  return (
    <BottomSheet title={`Edit ${h.ticker}`} onClose={onClose}>
      <div className="px-5 pb-5 space-y-4">
        <div className="flex items-center gap-3">
          <Logo h={h} size={40} rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-700 truncate">{h.name || h.ticker}</div>
            <div className="text-[11px] text-slate-400">Current: {h.shares} share{Number(h.shares) === 1 ? "" : "s"}{h.currentPrice > 0 ? ` · now ${money(h.currentPrice, hc)}` : ""}</div>
          </div>
          <button onClick={onDetails} className="text-xs font-semibold text-emerald-700 shrink-0">Details →</button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold text-slate-400 tracking-wide">SHARES</label>
            <div className="flex gap-3 text-[11px] font-semibold">
              <button onClick={onAdd} className="text-emerald-700">Bought more</button>
              <button onClick={onReduce} className="text-slate-500">Sold some</button>
            </div>
          </div>
          <Stepper value={f.shares} onChange={(n) => set("shares", n)} />
          {zero && <p className="text-[11px] text-rose-600 mt-1.5">0 shares — saving will remove {h.ticker} from your portfolio.</p>}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 tracking-wide mb-1.5">AVG. BUY PRICE ({f.currency})</label>
            <input type="number" inputMode="decimal" step="any" value={f.buyPrice} onChange={(e) => set("buyPrice", e.target.value)} aria-label="Average buy price" className={field} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 tracking-wide mb-1.5">BUY DATE</label>
            <input type="date" value={f.buyDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("buyDate", e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 tracking-wide mb-1.5">CURRENCY</label>
            <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={field}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              {!CURRENCIES.some((c) => c.code === f.currency) && <option value={f.currency}>{f.currency}</option>}
            </select>
          </div>
          <div className="self-end text-right text-[12px] text-slate-500 tabular-nums pb-2.5">
            {f.shares} × {money(cp, f.currency)} = <b className="text-slate-800">{money(value, cur)}</b>
            {Number(f.buyPrice) > 0 && <div><Ret v={ret} className="font-bold" /></div>}
          </div>
        </div>

        <button onClick={save} disabled={!dirty} className={`w-full h-12 rounded-xl text-sm font-bold ${zero ? "bg-rose-600 text-white" : "btn-primary"} disabled:opacity-40`}>
          {zero ? `Remove ${h.ticker}` : dirty ? "Save changes" : "No changes"}
        </button>
        <button onClick={onRemove} className="w-full h-10 text-sm font-semibold text-rose-600 flex items-center justify-center gap-1.5"><Trash2 size={14} /> Delete holding</button>
      </div>
    </BottomSheet>
  );
}

/* Very fast quantity change: NVDA · Current: 20 shares · [ − ] 5 [ + ] */
export function SharesSheet({ h, mode, cur, onAdd, onReduce, onClose }) {
  const hc = h.currency || cur;
  const have = Number(h.shares) || 0;
  const [n, setN] = useState(1);
  const [price, setPrice] = useState(h.currentPrice > 0 ? h.currentPrice : Number(h.buyPrice) || "");
  const [asSale, setAsSale] = useState(true);
  const add = mode === "add";
  const qty = add ? Math.max(0, n) : Math.min(have, Math.max(0, n));
  const after = round6(add ? have + qty : have - qty);
  const p = Number(price);
  const avgAfter = add && qty > 0 && p > 0 ? (have * Number(h.buyPrice) + qty * p) / (have + qty) : Number(h.buyPrice);
  const ok = qty > 0 && (add ? p > 0 : (!asSale || p > 0));
  return (
    <BottomSheet title={add ? "Add shares" : "Reduce shares"} onClose={onClose}>
      <div className="px-5 pb-5 space-y-4">
        <div className="flex items-center gap-3">
          <Logo h={h} size={40} rounded="rounded-xl" />
          <div className="min-w-0">
            <div className="font-bold text-slate-900">{h.ticker}</div>
            <div className="text-[12px] text-slate-500">Current: <b className="text-slate-700">{have} share{have === 1 ? "" : "s"}</b> · avg. {money(h.buyPrice, hc)}</div>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-400 tracking-wide mb-1.5">{add ? "SHARES BOUGHT" : "SHARES TO REMOVE"}</label>
          <div className="flex items-center gap-3">
            <Stepper value={n} onChange={setN} ariaLabel={add ? "Shares bought" : "Shares to remove"} />
            {!add && <button onClick={() => setN(have)} className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 h-8 rounded-lg">All</button>}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-400 tracking-wide mb-1.5">{add ? "PRICE PAID PER SHARE" : "SELL PRICE"} ({hc})</label>
          <input type="number" inputMode="decimal" step="any" value={price} onChange={(e) => setPrice(e.target.value)}
            aria-label={add ? "Price paid per share" : "Sell price"}
            className="w-full h-11 border border-slate-200 rounded-xl px-3 text-sm bg-white outline-none focus:border-emerald-400 tabular-nums" />
        </div>
        {!add && (
          <label className="flex items-center gap-2.5 text-[13px] text-slate-700">
            <input type="checkbox" checked={asSale} onChange={(e) => setAsSale(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            Record as a sale <span className="text-slate-400 text-[11px]">(counts toward realized return)</span>
          </label>
        )}
        <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-[12px] text-slate-600 tabular-nums">
          → <b className="text-slate-800">{after} share{after === 1 ? "" : "s"}</b>{add && p > 0 ? <> · avg. {money(avgAfter, hc)}</> : null}
          {!add && after <= 0 && <span className="text-rose-600 font-semibold"> · removes {h.ticker} from your portfolio</span>}
        </div>
        <button disabled={!ok} onClick={() => (add ? onAdd(qty, p) : onReduce(qty, p, asSale))}
          className={`w-full h-12 rounded-xl text-sm font-bold disabled:opacity-40 ${!add && after <= 0 ? "bg-rose-600 text-white" : "btn-primary"}`}>
          {add ? `Add ${qty} ${h.ticker}` : after <= 0 ? `Remove ${h.ticker}` : `Reduce by ${qty}`}
        </button>
      </div>
    </BottomSheet>
  );
}

/* Edit Portfolio mode: many holdings on one screen — quantities, prices,
   multi-select delete. Row order is frozen while editing so nothing jumps. */
export function EditPortfolio({ holdings, cur, fx, onEditFields, onRemoveMany, onConfirm, onDone }) {
  const orderRef = useRef(byValueDesc(holdings, cur, fx).map((h) => h.id));
  const [sel, setSel] = useState(() => new Set());
  const rows = orderRef.current.map((id) => holdings.find((h) => h.id === id)).filter(Boolean);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const totals = portfolioTotals(holdings, cur, fx);
  const delSel = () => {
    const ids = [...sel].filter((id) => holdings.some((h) => h.id === id));
    if (!ids.length) return;
    const names = ids.map((id) => holdings.find((h) => h.id === id).ticker);
    onConfirm({ text: ids.length === 1 ? `Delete ${names[0]} from your portfolio?` : `Delete ${ids.length} holdings (${names.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""})?`, label: "Delete",
      onYes: async () => { await onRemoveMany(ids); setSel(new Set()); onConfirm(null); } });
  };
  const zeroRow = (h) => onConfirm({ text: `Remove ${h.ticker} entirely?`, label: "Remove", onYes: async () => { await onRemoveMany([h.id]); onConfirm(null); } });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
        <span>{holdings.length} positions · {money(totals.value, cur)}</span>
        <button onClick={() => setSel(sel.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} className="font-semibold text-slate-500">{sel.size === rows.length ? "Select none" : "Select all"}</button>
      </div>
      <div className="card-tight divide-y divide-slate-100 !py-1">
        {rows.map((h) => {
          const hc = h.currency || cur;
          return (
            <div key={h.id} className="py-2.5 flex items-center gap-2">
              <input type="checkbox" checked={sel.has(h.id)} onChange={() => toggle(h.id)} aria-label={`Select ${h.ticker}`} className="w-[18px] h-[18px] accent-emerald-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 text-[13px] leading-tight truncate">{h.ticker}</div>
                <div className="text-[10px] text-slate-400 truncate tabular-nums">{moneyShort(holdingValue(h, cur, fx), cur)}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Stepper size="sm" value={Number(h.shares)} ariaLabel={`${h.ticker} shares`}
                  onChange={(n) => { if (n > 0) onEditFields(h.id, { shares: n }); else zeroRow(h); }} />
                <input type="number" inputMode="decimal" step="any" defaultValue={h.buyPrice} key={h.id + h.buyPrice} aria-label={`${h.ticker} average price`}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (v >= 0 && v !== Number(h.buyPrice)) onEditFields(h.id, { buyPrice: v }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} title={`Avg. price (${hc})`}
                  className="h-9 w-[4.25rem] text-sm text-right tabular-nums border border-slate-200 rounded-xl px-2 bg-white outline-none focus:border-emerald-400" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-[4.75rem] z-30 flex gap-2">
        <button onClick={delSel} disabled={!sel.size} className="flex-1 h-11 rounded-xl bg-rose-600 text-white text-sm font-bold shadow disabled:opacity-40 disabled:shadow-none">
          Delete{sel.size ? ` ${sel.size}` : ""} selected
        </button>
        <button onClick={onDone} className="h-11 px-5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold shadow-sm">Done</button>
      </div>
      <p className="text-[11px] text-slate-400 text-center">Changes save instantly. Shares · avg. price per row.</p>
    </div>
  );
}

export function PositionModal({ holding, cur, fx = null, holdings = [], onClose, onSave, title }) {
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
                  {(holdings || []).some((h) => !h.sample) && (
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

/* ================= POSITION DETAIL ================= */
/* Tap a position → what the company actually does, in plain language.
   The description is AI-written once per ticker and cached, so it's
   instant (and free) on every later open.                              */
export function DetailSheet({ h, cur, fx, info, onSaveInfo, onClosePosition, onClose }) {
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
              <span className="text-[10px] font-semibold text-slate-400">VALUE ({cur}) · {daysHeld(h.buyDate)} DAY{daysHeld(h.buyDate) === 1 ? "" : "S"} HELD</span>
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

/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { ChevronLeft, ExternalLink, Lock, Share2, X } from "lucide-react";
import { PortfolioCard } from "./home.jsx";
import { CallsList } from "./sentiment.jsx";
import { eventText } from "./social.jsx";
import { CURRENCIES, DEFAULT_FX, fmtDateTime, pct, timeAgo, withTimeout } from "../lib/format.js";
import { PROFILES, SCORE_LABEL, SHARE_ITEMS, byValueDesc, holdingValue, profileOf, publishBoard, scoreTone, shareOf } from "../lib/portfolio.js";
import { Avatar, Ret, Skeleton } from "../ui/primitives.jsx";

/* ================= PROFILE ================= */
export const TAB_LABEL = { portfolio: "Home", research: "Discover", groups: "Communities", friends: "Friends", profile: "Profile" };

export function OwnPortfolioCard({ user, data, active, cur }) {
  const [row, setRow] = useState(null);
  const [rank, setRank] = useState({ rank: null, n: null });
  useEffect(() => {
    let dead = false;
    (async () => {
      const [{ data: me }, { data: out }, { data: inc }, { data: board }] = await withTimeout(Promise.all([
        supabase.from("leaderboard").select("return_pct, top_holdings, score, spark").eq("user_id", user.id).maybeSingle(),
        supabase.from("friends").select("friend_id").eq("user_id", user.id),
        supabase.from("friends").select("user_id").eq("friend_id", user.id),
        supabase.from("leaderboard").select("user_id, return_pct"),
      ]), 10000, [{ data: null }, { data: [] }, { data: [] }, { data: [] }]);
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

export function ProfileTab({ data, user, say, onName, onUsername, cur, onCurrency, onProfile, onPhilosophy, onShare, active, totals, onBack, backLabel, onSignOut }) {
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

/* ================= PROFILE SHEET ================= */
/* Tapping a leaderboard entry opens this: badge, philosophy, unrealized +
   realized return, win rate, average hold, and top-10 allocation. */
export function ProfileSheet({ r, me, mine = null, latest = null, onClose }) {
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

/* ================= SHARE CARD (PNG) ================= */
/* Draws an "investing card" on a canvas — percentages only — and hands it
   to the phone's share sheet (WhatsApp, Instagram, Discord…) or downloads
   it. Everything is computed on-device from what the user already shares. */
export async function buildShareCardBlob({ username, name, mascot, ytd, rank, n, holdings, top, score, isPublic, style, spark }) {
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

export function roundRect(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

/* Gather what the card needs (my published row + rank among mutual
   friends), draw it, and share/download. */
export async function shareProfileCard({ user, data, active, cur, fx, say, setPreview }) {
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
export function ShareCardPreview({ url, username, onClose }) {
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
  const [p, setP] = useState(undefined); // undefined loading, null private/missing, false = couldn't load
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let dead = false;
    setP(undefined);
    withTimeout(supabase.rpc("get_public_profile", { uname: username }), 12000).then(({ data, error }) => {
      if (dead) return;
      setP(error ? false : (data || null));
    });
    return () => { dead = true; };
  }, [username, tries]);

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

  if (p === undefined) return shell(<div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100" aria-busy="true"><div className="skel h-5 w-1/2 mb-3" /><div className="skel h-3 w-2/3 mb-2" /><div className="skel h-3 w-1/2" /></div>);
  if (p === false) return shell(
    <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
      <p className="font-semibold text-slate-600">Couldn't load this profile</p>
      <p className="text-sm text-slate-400 mt-1">Check your connection and try again.</p>
      <button onClick={() => setTries((t) => t + 1)} className="btn-secondary mt-4 text-xs">Retry</button>
    </div>
  );
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

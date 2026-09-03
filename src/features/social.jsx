/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { supabase } from "../supabase";
import { useEffect, useState } from "react";
import { TICKER_RE } from "../lib/format.js";

/* ================= SOCIAL LAYER ================= */
/* Portfolio = identity, activity = content, opinions = discussion,
   performance = reputation, chat connects everything.
   Buy/Hold/Sell is community sentiment — an opinion, never advice.
   Votes and discussions are visible to every signed-in RichR user
   (tables stock_calls / stock_posts); portfolio numbers stay
   mutual-friends-only exactly as before. */

export const SOCIAL_ME = { id: null, username: "", holdings: new Set() };   // holdings: tickers I hold (any portfolio) — a badge, never a vote weight
export const ownsTicker = (t) => SOCIAL_ME.holdings.has(String(t || "").toUpperCase());

/* Mutual-friend ids, cached for a minute so every card doesn't re-query. */
export const _mutual = { at: 0, for: null, ids: [] };

export async function mutualIdsCached(userId) {
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
export const NAME_CACHE = {
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

export function useNames(ids) {
  const [names, setNames] = useState({ ...NAME_CACHE.m });
  const key = (ids || []).filter(Boolean).sort().join(",");
  useEffect(() => {
    let dead = false;
    NAME_CACHE.ensure(ids || []).then((m) => { if (!dead) setNames({ ...m }); });
    return () => { dead = true; };
  }, [key]);
  return names;
}

export const REACTIONS = ["👍", "🚀", "🤔", "🔥"];

/* One sentence per feed event — shared by the Activity feed and the
   leaderboard's "latest update" line. */
export function eventText(e) {
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

/* Mutual friends = people in my list who also have me in theirs. */
export async function loadMutualFriends(userId) {
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
export function PostBody({ text, onTicker }) {
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

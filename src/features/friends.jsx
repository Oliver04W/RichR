/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Check, ChevronRight, Clock, Lock, Plus, RefreshCw, Share2, Trophy, Users } from "lucide-react";
import { ActivityFeed } from "./feed.jsx";
import { ProfileSheet } from "./profile.jsx";
import { eventText } from "./social.jsx";
import { pct, timeAgo, withTimeout } from "../lib/format.js";
import { SHARE_ITEMS, profileOf, publishBoard, scoreTone, shareOf } from "../lib/portfolio.js";
import { Avatar, Ret, Skeleton } from "../ui/primitives.jsx";

/* ================= FRIENDS ================= */
export function FriendsTab({ data, active, totals, cur, say, user, onEditSharing, onOpenTicker, onBoardRanks }) {
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
      const { data: fr, error: fErr } = await withTimeout(supabase
        .from("friends").select("friend_id").eq("user_id", user.id));
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
      const { data: rows, error: bErr } = await withTimeout(supabase
        .from("leaderboard")
        .select("user_id, name, profile, portfolio, return_pct, holdings, top_holdings, realized_pct, avg_days, win_rate, philosophy, score, score_parts, spark")
        .order("return_pct", { ascending: false, nullsFirst: false })
        .limit(100));
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
    if (!data.userName.trim()) { say("Set your name in Profile before sharing."); return; }
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
              : "Add a position on Home first — there's nothing to share yet."}
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
            Set your username in Profile first so friends can add you back.
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
                            <div className="text-sm font-semibold text-slate-700 truncate">{f.username === "unknown" ? <span className="text-slate-400 font-medium">No username yet</span> : `@${f.username}`}</div>
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
                          <div className="text-sm font-semibold text-slate-700 truncate">{f.username === "unknown" ? <span className="text-slate-400 font-medium">No username yet</span> : `@${f.username}`}</div>
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

export function FriendsSwitcher({ view, setView }) {
  return (
    <div className="bg-slate-100 rounded-xl p-1 flex">
      {[["board", "Leaderboard"], ["activity", "Activity"]].map(([id, lbl]) => (
        <button key={id} onClick={() => setView(id)}
          className={`flex-1 text-[13px] font-semibold py-1.5 rounded-lg transition ${view === id ? "bg-white text-slate-800" : "text-slate-500"}`}>{lbl}</button>
      ))}
    </div>
  );
}

/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { Briefcase, Check, ChevronLeft, ChevronRight, CornerDownRight, Lock, LogOut, MessageCircle, Plus, Search, Send, Share2, Trash2, UserPlus, Users, UsersRound, X } from "lucide-react";
import { CardPicker, ChatCard } from "./feed.jsx";
import { OwnerBadge, STALE_DAYS, SentimentBar, VOTE_META, activeCalls, castVote } from "./sentiment.jsx";
import { PostBody, REACTIONS, loadMutualFriends } from "./social.jsx";
import { daysOld, extractTickers, fmtDate, pct, timeAgo, withTimeout } from "../lib/format.js";
import { byValueDesc } from "../lib/portfolio.js";
import { Avatar, BottomSheet, Logo, Ret, Skeleton } from "../ui/primitives.jsx";

/* Where a post/poll goes: one of your communities, or a stock's discussion. */
export function useMyCommunities(userId) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let dead = false;
    supabase.rpc("my_communities").then(({ data }) => { if (!dead) setList(Array.isArray(data) ? data : []); });
    return () => { dead = true; };
  }, [userId]);
  return list;
}

/* ================= COMMUNITIES: PUBLIC 🌐 / PRIVATE 🔒 ================= */
/* Public   = discover new investors and discussions (searchable, joinable).
   Private  = your own group (invisible to non-members; invite links).
   "request" is reserved for 🛡️ Request to join — treated like public for
   discovery, but never self-joinable. Privacy is enforced by RLS/RPCs
   (see 20260903_public_private_communities.sql); the client only decides
   what to show. */
export const VIS_META = {
  public:  { icon: "🌐", label: "Public",  blurb: "Anyone can find, view and join this community.", chip: "bg-sky-50 text-sky-700 border-sky-100" },
  private: { icon: "🔒", label: "Private", blurb: "Only invited members can find and access this community.", chip: "bg-slate-100 text-slate-600 border-slate-200" },
  request: { icon: "🛡️", label: "Request to join", blurb: "Anyone can find it; an admin approves who joins.", chip: "bg-amber-50 text-amber-700 border-amber-100" },
};

export const visOf = (g) => VIS_META[(g && g.visibility) || "private"] || VIS_META.private;

export const isDiscoverable = (g) => !!g && g.visibility !== "private";

export const canSelfJoin = (g) => !!g && g.visibility === "public";

export function VisChip({ visibility, size = "xs", className = "" }) {
  const m = VIS_META[visibility] || VIS_META.private;
  return <span className={`inline-flex items-center gap-1 border rounded-full font-bold ${size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5"} ${m.chip} ${className}`}>{m.icon} {m.label}</span>;
}

/* Comma / space separated "NVDA, tsm ai" → ["NVDA","TSM","AI"] (max 8, ≤16 chars each). */
export const parseTopics = (text) => [...new Set(String(text || "").split(/[,\s]+/).map((t) => t.trim().toUpperCase().replace(/^\$/, "")).filter((t) => t && t.length <= 16))].slice(0, 8);

/* Client-side filter for lists we already hold (name, description, topics, ticker prefix). */
export const communityMatches = (g, q) => {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  return String(g.name || "").toLowerCase().includes(s) || String(g.description || "").toLowerCase().includes(s)
    || (Array.isArray(g.topics) && g.topics.some((t) => String(t).toLowerCase().startsWith(s)));
};

export const inviteUrl = (code) => `${typeof window !== "undefined" ? window.location.origin : "https://rich-r.vercel.app"}/?invite=${code}`;

export const fmtMembers = (n) => `${Number(n || 0).toLocaleString()} member${Number(n) === 1 ? "" : "s"}`;

/* One community in a list: 🌐 AI & Semiconductors · 2,431 members · NVDA · TSM */
export function CommunityCard({ g, me, onOpen, onJoin, joining = false, trailing = null, subtitle = null }) {
  const m = visOf(g);
  const topics = Array.isArray(g.topics) ? g.topics.slice(0, 4) : [];
  const joined = g.joined || (Array.isArray(g.members) && g.members.includes(me));
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
      <div className="flex items-center">
        <button onClick={onOpen} className="flex-1 min-w-0 text-left p-4 flex items-center gap-3 active:bg-slate-50 rounded-l-2xl">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0 ${g.visibility === "public" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-600"}`}>
            {String(g.name || "?").trim().slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-slate-800 text-sm truncate">{g.name}</span>
              <span className="text-[11px] shrink-0" title={m.label}>{m.icon}</span>
            </div>
            <div className="text-xs text-slate-500 truncate">{subtitle != null ? subtitle : (g.description || `${m.icon} ${m.label} community`)}</div>
            <div className="text-[11px] text-slate-400 truncate tabular-nums mt-0.5">
              {fmtMembers(g.member_count != null ? g.member_count : (g.members || []).length)}{topics.length ? ` · ${topics.join(" · ")}` : ""}
            </div>
          </div>
        </button>
        {trailing !== null ? trailing : onJoin && !joined && canSelfJoin(g) ? (
          <button onClick={onJoin} disabled={joining} className="mr-3 shrink-0 h-9 px-4 rounded-full bg-slate-900 text-white text-xs font-bold disabled:opacity-50">{joining ? "…" : "Join"}</button>
        ) : joined && onJoin ? (
          <span className="mr-3 shrink-0 text-[11px] font-semibold text-emerald-700">Joined</span>
        ) : null}
      </div>
    </div>
  );
}

export function GroupsTab({ user, active, cur, fx, say, onOpenTicker, username, richrData = null, goFriends = null, inviteCode = null, onInviteDone = null }) {
  const [groups, setGroups] = useState(null);   // my communities [{id,name,visibility,…,members,lastPost}]
  const [open, setOpen] = useState(null);       // community being viewed (member or not)
  const [creating, setCreating] = useState(false);
  const [mutuals, setMutuals] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [confirmFor, setConfirmFor] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null); // search results (public only — the server never returns private ones)
  const [trending, setTrending] = useState(null);
  const [joining, setJoining] = useState(null);
  const searchTimer = useRef(null);

  const quickAction = async (g) => {
    const owner = g.created_by === user.id;
    const { error } = owner
      ? await supabase.from("groups").delete().eq("id", g.id)
      : await supabase.from("group_members").delete().match({ group_id: g.id, user_id: user.id });
    setMenuFor(null); setConfirmFor(null);
    if (error) { say(owner ? "Couldn't delete the community." : "Couldn't leave — try again."); return; }
    say(owner ? `Deleted “${g.name}”.` : `You left “${g.name}”.`);
    await loadGroups(); loadTrending();
  };

  const loadGroups = async () => {
    const guard = setTimeout(() => setGroups((g) => (g === null ? [] : g)), 12000);
    try {
      const { data: mine, error } = await withTimeout(supabase.rpc("my_communities"), 10000, { data: null, error: new Error("timeout") });
      if (error) throw error;
      const gs = Array.isArray(mine) ? mine : [];
      const ids = gs.map((g) => g.id);
      let members = [], last = [];
      if (ids.length) {
        const [{ data: m }, { data: l }] = await Promise.all([
          supabase.from("group_members").select("group_id, user_id").in("group_id", ids),
          supabase.from("group_posts").select("group_id, body, position, card, created_at, user_id").in("group_id", ids).is("parent_id", null).order("created_at", { ascending: false }).limit(200),
        ]);
        members = m || []; last = l || [];
      }
      setGroups(gs.map((g) => ({
        ...g,
        members: members.filter((m) => m.group_id === g.id).map((m) => m.user_id),
        lastPost: last.find((p) => p.group_id === g.id) || null,
      })).sort((a, b) => {
        const ta = a.lastPost ? new Date(a.lastPost.created_at).getTime() : new Date(a.created_at).getTime();
        const tb = b.lastPost ? new Date(b.lastPost.created_at).getTime() : new Date(b.created_at).getTime();
        return tb - ta;
      }));
    } catch (e) {
      console.error("RichR communities load failed:", e);
      setGroups([]);
    } finally { clearTimeout(guard); }
  };
  const loadTrending = async () => {
    const { data, error } = await withTimeout(supabase.rpc("search_communities", { q: "", lim: 12 }), 10000, { data: null, error: new Error("timeout") });
    setTrending(error || !Array.isArray(data) ? [] : data);
  };
  useEffect(() => { loadGroups(); loadTrending(); withTimeout(loadMutualFriends(user.id), 10000, []).then(setMutuals).catch(() => setMutuals([])); }, []);

  /* search: name, description, topics/tickers — server side, discoverable communities only */
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const s = q.trim();
    if (!s) { setResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      const { data, error } = await withTimeout(supabase.rpc("search_communities", { q: s, lim: 20 }), 10000, { data: null, error: new Error("timeout") });
      setResults(error || !Array.isArray(data) ? [] : data);
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [q]);

  const createGroup = async ({ name, visibility, description, topics, memberIds }) => {
    const { data: g, error } = await supabase.from("groups").insert({ name, created_by: user.id, visibility, description, topics })
      .select("id, name, created_by, created_at, visibility, description, topics").single();
    if (error || !g) { say("Couldn't create the community — try again."); return; }
    const { error: e1 } = await supabase.from("group_members").insert({ group_id: g.id, user_id: user.id, added_by: user.id });
    if (e1) { say("Couldn't join your own community — try again."); return; }
    if (memberIds.length) {
      const { error: e2 } = await supabase.from("group_members").insert(memberIds.map((id) => ({ group_id: g.id, user_id: id, added_by: user.id })));
      if (e2) say("Community created, but some friends couldn't be added (only mutual friends can be added directly).");
    }
    setCreating(false);
    await loadGroups(); loadTrending();
    setOpen({ ...g, members: [user.id, ...memberIds], member_count: 1 + memberIds.length, lastPost: null });
    say(visibility === "public" ? `“${name}” is live — anyone on RichR can find it.` : `“${name}” is ready — invite people with a link.`);
  };

  const join = async (g) => {
    setJoining(g.id);
    const { error } = await supabase.from("group_members").insert({ group_id: g.id, user_id: user.id, added_by: user.id });
    setJoining(null);
    if (error && error.code !== "23505") { say("Couldn't join — try again."); return false; }
    say(`You joined “${g.name}”.`);
    await loadGroups(); loadTrending();
    if (results) setResults((r) => (r || []).map((x) => (x.id === g.id ? { ...x, joined: true, member_count: Number(x.member_count || 0) + 1 } : x)));
    return true;
  };

  if (open) {
    return (
      <GroupChat group={open} user={user} active={active} cur={cur} fx={fx} say={say} username={username} richrData={richrData}
        mutuals={mutuals || []} onOpenTicker={onOpenTicker}
        onJoin={async () => { const ok = await join(open); if (ok) setOpen((g) => ({ ...g, members: [...(g.members || []), user.id] })); }}
        onBack={() => { setOpen(null); loadGroups(); }}
        onGroupChanged={(g) => { if (g) setOpen(g); else { setOpen(null); loadGroups(); loadTrending(); } }} />
    );
  }

  const mineIds = new Set((groups || []).map((g) => g.id));
  const discover = (trending || []).filter((g) => !mineIds.has(g.id) && !g.joined).slice(0, 6);
  const searching = q.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Communities</h2>
          <p className="text-sm text-slate-500 mt-0.5">Public ones to discover investors. Private ones for your own circle.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary shrink-0">
          <Plus size={15} /> New
        </button>
      </div>

      {/* search */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search public communities, topics or tickers"
          aria-label="Search communities"
          className="w-full h-11 pl-10 pr-9 rounded-2xl border border-slate-200 bg-white text-sm outline-none focus:border-emerald-400" />
        {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><X size={12} /></button>}
      </div>

      {searching ? (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-400 tracking-wide">🌐 PUBLIC COMMUNITIES</div>
          {results === null ? <Skeleton lines={3} /> : results.length === 0 ? (
            <div className="card text-sm text-slate-500">
              No public community matches “{q.trim()}”. <button onClick={() => setCreating(true)} className="font-semibold text-emerald-700">Start one →</button>
              <p className="text-[11px] text-slate-400 mt-1">Private communities never show up in search — you need an invite link.</p>
            </div>
          ) : results.map((g) => (
            <CommunityCard key={g.id} g={g} me={user.id} onOpen={() => setOpen({ ...g, members: null })} onJoin={() => join(g)} joining={joining === g.id} />
          ))}
        </div>
      ) : (<>
        {/* mine */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-400 tracking-wide">YOUR COMMUNITIES{groups && groups.length ? ` · ${groups.length}` : ""}</div>
          </div>
          {groups === null ? (
            <Skeleton lines={3} />
          ) : groups.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-100">
              <UsersRound size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700 mb-1">You're not in a community yet</p>
              <p className="text-sm text-slate-500 leading-relaxed">Join a public one below to meet other investors, or start a private one for your friends — no friends on RichR needed.</p>
              <button onClick={() => setCreating(true)} className="btn-secondary mt-3 text-xs">Create a community</button>
            </div>
          ) : groups.map((g) => (
            <div key={g.id}>
              <CommunityCard g={g} me={user.id} onOpen={() => setOpen(g)}
                subtitle={g.lastPost
                  ? (g.lastPost.card ? `${g.lastPost.card.kind === "performance" ? "📊 shared their performance" : g.lastPost.card.kind === "poll" ? `🗳 poll on ${g.lastPost.card.ticker}` : g.lastPost.card.kind === "vote" ? `${VOTE_META[g.lastPost.card.vote]?.dot || ""} ${VOTE_META[g.lastPost.card.vote]?.label || ""} on ${g.lastPost.card.ticker}` : `📈 shared ${g.lastPost.card.ticker}`}` : g.lastPost.position ? `📈 shared ${g.lastPost.position.ticker}` : g.lastPost.body)
                  : (g.description || "No messages yet — say hi")}
                trailing={
                  <button onClick={() => setMenuFor(menuFor === g.id ? null : g.id)} aria-label={`Options for ${g.name}`}
                    className="shrink-0 w-10 h-10 mr-2 rounded-full text-slate-400 flex items-center justify-center text-lg font-bold active:bg-slate-100">⋯</button>
                } />
              {menuFor === g.id && (
                <div className="bg-white rounded-b-2xl -mt-2 pt-2 border border-t-0 border-slate-100 px-4 py-3 flex items-center gap-2 flex-wrap">
                  {confirmFor === g.id ? (
                    <>
                      <span className="text-sm text-rose-600 font-semibold flex-1 min-w-0">
                        {g.created_by === user.id ? "Delete for everyone? Messages are gone for good." : "Leave this community?"}
                      </span>
                      <button onClick={() => quickAction(g)} className="bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full">Yes, {g.created_by === user.id ? "delete" : "leave"}</button>
                      <button onClick={() => setConfirmFor(null)} className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setOpen(g)} className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">Open</button>
                      <VisChip visibility={g.visibility} />
                      {g.created_by === user.id ? (
                        <button onClick={() => setConfirmFor(g.id)} className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                      ) : (
                        <button onClick={() => setConfirmFor(g.id)} className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full flex items-center gap-1"><LogOut size={12} /> Leave</button>
                      )}
                      <span className="text-[11px] text-slate-400 ml-auto">{g.created_by === user.id ? "You created this" : timeAgo(g.lastPost ? g.lastPost.created_at : g.created_at)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* discover */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-400 tracking-wide">🌐 DISCOVER · ACTIVE PUBLIC COMMUNITIES</div>
          {trending === null ? <Skeleton lines={2} /> : discover.length === 0 ? (
            <div className="card text-sm text-slate-500">
              {trending.length === 0 ? "No public communities yet — start the first one and other investors can find it." : "You've joined every active public community. Search for more above."}
            </div>
          ) : discover.map((g) => (
            <CommunityCard key={g.id} g={g} me={user.id} onOpen={() => setOpen({ ...g, members: null })} onJoin={() => join(g)} joining={joining === g.id} />
          ))}
        </div>
      </>)}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        🌐 Public communities are open to everyone on RichR. 🔒 Private ones are invisible to non-members — name, members and messages included — and people join by invite link only.
        Sharing a position posts the ticker, your buy date, return % and thesis — never amounts. Nothing here is investment advice.
      </p>

      {creating && <NewGroupModal mutuals={mutuals || []} onClose={() => setCreating(false)} onCreate={createGroup} />}
      {inviteCode && (
        <InviteSheet code={inviteCode} user={user}
          onJoined={async (g) => { onInviteDone && onInviteDone(); await loadGroups(); setOpen({ ...g, members: null }); }}
          onClose={() => onInviteDone && onInviteDone()} />
      )}
    </div>
  );
}

/* /?invite=CODE → preview (name, size, visibility) → Join. Bogus, revoked or
   expired codes reveal nothing. */
export function InviteSheet({ code, user, onJoined, onClose }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let dead = false;
    withTimeout(supabase.rpc("preview_group_invite", { code_in: code }), 10000, { data: null, error: new Error("timeout") })
      .then(({ data, error }) => { if (!dead) setInfo(error || !data ? { valid: false, reason: "error" } : data); });
    return () => { dead = true; };
  }, [code]);
  const accept = async () => {
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("accept_group_invite", { code_in: code });
    setBusy(false);
    if (error || !data || !data.ok) { setErr(REASONS[(data && data.reason) || "error"] || REASONS.error); return; }
    onJoined({ id: data.group_id, name: data.name, visibility: data.visibility, member_count: Number(info.member_count || 0) + 1 });
  };
  const REASONS = { invalid: "This invite link isn't valid.", revoked: "This invite link has been revoked.", expired: "This invite link has expired.", used_up: "This invite link has been used up.", error: "Couldn't check the invite — try again." };
  return (
    <BottomSheet title="Community invite" onClose={onClose}>
      <div className="px-5 pb-5">
        {info === null ? <Skeleton lines={2} /> : !info.valid ? (
          <div>
            <p className="text-sm text-slate-700">{REASONS[info.reason] || REASONS.error}</p>
            <p className="text-[11px] text-slate-400 mt-1">Ask the person who invited you for a new link.</p>
            <button onClick={onClose} className="btn-secondary mt-4 w-full">OK</button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl ${info.visibility === "public" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-600"}`}>{String(info.name).slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{info.name}</div>
                <div className="text-[12px] text-slate-500"><VisChip visibility={info.visibility} /> · {fmtMembers(info.member_count)}</div>
              </div>
            </div>
            {info.description && <p className="text-sm text-slate-600 mt-3">{info.description}</p>}
            {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
            <button onClick={info.joined ? () => onJoined({ id: info.group_id, name: info.name, visibility: info.visibility, member_count: info.member_count }) : accept} disabled={busy}
              className="btn-primary w-full mt-4 h-12 disabled:opacity-50">{busy ? "Joining…" : info.joined ? "Open community" : `Join ${info.name}`}</button>
            <p className="text-[11px] text-slate-400 mt-2 text-center">Members can see your username and what you choose to share.</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* Chips for topics & tickers: "nvda, $tsm ai" → $NVDA · $TSM · AI (removable). */
export const looksLikeTicker = (t, typedDollar = false) => typedDollar || /^[A-Z0-9.\-]{3,6}$/.test(t);

export function TopicInput({ value, onChange, placeholder = "NVDA, TSM, AI", ariaLabel = "Topics" }) {
  const [draft, setDraft] = useState("");
  const [dollar, setDollar] = useState({});      // topic -> typed with $
  const add = (raw) => {
    const parts = parseTopics(raw);
    if (!parts.length) return;
    const typed = {}; String(raw).split(/[,\s]+/).forEach((p) => { if (p.trim().startsWith("$")) typed[p.trim().slice(1).toUpperCase()] = true; });
    setDollar((d) => ({ ...d, ...typed }));
    onChange([...new Set([...value, ...parts])].slice(0, 8));
    setDraft("");
  };
  const remove = (t) => onChange(value.filter((x) => x !== t));
  return (
    <div className="min-h-[2.75rem] w-full border border-slate-200 rounded-xl bg-white px-2 py-1.5 flex flex-wrap items-center gap-1.5 focus-within:border-emerald-400"
      onClick={(e) => e.currentTarget.querySelector("input")?.focus()}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-lg bg-slate-900 text-white text-[12px] font-bold tabular-nums">
          {looksLikeTicker(t, dollar[t]) ? `$${t}` : t}
          <button type="button" onClick={(e) => { e.stopPropagation(); remove(t); }} aria-label={`Remove ${t}`} className="w-5 h-5 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"><X size={11} /></button>
        </span>
      ))}
      {value.length < 8 && (
        <input value={draft} aria-label={ariaLabel} placeholder={value.length ? "Add more…" : placeholder}
          onChange={(e) => { const v = e.target.value; if (/[,\s]$/.test(v)) add(v); else setDraft(v.slice(0, 20)); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } if (e.key === "Backspace" && !draft && value.length) remove(value[value.length - 1]); }}
          onBlur={() => add(draft)}
          className="flex-1 min-w-[6rem] h-7 text-sm bg-transparent outline-none uppercase placeholder:normal-case" />
      )}
    </div>
  );
}

export function NewGroupModal({ mutuals, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState(null);   // must be chosen explicitly
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [fq, setFq] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const esc = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, []);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const valid = name.trim().length > 0 && !!visibility;
  const friends = mutuals.filter((f) => !fq.trim() || String(f.username || "").toLowerCase().includes(fq.trim().toLowerCase()));
  const field = "w-full h-11 border border-slate-200 rounded-xl px-3 text-sm bg-white outline-none focus:border-emerald-400";
  const label = "block text-[11px] font-bold tracking-wide text-slate-400 mb-1.5";
  const create = async () => { if (!valid || busy) return; setBusy(true); await onCreate({ name: name.trim(), visibility, description: description.trim(), topics, memberIds: [...picked] }); setBusy(false); };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl flex flex-col" style={{ animation: "richr-up .22s cubic-bezier(.2,.8,.2,1) both" }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="shrink-0 px-5 pb-3 flex items-center justify-between border-b border-slate-100" style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))" }}>
          <h3 className="font-bold text-lg text-slate-900">New community</h3>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><X size={15} /></button>
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          <div>
            <label className={label}>NAME</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="e.g. AI & Semiconductors" aria-label="Community name" className={field} />
          </div>

          <div>
            <label className={label}>VISIBILITY</label>
            <div role="radiogroup" aria-label="Community visibility" className="grid grid-cols-2 gap-2">
              {[["public", "Anyone can find and join this community."], ["private", "Only invited members can find and join."]].map(([v, blurb]) => {
                const m = VIS_META[v]; const on = visibility === v;
                return (
                  <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setVisibility(v)}
                    className={`relative text-left rounded-2xl border-2 px-3 py-2.5 min-h-[4.5rem] transition ${on ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white active:bg-slate-50"}`}>
                    <span className="flex items-center gap-1.5">
                      <span className="text-base leading-none">{m.icon}</span>
                      <span className={`font-bold text-sm ${on ? "text-emerald-900" : "text-slate-900"}`}>{m.label}</span>
                      <span className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300"}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                    </span>
                    <span className={`block text-[11.5px] leading-snug mt-1 ${on ? "text-emerald-800" : "text-slate-500"}`}>{blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={label}>DESCRIPTION <span className="font-medium normal-case tracking-normal">· optional{visibility === "public" ? ", shown in search" : ""}</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 280))} rows={2} placeholder="What's this community about?" aria-label="Description"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-emerald-400 resize-none h-[3.75rem]" />
          </div>

          <div>
            <label className={label}>TOPICS & TICKERS <span className="font-medium normal-case tracking-normal">· optional{visibility === "public" ? ", searchable" : ""}</span></label>
            <TopicInput value={topics} onChange={setTopics} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={label + " mb-0"}>INVITE FRIENDS</label>
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums" aria-live="polite">{picked.size} picked</span>
            </div>
            {mutuals.length === 0 ? (
              <p className="text-[13px] text-slate-500 leading-snug">No mutual friends yet — that's fine. {visibility === "private" ? "You'll get an invite link right after creating it." : "Anyone on RichR can join a public community."}</p>
            ) : (
              <>
                {mutuals.length > 6 && (
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={fq} onChange={(e) => setFq(e.target.value)} placeholder="Search friends" aria-label="Search friends" className={`${field} pl-9 h-10`} />
                  </div>
                )}
                <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden max-h-56 overflow-y-auto">
                  {friends.length === 0 ? <p className="text-[13px] text-slate-400 px-3 py-3">No friend matches “{fq}”.</p> : friends.map((f) => {
                    const on = picked.has(f.id);
                    return (
                      <button key={f.id} type="button" onClick={() => toggle(f.id)} aria-pressed={on}
                        className={`w-full h-11 flex items-center gap-2.5 px-3 text-sm text-left ${on ? "bg-emerald-50" : "bg-white active:bg-slate-50"}`}>
                        <Avatar name={f.username} size={24} />
                        <span className={`flex-1 truncate font-semibold ${on ? "text-emerald-900" : "text-slate-700"}`}>@{f.username}</span>
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300"}`}>{on && <Check size={12} strokeWidth={3} />}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* sticky CTA — above the tab bar / Safari toolbar / home indicator */}
        <div className="shrink-0 px-5 pt-3 border-t border-slate-100 bg-white" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
          <button onClick={create} disabled={!valid || busy}
            className={`w-full h-12 rounded-full text-[15px] font-bold transition ${valid ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow" : "bg-slate-100 text-slate-400"} disabled:cursor-not-allowed`}>
            {busy ? "Creating…" : valid ? `Create ${VIS_META[visibility].icon} community` : "Create community"}
          </button>
          {!valid && <p className="text-[11px] text-slate-400 text-center mt-1.5">{!name.trim() ? "Give it a name" : "Choose public or private"}{!name.trim() && !visibility ? " and choose public or private" : ""}</p>}
        </div>
      </div>
    </div>
  );
}

export function GroupChat({ group, user, active, cur, fx, say, username, mutuals, onOpenTicker, onBack, onGroupChanged, onJoin = null, richrData = null }) {
  const [posts, setPosts] = useState(null);
  const [reactions, setReactions] = useState([]);   // [{post_id,user_id,emoji}]
  const [names, setNames] = useState({});          // user_id -> username
  const [members, setMembers] = useState(group.members || []);
  const [gone, setGone] = useState(false);          // RLS returned nothing: private and we're not a member
  const isMember = members.includes(user.id);
  const [joiningNow, setJoiningNow] = useState(false);
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
      const [{ data: ps, error }, { data: ms }, { data: gr }] = await Promise.all([
        supabase.from("group_posts").select("id, user_id, parent_id, body, tickers, position, card, created_at").eq("group_id", group.id).order("created_at", { ascending: true }).limit(500),
        supabase.from("group_members").select("user_id").eq("group_id", group.id),
        supabase.from("groups").select("id, name, visibility, description, topics, created_by").eq("id", group.id).maybeSingle(),
      ]);
      if (error) throw error;
      if (!gr) { setGone(true); setPosts([]); return; }       // not visible to us (private, not a member) or deleted
      if (gr.visibility !== group.visibility || gr.name !== group.name || gr.description !== group.description) onGroupChanged({ ...group, ...gr, members });
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
    if (card && card.kind === "vote" && card.ticker) await castVote(card.ticker, card.vote, { reason: card.reason || null });
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
  const saveSettings = async ({ visibility, description, topics }) => {
    const { error } = await supabase.from("groups").update({ visibility, description, topics }).eq("id", group.id);
    if (error) { say("Couldn't save the settings."); return; }
    say(visibility !== group.visibility ? `“${group.name}” is now ${VIS_META[visibility].icon} ${VIS_META[visibility].label.toLowerCase()}.` : "Settings saved.");
    onGroupChanged({ ...group, visibility, description, topics, members });
  };
  const joinHere = async () => { if (!onJoin) return; setJoiningNow(true); await onJoin(); setJoiningNow(false); await load(true); };

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
          <div className="font-bold text-slate-700 text-sm truncate">{visOf(group).icon} {group.name}</div>
          <div className="text-[11px] text-slate-400">{visOf(group).label} · {members.length} member{members.length === 1 ? "" : "s"}</div>
        </button>
        {isMember ? (
          <button onClick={() => setShowMembers(true)} title={isOwner ? "Members, invites, settings" : "Members, invite link or leave"}
            className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-2.5 py-1.5">
            <Users size={13} /> {isOwner ? "Manage" : "Members"}
          </button>
        ) : canSelfJoin(group) && onJoin ? (
          <button onClick={joinHere} disabled={joiningNow} className="shrink-0 h-8 px-4 rounded-full bg-slate-900 text-white text-xs font-bold disabled:opacity-50">{joiningNow ? "…" : "Join"}</button>
        ) : null}
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

      {gone && (
        <div className="px-4 py-10 text-center">
          <Lock size={22} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">This community isn't available</p>
          <p className="text-xs text-slate-400 mt-1">It's private, or it no longer exists. Ask a member for an invite link.</p>
          <button onClick={onBack} className="btn-secondary mt-4 text-xs">Back to Communities</button>
        </div>
      )}
      {!gone && !isMember && posts !== null && (
        <div className="mx-4 mt-3 bg-white border border-sky-100 rounded-2xl p-3.5 flex items-center gap-3">
          <span className="text-xl">🌐</span>
          <div className="flex-1 min-w-0 text-[13px] text-slate-600">{group.description ? <span className="block text-slate-800 font-semibold truncate">{group.description}</span> : null}You're viewing a public community. Join to post, vote in polls and share positions.</div>
          {canSelfJoin(group) && onJoin && <button onClick={joinHere} disabled={joiningNow} className="btn-primary text-xs h-9 shrink-0 disabled:opacity-50">{joiningNow ? "Joining…" : "Join"}</button>}
        </div>
      )}
      {!gone && section === "holdings" && <CommunityHoldings members={members} names={names} user={user} onOpenTicker={onOpenTicker} />}
      {!gone && section === "sentiment" && <CommunitySentiment members={members} names={names} user={user} onOpenTicker={onOpenTicker} />}

      {/* messages */}
      {!gone && section === "chat" && <div className="flex-1 px-4 pb-3">
        {posts === null ? (
          <div className="mt-8 space-y-3" aria-busy="true"><div className="skel h-10 w-3/4" /><div className="skel h-10 w-2/3 ml-auto" /><div className="skel h-10 w-1/2" /></div>
        ) : tops.length === 0 ? (
          <div className="text-center mt-10">
            <MessageCircle size={24} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">Nothing yet</p>
            <p className="text-xs text-slate-400 mt-1">{isMember ? "Say hi, or tap + to drop in a stock, a position, your Buy/Hold/Sell call or a performance card. Tag tickers with $ — “what do you think of $ASML?”" : "No messages yet. Join and be the first to post."}</p>
          </div>
        ) : tops.map((p) => renderPost(p, false))}
        <div ref={bottomRef} />
      </div>}

      {/* composer (members only) */}
      {!gone && isMember && section === "chat" && <div className="sticky z-30 bg-white border-t border-slate-200 px-3 pt-2 pb-2" style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))" }}>
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
        <MembersSheet group={group} members={members} names={names} user={user} isOwner={isOwner} mutuals={mutuals} say={say}
          onAdd={addMember} onRemove={removeMember} onLeave={leave} onDelete={deleteGroup} onRename={rename} onSettings={saveSettings}
          onClose={() => setShowMembers(false)} />
      )}
    </div>
  );
}

/* Community › Holdings: what the members hold, from their shared leaderboard
   rows (each member controls what they share; RLS only returns rows you may see). */
export function CommunityHoldings({ members, names, user, onOpenTicker }) {
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
export function CommunitySentiment({ members, names, user, onOpenTicker }) {
  const [calls, setCalls] = useState(null);
  useEffect(() => {
    let dead = false;
    if (!members.length) { setCalls([]); return; }
    supabase.from("stock_calls").select("id, user_id, ticker, vote, reason, created_at, owner").in("user_id", members)
      .order("created_at", { ascending: false }).limit(600)
      .then(({ data }) => { if (!dead) setCalls(activeCalls(data || []).filter((c) => daysOld(c.created_at) < STALE_DAYS)); });
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
                  <Avatar name={names[c.user_id] || "?"} size={16} /> @{c.user_id === user.id ? "you" : (names[c.user_id] || "…")} {VOTE_META[c.vote].dot}{c.owner && <OwnerBadge />}
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
export function PositionShareCard({ pos, onTicker }) {
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

export function SharePositionPicker({ holdings, cur, fx, onPick, onClose }) {
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

export function MembersSheet({ group, members, names, user, isOwner, mutuals, onAdd, onRemove, onLeave, onDelete, onRename, onSettings, onClose, say }) {
  const [confirm, setConfirm] = useState(null); // "leave" | "delete"
  const [invites, setInvites] = useState(null);
  const [minting, setMinting] = useState(false);
  const [copied, setCopied] = useState(null);
  const [vis, setVis] = useState(group.visibility || "private");
  const [desc, setDesc] = useState(group.description || "");
  const [topics, setTopics] = useState(Array.isArray(group.topics) ? group.topics.join(", ") : "");
  const isMember = members.includes(user.id);
  const addable = (mutuals || []).filter((f) => !members.includes(f.id));
  const loadInvites = async () => {
    const { data } = await supabase.from("group_invites").select("id, code, created_by, created_at, expires_at, revoked_at, max_uses, uses").eq("group_id", group.id).is("revoked_at", null).order("created_at", { ascending: false });
    setInvites(data || []);
  };
  useEffect(() => { if (isMember) loadInvites(); else setInvites([]); }, [group.id, isMember]);
  const mint = async () => {
    setMinting(true);
    const { data, error } = await supabase.rpc("create_group_invite", { gid: group.id });
    setMinting(false);
    if (error || !data) { say && say("Couldn't create an invite link."); return; }
    await loadInvites();
    copy(data.code, data.id);
  };
  const copy = async (code, id) => {
    const url = inviteUrl(code);
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 2000); say && say("Invite link copied."); }
    catch (e) { window.prompt("Copy this invite link", url); }
  };
  const revoke = async (id) => {
    const { data } = await supabase.rpc("revoke_group_invite", { invite_id: id });
    if (data) { say && say("Invite link revoked — it no longer works."); await loadInvites(); }
  };
  const dirtySettings = vis !== (group.visibility || "private") || desc.trim() !== (group.description || "") || parseTopics(topics).join(",") !== (Array.isArray(group.topics) ? group.topics : []).join(",");
  const m = visOf(group);
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto overscroll-contain p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          {isOwner ? (
            <input defaultValue={group.name} onBlur={(e) => onRename(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} aria-label="Community name"
              className="font-bold text-lg text-slate-700 bg-transparent border-b border-dashed border-slate-300 focus:border-emerald-400 outline-none min-w-0 flex-1 mr-2" />
          ) : (
            <h3 className="font-bold text-lg text-slate-700 truncate">{group.name}</h3>
          )}
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0"><X size={14} /></button>
        </div>
        <div className="flex items-center gap-2 mb-3"><VisChip visibility={group.visibility} /><span className="text-[11px] text-slate-400">{m.blurb}</span></div>
        {group.description && !isOwner && <p className="text-sm text-slate-600 mb-3">{group.description}</p>}

        {/* owner settings */}
        {isOwner && (
          <div className="bg-slate-50 rounded-2xl p-3 mb-4 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Settings</div>
            <div role="radiogroup" aria-label="Visibility" className="grid grid-cols-2 gap-2">
              {["public", "private"].map((v) => (
                <button key={v} role="radio" aria-checked={vis === v} onClick={() => setVis(v)}
                  className={`rounded-xl border-2 px-3 py-2 text-left ${vis === v ? (v === "public" ? "border-sky-500 bg-sky-50" : "border-slate-800 bg-white") : "border-slate-200 bg-white"}`}>
                  <div className="text-sm font-bold text-slate-800">{VIS_META[v].icon} {VIS_META[v].label}</div>
                  <div className="text-[10px] text-slate-500 leading-snug">{VIS_META[v].blurb}</div>
                </button>
              ))}
            </div>
            {vis !== (group.visibility || "private") && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                {vis === "public" ? "Switching to public makes the name, members and all messages readable by everyone on RichR." : "Switching to private hides this community from everyone who isn't a member."}
              </p>
            )}
            <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 280))} rows={2} placeholder="Description" aria-label="Description" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white resize-none" />
            <input value={topics} onChange={(e) => setTopics(e.target.value.slice(0, 120))} placeholder="Topics & tickers: NVDA, TSM, AI" aria-label="Topics" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
            <button disabled={!dirtySettings} onClick={() => onSettings({ visibility: vis, description: desc.trim(), topics: parseTopics(topics) })} className="btn-primary w-full text-xs h-9 disabled:opacity-40">Save settings</button>
          </div>
        )}

        {/* invite link — every member of a private community can invite; public too, for convenience */}
        {isMember && (
          <div className="mb-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1"><Share2 size={12} /> Invite link</div>
            {invites === null ? <Skeleton lines={1} /> : (
              <div className="space-y-1.5">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    <code className="text-[11px] text-slate-600 truncate flex-1">…/?invite={inv.code.slice(0, 6)}…{inv.code.slice(-4)}</code>
                    <span className="text-[10px] text-slate-400 shrink-0">{inv.uses} use{inv.uses === 1 ? "" : "s"}</span>
                    <button onClick={() => copy(inv.code, inv.id)} className="text-[11px] font-bold text-emerald-700 shrink-0">{copied === inv.id ? "Copied" : "Copy"}</button>
                    {(inv.created_by === user.id || isOwner) && <button onClick={() => revoke(inv.id)} className="text-[11px] font-semibold text-rose-600 shrink-0">Revoke</button>}
                  </div>
                ))}
                <button onClick={mint} disabled={minting} className="btn-secondary w-full text-xs h-9 disabled:opacity-50">{minting ? "Creating…" : invites.length ? "New invite link" : "Create invite link"}</button>
                <p className="text-[11px] text-slate-400">Anyone with the link can join{group.visibility === "private" ? " this private community" : ""}. Revoke a link to stop it working.</p>
              </div>
            )}
          </div>
        )}

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

        {isMember && (<>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1"><UserPlus size={12} /> Add friends</div>
          {addable.length === 0 ? (
            <p className="text-sm text-slate-400 mb-4">{(mutuals || []).length === 0 ? "Mutual friends can be added directly; anyone else joins with the invite link." : "All your mutual friends are already here — share the invite link with anyone else."}</p>
          ) : (
            <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden mb-4">
              {addable.map((f) => (
                <button key={f.id} onClick={() => onAdd(f.id, f.username)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm bg-white active:bg-slate-50">
                  <span className="font-semibold text-slate-600">@{f.username}</span>
                  <span className="text-xs font-semibold text-emerald-700">Add</span>
                </button>
              ))}
            </div>
          )}
        </>)}

        {!isMember ? null : confirm ? (
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

/* RichR — main app shell. Feature code lives in src/features/*, shared helpers in src/lib/*, UI atoms in src/ui/*. */
import { useEffect, useMemo, useRef, useState } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "./supabase";
import { Handshake, Home, Plus, Search, Trophy, User, Users, UsersRound, X } from "lucide-react";
import { CommunityCard, GroupsTab, InviteSheet, NewGroupModal, TopicInput, VIS_META, canSelfJoin, communityMatches, inviteUrl, isDiscoverable, parseTopics, visOf } from "./features/communities.jsx";
import { CreateMenu, CreatePostSheet, TransactionSheet } from "./features/create.jsx";
import { FEED_CACHE } from "./features/feed.jsx";
import { FriendsTab } from "./features/friends.jsx";
import { EditPortfolio, PositionModal, PositionsTab, QuickEditSheet, SharesSheet } from "./features/holdings.jsx";
import { HomeTab } from "./features/home.jsx";
import { parseHoldingsCsv } from "./features/import.jsx";
import { InsightsTab } from "./features/insights.jsx";
import { ProfileTab, TAB_LABEL } from "./features/profile.jsx";
import { ResearchTab } from "./features/research.jsx";
import { SENT_CACHE, ScopeSummary, activeCalls, castVote, fetchSentiment, latestCalls, removeVote, sentimentBus, tallyAfterVote } from "./features/sentiment.jsx";
import { SOCIAL_ME } from "./features/social.jsx";
import { DEFAULT_FX, daysOld, fmtDate, fxConvert, money, moneyShort, pct, pctOf, round6, uid, withTimeout } from "./lib/format.js";
import { SAMPLE, addHoldingShares, applyPriceRow, removePortfolio, computeScore, cutSeries, editHolding, exchangeOf, holdingValue, holdingsKey, idxOnOrBefore, isFund, periodReturn, portfolioTotals, publishBoard, removeHoldings, seed, setHoldingShares } from "./lib/portfolio.js";
import { commitDoc, dataKey, loadCloud, loadLocal, queueCloudSave, saveCloud, saveCloudDoc, saveLocal, watchTicker } from "./lib/storage.js";
import { AsyncConfirm, ConfirmDialog, Stepper } from "./ui/primitives.jsx";

export { PublicProfile } from "./features/profile.jsx";

export default function RichR({ user, onSignOut }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("portfolio");
  /* Where you were before opening Profile (from the name button top-right,
     or "Edit" on the Friends share card) — so its Back control returns you
     there instead of always to Portfolio. */
  const prevTabRef = useRef("portfolio");
  const [researchQuery, setResearchQuery] = useState(""); // prefilled when a $TICKER chip is tapped
  const [importOnce, setImportOnce] = useState(false);    // open the import modal on arrival in Holdings
  const openTicker = (t) => { setResearchQuery(String(t || "").toUpperCase()); setTab("research"); };
  // Social components (votes, discussions, feed) read the signed-in user from here.
  SOCIAL_ME.id = user.id; SOCIAL_ME.username = (data && data.username) || "";
  const openProfile = () => { if (tab !== "profile") prevTabRef.current = tab; setTab("profile"); };
  const closeProfile = () => setTab(prevTabRef.current === "profile" ? "portfolio" : prevTabRef.current);
  const [sub, setSub] = useState("overview"); // Portfolio tab sections: overview | holdings | analysis
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");
  const [create, setCreate] = useState(null); // null | menu | post | poll | position | transaction
  const [inviteCode, setInviteCode] = useState(() => { try { const c = localStorage.getItem("richr_invite"); if (c) localStorage.removeItem("richr_invite"); return c || null; } catch (e) { return null; } });
  useEffect(() => { if (inviteCode) setTab("groups"); }, []);
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

  /* ---- "X wants to see your portfolio" banner (nudges table) ----
     A friend who can't see your board yet can nudge you once a day.
     Shown until you share or dismiss; dismiss deletes the row. */
  const [nudge, setNudge] = useState(null); // { fromId, username, more }
  const nudgeChecked = useRef(false);
  useEffect(() => {
    if (!data || nudgeChecked.current) return;
    nudgeChecked.current = true;
    (async () => {
      try {
        const { data: rows } = await supabase
          .from("nudges").select("from_id, created_at").eq("to_id", user.id)
          .order("created_at", { ascending: false });
        if (!rows || !rows.length) return;
        const { data: p } = await supabase
          .from("profiles").select("user_id, username").in("user_id", rows.map((r) => r.from_id));
        const first = rows[0];
        const prof = (p || []).find((x) => x.user_id === first.from_id);
        setNudge({ fromId: first.from_id, username: (prof && prof.username) || "a friend", more: rows.length - 1 });
      } catch (_) { /* best-effort */ }
    })();
  }, [data]);
  const dismissNudge = async () => {
    if (!nudge) return;
    setNudge(null);
    try { await supabase.from("nudges").delete().eq("to_id", user.id); } catch (_) {}
  };

  /* ---- keep my leaderboard row (and the activity feed) current ----
     If I've shared my portfolio, a change to holdings re-publishes the row
     ~6s later so friends see the update — and the feed gets its
     "increased X 12% → 18%" events — without tapping "Update share". */
  const lastPubKey = useRef(null);
  const pubTimer = useRef(null);
  useEffect(() => {
    if (!data) return;
    const act = data.portfolios.find((p) => p.id === data.activeId) || data.portfolios[0];
    if (!act) return;
    const k = holdingsKey(act.holdings, data.currency || "USD");
    if (lastPubKey.current === null) { lastPubKey.current = k; return; } // initial load
    if (lastPubKey.current === k) return;
    lastPubKey.current = k;
    if (pubTimer.current) clearTimeout(pubTimer.current);
    pubTimer.current = setTimeout(async () => {
      try {
        const { data: row } = await supabase.from("leaderboard").select("user_id").eq("user_id", user.id).maybeSingle();
        if (!row) return;
        if (!act.holdings.length || act.holdings.some((h) => h.sample)) return;
        const fx = data.fx || DEFAULT_FX;
        const cur = data.currency || "USD";
        let value = 0, cost = 0;
        act.holdings.forEach((h) => {
          const cp = h.currentPrice > 0 ? h.currentPrice : h.buyPrice;
          value += fxConvert(h.shares * cp, h.currency || cur, cur, fx);
          cost += fxConvert(h.shares * h.buyPrice, h.currency || cur, cur, fx);
        });
        const plPct = cost > 0 ? ((value - cost) / cost) * 100 : 0;
        await publishBoard({ data, active: act, totals: { value, cost, pl: value - cost, plPct }, cur, user });
      } catch (_) { /* silent — the manual button still works */ }
    }, 6000);
    return () => { if (pubTimer.current) clearTimeout(pubTimer.current); };
  }, [data && data.portfolios, data && data.activeId]);

  const storageKey = dataKey(user.id);
  const cloudOk = useRef(false);
  const offlineSeed = useRef(false);   // started from an empty seed because the cloud was unreachable
  const dataRef = useRef(null);        // latest doc, for code that must not use a stale closure
  dataRef.current = data;

  /* ---- initial load: newest of cloud vs. local cache wins ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadLocal(storageKey);
      const cloud = await loadCloud(user.id);
      let d;
      if (cloud === undefined) {
        // offline / cloud unreachable — run on the local cache for now.
        // With no local copy either we start from a seed, but that seed must
        // never be written over a cloud document we simply couldn't reach.
        d = local || seed();
        offlineSeed.current = !local;
        cloudOk.current = false;
      } else if (cloud === null) {
        // first cloud-era login on this account: migrate whatever this
        // device has (or start fresh) up to Supabase
        d = local || seed();
        cloudOk.current = true;
        saveCloud(user.id, { ...d, _ts: Date.now() });
      } else {
        // both exist — keep whichever copy was saved most recently
        const newerLocal = local && (local._ts || 0) > (cloud._ts || 0);
        d = newerLocal ? local : cloud;
        cloudOk.current = true;
        if (newerLocal) saveCloud(user.id, local);
        else saveLocal(storageKey, cloud);
      }
      if (cancelled) return;
      if (!d.userName && user.user_metadata && user.user_metadata.full_name)
        d.userName = user.user_metadata.full_name;
      setData(d);
      loaded.current = true;
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  /* ---- write-through: localStorage immediately, cloud debounced ---- */
  const cloudTimer = useRef(null);
  const pendingRef = useRef(null); // doc waiting for the debounced cloud save
  useEffect(() => {
    if (!loaded.current || !data) return;
    const stamped = { ...data, _ts: Date.now() };
    saveLocal(storageKey, stamped);
    pendingRef.current = stamped;
    if (cloudTimer.current) clearTimeout(cloudTimer.current);
    cloudTimer.current = setTimeout(() => {
      if (offlineSeed.current) return;                     // see initial load
      pendingRef.current = null;
      queueCloudSave(user.id, stamped, (r) => {
        if (r.ok) cloudOk.current = true;
        if (r.ok && r.stale) {
          // Another device/tab saved a newer document: adopt it rather than fight it.
          loadCloud(user.id).then((cloud) => { if (cloud && typeof cloud === "object") { loaded.current = false; setData(cloud); saveLocal(storageKey, cloud); setTimeout(() => { loaded.current = true; }, 0); } });
        }
      });
    }, 1200);
    return () => { if (cloudTimer.current) clearTimeout(cloudTimer.current); };
  }, [data, storageKey]);
  /* Reconnect: while we run on an offline seed, keep trying to reach the cloud.
     If a document exists there, it wins over the seed (unless edits were made). */
  useEffect(() => {
    if (!data || !offlineSeed.current) return;
    const id = setInterval(async () => {
      const cloud = await loadCloud(user.id);
      if (cloud === undefined) return;
      offlineSeed.current = false; cloudOk.current = true;
      const edited = (dataRef.current && dataRef.current.portfolios || []).some((p) => (p.holdings || []).length || (p.closed || []).length);
      if (cloud && !edited) { loaded.current = false; setData(cloud); saveLocal(storageKey, cloud); setTimeout(() => { loaded.current = true; }, 0); }
      clearInterval(id);
    }, 10000);
    return () => clearInterval(id);
  }, [!!data]);

  /* If the tab is hidden or closed while a save is still pending, flush it
     right away (keepalive so the request survives navigation). Otherwise a
     quick edit-then-leave could vanish from the cloud copy. */
  useEffect(() => {
    const flush = () => {
      const d = pendingRef.current;
      if (!d) return;
      pendingRef.current = null;
      if (cloudTimer.current) clearTimeout(cloudTimer.current);
      try {
        const sess = JSON.parse(localStorage.getItem(`sb-${new URL(SUPABASE_URL).host.split(".")[0]}-auth-token`) || "null");
        const token = sess && sess.access_token;
        if (!token) return;
        fetch(`${SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`, {
          method: "POST", keepalive: true,
          headers: {
            "content-type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${token}`,
            prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({ user_id: user.id, data: d, updated_at: new Date().toISOString() }),
        }).catch(() => {});
      } catch (e) { /* best effort */ }
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", flush); flush(); /* sign-out / unmount */ };
  }, [user.id]);

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
      label: fmtDate(s.t),
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
      const newFx = { at: Date.now(), rates: { ...DEFAULT_FX.rates, ...(data.fx || DEFAULT_FX).rates, USD: 1 } };
      fxRows.forEach((r) => {
        const code = String(r.code || "").toUpperCase();
        const v = Number(r.per_usd);
        if (code && code !== "USD" && v > 0) newFx.rates[code] = v;
      });

      let hit = 0;
      // newest server-side update among the rows we actually use
      let priceDataAt = 0;
      /* Apply a price row to one holding. Used inside setData on whatever the
         holdings are NOW — the list captured when this refresh started may be
         seconds old, and replacing it wholesale used to resurrect holdings
         deleted (or undo edits made) while the request was in flight. */
      const applyPrice = (h) => applyPriceRow(h, priceMap, newFx.rates, cur);
      active.holdings.forEach((h) => {
        const row = priceMap[String(h.ticker || "").toUpperCase()];
        if (row && Number(row.price) > 0) { hit++; const at = row.updated_at ? new Date(row.updated_at).getTime() : 0; if (at > priceDataAt) priceDataAt = at; }
      });
      const updated = active.holdings.map(applyPrice);   // for the snapshot below only

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
          ...d, snapshots: snaps, fx: newFx, pricesAt: Date.now(), priceDataAt: priceDataAt || d.priceDataAt || 0,
          portfolios: d.portfolios.map((p) => (p.id === active.id ? { ...p, holdings: (p.holdings || []).map(applyPrice) } : p)),
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
  /* Deletions are committed to the cloud document FIRST and only applied to
     the UI once the server has confirmed the write — so "deleted" is never a
     lie, and a refresh / another device can't bring the item back. `reduce`
     must be idempotent: it runs on the doc we send and again on live state. */
  const commit = async (reduce) => {
    let next;
    try { ({ next } = await commitDoc({ userId: user.id, base: dataRef.current, reduce })); }
    catch (e) { if (e && e.cloud) { setData(e.cloud); saveLocal(storageKey, e.cloud); } throw e; }
    cloudOk.current = true; offlineSeed.current = false;
    setData((d) => ({ ...reduce(d), _ts: next._ts }));
    saveLocal(storageKey, next);
    return true;
  };
  const removeHoldingNow = (id) => commit((d) => ({ ...d, portfolios: d.portfolios.map((p) => (p.id === d.activeId ? { ...p, holdings: removeHoldings(p.holdings, id) } : p)) }));
  const removeManyNow = (ids) => commit((d) => ({ ...d, portfolios: d.portfolios.map((p) => (p.id === d.activeId ? { ...p, holdings: removeHoldings(p.holdings, ids) } : p)) }));
  /* Delete the active portfolio and everything in it. Deleting the last one
     leaves a fresh, empty portfolio so the app always has somewhere to land. */
  const deletePortfolio = () => { const freshId = uid(); return commit((d) => removePortfolio(d, d.activeId, () => freshId)); };
  const upsertHolding = (h) => {
    watchTicker(h.ticker);
    patchActive((p) => ({
      holdings: p.holdings.some((x) => x.id === h.id)
        ? p.holdings.map((x) => (x.id === h.id ? h : x))
        : [...p.holdings, h],
    }));
  };
  const editFields = (id, fields) => patchActive((p) => ({ holdings: editHolding(p.holdings, id, fields) }));
  const setShares = (id, n) => patchActive((p) => ({ holdings: setHoldingShares(p.holdings, id, n) }));
  const addShares = (id, n, price) => patchActive((p) => ({ holdings: addHoldingShares(p.holdings, id, n, price) }));
  /* Sell part of a position: the sold shares become a closed trade, the rest stays open. */
  const sellShares = (id, n, sellPrice, sellDate) =>
    patchActive((p) => {
      const h = (p.holdings || []).find((x) => x.id === id);
      if (!h) return {};
      const qty = Math.min(Number(n) || 0, Number(h.shares) || 0);
      if (qty <= 0) return {};
      const closedItem = { ...h, id: uid(), shares: qty, sellPrice: Number(sellPrice) || 0, sellDate: sellDate || new Date().toISOString().slice(0, 10), closedAt: Date.now() };
      const left = Number(h.shares) - qty;
      return {
        holdings: left > 1e-9 ? p.holdings.map((x) => (x.id === id ? { ...x, shares: Math.round(left * 1e6) / 1e6 } : x)) : p.holdings.filter((x) => x.id !== id),
        closed: [...(p.closed || []), closedItem],
      };
    });
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
    // `sample: true` marks these so the Friends tab refuses to publish them.
    SAMPLE.forEach((s) => upsertHolding({ id: uid(), ...s, buyDate: today, currentPrice: 0, verdict: "open", sample: true }));
    say("Sample positions added — replace them with your own before sharing.");
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
    { id: "portfolio", label: "Home", icon: Home },
    { id: "research", label: "Discover", icon: Search },
    { id: "groups", label: "Communities", icon: UsersRound },
    { id: "friends", label: "Friends", icon: Handshake },
    { id: "profile", label: "Profile", icon: User },
  ];
  const SUBS = [
    { id: "overview", label: "Overview" },
    { id: "holdings", label: "Holdings" },
    { id: "analysis", label: "Analysis" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Phone-width everywhere, except the Overview on a big screen, which
          spreads into two columns (see HomeTab). */}
      <div className={`mx-auto px-4 pb-36 pt-6 transition-[max-width] ${
        tab === "portfolio" && sub === "overview" && active.holdings.length > 0 ? "max-w-md lg:max-w-5xl" : "max-w-md"}`}>
        {/* header: a restrained wordmark; the personality comes from the content */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-extrabold tracking-tight flex items-baseline text-slate-900">
            Rich<img src="/logo.png" alt="R" className="h-[1.1rem] w-auto inline-block translate-y-[1px]" />
          </h1>
          <div className="text-xs font-semibold text-slate-400">{TAB_LABEL[tab]}</div>
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow shrink-0">
              Add back
            </button>
            <button onClick={dismissFriendAlert}
              className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        {/* nudge banner — a friend wants to see your portfolio */}
        {nudge && !friendAlert && (
          <div className="mb-4 bg-white border border-amber-200 rounded-2xl p-3 shadow-sm flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
              <Trophy size={15} className="text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-700 truncate">@{nudge.username} wants to see your portfolio</div>
              <div className="text-[11px] text-slate-400">{nudge.more > 0 ? `+${nudge.more} more · ` : ""}Share to join the leaderboard</div>
            </div>
            <button onClick={() => { setTab("friends"); dismissNudge(); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow shrink-0">
              Share
            </button>
            <button onClick={dismissNudge}
              className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        {tab === "portfolio" && (
          <div className="mb-4 bg-slate-200/60 rounded-full p-1 flex lg:max-w-md">
            {SUBS.map((s) => (
              <button key={s.id} onClick={() => setSub(s.id)}
                className={`flex-1 text-[13px] font-semibold py-1.5 rounded-full transition ${
                  sub === s.id ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {tab === "portfolio" && sub === "overview" && (
          <HomeTab
            data={data} active={active} cur={cur} totals={totals} chartData={chartData}
            refreshing={refreshing} onRefresh={refreshPrices}
            onSwitch={(id) => patch(() => ({ activeId: id }))}
            onAddPortfolio={addPortfolio} onDeletePortfolio={deletePortfolio}
            onRename={(name) => patchActive(() => ({ name }))}
            goPositions={() => setSub("holdings")} goImport={() => { setImportOnce(true); setSub("holdings"); }} onLoadSample={loadSample}
            goals={data.goals || []} allValue={allValue} fx={data.fx || DEFAULT_FX}
            autoRefresh={!!data.autoRefresh} onToggleAuto={() => patch((d) => ({ autoRefresh: !d.autoRefresh }))}
            pricesAt={data.pricesAt || 0} priceDataAt={data.priceDataAt || 0}
            onAddGoal={addGoal} onUpdateGoal={updateGoal} onRemoveGoal={removeGoal}
            onBenchmark={(benchmark) => patch(() => ({ benchmark }))}
            onScoreLog={(scoreLog) => patch(() => ({ scoreLog }))}
            user={user} goFriends={() => setTab("friends")} goCommunities={() => setTab("groups")}
            onDismissOnboarding={() => patch(() => ({ onboardingDismissed: true }))}
            onOpenProfile={openProfile}
            onRankLog={(rankLog) => patch(() => ({ rankLog }))}
            onOpenTicker={openTicker}
          />
        )}
        {tab === "portfolio" && sub === "holdings" && (
          <PositionsTab active={active} cur={cur} fx={data.fx || DEFAULT_FX}
            companyInfo={data.companyInfo || {}} onSaveInfo={saveCompanyInfo}
            onUpsert={upsertHolding} onRemove={removeHoldingNow} onSetPrice={setPrice} onLoadSample={loadSample} onClosePosition={closePosition}
            onEditFields={editFields} onSetShares={setShares} onAddShares={addShares} onRemoveMany={removeManyNow} onSell={sellShares} say={say}
            watchlist={data.watchlist || []} onRemoveWatch={removeWatch} onSetWatchPrice={setWatchPrice}
            goResearch={() => setTab("research")}
            openImport={importOnce} onImportOpened={() => setImportOnce(false)} />
        )}
        {tab === "portfolio" && sub === "analysis" && (
          <InsightsTab active={active} totals={totals} cur={cur} fx={data.fx || DEFAULT_FX} say={say}
            onVerdict={setVerdict}
            analysis={(data.analysis || {})[active.id]} onSave={saveAnalysis}
            news={(data.news || {})[active.id]} onSaveNews={saveNews} />
        )}
        {tab === "research" && <ResearchTab cur={cur} say={say} onUpsert={upsertHolding} holdings={active.holdings} fx={data.fx || DEFAULT_FX}
          companyInfo={data.companyInfo || {}} onSaveInfo={saveCompanyInfo}
          watchlist={data.watchlist || []} onWatch={addWatch} onUnwatch={removeWatchByTicker}
          initialQuery={researchQuery} onConsumeQuery={() => setResearchQuery("")} />}
        {tab === "groups" && (
          <GroupsTab user={user} active={active} cur={cur} fx={data.fx || DEFAULT_FX} say={say} username={data.username} onOpenTicker={openTicker} richrData={data}
            goFriends={() => setTab("friends")} inviteCode={inviteCode} onInviteDone={() => setInviteCode(null)} />
        )}
        {tab === "friends" && <FriendsTab data={data} active={active} totals={totals} cur={cur} say={say} user={user}
          onEditSharing={openProfile} onOpenTicker={openTicker}
          onBoardRanks={(boardRanks) => patch(() => ({ boardRanks }))} />}
        {tab === "profile" && (
          <ProfileTab data={data} user={user} say={say}
            onName={(userName) => patch(() => ({ userName }))}
            onUsername={(username) => patch(() => ({ username }))}
            cur={cur} onCurrency={(currency) => patch(() => ({ currency }))}
            onProfile={(profile) => patch(() => ({ profile }))}
            onPhilosophy={(philosophy) => patch(() => ({ philosophy }))}
            onShare={(share) => patch(() => ({ share }))}
            active={active} totals={totals}
            onBack={closeProfile} backLabel={TAB_LABEL[prevTabRef.current === "profile" ? "portfolio" : prevTabRef.current]}
            onSignOut={onSignOut} />
        )}
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 max-w-[90%] text-center">
          {toast}
        </div>
      )}

      {/* universal Create — floats above the tab bar (not inside a community chat, where the composer lives) */}
      {["portfolio", "research", "friends"].includes(tab) && !create && (
        <button onClick={() => setCreate("menu")} aria-label="Create"
          className="fab fixed z-40 h-11 pl-3.5 pr-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[14px] flex items-center gap-1.5 lg:right-[max(1.25rem,calc(50%-32rem))]"
          style={{ right: 20, bottom: "calc(4.25rem + 14px + env(safe-area-inset-bottom, 0px))" }}>
          <Plus size={18} strokeWidth={2.5} /> Create
        </button>
      )}
      {create === "menu" && <CreateMenu onPick={setCreate} onClose={() => setCreate(null)} />}
      {(create === "post" || create === "poll") && (
        <CreatePostSheet mode={create} user={user} cur={cur} fx={data.fx || DEFAULT_FX} holdings={active.holdings} richrData={data} active={active}
          onClose={() => setCreate(null)} onBack={() => setCreate("menu")}
          onDone={(msg) => { FEED_CACHE.at = 0; setCreate(null); say(msg); }} onOpenTicker={openTicker} />
      )}
      {create === "position" && (
        <PositionModal holding={null} cur={cur} fx={data.fx || DEFAULT_FX} holdings={active.holdings}
          onClose={() => setCreate(null)} onSave={(h) => upsertHolding(h)} />
      )}
      {create === "transaction" && (
        <TransactionSheet holdings={active.holdings} cur={cur} fx={data.fx || DEFAULT_FX}
          onClose={() => setCreate(null)} onBack={() => setCreate("menu")}
          onBuyMore={(h, n, p, d) => {
            const s0 = Number(h.shares), total = s0 + n;
            upsertHolding({ ...h, shares: total, buyPrice: (s0 * Number(h.buyPrice) + n * p) / total, buyDate: [h.buyDate, d].filter(Boolean).sort()[0] || d });
            setCreate(null); say(`Added ${n} ${h.ticker} — now ${total} at ${money((s0 * Number(h.buyPrice) + n * p) / total, h.currency || cur)} avg.`);
          }}
          onSell={(h, n, p, d) => { sellShares(h.id, n, p, d); setCreate(null); }}
          onDone={(msg) => say(msg)} />
      )}

      {/* bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="max-w-md mx-auto flex">
          {tabs.map((t) => {
            const on = tab === t.id;
            const I = t.icon;
            return (
              <button key={t.id} onClick={() => (t.id === "profile" ? openProfile() : setTab(t.id))}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 pb-4">
                <I size={20} className={on ? "text-slate-900" : "text-slate-400"} strokeWidth={on ? 2.4 : 2} />
                <span className={`text-[11px] font-semibold ${on ? "text-slate-900" : "text-slate-400"}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* Pure helpers exposed for unit tests only (see src/*.test.js). */
export const __helpers = { pct, money, moneyShort, fxConvert, parseHoldingsCsv, latestCalls, activeCalls, tallyAfterVote, castVote, removeVote, fetchSentiment, SENT_CACHE, sentimentBus, SOCIAL_ME,
  editHolding, removeHoldings, setHoldingShares, addHoldingShares, portfolioTotals, holdingValue, round6, removePortfolio, applyPriceRow, commitDoc, saveCloudDoc, queueCloudSave, AsyncConfirm, PositionsTab,
  QuickEditSheet, SharesSheet, ConfirmDialog, EditPortfolio, Stepper,
  VIS_META, visOf, isDiscoverable, canSelfJoin, parseTopics, communityMatches, inviteUrl, CommunityCard, NewGroupModal, TopicInput, InviteSheet, ScopeSummary, cutSeries, exchangeOf, isFund, pctOf, daysOld, withTimeout, periodReturn, idxOnOrBefore, computeScore };

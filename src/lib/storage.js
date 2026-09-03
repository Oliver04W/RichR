/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */
import { supabase } from "../supabase";

/* ---------- storage (cloud-first via Supabase, localStorage as offline cache) ---------- */
/* The whole app state lives in one document per user:
     - Source of truth: public.user_data (JSONB, protected by RLS)
     - localStorage keeps a copy so the app opens instantly and works offline
   Every saved copy carries a _ts timestamp; on load the newer of
   cloud vs. local wins, so no edit is ever silently rolled back. */
export const dataKey = (userId) => `richr:data:${userId}`;

export function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* first run */ }
  return null;
}

export function saveLocal(key, d) {
  try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) { console.error(e); }
}

/* returns the document, null (signed in but no cloud row yet),
   or undefined (cloud unreachable — offline mode) */
export async function loadCloud(userId) {
  try {
    // A request that never answers (captive portal, flaky mobile data) must not
    // leave the app on the splash screen: after 8s we run on the local copy.
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000));
    const { data: row, error } = await Promise.race([
      supabase.from("user_data").select("data").eq("user_id", userId).maybeSingle(),
      timeout,
    ]);
    if (error) throw error;
    return row ? row.data : null;
  } catch (e) { return undefined; }
}

/* Save the document. Goes through save_user_data (stale-write guard: the
   server refuses a doc older than the one it holds) and falls back to a plain
   upsert on databases without the RPC. Resolves to
     { ok: true }                       saved
     { ok: true, stale: true, ts }      the server already had a NEWER doc — reload it
     { ok: false }                      network / auth failure (nothing changed) */
export async function saveCloudDoc(userId, d) {
  try {
    const { data, error } = await supabase.rpc("save_user_data", { doc: d });
    if (!error && data && typeof data === "object") {
      return data.applied ? { ok: true } : { ok: true, stale: true, ts: Number(data.stored_ts) || 0 };
    }
    if (error && !/save_user_data|function|404/i.test(String(error.message || error.code || ""))) return { ok: false };
    const up = await supabase.from("user_data").upsert(
      { user_id: userId, data: d, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return { ok: !up.error };
  } catch (e) { return { ok: false }; }
}
export async function saveCloud(userId, d) { const r = await saveCloudDoc(userId, d); return r.ok && !r.stale; }

/* One save in flight at a time, always sending the NEWEST document: two
   overlapping requests can otherwise complete out of order. */
const SAVE_Q = new Map(); // userId -> { running: Promise|null, next: doc|null }
export function queueCloudSave(userId, d, onResult) {
  const q = SAVE_Q.get(userId) || { running: null, next: null };
  SAVE_Q.set(userId, q);
  q.next = d;
  if (q.running) return q.running;
  const run = async () => {
    let last = { ok: false };
    while (q.next) {
      const doc = q.next; q.next = null;
      last = await saveCloudDoc(userId, doc);
      if (onResult) onResult(last, doc);
    }
    q.running = null;
    return last;
  };
  q.running = run();
  return q.running;
}

/* Commit a change that must not be lost (deletions): write the reduced
   document to the cloud FIRST; the caller applies `reduce` to live state only
   after the server said yes. Throws a user-readable Error otherwise.
     resolves { next }                         saved; apply reduce() to state
     throws   Error("Couldn't reach …")        network/auth failure, nothing changed
     throws   Error("…another device…") + .cloud   server had a newer doc: reload it, retry */
export async function commitDoc({ userId, base, reduce, timeoutMs = 12000 }) {
  if (!base) throw new Error("Not loaded yet.");
  const next = { ...reduce(base), _ts: Date.now() };
  const timeout = new Promise((res) => setTimeout(() => res({ ok: false }), timeoutMs));
  const r = await Promise.race([saveCloudDoc(userId, next), timeout]);
  if (!r.ok) throw new Error("Couldn't reach RichR — check your connection and try again.");
  if (r.stale) {
    const cloud = await loadCloud(userId);
    const err = new Error("Your portfolio changed on another device — please try again.");
    err.cloud = cloud && typeof cloud === "object" ? cloud : null;
    throw err;
  }
  return { next };
}

/* ---------- price pipeline ---------- */
/* Every ticker anyone holds gets registered in seed_tickers (feeding the
   watched_tickers view), which the
   refresh-prices edge function polls once a minute. Duplicate inserts are
   ignored; failures are silent (worst case the price just stays manual). */
export const watchTicker = async (t) => {
  const ticker = String(t || "").trim().toUpperCase();
  if (!ticker) return;
  try {
    await supabase.from("seed_tickers").upsert({ ticker }, { onConflict: "ticker", ignoreDuplicates: true });
  } catch (e) { /* non-fatal */ }
};

/* AI proxy calls carry the user's session token — the /api routes refuse
   anonymous callers so the OpenAI budget can't be spent from outside the app. */
export const aiFetch = async (url, init = {}) => {
  let token = null;
  try { const { data } = await supabase.auth.getSession(); token = data && data.session && data.session.access_token; } catch (e) { /* signed-out */ }
  return fetch(url, { ...init, headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
};

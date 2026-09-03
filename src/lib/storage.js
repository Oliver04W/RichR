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

export async function saveCloud(userId, d) {
  try {
    const { error } = await supabase.from("user_data").upsert(
      { user_id: userId, data: d, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return !error;
  } catch (e) { return false; }
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

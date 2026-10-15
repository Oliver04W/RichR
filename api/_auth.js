// Shared for the AI proxy routes: only signed-in RichR users may spend the
// OpenAI / Anthropic budget. The client sends its Supabase access token as
// `Authorization: Bearer <jwt>`; we verify it with Supabase Auth (anon key is
// public, so nothing secret is needed here).
const SUPABASE_URL = "https://exknelcubfqlzbkwfyic.supabase.co";
const SUPABASE_ANON = "sb_publishable_cXtkJw62aAkTvPmB8JDy9Q_N7G9Pglc";

export async function requireUser(req) {
  const auth = req.headers?.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) {
    return null;
  }
}

export const unauthorized = (res) =>
  res.status(401).json({ error: { message: "Sign in to use AI features." } });

// The iOS app runs at capacitor://localhost (or ionic://localhost), so its
// calls to these routes are cross-origin. Allow exactly those origins plus
// the site itself; answers the CORS preflight. Returns true when handled.
const ALLOWED_ORIGINS = new Set(["capacitor://localhost", "ionic://localhost", "https://rich-r.vercel.app", "http://localhost:5173"]);
export function cors(req, res) {
  const origin = req.headers?.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

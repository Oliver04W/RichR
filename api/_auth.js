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

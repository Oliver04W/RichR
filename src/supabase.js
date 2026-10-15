import { createClient } from "@supabase/supabase-js";
import { isNative } from "./lib/native.js";

// Publishable (anon) key — safe to ship in the client. What it can do is
// controlled entirely by Row Level Security policies in the database.
export const SUPABASE_URL = "https://exknelcubfqlzbkwfyic.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cXtkJw62aAkTvPmB8JDy9Q_N7G9Pglc";

// In the iOS app, OAuth and magic links come back through a deep link
// (fi.richr.app://auth-callback?code=…), so the app uses the PKCE flow and
// exchanges the code itself. The website keeps the existing flow.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: isNative
    ? { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
    : { persistSession: true, autoRefreshToken: true },
});

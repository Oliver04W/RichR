import { createClient } from "@supabase/supabase-js";

// Publishable (anon) key — safe to ship in the client. What it can do is
// controlled entirely by Row Level Security policies in the database.
export const SUPABASE_URL = "https://exknelcubfqlzbkwfyic.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cXtkJw62aAkTvPmB8JDy9Q_N7G9Pglc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

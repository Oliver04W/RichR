import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import RichR from "./RichR";

export default function App() {
  // undefined = still checking the stored session, null = signed out
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  return <RichR user={session.user} onSignOut={() => supabase.auth.signOut()} />;
}

function Splash() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="text-2xl font-bold text-slate-800">
        Rich<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">R</span>
      </div>
    </div>
  );
}

function Login() {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(""); // which provider is opening
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);

  // One handler for all OAuth providers.
  const signInWith = async (provider, label) => {
    setErr("");
    setBusy(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setErr(`${label}: ${error.message}`);
      setBusy("");
    }
    // on success the browser redirects to the provider, so busy stays set
  };

  // Email magic link — no password to remember.
  const sendMagicLink = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr || !addr.includes("@")) { setErr("Enter a valid email address."); return; }
    setErr("");
    setBusy("email");
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy("");
    if (error) { setErr(error.message); return; }
    setLinkSent(true);
  };

  const oauthBtn =
    "w-full flex items-center justify-center gap-2.5 border border-slate-200 rounded-2xl py-3 font-semibold text-slate-700 bg-white hover:bg-slate-50 transition disabled:opacity-60";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-800">
            Rich<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">R</span>
          </h1>
          <p className="text-sm text-slate-400 font-medium mt-2">Grow your money with friends</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h2 className="font-bold text-lg text-slate-700">Welcome</h2>
          <p className="text-sm text-slate-400 mt-1 mb-5">
            Sign in to track your portfolio, write theses and share progress.
          </p>

          <div className="space-y-2.5">
            <button onClick={() => signInWith("google", "Google")} disabled={!!busy} className={oauthBtn}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>

            <button onClick={() => signInWith("linkedin_oidc", "LinkedIn")} disabled={!!busy} className={oauthBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45z"/>
              </svg>
              {busy === "linkedin_oidc" ? "Opening LinkedIn…" : "Continue with LinkedIn"}
            </button>

            <button onClick={() => signInWith("facebook", "Facebook")} disabled={!!busy} className={oauthBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12z"/>
              </svg>
              {busy === "facebook" ? "Opening Facebook…" : "Continue with Facebook"}
            </button>
          </div>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">or</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {linkSent ? (
            <div className="text-center py-2">
              <div className="text-sm font-semibold text-emerald-600">Check your inbox!</div>
              <p className="text-xs text-slate-400 mt-1">
                We sent a sign-in link to {email.trim().toLowerCase()}. Open it on this device.
              </p>
              <button onClick={() => { setLinkSent(false); }}
                className="text-xs font-semibold text-slate-400 underline mt-2">
                Use a different email
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendMagicLink(); }}
                placeholder="you@email.com" type="email" autoComplete="email"
                className="flex-1 min-w-0 border border-slate-200 rounded-2xl px-3.5 py-3 text-sm outline-none focus:border-emerald-300" />
              <button onClick={sendMagicLink} disabled={!!busy}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold px-4 rounded-2xl shadow disabled:opacity-60 shrink-0">
                {busy === "email" ? "Sending…" : "Email me a link"}
              </button>
            </div>
          )}

          {err && (
            <p className="text-xs text-rose-500 font-medium mt-3 leading-relaxed break-words">
              {err}
            </p>
          )}
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed">
          Your portfolio data is stored on this device, tied to your account.
          Only what you explicitly share goes on the friends board.
        </p>
      </div>
    </div>
  );
}

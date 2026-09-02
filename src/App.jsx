import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import RichR, { PublicProfile } from "./RichR";

export default function App() {
  // undefined = still checking the stored session, null = signed out
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // /u/<username> — public profile page, no sign-in needed
  const m = typeof window !== "undefined" && window.location.pathname.match(/^\/u\/([a-z0-9_]{3,20})\/?$/i);
  if (m) return <PublicProfile username={m[1]} />;

  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  return <RichR user={session.user} onSignOut={() => supabase.auth.signOut()} />;
}

function Splash() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <img src="/logo.png" alt="RichR" className="w-20 h-20 object-contain animate-pulse" />
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

  /* Sign-in card: the only interactive block on the page. On phones it
     sits below the pitch; "Create your portfolio" scrolls to it. */
  const signInRef = useRef(null);
  const goSignIn = () => { if (signInRef.current) signInRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); };

  const GoogleIcon = (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
  const LinkedInIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0A66C2" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45z"/>
    </svg>
  );
  const FacebookIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12z"/>
    </svg>
  );

  /* One clear path: Google → or → email. LinkedIn/Facebook stay available
     but small, so the card reads as a single decision, not a menu. */
  const signInCard = (
    <div ref={signInRef} id="signin" className="bg-white rounded-3xl p-6 sm:p-8 shadow-lg shadow-slate-200/60 border border-slate-100 w-full max-w-[580px] mx-auto">
      <h2 className="font-bold text-[22px] tracking-tight text-slate-900">Create your portfolio</h2>
      <p className="text-[15px] text-slate-500 mt-1">Create your portfolio in about 20 seconds. It’s free.</p>

      <button onClick={() => signInWith("google", "Google")} disabled={!!busy}
        className="mt-6 w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[15px] transition disabled:opacity-60">
        <span className="bg-white rounded-full p-1 flex">{GoogleIcon}</span>
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs font-semibold text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {linkSent ? (
        <div className="text-center py-3 bg-emerald-50 rounded-2xl">
          <div className="text-sm font-semibold text-emerald-700">Check your inbox</div>
          <p className="text-xs text-slate-500 mt-1">
            We sent a sign-in link to {email.trim().toLowerCase()}. Open it on this device.
          </p>
          <button onClick={() => { setLinkSent(false); }} className="text-xs font-semibold text-slate-400 underline mt-2">
            Use a different email
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendMagicLink(); }}
            placeholder="you@email.com" type="email" autoComplete="email" aria-label="Email address"
            className="w-full h-14 border border-slate-200 rounded-2xl px-4 text-[15px] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
          <button onClick={sendMagicLink} disabled={!!busy}
            className="w-full h-14 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-[15px] transition disabled:opacity-60">
            {busy === "email" ? "Sending link…" : "Continue with email"}
          </button>
          <p className="text-[11px] text-slate-400 text-center">No password — we email you a sign-in link.</p>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 mt-5">
        <button onClick={() => signInWith("linkedin_oidc", "LinkedIn")} disabled={!!busy}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-full px-3 py-1.5 transition disabled:opacity-60">
          {LinkedInIcon} {busy === "linkedin_oidc" ? "Opening…" : "LinkedIn"}
        </button>
        <button onClick={() => signInWith("facebook", "Facebook")} disabled={!!busy}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-full px-3 py-1.5 transition disabled:opacity-60">
          {FacebookIcon} {busy === "facebook" ? "Opening…" : "Facebook"}
        </button>
      </div>

      {err && (
        <p className="text-xs text-rose-500 font-medium mt-3 leading-relaxed break-words text-center">{err}</p>
      )}

      <div className="mt-6 pt-4 border-t border-slate-100 flex items-start gap-2 text-[13px] text-slate-600">
        <span aria-hidden="true">🔒</span>
        <span><span className="font-semibold text-slate-800">Private by default.</span> You control what friends can see.</span>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Already have an account? Sign in the same way.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto px-5 pt-8 pb-16">
        {/* top bar */}
        <div className="flex items-center justify-between mb-10">
          <div className="text-2xl font-extrabold tracking-tight text-slate-800 flex items-baseline">
            Rich<img src="/logo.png" alt="R" className="h-[1.35rem] w-auto inline-block translate-y-[1px]" />
          </div>
          <button onClick={goSignIn} className="text-sm font-semibold text-slate-600 hover:text-slate-800">Sign in</button>
        </div>

        <div className="lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:items-start">
          {/* pitch + mock profile */}
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.05]">
              Invest better.<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">Together.</span>
            </h1>
            <p className="text-lg text-slate-500 mt-4 max-w-md leading-relaxed">
              Track your portfolio, compare performance with friends and discover what great investors are buying.
            </p>

            {/* mock profile card — clearly a demo */}
            <MockProfile />

            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <button onClick={goSignIn}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold px-6 py-3.5 rounded-full shadow-lg shadow-emerald-200 text-base">
                Create your portfolio →
              </button>
              <span className="text-xs text-slate-400">Free · no card · import from a screenshot in ~20 s</span>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mt-10">
              {[
                ["Track", "Live prices, cash-flow-adjusted returns, allocation and a RichR Score that tells you what to improve."],
                ["Compare", "A private leaderboard and activity feed with the friends you choose — percentages, never euro amounts."],
                ["Discover", "Group chats, shared positions with the thesis behind them, and one-tap research on any ticker."],
              ].map(([t, d]) => (
                <div key={t} className="bg-white rounded-2xl p-4 border border-slate-100">
                  <div className="font-bold text-slate-800">{t}</div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* sign-in */}
          <div className="mt-10 lg:mt-0 lg:sticky lg:top-8">
            {signInCard}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-12 leading-relaxed max-w-lg mx-auto">
          RichR is a tool for tracking and talking about investments with friends. Nothing here is investment advice.
        </p>
      </div>
    </div>
  );
}

/* A believable, clearly-labelled example profile: the product in one glance. */
function MockProfile() {
  const holdings = [["NVO", 22], ["ASML", 18], ["VOO", 16], ["RHM", 12], ["TSM", 9]];
  return (
    <div className="mt-8 bg-white rounded-3xl p-5 shadow-lg shadow-slate-200/60 border border-slate-100 max-w-md relative">
      <span className="absolute -top-2.5 left-5 text-[10px] font-bold uppercase tracking-wide bg-slate-800 text-white px-2 py-0.5 rounded-full">Example profile</span>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">🐢</div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800">Emma</div>
          <div className="text-xs text-slate-400">Long-term · @emma_invests</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold text-emerald-600">+18.4%</div>
          <div className="text-[10px] font-semibold text-slate-400">YTD · S&P +11.2%</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[["RichR Score", "78", "text-emerald-600"], ["Risk", "Moderate", "text-slate-700"], ["Friends", "14", "text-slate-700"]].map(([l, v, c]) => (
          <div key={l} className="bg-slate-50 rounded-2xl p-2.5 text-center">
            <div className={`font-bold text-sm ${c}`}>{v}</div>
            <div className="text-[10px] font-semibold text-slate-400">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="text-[10px] font-semibold text-slate-400 mb-1.5">TOP HOLDINGS · ALLOCATION</div>
        <div className="space-y-1">
          {holdings.map(([t, w]) => (
            <div key={t} className="flex items-center gap-2">
              <div className="text-xs font-semibold text-slate-700 w-12">{t}</div>
              <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden"><div className="bg-emerald-400 h-full rounded-full" style={{ width: `${w * 3.5}%` }} /></div>
              <div className="text-[11px] font-semibold text-slate-500 w-8 text-right">{w}%</div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
        <div><span className="font-semibold text-emerald-700">@emma_invests</span> increased <b>ASML</b> from 12% → 18% <span className="text-slate-300">· 2h</span></div>
        <div><span className="font-semibold text-emerald-700">@jonas</span> RichR Score rose 71 → <b>76</b> <span className="text-slate-300">· 1d</span></div>
      </div>
    </div>
  );
}

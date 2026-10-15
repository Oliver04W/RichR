import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import RichR, { PublicProfile } from "./RichR";
import { LegalPage, TermsGate } from "./features/safety.jsx";
import { hasAcceptedTerms } from "./lib/moderation.js";
import { authRedirect, closeAuthBrowser, initNativeShell, isNative, listenPushTaps, openAuthBrowser, platform, watchNetwork } from "./lib/native.js";

/* Completes an OAuth / magic-link sign-in that came back through the app's
   deep link (fi.richr.app://auth-callback?code=… or #access_token=…). */
async function finishNativeAuth(url) {
  try {
    const u = new URL(url);
    const code = u.searchParams.get("code");
    const hash = new URLSearchParams((u.hash || "").replace(/^#/, ""));
    if (code) await supabase.auth.exchangeCodeForSession(code);
    else if (hash.get("access_token")) await supabase.auth.setSession({ access_token: hash.get("access_token"), refresh_token: hash.get("refresh_token") });
  } catch (e) { console.error("RichR auth callback failed:", e); }
  closeAuthBrowser();
}

const sha256Hex = async (str) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/* Native Sign in with Apple (Face ID sheet) → Supabase ID-token sign-in. */
async function signInWithAppleNative() {
  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
  const rawNonce = crypto.getRandomValues(new Uint32Array(4)).join("-");
  const res = await SignInWithApple.authorize({
    clientId: "fi.richr.app",
    redirectURI: "https://exknelcubfqlzbkwfyic.supabase.co/auth/v1/callback",
    scopes: "email name",
    state: String(Date.now()),
    nonce: await sha256Hex(rawNonce),
  });
  const r = res && res.response;
  if (!r || !r.identityToken) throw new Error("Apple didn't return a sign-in token.");
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: r.identityToken, nonce: rawNonce });
  if (error) throw error;
  // Apple shares the name only on the very first sign-in — keep it.
  const name = [r.givenName, r.familyName].filter(Boolean).join(" ");
  if (name) await supabase.auth.updateUser({ data: { full_name: name } });
}

/* Invite links (/?invite=CODE) survive the OAuth round-trip through localStorage;
   RichR consumes the code once the user is signed in. */
const INVITE_KEY = "richr_invite";
if (typeof window !== "undefined") {
  try {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code && /^[A-Za-z0-9_-]{16,64}$/.test(code)) {
      localStorage.setItem(INVITE_KEY, code);
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch (e) { /* storage blocked — the link just opens the app */ }
}
const hasPendingInvite = () => { try { return !!localStorage.getItem(INVITE_KEY); } catch (e) { return false; } };

export default function App() {
  // undefined = still checking the stored session, null = signed out
  const [session, setSession] = useState(undefined);

  const [termsOk, setTermsOk] = useState(undefined); // undefined = checking
  const [online, setOnline] = useState(true);
  const [legal, setLegal] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // iOS app: deep links (auth callback, shared /u/ and invite links), push taps, offline state
  useEffect(() => {
    const go = (path) => { if (path && path !== window.location.pathname + window.location.search) window.location.assign(path); };
    let offShell = () => {}, offPush = () => {};
    initNativeShell({ onAuthUrl: finishNativeAuth, onOpenPath: go }).then((f) => { offShell = f; });
    listenPushTaps(go).then((f) => { offPush = f; });
    const offNet = watchNetwork(setOnline);
    return () => { offShell(); offPush(); offNet(); };
  }, []);

  const uid = session && session.user && session.user.id;
  useEffect(() => {
    if (!uid) { setTermsOk(undefined); return; }
    let dead = false;
    hasAcceptedTerms(uid).then((ok) => { if (!dead) setTermsOk(ok); });
    return () => { dead = true; };
  }, [uid]);

  const legalOverlay = legal && <LegalPage which={legal} onSwitch={setLegal} onClose={() => setLegal(null)} />;
  const offlineBanner = !online && (
    <div role="status" className="fixed top-0 inset-x-0 z-[80] bg-slate-900 text-white text-[12px] font-semibold text-center py-1.5"
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}>
      You're offline — showing your last synced portfolio. Changes save when you reconnect.
    </div>
  );

  // /privacy, /terms, /support — public pages (App Store Connect needs these URLs)
  const legalPath = typeof window !== "undefined" && window.location.pathname.match(/^\/(privacy|terms|support)\/?$/);
  if (legalPath) {
    const which = legalPath[1] === "support" ? "terms" : legalPath[1];
    return <LegalPage which={legal || which} onSwitch={setLegal} onClose={() => window.location.assign("/")} support={legalPath[1] === "support"} />;
  }

  // /u/<username> — public profile page, no sign-in needed
  const m = typeof window !== "undefined" && window.location.pathname.match(/^\/u\/([a-z0-9_]{3,20})\/?$/i);
  if (m) return <PublicProfile username={m[1]} />;

  // Local-only demo session (never active on the deployed host): lets the UI be
  // exercised without an account — every backend call simply comes back empty.
  const demo = !isNative && typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && new URLSearchParams(window.location.search).get("demo") === "1";
  if (demo) return <RichR user={{ id: "00000000-0000-4000-8000-000000000000", email: "demo@richr.local" }} onSignOut={() => {}} />;

  if (session === undefined) return <Splash />;
  if (!session) return <>{offlineBanner}<Login onOpenLegal={setLegal} />{legalOverlay}</>;
  if (termsOk === undefined) return <Splash />;
  if (!termsOk) return <>{offlineBanner}<TermsGate user={session.user} onAccepted={() => setTermsOk(true)} onOpenLegal={setLegal} />{legalOverlay}</>;
  return <>{offlineBanner}<RichR user={session.user} onSignOut={() => supabase.auth.signOut()} /></>;
}

function Splash() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <img src="/logo.png" alt="RichR" className="w-20 h-20 object-contain animate-pulse" />
    </div>
  );
}

function Login({ onOpenLegal }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(""); // which provider is opening
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");

  // One handler for all OAuth providers. In the iOS app the provider opens in
  // an in-app Safari sheet and returns through the fi.richr.app:// deep link.
  const signInWith = async (provider, label) => {
    setErr("");
    setBusy(provider);
    if (provider === "apple" && platform === "ios") {
      try { await signInWithAppleNative(); }
      catch (e) { if (!/cancel|1001/i.test(String(e && (e.message || e.code)))) setErr(`Apple: ${(e && e.message) || "sign-in failed"}`); }
      setBusy("");
      return;
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authRedirect(), skipBrowserRedirect: isNative },
    });
    if (error) {
      setErr(`${label}: ${error.message}`);
      setBusy("");
      return;
    }
    if (isNative && data && data.url) { await openAuthBrowser(data.url); setBusy(""); }
    // on the web the browser redirects to the provider, so busy stays set
  };

  // Email + password — for accounts created with a password (e.g. the App Review demo account).
  const signInWithPassword = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr.includes("@") || !password) { setErr("Enter your email and password."); return; }
    setErr(""); setBusy("password");
    const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
    setBusy("");
    if (error) setErr(error.message);
  };

  // Email magic link — no password to remember.
  const sendMagicLink = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr || !addr.includes("@")) { setErr("Enter a valid email address."); return; }
    setErr("");
    setBusy("email");
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: authRedirect() },
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

  const AppleIcon = (
    <svg width="17" height="17" viewBox="0 0 384 512" aria-hidden="true">
      <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
    </svg>
  );

  /* One clear path: Google → or → email. LinkedIn/Facebook stay available
     but small, so the card reads as a single decision, not a menu. */
  const signInCard = (
    <div ref={signInRef} id="signin" className="bg-white rounded-3xl p-6 sm:p-8 shadow-lg shadow-slate-200/60 border border-slate-100 w-full max-w-[580px] mx-auto">
      <h2 className="font-bold text-[22px] tracking-tight text-slate-900">Create your portfolio</h2>
      <p className="text-[15px] text-slate-500 mt-1">Create your portfolio in about 20 seconds. It’s free.</p>
      {hasPendingInvite() && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[13px] text-emerald-800">
          🔒 You've been invited to a private community — sign in and we'll take you there.
        </div>
      )}

      <button onClick={() => signInWith("google", "Google")} disabled={!!busy}
        className="mt-6 w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[15px] transition disabled:opacity-60">
        <span className="bg-white rounded-full p-1 flex">{GoogleIcon}</span>
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <button onClick={() => signInWith("apple", "Apple")} disabled={!!busy}
        className="mt-2.5 w-full h-14 flex items-center justify-center gap-3 rounded-2xl bg-black hover:bg-slate-900 text-white font-semibold text-[15px] transition disabled:opacity-60">
        {AppleIcon}
        {busy === "apple" ? "Opening Apple…" : "Continue with Apple"}
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
          {usePassword && (
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") signInWithPassword(); }}
              placeholder="Password" type="password" autoComplete="current-password" aria-label="Password"
              className="w-full h-14 border border-slate-200 rounded-2xl px-4 text-[15px] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
          )}
          <button onClick={usePassword ? signInWithPassword : sendMagicLink} disabled={!!busy}
            className="w-full h-14 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-[15px] transition disabled:opacity-60">
            {busy === "email" ? "Sending link…" : busy === "password" ? "Signing in…" : usePassword ? "Sign in" : "Continue with email"}
          </button>
          <p className="text-[11px] text-slate-400 text-center">
            {usePassword ? <>Or <button onClick={() => { setUsePassword(false); setErr(""); }} className="underline">email me a sign-in link</button> instead.</>
              : <>No password — we email you a sign-in link. <button onClick={() => { setUsePassword(true); setErr(""); }} className="underline">Use a password</button></>}
          </p>
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
      <p className="text-[11px] text-slate-400 mt-2">
        By continuing you agree to the <button onClick={() => onOpenLegal("terms")} className="underline">Terms of Use</button> and <button onClick={() => onOpenLegal("privacy")} className="underline">Privacy Policy</button>.
      </p>
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
          <br /><button onClick={() => onOpenLegal("terms")} className="underline">Terms</button> · <button onClick={() => onOpenLegal("privacy")} className="underline">Privacy</button> · <a href="mailto:oliverwartiovaara@gmail.com" className="underline">Contact</a>
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

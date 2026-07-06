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
  const [busy, setBusy] = useState(false);

  const signInWithGoogle = async () => {
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
    // on success the browser redirects to Google, so no need to reset busy
  };

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

          <button onClick={signInWithGoogle} disabled={busy}
            className="w-full flex items-center justify-center gap-2.5 border border-slate-200 rounded-2xl py-3 font-semibold text-slate-700 bg-white hover:bg-slate-50 transition disabled:opacity-60">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>

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

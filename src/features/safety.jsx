/* Safety & account: report / block menu on every piece of user content,
   blocked-users list, account deletion, moderator queue, terms gate and the
   Terms / Privacy pages. Required for App Store guideline 1.2 and 5.1.1(v). */
import { useEffect, useState } from "react";
import { Ban, Flag, LifeBuoy, MoreHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import { BottomSheet, ConfirmDialog } from "../ui/primitives.jsx";
import { REPORT_REASONS, SUPPORT_EMAIL, acceptTerms, blockUser, deleteMyAccount, listBlocks, reportContent, unblockUser } from "../lib/moderation.js";
import { supabase } from "../supabase";
import { haptic } from "../lib/native.js";

/* ---------- ⋯ menu: Report / Block on someone else's content ---------- */
export function ModMenu({ kind, contentId, authorId, authorName, me, onDone, say, className = "" }) {
  const [open, setOpen] = useState(null); // null | menu | report | block
  if (!authorId || authorId === me) return null;
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen("menu"); }} aria-label="More: report or block"
        className={`w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 shrink-0 ${className}`}>
        <MoreHorizontal size={14} />
      </button>
      {open === "menu" && (
        <BottomSheet title={authorName ? `@${authorName}` : "Options"} onClose={() => setOpen(null)}>
          <div className="px-5 pb-6 space-y-2">
            <button onClick={() => setOpen("report")} className="w-full flex items-center gap-3 h-12 px-4 rounded-2xl bg-slate-50 text-[15px] font-semibold text-slate-800">
              <Flag size={16} className="text-amber-500" /> Report {kind === "user" ? "profile" : kind === "group" ? "community" : "this"}
            </button>
            <button onClick={() => setOpen("block")} className="w-full flex items-center gap-3 h-12 px-4 rounded-2xl bg-rose-50 text-[15px] font-semibold text-rose-600">
              <Ban size={16} /> Block {authorName ? `@${authorName}` : "this person"}
            </button>
            <p className="text-[11px] text-slate-400 pt-1">Blocking hides their posts, comments and activity from you, removes them as a friend, and stops them from seeing yours. They aren't told.</p>
          </div>
        </BottomSheet>
      )}
      {open === "report" && (
        <ReportSheet kind={kind} contentId={contentId} authorId={authorId} authorName={authorName}
          onClose={() => setOpen(null)} onDone={(blocked) => { setOpen(null); say && say(blocked ? "Reported and blocked." : "Thanks — reported. It's hidden for you."); onDone && onDone(); }} />
      )}
      {open === "block" && (
        <BlockConfirm userId={authorId} name={authorName} onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); say && say(`Blocked${authorName ? ` @${authorName}` : ""}.`); onDone && onDone(); }} />
      )}
    </>
  );
}

export function ReportSheet({ kind, contentId, authorId, authorName, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true); setErr("");
    const { error } = await reportContent(kind, contentId, reason, details.trim());
    if (error) { setBusy(false); setErr("Couldn't send the report — try again."); return; }
    if (alsoBlock && authorId) await blockUser(authorId);
    haptic("success");
    onDone(alsoBlock);
  };
  return (
    <BottomSheet title="Report" onClose={onClose}>
      <div className="px-5 pb-6">
        <p className="text-[13px] text-slate-500 mb-3">Why are you reporting this? Reports are anonymous and reviewed within 24 hours.</p>
        <div className="space-y-1.5" role="radiogroup">
          {REPORT_REASONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={reason === id} onClick={() => setReason(id)}
              className={`w-full text-left h-11 px-4 rounded-xl border text-[14px] font-medium transition ${reason === id ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 500))} rows={2}
          placeholder="Anything we should know? (optional)" className="mt-3 w-full border border-slate-200 rounded-xl px-3 py-2 text-[14px] resize-none" />
        {authorId && kind !== "user" && (
          <label className="flex items-center gap-2 mt-2 text-[13px] text-slate-600">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="accent-emerald-600" />
            Also block {authorName ? `@${authorName}` : "this person"}
          </label>
        )}
        {err && <p role="alert" className="text-xs text-rose-600 mt-2">{err}</p>}
        <button onClick={submit} disabled={!reason || busy} className="btn-primary w-full h-12 mt-4 disabled:opacity-50">
          {busy ? "Sending…" : "Send report"}
        </button>
      </div>
    </BottomSheet>
  );
}

export function BlockConfirm({ userId, name, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <ConfirmDialog title={`Block ${name ? `@${name}` : "this person"}?`} label="Block" busy={busy} error={err}
      text="You won't see each other's posts, comments, calls or activity, and they'll be removed from your friends. You can unblock them in Profile › Blocked."
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        const { error } = await blockUser(userId);
        if (error) { setBusy(false); setErr("Couldn't block — try again."); return; }
        haptic("success");
        onDone();
      }} />
  );
}

/* ---------- Profile › Safety & account ---------- */
export function SafetySection({ user, say, onSignOut, onOpenLegal }) {
  const [blocks, setBlocks] = useState(null);
  const [showBlocks, setShowBlocks] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  useEffect(() => {
    listBlocks().then(({ data }) => setBlocks(data));
    supabase.rpc("is_moderator").then(({ data }) => setIsMod(!!data), () => {});
  }, [user.id]);

  const Row = ({ icon, label, sub, onClick, tone = "text-slate-700", href }) => {
    const Icon = icon;
    const inner = (
      <>
        <Icon size={17} className={tone === "text-slate-700" ? "text-slate-400" : tone} />
        <div className="flex-1 min-w-0 text-left">
          <div className={`text-[14px] font-semibold ${tone}`}>{label}</div>
          {sub && <div className="text-[11px] text-slate-400 truncate">{sub}</div>}
        </div>
      </>
    );
    const cls = "w-full flex items-center gap-3 py-3 border-b border-slate-100 last:border-b-0";
    return href ? <a href={href} className={cls}>{inner}</a> : <button onClick={onClick} className={cls}>{inner}</button>;
  };

  return (
    <div className="bg-white rounded-2xl px-5 py-2 shadow-sm border border-slate-100">
      <h3 className="font-bold text-slate-700 pt-3 pb-1">Safety & account</h3>
      {isMod && <Row icon={ShieldCheck} label="Moderation queue" sub="Reported posts and people" onClick={() => setShowQueue(true)} tone="text-emerald-700" />}
      <Row icon={Ban} label="Blocked" sub={blocks === null ? "…" : blocks.length ? `${blocks.length} ${blocks.length === 1 ? "person" : "people"}` : "No one"} onClick={() => setShowBlocks(true)} />
      <Row icon={LifeBuoy} label="Contact & support" sub={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}?subject=RichR%20support`} />
      <Row icon={ShieldCheck} label="Terms of Use · Privacy Policy" onClick={() => onOpenLegal("terms")} />
      <div className="pt-3 pb-2 text-[11px] text-slate-400">
        Signed in{user && user.email ? ` as ${user.email}` : ""}. Your portfolio syncs to your account and follows you across devices.
      </div>
      <button onClick={onSignOut} className="w-full bg-slate-100 rounded-xl py-2.5 text-sm font-semibold text-slate-700">Sign out</button>
      <button onClick={() => setDeleting(true)} className="w-full mt-2 mb-3 rounded-xl py-2.5 text-sm font-semibold text-rose-600 flex items-center justify-center gap-1.5">
        <Trash2 size={14} /> Delete account
      </button>

      {showBlocks && (
        <BottomSheet title="Blocked" onClose={() => setShowBlocks(false)}>
          <div className="px-5 pb-6">
            {!blocks || blocks.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">You haven't blocked anyone. Use ⋯ on a post or profile to block someone.</p>
            ) : blocks.map((b) => (
              <div key={b.user_id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-b-0">
                <span className="text-sm font-semibold text-slate-700">@{b.username || "deleted"}</span>
                <button onClick={async () => {
                  const { error } = await unblockUser(b.user_id);
                  if (error) { say("Couldn't unblock — try again."); return; }
                  setBlocks((bs) => bs.filter((x) => x.user_id !== b.user_id));
                  say(`Unblocked @${b.username || "user"}.`);
                }} className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">Unblock</button>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
      {showQueue && <ModQueue say={say} onClose={() => setShowQueue(false)} />}
    </div>
  );
}

/* Two-step: explain what goes, then type DELETE. */
export function DeleteAccountDialog({ onClose }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    if (typed.trim().toUpperCase() !== "DELETE" || busy) return;
    setBusy(true); setErr("");
    const { error } = await deleteMyAccount();
    if (error) { setBusy(false); setErr("Couldn't delete your account — nothing was removed. Try again or contact support."); return; }
    window.location.replace("/");
  };
  return (
    <BottomSheet title="Delete account" onClose={() => !busy && onClose()}>
      <div className="px-5 pb-6">
        <p className="text-[14px] text-slate-600 leading-relaxed">This permanently deletes your RichR account and everything in it:</p>
        <ul className="text-[13px] text-slate-600 mt-2 space-y-1 list-disc pl-5">
          <li>your portfolios, transactions, goals and history</li>
          <li>your profile, leaderboard entry and friends</li>
          <li>your posts, comments, votes, reactions and chat messages</li>
        </ul>
        <p className="text-[12px] text-slate-400 mt-2">Communities you created pass to their longest-standing member; ones where you're alone are deleted. This can't be undone.</p>
        <label className="block text-[13px] font-semibold text-slate-700 mt-4">Type DELETE to confirm</label>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" aria-label="Type DELETE to confirm"
          className="mt-1.5 w-full h-12 border border-slate-200 rounded-xl px-3 text-[15px] outline-none focus:border-rose-400" />
        {err && <p role="alert" className="text-xs text-rose-600 mt-2">{err}</p>}
        <button onClick={go} disabled={typed.trim().toUpperCase() !== "DELETE" || busy}
          className="w-full h-12 mt-4 rounded-xl bg-rose-600 text-white font-bold text-sm disabled:opacity-40">
          {busy ? "Deleting…" : "Permanently delete my account"}
        </button>
        <button onClick={onClose} disabled={busy} className="w-full h-11 mt-2 rounded-xl text-sm font-semibold text-slate-500">Cancel</button>
      </div>
    </BottomSheet>
  );
}

/* ---------- moderator queue ---------- */
const KIND_LABEL = { group_post: "Community post", stock_post: "Stock discussion", event_comment: "Feed comment", stock_call: "Buy/Hold/Sell reason", group: "Community", user: "Profile" };

export function ModQueue({ say, onClose }) {
  const [rows, setRows] = useState(null);
  const load = async () => {
    const { data, error } = await supabase.rpc("mod_queue");
    setRows(error ? [] : data || []);
  };
  useEffect(() => { load(); }, []);
  const act = async (r, action) => {
    const { error } = await supabase.rpc("mod_resolve", { k: r.kind, cid: r.content_id, action });
    if (error) { say("Couldn't save — try again."); return; }
    say(action === "dismiss" ? "Kept." : action === "ban" ? "Removed and banned." : "Removed.");
    setRows((rs) => rs.filter((x) => !(x.kind === r.kind && x.content_id === r.content_id)));
  };
  return (
    <BottomSheet title={`Moderation${rows && rows.length ? ` · ${rows.length}` : ""}`} onClose={onClose}>
      <div className="px-5 pb-6 space-y-3">
        {rows === null ? <div className="skel h-16" /> : rows.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">Nothing to review. 🎉</p>
        ) : rows.map((r) => (
          <div key={r.kind + r.content_id} className="border border-slate-200 rounded-2xl p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
              <span>{KIND_LABEL[r.kind] || r.kind}</span><span>·</span><span>@{r.author || "unknown"}</span>
              <span className="ml-auto text-amber-600">{r.reports} report{r.reports === 1 ? "" : "s"}{r.hidden ? " · hidden" : ""}</span>
            </div>
            <div className="text-[14px] text-slate-700 mt-1.5 whitespace-pre-wrap break-words">{r.snapshot || <i className="text-slate-400">(no text)</i>}</div>
            <div className="text-[11px] text-slate-500 mt-1.5">Reason: {r.reason}{r.details ? ` — ${r.details}` : ""}</div>
            <div className="grid grid-cols-3 gap-1.5 mt-2.5">
              <button onClick={() => act(r, "dismiss")} className="h-9 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">Keep</button>
              <button onClick={() => act(r, "remove")} className="h-9 rounded-lg bg-amber-50 text-xs font-semibold text-amber-700">Remove</button>
              <button onClick={() => act(r, "ban")} className="h-9 rounded-lg bg-rose-50 text-xs font-semibold text-rose-600">Remove + ban</button>
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

/* ---------- first-run terms gate (EULA, guideline 1.2) ---------- */
export function TermsGate({ user, onAccepted, onOpenLegal }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100 w-full max-w-md">
        <img src="/logo.png" alt="" className="w-12 h-12 object-contain" />
        <h1 className="text-[22px] font-bold text-slate-900 mt-3">Before you start</h1>
        <p className="text-[14px] text-slate-600 mt-2 leading-relaxed">RichR is a place to share portfolios and opinions with other people. To keep it that way:</p>
        <ul className="text-[14px] text-slate-700 mt-3 space-y-2">
          <li>🤝 <b>Zero tolerance</b> for harassment, hate, scams or other objectionable content. Accounts that post it are removed.</li>
          <li>🚩 Use <b>⋯ → Report</b> or <b>Block</b> on anything or anyone. We review reports within 24 hours.</li>
          <li>📈 Nothing on RichR is investment advice. Votes and scores are community opinion.</li>
        </ul>
        <p className="text-[12px] text-slate-500 mt-4">
          By continuing you agree to the <button onClick={() => onOpenLegal("terms")} className="underline font-semibold">Terms of Use</button> and
          the <button onClick={() => onOpenLegal("privacy")} className="underline font-semibold">Privacy Policy</button>.
        </p>
        {err && <p role="alert" className="text-xs text-rose-600 mt-2">{err}</p>}
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          const { error } = await acceptTerms(user.id);
          if (error) { setBusy(false); setErr("Couldn't save — check your connection and try again."); return; }
          onAccepted();
        }} className="btn-primary w-full h-12 mt-5 disabled:opacity-60">{busy ? "…" : "I agree"}</button>
      </div>
    </div>
  );
}

/* ---------- Terms of Use / Privacy Policy ---------- */
export function LegalPage({ which, onClose, onSwitch, support = false }) {
  const isTerms = which === "terms";
  const H = ({ children }) => <h2 className="font-bold text-slate-800 mt-5 mb-1.5 text-[15px]">{children}</h2>;
  const P = ({ children }) => <p className="text-[14px] text-slate-600 leading-relaxed mb-2">{children}</p>;
  return (
    <div className="fixed inset-0 z-[70] bg-white overflow-y-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center justify-between"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <button onClick={onClose} className="text-sm font-semibold text-emerald-700">Done</button>
        <div className="bg-slate-100 rounded-xl p-1 flex text-[12px] font-semibold">
          <button onClick={() => onSwitch("terms")} className={`px-3 h-7 rounded-lg ${isTerms ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Terms</button>
          <button onClick={() => onSwitch("privacy")} className={`px-3 h-7 rounded-lg ${!isTerms ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Privacy</button>
        </div>
        <span className="w-10" />
      </div>
      <div className="max-w-2xl mx-auto px-5 py-6 pb-16">
        {support && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6">
            <h1 className="text-xl font-extrabold text-slate-900">RichR support</h1>
            <p className="text-[14px] text-slate-600 mt-1">Questions, bugs, account or data requests, or a report about content: email <a className="text-emerald-700 font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We reply within two working days, and review content reports within 24 hours.</p>
            <p className="text-[13px] text-slate-500 mt-2">Delete your account any time in the app: Profile › Safety & account › Delete account.</p>
          </div>
        )}
        {isTerms ? (
          <>
            <h1 className="text-2xl font-extrabold text-slate-900">Terms of Use</h1>
            <p className="text-xs text-slate-400 mt-1">Version {"2026-10"} · RichR, operated by Oliver Wartiovaara, Helsinki, Finland</p>
            <H>1. What RichR is</H>
            <P>RichR lets you track investment portfolios and share performance, holdings (as percentages), opinions and messages with other people. RichR does not hold money, execute trades or give investment, tax or legal advice.</P>
            <H>2. Not investment advice</H>
            <P>Buy/Hold/Sell votes, sentiment, RichR Scores, AI-generated research and anything users post are opinions, not recommendations. Prices may be delayed or wrong. You are solely responsible for your investment decisions.</P>
            <H>3. Your account</H>
            <P>You must be at least 16 years old. Keep your sign-in secure; you're responsible for activity on your account. You can delete your account at any time in Profile › Safety & account › Delete account.</P>
            <H>4. Community rules — zero tolerance</H>
            <P>There is no tolerance for objectionable content or abusive users. You may not post content that is hateful, harassing, threatening, sexually explicit, violent, illegal, or that infringes others' rights; promote scams, pump-and-dump schemes or market manipulation; impersonate others; spam; or share other people's personal data.</P>
            <P>Anyone can report content or block users with the ⋯ menu. We review reports within 24 hours, remove content that breaks these rules and remove the accounts of users who post it. Content with several reports may be hidden automatically while it is reviewed.</P>
            <H>5. Your content</H>
            <P>You keep ownership of what you post. You give RichR a non-exclusive licence to store and display it to the audience you chose (friends, a community, or everyone on RichR for stock discussions and votes) for as long as it stays on RichR.</P>
            <H>6. Availability and liability</H>
            <P>RichR is provided “as is”. To the extent permitted by law we are not liable for losses arising from use of the service, including decisions based on data or content shown in it. Nothing in these terms limits rights you have under mandatory consumer law.</P>
            <H>7. Changes and contact</H>
            <P>We may update these terms; we'll ask you to accept material changes in the app. Finnish law applies. Questions or complaints: <a className="text-emerald-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</P>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold text-slate-900">Privacy Policy</h1>
            <p className="text-xs text-slate-400 mt-1">Controller: Oliver Wartiovaara (RichR), Helsinki, Finland · <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
            <H>What we collect</H>
            <P><b>Account:</b> email address and name from the sign-in method you choose (Apple, Google, LinkedIn, Facebook or email link). With Sign in with Apple you can hide your email.</P>
            <P><b>Portfolio data you enter:</b> holdings, share counts, average prices, transactions, goals and settings. Screenshots you import are sent to our AI provider to read the positions and are not stored.</P>
            <P><b>Social content:</b> username, posts, comments, votes, reactions, chat messages, friends and community memberships, and reports you send.</P>
            <P><b>Device:</b> a push-notification token if you allow notifications. We don't use advertising identifiers or third-party trackers.</P>
            <H>Who sees what</H>
            <P>Your portfolio is private by default. Friends see only what you switch on under “What friends can see”, and only as percentages — never amounts. Stock discussions and Buy/Hold/Sell votes are visible to everyone on RichR. A public profile link exists only if you turn it on.</P>
            <H>Why (legal basis)</H>
            <P>To provide the service you asked for (contract), to keep the community safe and prevent abuse (legitimate interest), and for notifications (consent, which you can withdraw in your device settings).</P>
            <H>Processors</H>
            <P>Supabase (database and authentication), Vercel (hosting), OpenAI (screenshot import and AI research — text and images you submit), Finnhub and Yahoo Finance (market data; no personal data sent), Apple Push Notification service.</P>
            <H>How long</H>
            <P>Until you delete your account. Deleting it in the app removes your data immediately from the live database; copies in our provider's backups expire on their normal schedule. Reports you sent are kept anonymised for moderation records.</P>
            <H>Your rights</H>
            <P>Under the GDPR you can access, correct, export or delete your data, object to processing, and complain to the Finnish Data Protection Ombudsman (tietosuoja.fi). Email us for an export.</P>
          </>
        )}
      </div>
    </div>
  );
}

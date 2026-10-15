// send-push — delivers pending rows from public.push_outbox to Apple Push
// Notification service. Called by the database (pg_net, see
// 20261016_push_notifications.sql) right after a notification is queued.
//
// Environment (Supabase › Edge Functions › send-push › Secrets):
//   PUSH_WEBHOOK_SECRET   same random string as the Vault secret send_push_secret
//   APNS_KEY_ID           10-character Key ID of the .p8 key (Apple Developer › Keys)
//   APNS_TEAM_ID          10-character Team ID
//   APNS_PRIVATE_KEY      contents of the AuthKey_XXXX.p8 file (BEGIN/END lines included)
//   APNS_BUNDLE_ID        fi.richr.app
//   APNS_ENV              "production" for TestFlight/App Store, "sandbox" for Xcode debug builds
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Deploy with JWT verification OFF (the database calls it with the shared
// secret instead):   supabase functions deploy send-push --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// APNs provider token (ES256 JWT), cached for 50 minutes (Apple allows up to 60).
let cachedJwt: { token: string; at: number } | null = null;
async function apnsJwt(): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.at < 50 * 60 * 1000) return cachedJwt.token;
  const pem = env("APNS_PRIVATE_KEY").replace(/\\n/g, "\n");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: env("APNS_KEY_ID") })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: env("APNS_TEAM_ID"), iat: Math.floor(Date.now() / 1000) })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  cachedJwt = { token: `${header}.${claims}.${b64url(sig)}`, at: Date.now() };
  return cachedJwt.token;
}

async function sendToDevice(token: string, n: { title: string; body: string; path: string | null }) {
  const host = env("APNS_ENV") === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsJwt()}`,
      "apns-topic": env("APNS_BUNDLE_ID") || "fi.richr.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ aps: { alert: { title: n.title, body: n.body }, sound: "default" }, path: n.path ?? "/" }),
  });
  if (res.ok) return { ok: true, gone: false, reason: "" };
  let reason = String(res.status);
  try { reason = (await res.json()).reason || reason; } catch { /* empty body */ }
  // 410 / BadDeviceToken / Unregistered: the app was deleted or the token rotated
  return { ok: false, gone: res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered", reason };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  if (!env("PUSH_WEBHOOK_SECRET") || req.headers.get("x-push-secret") !== env("PUSH_WEBHOOK_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  if (!env("APNS_KEY_ID") || !env("APNS_TEAM_ID") || !env("APNS_PRIVATE_KEY")) {
    return new Response(JSON.stringify({ sent: 0, note: "APNs not configured yet" }), { headers: { "content-type": "application/json" } });
  }

  // Claim up to 100 pending notifications from the last 6 hours.
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("push_outbox").select("id, user_id, title, body, path")
    .is("sent_at", null).gte("created_at", since).order("created_at").limit(100);
  if (error) return new Response(error.message, { status: 500 });
  if (!rows || rows.length === 0) return new Response(JSON.stringify({ sent: 0 }), { headers: { "content-type": "application/json" } });

  // Mark claimed first, so overlapping calls don't double-send.
  await supabase.from("push_outbox").update({ sent_at: new Date().toISOString() }).in("id", rows.map((r) => r.id)).is("sent_at", null);

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: tokens } = await supabase.from("push_tokens").select("token, user_id").in("user_id", userIds);
  let sent = 0;
  const dead: string[] = [];
  for (const r of rows) {
    const mine = (tokens ?? []).filter((t) => t.user_id === r.user_id);
    const errs: string[] = [];
    for (const t of mine) {
      const out = await sendToDevice(t.token, r);
      if (out.ok) sent++;
      else { errs.push(out.reason); if (out.gone) dead.push(t.token); }
    }
    if (errs.length) await supabase.from("push_outbox").update({ error: errs.join(",") }).eq("id", r.id);
  }
  if (dead.length) await supabase.from("push_tokens").delete().in("token", dead);

  // Keep the outbox small.
  await supabase.from("push_outbox").delete().lt("created_at", new Date(Date.now() - 7 * 86400 * 1000).toISOString());

  return new Response(JSON.stringify({ sent, removedTokens: dead.length }), { headers: { "content-type": "application/json" } });
});

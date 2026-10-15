/* Native (Capacitor) bridge. Every helper degrades to a sensible web
   behaviour, so the same build runs on rich-r.vercel.app and in the iOS app. */
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "ios" | "android" | "web"

/* The public web address — used for shareable links (invites, /u/username)
   and for the /api routes when running inside the app (where the page
   origin is capacitor://localhost). */
export const PUBLIC_ORIGIN = "https://rich-r.vercel.app";
export const webOrigin = () => (isNative || typeof window === "undefined" ? PUBLIC_ORIGIN : window.location.origin);
export const apiUrl = (path) => (isNative ? PUBLIC_ORIGIN + path : path);

/* Deep link that OAuth providers and magic links return to inside the app.
   Registered as a URL scheme in ios/App/App/Info.plist and must be added to
   Supabase › Auth › URL Configuration › Redirect URLs. */
export const NATIVE_AUTH_REDIRECT = "fi.richr.app://auth-callback";
export const authRedirect = () => (isNative ? NATIVE_AUTH_REDIRECT : window.location.origin);

/* ---------- haptics ---------- */
let H = null;
const loadHaptics = async () => H || (H = await import("@capacitor/haptics"));
export async function haptic(kind = "light") {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await loadHaptics();
    if (kind === "success") await Haptics.notification({ type: NotificationType.Success });
    else if (kind === "warning") await Haptics.notification({ type: NotificationType.Warning });
    else if (kind === "select") await Haptics.selectionChanged();
    else await Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch (e) { /* haptics unavailable */ }
}

/* ---------- share sheet ---------- */
/* Opens the native share sheet with text/url and optionally an image file.
   Returns "shared" | "copied" | "cancelled" | "unsupported". */
export async function shareContent({ title, text, url, file = null }) {
  if (isNative) {
    try {
      const { Share } = await import("@capacitor/share");
      let files;
      if (file) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem").catch(() => ({}));
        if (Filesystem) {
          const b64 = await blobToBase64(file);
          const w = await Filesystem.writeFile({ path: file.name || "richr.png", data: b64, directory: Directory.Cache });
          files = [w.uri];
        }
      }
      await Share.share({ title, text, url, files, dialogTitle: title });
      return "shared";
    } catch (e) { return /cancel/i.test(String(e && e.message)) ? "cancelled" : "unsupported"; }
  }
  try {
    const payload = file ? { files: [file], title, text } : { title, text, url };
    if (navigator.share && (!file || (navigator.canShare && navigator.canShare(payload)))) { await navigator.share(payload); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  if (url && navigator.clipboard) { try { await navigator.clipboard.writeText(url); return "copied"; } catch (e) { /* no clipboard */ } }
  return "unsupported";
}
const blobToBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/* ---------- network status ---------- */
export function watchNetwork(cb) {
  let off = () => {};
  if (isNative) {
    import("@capacitor/network").then(async ({ Network }) => {
      const s = await Network.getStatus(); cb(s.connected);
      const h = await Network.addListener("networkStatusChange", (st) => cb(st.connected));
      off = () => h.remove();
    }).catch(() => {});
  } else if (typeof window !== "undefined") {
    const on = () => cb(true), down = () => cb(false);
    cb(navigator.onLine !== false);
    window.addEventListener("online", on); window.addEventListener("offline", down);
    off = () => { window.removeEventListener("online", on); window.removeEventListener("offline", down); };
  }
  return () => off();
}

/* ---------- app shell: status bar, splash, deep links ---------- */
export async function initNativeShell({ onAuthUrl, onOpenPath }) {
  if (!isNative) return () => {};
  const subs = [];
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
  } catch (e) { /* no status bar plugin */ }
  try { const { SplashScreen } = await import("@capacitor/splash-screen"); await SplashScreen.hide(); } catch (e) { /* ignore */ }
  try {
    const { App } = await import("@capacitor/app");
    subs.push(await App.addListener("appUrlOpen", ({ url }) => {
      if (!url) return;
      if (url.startsWith(NATIVE_AUTH_REDIRECT)) { onAuthUrl(url); return; }
      // universal links: https://rich-r.vercel.app/u/name or /?invite=CODE
      try { const u = new URL(url); onOpenPath && onOpenPath(u.pathname + u.search); } catch (e) { /* bad url */ }
    }));
  } catch (e) { /* ignore */ }
  return () => subs.forEach((s) => s.remove());
}

/* Opens an OAuth URL in the in-app Safari sheet (SFSafariViewController). */
export async function openAuthBrowser(url) {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, presentationStyle: "popover" });
}
export async function closeAuthBrowser() {
  try { const { Browser } = await import("@capacitor/browser"); await Browser.close(); } catch (e) { /* already closed */ }
}

/* ---------- push notifications ---------- */
/* Asks permission (only after the user taps "Turn on"), registers with APNs
   and stores the token so the send-push edge function can reach the device. */
export async function enablePush(supabase, userId) {
  if (!isNative) return { ok: false, reason: "web" };
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "denied" };
  return new Promise((resolve) => {
    let done = false;
    PushNotifications.addListener("registration", async ({ value }) => {
      if (done) return; done = true;
      const { error } = await supabase.rpc("register_push_token", { tok: value, plat: platform });
      resolve({ ok: !error, reason: error ? "save" : "" });
    });
    PushNotifications.addListener("registrationError", () => { if (!done) { done = true; resolve({ ok: false, reason: "apns" }); } });
    PushNotifications.register();
    setTimeout(() => { if (!done) { done = true; resolve({ ok: false, reason: "timeout" }); } }, 15000);
  });
}

export async function pushStatus() {
  if (!isNative) return "web";
  try { const { PushNotifications } = await import("@capacitor/push-notifications"); return (await PushNotifications.checkPermissions()).receive; }
  catch (e) { return "unavailable"; }
}

/* Tapping a notification opens the right screen (data.path set by send-push). */
export async function listenPushTaps(onPath) {
  if (!isNative) return () => {};
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const h = await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
      const p = a && a.notification && a.notification.data && a.notification.data.path;
      if (p) onPath(p);
    });
    return () => h.remove();
  } catch (e) { return () => {}; }
}

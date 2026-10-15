/* Moderation helpers — reporting, blocking, account deletion.
   Hiding happens in the database (restrictive RLS in
   20261016_app_store_safety.sql), so after a report or block the caller only
   needs to reload: the content is gone for this user on every surface. */
import { supabase } from "../supabase";

export const SUPPORT_EMAIL = "oliverwartiovaara@gmail.com";
export const TERMS_VERSION = "2026-10";

export const REPORT_REASONS = [
  ["spam", "Spam or self-promotion"],
  ["harassment", "Harassment or bullying"],
  ["hate", "Hate speech"],
  ["scam", "Scam or pump-and-dump"],
  ["misleading", "Misleading financial claims"],
  ["sexual", "Sexual content"],
  ["violence", "Violence or threats"],
  ["other", "Something else"],
];

/* Listeners (e.g. feeds) that should reload after a block/report. */
export const moderationBus = { subs: new Set(), emit() { this.subs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); } };

export async function reportContent(kind, contentId, reason, details) {
  const { error } = await supabase.rpc("report_content", { k: kind, cid: contentId, why: reason, note: details || null });
  if (!error) moderationBus.emit();
  return { error };
}

export async function blockUser(userId) {
  const { error } = await supabase.rpc("block_user", { target: userId });
  if (!error) { BLOCKED.ids.add(userId); moderationBus.emit(); }
  return { error };
}

export async function unblockUser(userId) {
  const { error } = await supabase.rpc("unblock_user", { target: userId });
  if (!error) { BLOCKED.ids.delete(userId); moderationBus.emit(); }
  return { error };
}

export async function listBlocks() {
  const { data, error } = await supabase.rpc("my_blocks");
  if (!error) BLOCKED.ids = new Set((data || []).map((r) => r.user_id));
  return { data: data || [], error };
}

/* Local mirror of who I've blocked — for hiding members/avatars instantly. */
export const BLOCKED = { ids: new Set() };

/* Turns a failed insert into a message a person can act on. */
export function postErrorMessage(error) {
  if (!error) return "";
  const msg = String(error.message || "");
  if (msg.includes("objectionable_content")) return "That message contains language that isn't allowed on RichR. Please rephrase it.";
  if (error.code === "42501" || /row-level security/i.test(msg)) return "You can't post here right now.";
  return "Couldn't send — try again.";
}

export async function deleteMyAccount() {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error };
  try { localStorage.clear(); } catch (e) { /* storage blocked */ }
  try { await supabase.auth.signOut({ scope: "local" }); } catch (e) { /* session already gone */ }
  return { error: null };
}

export async function hasAcceptedTerms(userId) {
  const { data, error } = await supabase.from("terms_acceptance").select("version").eq("user_id", userId).eq("version", TERMS_VERSION).maybeSingle();
  if (error) return true; // table missing / offline: never lock people out of their portfolio
  return !!data;
}

export async function acceptTerms(userId) {
  const { error } = await supabase.from("terms_acceptance").insert({ user_id: userId, version: TERMS_VERSION });
  return { error: error && error.code !== "23505" ? error : null };
}

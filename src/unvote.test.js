// castVote / removeVote against a fake Supabase: instant optimistic tallies,
// in-order writes for rapid taps, one refetch after the last one, and a
// 'none' row actually written so the vote is gone server-side too.
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = { rows: [], fail: false, delay: 0 };
vi.mock("./supabase.js", () => ({
  SUPABASE_URL: "x", SUPABASE_PUBLISHABLE_KEY: "y",
  supabase: {
    from: (table) => ({
      insert: async (row) => {
        await new Promise((r) => setTimeout(r, db.delay));
        if (db.fail) return { error: new Error("boom") };
        db.rows.push({ table, ...row, created_at: new Date().toISOString() });
        return { error: null };
      },
    }),
    rpc: async () => ({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

const { __helpers: h } = await import("./RichR.jsx");
const fresh = (mine) => ({ buy: 6, hold: 3, sell: 1, total: 10, mine, reasons: [] });
const seed = (mine) => { h.SENT_CACHE.clear(); h.SENT_CACHE.set("NVDA|everyone|", { at: Date.now(), data: fresh(mine) }); h.SENT_CACHE.set("NVDA|friends|", { at: Date.now(), data: { buy: 2, hold: 0, sell: 0, total: 2, mine } }); };
const cached = (k = "NVDA|everyone|") => (h.SENT_CACHE.get(k) || {}).data;

beforeEach(() => { db.rows = []; db.fail = false; db.delay = 0; h.SOCIAL_ME.id = "me"; h.sentimentBus.subs.clear(); });

describe("castVote / removeVote", () => {
  it("vote → unvote: instant neutral state, then a 'none' row is written and the cache is refetched", async () => {
    seed({ vote: "buy", reason: null, created_at: new Date().toISOString() });
    const phases = [];
    h.sentimentBus.subs.add((t, phase) => phases.push(`${t}:${phase}`));
    const p = h.removeVote("nvda");
    expect(cached().mine).toBeNull();                              // before the network answers
    expect([cached().buy, cached().total]).toEqual([5, 9]);
    expect([cached("NVDA|friends|").buy, cached("NVDA|friends|").total]).toEqual([1, 1]);
    expect(phases).toEqual(["NVDA:optimistic"]);
    expect(await p).toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ table: "stock_calls", user_id: "me", ticker: "NVDA", vote: "none", reason: null, price_at: null, reaffirmed: false });
    expect(phases).toEqual(["NVDA:optimistic", "NVDA:settled"]);
    expect(h.SENT_CACHE.has("NVDA|everyone|")).toBe(false);       // next read comes from the server
  });
  it("vote → change vote → vote again: every change is a new row, newest wins", async () => {
    seed({ vote: "buy", created_at: new Date().toISOString() });
    await h.castVote("NVDA", "sell", { reason: "stretched", price: 120, currency: "USD" });
    seed(null);
    await h.castVote("NVDA", "hold");
    expect(db.rows.map((r) => r.vote)).toEqual(["sell", "hold"]);
    expect(db.rows[0]).toMatchObject({ reason: "stretched", price_at: 120, currency: "USD" });
    expect(cached()).toBeUndefined();
  });
  it("rapid taps are written in order, the last one wins, and the tally is refetched once", async () => {
    db.delay = 15;
    seed({ vote: "buy", created_at: new Date().toISOString() });
    let settled = 0;
    h.sentimentBus.subs.add((t, phase) => { if (phase === "settled") settled += 1; });
    const taps = [h.castVote("NVDA", "hold"), h.removeVote("NVDA"), h.castVote("NVDA", "sell"), h.removeVote("NVDA"), h.castVote("NVDA", "buy")];
    expect(cached().mine.vote).toBe("buy");                        // optimistic result of the whole burst
    expect([cached().buy, cached().hold, cached().sell, cached().total]).toEqual([6, 3, 1, 10]);
    expect(settled).toBe(0);
    expect(await Promise.all(taps)).toEqual([true, true, true, true, true]);
    expect(db.rows.map((r) => r.vote)).toEqual(["hold", "none", "sell", "none", "buy"]);
    expect(settled).toBe(1);
  });
  it("a failed write reports false and drops the optimistic cache so the truth is refetched", async () => {
    db.fail = true;
    seed({ vote: "buy", created_at: new Date().toISOString() });
    expect(await h.removeVote("NVDA")).toBe(false);
    expect(db.rows).toHaveLength(0);
    expect(cached()).toBeUndefined();
  });
  it("removing an already-stale vote does not touch the counted tally", async () => {
    seed({ vote: "buy", created_at: new Date(Date.now() - 40 * 86400000).toISOString() });
    const p = h.removeVote("NVDA");
    expect([cached().buy, cached().total, cached().mine]).toEqual([6, 10, null]);
    await p;
  });
});

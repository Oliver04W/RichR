// Batched sentiment lookups: N cards on one screen → one sentiment_for_many call.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("./supabase.js", () => ({ SUPABASE_URL: "x", SUPABASE_PUBLISHABLE_KEY: "y", supabase: { rpc: (...a) => rpc(...a), from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }) } } }));
const { __helpers: h } = await import("./RichR.jsx");
const s = (buy) => ({ buy, hold: 1, sell: 1, total: buy + 2 });
beforeEach(() => { rpc.mockReset(); h.SENT_CACHE.clear(); });

describe("sentiment batching", () => {
  it("coalesces concurrent 'everyone' lookups into one RPC and fills the cache", async () => {
    rpc.mockResolvedValue({ data: { NVDA: s(10), TSM: s(4), AAPL: s(0) } });
    const [a, b, c, a2] = await Promise.all([h.fetchSentiment("NVDA"), h.fetchSentiment("TSM"), h.fetchSentiment("aapl"), h.fetchSentiment("NVDA")]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("sentiment_for_many", { tickers: ["NVDA", "TSM", "AAPL"] });
    expect([a.buy, b.buy, c.buy, a2.buy]).toEqual([10, 4, 0, 10]);
    expect(h.SENT_CACHE.get("NVDA|everyone|").data.buy).toBe(10);
    await h.fetchSentiment("NVDA");                       // served from cache
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("a single lookup uses sentiment_for; scoped lookups are never batched", async () => {
    rpc.mockResolvedValue({ data: s(3) });
    await h.fetchSentiment("NVDA");
    expect(rpc).toHaveBeenLastCalledWith("sentiment_for", { t: "NVDA", scope: "everyone", gid: null });
    await h.fetchSentiment("NVDA", "friends");
    expect(rpc).toHaveBeenLastCalledWith("sentiment_for", { t: "NVDA", scope: "friends", gid: null });
  });
  it("falls back to per-ticker calls when the batch RPC is missing", async () => {
    rpc.mockImplementation(async (fn, args) => fn === "sentiment_for_many" ? { data: null, error: { message: "function not found" } } : { data: s(args.t === "NVDA" ? 7 : 2) });
    const [a, b] = await Promise.all([h.fetchSentiment("NVDA"), h.fetchSentiment("TSM")]);
    expect([a.buy, b.buy]).toEqual([7, 2]);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["sentiment_for_many", "sentiment_for", "sentiment_for"]);
  });
});

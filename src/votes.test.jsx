// Vote on ANY stock — ownership is a badge, never a requirement or a weight.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";

const db = { rows: [] }; const rpc = vi.fn();
vi.mock("./supabase.js", () => ({
  SUPABASE_URL: "x", SUPABASE_PUBLISHABLE_KEY: "y",
  supabase: {
    from: (t) => ({ insert: async (row) => { db.rows.push({ table: t, ...row }); return { error: null }; }, select: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
    rpc: (...a) => rpc(...a),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
const { __helpers: h } = await import("./RichR.jsx");
afterEach(cleanup);
beforeEach(() => { db.rows = []; rpc.mockReset(); h.SOCIAL_ME.id = "me"; h.SOCIAL_ME.holdings = new Set(["NVDA"]); h.SENT_CACHE.clear(); h.sentimentBus.subs.clear(); });

describe("ownership is a signal, not a requirement", () => {
  it("you can vote on a stock you don't own; the row is flagged owner only when you hold it", async () => {
    expect(await h.castVote("TSLA", "buy")).toBe(true);           // not held → still allowed
    expect(await h.castVote("nvda", "hold")).toBe(true);
    expect(db.rows.map((r) => [r.ticker, r.vote, r.owner])).toEqual([["TSLA", "buy", false], ["NVDA", "hold", true]]);
    await h.removeVote("NVDA");
    expect(db.rows[2]).toMatchObject({ ticker: "NVDA", vote: "none", owner: false });
  });
  it("ownsTicker follows the portfolio, case-insensitively", () => {
    expect(h.ownsTicker("nvda")).toBe(true);
    expect(h.ownsTicker("AAPL")).toBe(false);
  });
  it("an owner's vote moves the owners tally too — with the same weight as anyone else's", () => {
    const s = { buy: 10, hold: 5, sell: 0, total: 15, holders: { buy: 2, hold: 1, sell: 0, total: 3 }, mine: null };
    const a = h.tallyAfterVote(s, null, "sell", { owner: true });
    expect([a.sell, a.total, a.holders.sell, a.holders.total]).toEqual([1, 16, 1, 4]);
    const b = h.tallyAfterVote(a, "sell", "buy", { owner: true });                       // change
    expect([b.sell, b.buy, b.holders.sell, b.holders.buy]).toEqual([0, 11, 0, 3]);
    const c = h.tallyAfterVote(b, "buy", null);                                          // unvote (prev flagged owner via mine)
    expect([c.buy, c.total, c.holders.buy, c.holders.total]).toEqual([10, 15, 2, 3]);
    const d = h.tallyAfterVote(s, null, "buy", { owner: false });                        // non-owner: owners untouched
    expect([d.buy, d.holders.buy, d.holders.total]).toEqual([11, 2, 3]);
  });
});

describe("QuickVote (Discover / list rows)", () => {
  it("tap votes, tap another replaces, tap the same removes", async () => {
    const onChange = vi.fn();
    render(<h.QuickVote ticker="TSLA" mine={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Buy TSLA"));
    expect(onChange).toHaveBeenLastCalledWith("buy", null);
    fireEvent.click(screen.getByLabelText("Sell TSLA"));
    expect(onChange).toHaveBeenLastCalledWith("sell", "buy");
    expect(screen.getByLabelText("Sell TSLA").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByLabelText("Sell TSLA"));
    expect(onChange).toHaveBeenLastCalledWith(null, "sell");
    await waitFor(() => expect(db.rows.map((r) => r.vote)).toEqual(["buy", "sell", "none"]));
  });
  it("a row shows counts under the sample threshold, percentages above it, and owners", () => {
    const { rerender } = render(<h.QuickVoteRow r={{ ticker: "NVDA", buy: 2, hold: 1, sell: 0, total: 3, owners: 1, mine: null }} onOpen={vi.fn()} />);
    expect(screen.getByText(/3 votes · 1 owner/)).toBeTruthy();
    rerender(<h.QuickVoteRow r={{ ticker: "NVDA", buy: 62, hold: 25, sell: 13, total: 100, owners: 4, mine: "buy" }} onOpen={vi.fn()} />);
    expect(screen.getByText("62% Buy")).toBeTruthy();
    expect(screen.getByText(/100 votes · 4 owners/)).toBeTruthy();
    expect(screen.getByLabelText("Buy NVDA").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Discover hub", () => {
  it("renders the six lenses from one RPC and switches between them", async () => {
    rpc.mockImplementation(async (fn) => fn === "discover_sentiment" ? { data: {
      most_voted: [{ ticker: "NVDA", buy: 8, hold: 1, sell: 1, total: 10, recent: 4, owners: 2, mine: null }],
      trending: [{ ticker: "PLTR", buy: 1, hold: 0, sell: 2, total: 3, recent: 3, owners: 0, mine: "sell" }],
      bullish: [], bearish: [{ ticker: "PLTR", buy: 1, hold: 0, sell: 2, total: 3, recent: 3, owners: 0, mine: "sell" }],
      friends_buying: [{ ticker: "ASML", users: ["u1"], n: 1 }], friends_selling: [],
    } } : { data: [] });
    render(<h.DiscoverSentiment onOpenTicker={vi.fn()} />);
    await waitFor(() => screen.getByText("80% Buy"));
    expect(rpc).toHaveBeenCalledWith("discover_sentiment", { lim: 8 });
    fireEvent.click(screen.getByText("Most bearish"));
    expect(screen.getByText("PLTR")).toBeTruthy();
    expect(screen.getByLabelText("Sell PLTR").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("Most bullish"));
    expect(screen.getByText(/Needs a couple of votes/)).toBeTruthy();
    fireEvent.click(screen.getByText("Friends buying"));
    expect(screen.getByText("ASML")).toBeTruthy();
    expect(screen.getByText(/1 friend/)).toBeTruthy();
    fireEvent.click(screen.getByText("Friends selling"));
    expect(screen.getByText(/None of your mutual friends has a Sell call/)).toBeTruthy();
  });
});

describe("Owner badge", () => {
  it("renders ✓ Owner", () => { render(<h.OwnerBadge />); expect(screen.getByText("✓ Owner")).toBeTruthy(); });
});

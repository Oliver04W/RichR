// Public 🌐 / Private 🔒 communities — client side. Server-side privacy is
// covered by supabase/tests/communities_privacy.sql (run in the SQL editor).
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("./supabase.js", () => ({
  SUPABASE_URL: "x", SUPABASE_PUBLISHABLE_KEY: "y",
  supabase: { rpc: (...a) => rpc(...a), from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: async () => ({ data: [] }) }) }) }) }), auth: { getSession: async () => ({ data: { session: null } }) } },
}));
const { __helpers: h } = await import("./RichR.jsx");
afterEach(cleanup);
beforeEach(() => rpc.mockReset());

describe("visibility model", () => {
  it("public is discoverable and self-joinable; private is neither; request is discoverable only", () => {
    expect(h.isDiscoverable({ visibility: "public" })).toBe(true);
    expect(h.canSelfJoin({ visibility: "public" })).toBe(true);
    expect(h.isDiscoverable({ visibility: "private" })).toBe(false);
    expect(h.canSelfJoin({ visibility: "private" })).toBe(false);
    expect(h.isDiscoverable({ visibility: "request" })).toBe(true);     // 🛡️ future: searchable…
    expect(h.canSelfJoin({ visibility: "request" })).toBe(false);       // …but needs approval
    expect(h.visOf({}).label).toBe("Private");                           // unknown → treated as private
    expect(h.VIS_META.public.icon + h.VIS_META.private.icon).toBe("🌐🔒");
  });
  it("topics parse into unique upper-case tickers/topics", () => {
    expect(h.parseTopics("nvda, $TSM ai  amd,nvda")).toEqual(["NVDA", "TSM", "AI", "AMD"]);
    expect(h.parseTopics("")).toEqual([]);
  });
  it("search matches name, description and ticker prefix", () => {
    const g = { name: "AI & Semiconductors", description: "chips and models", topics: ["NVDA", "TSM"] };
    expect(h.communityMatches(g, "semi")).toBe(true);
    expect(h.communityMatches(g, "models")).toBe(true);
    expect(h.communityMatches(g, "ts")).toBe(true);
    expect(h.communityMatches(g, "hanken")).toBe(false);
    expect(h.communityMatches(g, "")).toBe(true);
  });
  it("invite links carry the code as a query parameter", () => {
    expect(h.inviteUrl("abc_DEF-123")).toMatch(/\/\?invite=abc_DEF-123$/);
  });
});

describe("community card", () => {
  it("public card: 🌐, member count, tickers and a Join button", () => {
    const onJoin = vi.fn();
    render(<h.CommunityCard g={{ id: "1", name: "AI & Semiconductors", visibility: "public", member_count: 2431, topics: ["NVDA", "TSM", "AMD", "AVGO", "MU"] }} me="me" onOpen={vi.fn()} onJoin={onJoin} />);
    expect(screen.getByText("2,431 members · NVDA · TSM · AMD · AVGO")).toBeTruthy();
    expect(screen.getByTitle("Public").textContent).toBe("🌐");
    fireEvent.click(screen.getByText("Join"));
    expect(onJoin).toHaveBeenCalled();
  });
  it("private card: 🔒, no Join button even with onJoin", () => {
    render(<h.CommunityCard g={{ id: "2", name: "Hanken Investors", visibility: "private", member_count: 14 }} me="me" onOpen={vi.fn()} onJoin={vi.fn()} />);
    expect(screen.getByText("14 members")).toBeTruthy();
    expect(screen.getByTitle("Private").textContent).toBe("🔒");
    expect(screen.queryByText("Join")).toBeNull();
    expect(screen.getByText("🔒 Private community")).toBeTruthy();
  });
  it("joined public card shows Joined instead of Join", () => {
    render(<h.CommunityCard g={{ id: "1", name: "X", visibility: "public", member_count: 3, joined: true }} me="me" onOpen={vi.fn()} onJoin={vi.fn()} />);
    expect(screen.getByText("Joined")).toBeTruthy();
  });
});

describe("creating a community", () => {
  const mount = () => { const onCreate = vi.fn(); render(<h.NewGroupModal mutuals={[{ id: "f1", username: "jaan" }]} onClose={vi.fn()} onCreate={onCreate} />); return onCreate; };
  it("cannot be created until public or private is chosen explicitly", () => {
    const onCreate = mount();
    fireEvent.change(screen.getByLabelText("Community name"), { target: { value: "Hanken Investors" } });
    const btn = screen.getByText("Create community").closest("button");
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("Choose public or private")).toBeTruthy();
    fireEvent.click(btn);
    expect(onCreate).not.toHaveBeenCalled();
  });
  it("creating a public community sends visibility, description and topics", async () => {
    const onCreate = mount();
    fireEvent.change(screen.getByLabelText("Community name"), { target: { value: "AI & Semiconductors" } });
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Chips" } });
    fireEvent.change(screen.getByLabelText("Topics"), { target: { value: "nvda," } });
    fireEvent.change(screen.getByLabelText("Topics"), { target: { value: "$tsm" } });
    fireEvent.keyDown(screen.getByLabelText("Topics"), { key: "Enter" });
    expect(screen.getByText("$NVDA")).toBeTruthy();
    expect(screen.getByText("$TSM")).toBeTruthy();
    fireEvent.click(screen.getByText("Create 🌐 community"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: "AI & Semiconductors", visibility: "public", description: "Chips", topics: ["NVDA", "TSM"], memberIds: [] }));
  });
  it("creating a private community with a friend", async () => {
    const onCreate = mount();
    fireEvent.change(screen.getByLabelText("Community name"), { target: { value: "Hanken Investors" } });
    fireEvent.click(screen.getByRole("radio", { name: /Private/ }));
    expect(screen.getByText(/Only invited members can find and join/)).toBeTruthy();
    fireEvent.click(screen.getByText("@jaan"));
    expect(screen.getByText("1 picked")).toBeTruthy();
    fireEvent.click(screen.getByText("Create 🔒 community"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ visibility: "private", memberIds: ["f1"] })));
  });
});

describe("friend picker", () => {
  it("shows a search field for many friends, filters, and counts picks", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: "f" + i, username: i === 3 ? "jaan" : "friend" + i }));
    render(<h.NewGroupModal mutuals={many} onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search friends"), { target: { value: "jaa" } });
    expect(screen.getByText("@jaan")).toBeTruthy();
    expect(screen.queryByText("@friend0")).toBeNull();
    fireEvent.click(screen.getByText("@jaan"));
    expect(screen.getByText("@jaan").closest("button").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 picked")).toBeTruthy();
  });
});

describe("topic chips", () => {
  it("turns typed text into removable $TICKER / topic chips", () => {
    let val = ["NVDA"]; const onChange = vi.fn((v) => { val = v; });
    const { rerender } = render(<h.TopicInput value={val} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Topics"), { target: { value: "ai " } });
    expect(onChange).toHaveBeenLastCalledWith(["NVDA", "AI"]);
    rerender(<h.TopicInput value={val} onChange={onChange} />);
    expect(screen.getByText("$NVDA")).toBeTruthy();
    expect(screen.getByText("AI")).toBeTruthy();                 // short word, not a ticker
    fireEvent.click(screen.getByLabelText("Remove NVDA"));
    expect(onChange).toHaveBeenLastCalledWith(["AI"]);
    fireEvent.keyDown(screen.getByLabelText("Topics"), { key: "Backspace" });   // empty input + backspace removes the last chip
    expect(onChange).toHaveBeenLastCalledWith(["NVDA"]);
  });
});

describe("invite links", () => {
  const user = { id: "me" };
  it("a valid invite previews name, visibility and size, then joins", async () => {
    rpc.mockImplementation(async (fn) => fn === "preview_group_invite"
      ? { data: { valid: true, group_id: "g1", name: "Hanken Investors", visibility: "private", member_count: 14, joined: false } }
      : { data: { ok: true, group_id: "g1", name: "Hanken Investors", visibility: "private" } });
    const onJoined = vi.fn();
    render(<h.InviteSheet code="abcdefghijklmnopqrstuvwxyz012345" user={user} onJoined={onJoined} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Hanken Investors"));
    expect(screen.getByText("14 members", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByText("Join Hanken Investors"));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(expect.objectContaining({ id: "g1", member_count: 15 })));
    expect(rpc).toHaveBeenCalledWith("accept_group_invite", { code_in: "abcdefghijklmnopqrstuvwxyz012345" });
  });
  it("invalid and revoked invites reveal nothing", async () => {
    rpc.mockResolvedValueOnce({ data: { valid: false, reason: "invalid" } });
    const { unmount } = render(<h.InviteSheet code="nope" user={user} onJoined={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("This invite link isn't valid."));
    expect(screen.queryByText(/members/)).toBeNull();
    unmount();
    rpc.mockResolvedValueOnce({ data: { valid: false, reason: "revoked" } });
    render(<h.InviteSheet code="old" user={user} onJoined={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("This invite link has been revoked."));
  });
  it("a link that stopped working between preview and accept is reported", async () => {
    rpc.mockImplementation(async (fn) => fn === "preview_group_invite"
      ? { data: { valid: true, group_id: "g1", name: "X", visibility: "private", member_count: 1 } }
      : { data: { ok: false, reason: "revoked" } });
    const onJoined = vi.fn();
    render(<h.InviteSheet code="c" user={user} onJoined={onJoined} onClose={vi.fn()} />);
    await waitFor(() => screen.getByText("Join X"));
    fireEvent.click(screen.getByText("Join X"));
    await waitFor(() => screen.getByText("This invite link has been revoked."));
    expect(onJoined).not.toHaveBeenCalled();
  });
});

describe("sentiment across circles (one vote, many aggregations)", () => {
  it("shows Everyone, Friends and each community with its lead and hides percentages under the minimum sample", async () => {
    rpc.mockResolvedValue({ data: {
      everyone: { buy: 64, hold: 20, sell: 16, total: 100 },
      friends: { buy: 2, hold: 0, sell: 0, total: 2 },
      communities: [
        { id: "a", name: "AI & Semiconductors", visibility: "public", s: { buy: 81, hold: 10, sell: 9, total: 100 } },
        { id: "b", name: "Hanken Investors", visibility: "private", s: { buy: 0, hold: 0, sell: 0, total: 0 } },
      ],
    } });
    render(<h.ScopeSummary ticker="NVDA" />);
    await waitFor(() => screen.getByText("AI & Semiconductors"));
    expect(screen.getAllByText("64% Buy")).toHaveLength(1);
    expect(screen.getByText("2 votes")).toBeTruthy();
    expect(screen.getByText("81% Buy")).toBeTruthy();
    expect(screen.getByText("no votes")).toBeTruthy();
    expect(screen.getByText("🔒")).toBeTruthy();
    expect(screen.getByText("🌐")).toBeTruthy();
  });
  it("a vote / change / unvote moves through the same tally in every scope", () => {
    const scopes = { everyone: { buy: 5, hold: 3, sell: 2, total: 10, mine: null }, friends: { buy: 1, hold: 1, sell: 0, total: 2, mine: null }, community: { buy: 3, hold: 0, sell: 0, total: 3, mine: null } };
    const apply = (prev, next) => Object.fromEntries(Object.entries(scopes).map(([k, s]) => [k, h.tallyAfterVote(s, prev, next)]));
    let s = apply(null, "buy");
    expect([s.everyone.buy, s.friends.buy, s.community.buy]).toEqual([6, 2, 4]);
    s = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, h.tallyAfterVote(v, "buy", "sell")]));
    expect([s.everyone.buy, s.everyone.sell, s.community.sell, s.community.total]).toEqual([5, 3, 1, 4]);
    s = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, h.tallyAfterVote(v, "sell", null)]));
    expect([s.everyone.total, s.friends.total, s.community.total, s.community.mine]).toEqual([10, 2, 3, null]);
  });
});

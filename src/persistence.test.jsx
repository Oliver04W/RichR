// Deletion must survive refresh, sign-out and other devices: the cloud
// document is the source of truth, writes are guarded against stale
// snapshots, and the UI only reports "deleted" after the server agreed.
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";

const rpc = vi.fn(), upsert = vi.fn(), select = vi.fn();
vi.mock("./supabase.js", () => ({
  SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "y",
  supabase: {
    rpc: (...a) => rpc(...a),
    from: () => ({ upsert: (...a) => upsert(...a), select: () => ({ eq: () => ({ maybeSingle: () => select() }) }) }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
const { __helpers: h } = await import("./RichR.jsx");
afterEach(cleanup);
beforeEach(() => { rpc.mockReset(); upsert.mockReset(); select.mockReset(); });

const doc = (over = {}) => ({
  activeId: "p1", _ts: 100,
  portfolios: [
    { id: "p1", name: "Main", holdings: [{ id: "a", ticker: "NVDA", shares: 10, buyPrice: 100 }, { id: "b", ticker: "AAPL", shares: 5, buyPrice: 150 }], closed: [] },
    { id: "p2", name: "Fun", holdings: [{ id: "c", ticker: "TSLA", shares: 1, buyPrice: 200 }], closed: [] },
  ],
  snapshots: { p1: [{ t: 1, value: 1 }], p2: [{ t: 1, value: 2 }] }, analysis: { p1: { x: 1 } }, news: {},
  ...over,
});

describe("cloud save with stale-write guard", () => {
  it("applied → ok", async () => {
    rpc.mockResolvedValue({ data: { applied: true, stored_ts: 5 } });
    expect(await h.saveCloudDoc("u", { _ts: 5 })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("save_user_data", { doc: { _ts: 5 } });
  });
  it("server holds a newer document → stale, nothing overwritten", async () => {
    rpc.mockResolvedValue({ data: { applied: false, stored_ts: 9 } });
    expect(await h.saveCloudDoc("u", { _ts: 5 })).toEqual({ ok: true, stale: true, ts: 9 });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("network failure → not ok (never reported as saved)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "FetchError: failed" } });
    expect(await h.saveCloudDoc("u", { _ts: 5 })).toEqual({ ok: false });
  });
  it("database without the RPC → plain upsert fallback", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function save_user_data" } });
    upsert.mockResolvedValue({ error: null });
    expect(await h.saveCloudDoc("u", { _ts: 5 })).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalled();
  });
  it("overlapping autosaves are serialised and only the newest document is sent", async () => {
    let resolveFirst; const results = [];
    rpc.mockImplementationOnce(() => new Promise((r) => { resolveFirst = () => r({ data: { applied: true, stored_ts: 1 } }); }))
       .mockResolvedValue({ data: { applied: true, stored_ts: 3 } });
    h.queueCloudSave("u", { _ts: 1, v: 1 }, (r, d) => results.push(d.v));
    h.queueCloudSave("u", { _ts: 2, v: 2 });
    const p = h.queueCloudSave("u", { _ts: 3, v: 3 });
    resolveFirst(); await p;
    expect(rpc.mock.calls.map((c) => c[1].doc.v)).toEqual([1, 3]);   // v2 was superseded before it was sent
    expect(results).toEqual([1, 3]);
  });
});

describe("commitDoc — cloud first, then state", () => {
  const reduce = (d) => ({ ...d, portfolios: d.portfolios.map((p) => ({ ...p, holdings: p.holdings.filter((x) => x.id !== "a") })) });
  it("resolves with the saved document when the server applied it", async () => {
    rpc.mockResolvedValue({ data: { applied: true, stored_ts: 1 } });
    const { next } = await h.commitDoc({ userId: "u", base: doc(), reduce });
    expect(next.portfolios[0].holdings.map((x) => x.id)).toEqual(["b"]);
    expect(next._ts).toBeGreaterThan(100);
    expect(rpc.mock.calls[0][1].doc.portfolios[0].holdings).toHaveLength(1);   // what went to the server is already reduced
  });
  it("throws (and changes nothing) when the server can't be reached", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    await expect(h.commitDoc({ userId: "u", base: doc(), reduce })).rejects.toThrow(/Couldn't reach RichR/);
  });
  it("throws with the newer cloud document when another device saved first", async () => {
    rpc.mockResolvedValue({ data: { applied: false, stored_ts: 999 } });
    select.mockResolvedValue({ data: { data: doc({ _ts: 999, activeId: "p2" }) }, error: null });
    const err = await h.commitDoc({ userId: "u", base: doc(), reduce }).catch((e) => e);
    expect(err.message).toMatch(/another device/);
    expect(err.cloud.activeId).toBe("p2");
  });
  it("times out instead of hanging", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    await expect(h.commitDoc({ userId: "u", base: doc(), reduce, timeoutMs: 30 })).rejects.toThrow(/Couldn't reach/);
  });
});

describe("portfolio deletion reducer", () => {
  it("deleting one of several keeps the others untouched and switches to the first remaining", () => {
    const out = h.removePortfolio(doc(), "p1");
    expect(out.portfolios.map((p) => p.id)).toEqual(["p2"]);
    expect(out.portfolios[0]).toEqual(doc().portfolios[1]);
    expect(out.activeId).toBe("p2");
    expect(out.snapshots).toEqual({ p2: [{ t: 1, value: 2 }] });   // per-portfolio caches cleaned
    expect(out.analysis).toEqual({});
  });
  it("deleting a non-active portfolio keeps the active one selected", () => {
    const out = h.removePortfolio(doc(), "p2");
    expect(out.activeId).toBe("p1");
    expect(out.portfolios).toHaveLength(1);
  });
  it("deleting the last portfolio leaves a fresh empty one", () => {
    const one = h.removePortfolio(doc(), "p2");
    const out = h.removePortfolio(one, "p1", () => "fresh");
    expect(out.portfolios).toEqual([{ id: "fresh", name: "My Portfolio", holdings: [], closed: [] }]);
    expect(out.activeId).toBe("fresh");
    expect(out.snapshots).toEqual({});
  });
  it("is idempotent (safe to run on the sent doc and on live state)", () => {
    const once = h.removePortfolio(doc(), "p1");
    expect(h.removePortfolio(once, "p1")).toEqual(once);
  });
});

describe("price refresh cannot resurrect a deleted holding", () => {
  it("prices are patched onto the CURRENT holdings, never onto the fetched snapshot", () => {
    const priceMap = { NVDA: { price: 180, currency: "USD" }, AAPL: { price: 190, currency: "USD" } };
    const before = doc().portfolios[0].holdings;                  // captured when the refresh started
    const now = before.filter((x) => x.id !== "a");               // NVDA deleted while the request was in flight
    const applied = now.map((x) => h.applyPriceRow(x, priceMap, { USD: 1 }, "USD"));
    expect(applied.map((x) => x.ticker)).toEqual(["AAPL"]);
    expect(applied[0].currentPrice).toBe(190);
    expect(before.map((x) => h.applyPriceRow(x, priceMap, { USD: 1 }, "USD"))).toHaveLength(2); // the old way — the bug
  });
});

describe("delete dialog: loading, double-tap, errors", () => {
  it("shows Deleting…, blocks a second tap, closes only on success", async () => {
    let resolve; const action = vi.fn(() => new Promise((r) => { resolve = r; }));
    const onCancel = vi.fn();
    render(<h.AsyncConfirm text="Delete NVDA from your portfolio?" label="Delete" onCancel={onCancel} action={action} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Deleting…")).toBeTruthy();
    fireEvent.click(screen.getByText("Deleting…"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Cancel").closest("button").disabled).toBe(true);
    resolve();
  });
  it("a failed delete shows the error and keeps the dialog (nothing reported as deleted)", async () => {
    const action = vi.fn().mockRejectedValue(new Error("Couldn't reach RichR — check your connection and try again."));
    render(<h.AsyncConfirm text="Delete NVDA from your portfolio?" label="Delete" onCancel={vi.fn()} action={action} />);
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't reach RichR/);
    expect(screen.getByText("Delete")).toBeTruthy();                 // back to an actionable state
  });
});

describe("holdings list end to end", () => {
  const fx = { at: 0, rates: { USD: 1 } };
  function Harness({ save }) {
    const [holdings, setHoldings] = useState(doc().portfolios[0].holdings);
    const onRemove = async (id) => { await save(); setHoldings((hs) => hs.filter((x) => x.id !== id)); };
    return <h.PositionsTab active={{ id: "p1", name: "Main", holdings, closed: [] }} cur="USD" fx={fx} companyInfo={{}} onSaveInfo={vi.fn()}
      onUpsert={vi.fn()} onRemove={onRemove} onSetPrice={vi.fn()} onLoadSample={vi.fn()} onClosePosition={vi.fn()}
      onEditFields={vi.fn()} onSetShares={vi.fn()} onAddShares={vi.fn()} onRemoveMany={vi.fn()} onSell={vi.fn()} say={vi.fn()}
      watchlist={[]} onRemoveWatch={vi.fn()} onSetWatchPrice={vi.fn()} goResearch={vi.fn()} />;
  }
  it("delete → confirm → server ok → row gone", async () => {
    render(<Harness save={async () => {}} />);
    fireEvent.click(screen.getByLabelText("More actions for NVDA"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    fireEvent.click(screen.getByRole("alertdialog").querySelector("button.bg-rose-600"));
    await waitFor(() => expect(screen.queryByText("NVDA")).toBeNull());
    expect(screen.getByText("AAPL")).toBeTruthy();
  });
  it("delete → server fails → row stays and the error is shown", async () => {
    render(<Harness save={async () => { throw new Error("Couldn't reach RichR — check your connection and try again."); }} />);
    fireEvent.click(screen.getByLabelText("More actions for NVDA"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    fireEvent.click(screen.getByRole("alertdialog").querySelector("button.bg-rose-600"));
    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByText("NVDA")).toBeTruthy();
  });
});

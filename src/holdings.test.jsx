// Holdings maintenance: pure reducers + the quick-edit / confirm UI.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { __helpers as h } from "./RichR.jsx";

afterEach(cleanup);

const fx = { at: 0, rates: { USD: 1, EUR: 0.9, SEK: 10 } };
const port = () => [
  { id: "a", ticker: "NVDA", name: "NVIDIA", shares: 20, buyPrice: 100, currentPrice: 200, currency: "USD", buyDate: "2026-01-10" },
  { id: "b", ticker: "AAPL", name: "Apple", shares: 10, buyPrice: 150, currentPrice: 150, currency: "USD", buyDate: "2026-02-01" },
  { id: "c", ticker: "NOKIA.HE", name: "Nokia", shares: 100, buyPrice: 4, currentPrice: 5, currency: "EUR", buyDate: "2026-03-01" },
];

describe("holdings reducers", () => {
  it("deleting a holding removes only that one and nothing else changes", () => {
    const out = h.removeHoldings(port(), "b");
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
    expect(out[0]).toEqual(port()[0]);                       // untouched objects
  });
  it("deleting multiple holdings at once", () => {
    expect(h.removeHoldings(port(), ["a", "c"]).map((x) => x.ticker)).toEqual(["AAPL"]);
    expect(h.removeHoldings(port(), ["nope"])).toHaveLength(3);
  });
  it("changing quantity keeps everything else and rounds sanely", () => {
    const out = h.setHoldingShares(port(), "a", 25.1234567);
    expect(out.find((x) => x.id === "a")).toMatchObject({ shares: 25.123457, buyPrice: 100, currentPrice: 200 });
    expect(out).toHaveLength(3);
  });
  it("reducing quantity to zero removes the holding", () => {
    expect(h.setHoldingShares(port(), "a", 0).map((x) => x.id)).toEqual(["b", "c"]);
    expect(h.setHoldingShares(port(), "a", -3).map((x) => x.id)).toEqual(["b", "c"]);
    expect(h.addHoldingShares(port(), "a", -20).map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("increasing quantity at a price re-averages the buy price", () => {
    const out = h.addHoldingShares(port(), "a", 10, 250);
    expect(out.find((x) => x.id === "a")).toMatchObject({ shares: 30, buyPrice: 150 });   // (20×100 + 10×250) / 30
    const noPrice = h.addHoldingShares(port(), "a", 10);
    expect(noPrice.find((x) => x.id === "a")).toMatchObject({ shares: 30, buyPrice: 100 });
    const less = h.addHoldingShares(port(), "a", -5, 999);
    expect(less.find((x) => x.id === "a")).toMatchObject({ shares: 15, buyPrice: 100 });  // reducing never touches the average
  });
  it("editing the average price, date and currency", () => {
    const out = h.editHolding(port(), "a", { buyPrice: "120.5", buyDate: "2025-12-01", currency: "eur" });
    expect(out.find((x) => x.id === "a")).toMatchObject({ buyPrice: 120.5, buyDate: "2025-12-01", currency: "EUR", shares: 20 });
    expect(h.editHolding(port(), "a", { buyPrice: -5 })[0].buyPrice).toBe(0);
    expect(h.editHolding(port(), "zzz", { buyPrice: 1 })).toEqual(port());
  });
  it("editing a sample position makes it real", () => {
    const out = h.editHolding([{ ...port()[0], sample: true }], "a", { shares: 21 });
    expect(out[0].sample).toBe(false);
  });
  it("portfolio value recalculates after edits and deletions", () => {
    const t0 = h.portfolioTotals(port(), "USD", fx);
    // 20×200 + 10×150 + 100×5/0.9
    expect(t0.value).toBeCloseTo(4000 + 1500 + 555.5556, 2);
    expect(t0.cost).toBeCloseTo(2000 + 1500 + 444.4444, 2);
    const t1 = h.portfolioTotals(h.removeHoldings(port(), "a"), "USD", fx);
    expect(t1.value).toBeCloseTo(1500 + 555.5556, 2);
    expect(t1.plPct).toBeCloseTo(((t1.value - t1.cost) / t1.cost) * 100, 6);
    const t2 = h.portfolioTotals(h.setHoldingShares(port(), "a", 5), "USD", fx);
    expect(t2.value).toBeCloseTo(1000 + 1500 + 555.5556, 2);
    const t3 = h.portfolioTotals(h.editHolding(port(), "b", { buyPrice: 100 }), "USD", fx);
    expect(t3.cost).toBeCloseTo(2000 + 1000 + 444.4444, 2);
    expect(h.portfolioTotals([], "USD", fx)).toEqual({ value: 0, cost: 0, pl: 0, plPct: 0 });
  });
});

describe("quick edit sheet", () => {
  const nv = port()[0];
  const mount = (over = {}) => {
    const props = { h: nv, cur: "USD", fx, onSave: vi.fn(), onRemove: vi.fn(), onZero: vi.fn(), onAdd: vi.fn(), onReduce: vi.fn(), onDetails: vi.fn(), onClose: vi.fn(), ...over };
    render(<h.QuickEditSheet {...props} />);
    return props;
  };
  it("increasing quantity with + then saving", () => {
    const p = mount();
    fireEvent.click(screen.getByLabelText("Increase Shares"));
    fireEvent.click(screen.getByLabelText("Increase Shares"));
    fireEvent.click(screen.getByText("Save changes"));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ shares: 22, buyPrice: 100, currency: "USD" }));
  });
  it("typing a quantity and a new average price", () => {
    const p = mount();
    const input = screen.getByLabelText("Shares");
    fireEvent.change(input, { target: { value: "12,5" } }); fireEvent.blur(input);
    const price = screen.getByLabelText("Average buy price");
    fireEvent.change(price, { target: { value: "110" } });
    fireEvent.click(screen.getByText("Save changes"));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ shares: 12.5, buyPrice: 110 }));
  });
  it("nothing to save until something changes", () => {
    mount();
    expect(screen.getByText("No changes").closest("button").disabled).toBe(true);
  });
  it("reducing to zero asks about removing instead of saving", () => {
    const p = mount();
    const input = screen.getByLabelText("Shares");
    fireEvent.change(input, { target: { value: "0" } }); fireEvent.blur(input);
    expect(screen.getByText(/saving will remove NVDA/)).toBeTruthy();
    fireEvent.click(screen.getByText("Remove NVDA"));
    expect(p.onZero).toHaveBeenCalled();
    expect(p.onSave).not.toHaveBeenCalled();
  });
  it("Delete holding at the bottom hands off to the confirmation", () => {
    const p = mount();
    fireEvent.click(screen.getByText("Delete holding"));
    expect(p.onRemove).toHaveBeenCalledTimes(1);
  });
});

describe("delete confirmation", () => {
  it("cancelling deletion does not delete", () => {
    const onCancel = vi.fn(), onConfirm = vi.fn();
    render(<h.ConfirmDialog text="Delete NVDA from your portfolio?" onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByText("Delete NVDA from your portfolio?")).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("tapping the backdrop cancels too; Delete confirms", () => {
    const onCancel = vi.fn(), onConfirm = vi.fn();
    render(<h.ConfirmDialog text="Delete NVDA from your portfolio?" onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("alertdialog").parentElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("shares sheet (add / reduce)", () => {
  it("adds shares at the price paid", () => {
    const onAdd = vi.fn();
    render(<h.SharesSheet h={port()[0]} mode="add" cur="USD" onAdd={onAdd} onReduce={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Increase Shares bought"));
    fireEvent.change(screen.getByLabelText("Price paid per share"), { target: { value: "250" } });
    expect(screen.getByText("$113.64", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByText("Add 2 NVDA"));
    expect(onAdd).toHaveBeenCalledWith(2, 250);
  });
  it("reducing all shares becomes a removal", () => {
    const onReduce = vi.fn();
    render(<h.SharesSheet h={port()[0]} mode="reduce" cur="USD" onAdd={vi.fn()} onReduce={onReduce} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText(/removes NVDA from your portfolio/)).toBeTruthy();
    fireEvent.click(screen.getByText("Remove NVDA"));
    expect(onReduce).toHaveBeenCalledWith(20, 200, true);
  });
});

describe("edit portfolio mode", () => {
  it("multi-select delete goes through one confirmation and removes all selected", () => {
    const onRemoveMany = vi.fn(); let pending = null;
    const onConfirm = vi.fn((c) => { pending = c; });
    render(<h.EditPortfolio holdings={port()} cur="USD" fx={fx} onEditFields={vi.fn()} onRemoveMany={onRemoveMany} onConfirm={onConfirm} onDone={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Select NVDA"));
    fireEvent.click(screen.getByLabelText("Select Nokia".replace("Nokia", "NOKIA.HE")));
    fireEvent.click(screen.getByText("Delete 2 selected"));
    expect(pending.text).toMatch(/Delete 2 holdings/);
    pending.onYes();
    expect(onRemoveMany).toHaveBeenCalledWith(expect.arrayContaining(["a", "c"]));
  });
  it("stepper edits save instantly; stepping to zero asks first", () => {
    const onEditFields = vi.fn(); let pending = null;
    render(<h.EditPortfolio holdings={[{ ...port()[1], shares: 1 }]} cur="USD" fx={fx} onEditFields={onEditFields} onRemoveMany={vi.fn()} onConfirm={(c) => { pending = c; }} onDone={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Increase AAPL shares"));
    expect(onEditFields).toHaveBeenCalledWith("b", { shares: 2 });
    const input = screen.getByLabelText("AAPL shares");
    fireEvent.change(input, { target: { value: "0" } }); fireEvent.blur(input);
    expect(pending.text).toBe("Remove AAPL entirely?");
  });
});

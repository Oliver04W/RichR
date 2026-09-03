// Unit tests for RichR's pure helpers (formatting, FX, CSV import, sentiment, history).
import { describe, it, expect } from "vitest";
import { __helpers as h } from "./RichR.jsx";

describe("performance number formatting", () => {
  it("always shows a sign and uses a real minus", () => {
    expect(h.pct(12.345)).toBe("+12.35%");
    expect(h.pct(-3.2)).toBe("−3.20%");
    expect(h.pct(0)).toBe("+0.00%");
    expect(h.pct(7.26, 1)).toBe("+7.3%");
  });
  it("money keeps the currency symbol and a real minus", () => {
    expect(h.money(1234.5, "USD")).toMatch(/^\$1[,\s]?234[.,]50$/);
    expect(h.money(-5, "EUR")).toMatch(/^−€5[.,]00$/);
    expect(h.moneyShort(2241.6, "USD")).toMatch(/^\$2[,\s]?242$/);
  });
});

describe("FX conversion", () => {
  const fx = { rates: { USD: 1, EUR: 0.9, SEK: 10 } };
  it("converts through USD using per-USD rates", () => {
    expect(h.fxConvert(100, "USD", "EUR", fx)).toBeCloseTo(90);
    expect(h.fxConvert(90, "EUR", "USD", fx)).toBeCloseTo(100);
    expect(h.fxConvert(100, "EUR", "SEK", fx)).toBeCloseTo(1111.11, 1);
  });
  it("falls back to built-in defaults for codes the live table lacks", () => {
    expect(h.fxConvert(100, "CAD", "USD", fx)).toBeGreaterThan(60);
    expect(h.fxConvert(100, "CAD", "USD", fx)).toBeLessThan(90);
  });
  it("is a no-op for same currency or unknown codes", () => {
    expect(h.fxConvert(42, "EUR", "EUR", fx)).toBe(42);
    expect(h.fxConvert(42, "XXX", "EUR", fx)).toBe(42);
  });
});

describe("CSV import", () => {
  it("maps a Nordnet-style export with comma decimals and semicolons", () => {
    const csv = "Ticker;Namn;Antal;GAV;Kurs;Valuta\nNOKIA.HE;Nokia Oyj;120;3,85;4,10;EUR\nNVDA;Nvidia;5;95,20;128,40;USD\n";
    const { rows, unmapped } = h.parseHoldingsCsv(csv, "EUR");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ticker: "NOKIA.HE", shares: 120, buyPrice: 3.85, currency: "EUR" });
    expect(rows[1].currentPrice).toBeCloseTo(128.4);
    expect(unmapped).toEqual([]);
  });
  it("reports unrecognised columns instead of guessing", () => {
    const { rows, unmapped } = h.parseHoldingsCsv("foo,bar\n1,2\n", "EUR");
    expect(rows).toHaveLength(0);
    expect(unmapped.length).toBeGreaterThan(0);
  });
});

describe("sentiment helpers", () => {
  it("keeps only the newest vote per user (one user = one vote)", () => {
    const rows = [
      { user_id: "a", vote: "sell", created_at: "2026-09-02T10:00:00Z" },
      { user_id: "a", vote: "buy", created_at: "2026-09-01T10:00:00Z" },
      { user_id: "b", vote: "hold", created_at: "2026-09-01T09:00:00Z" },
    ];
    const latest = h.latestCalls(rows, (r) => r.user_id);
    expect(latest.map((r) => r.user_id + ":" + r.vote)).toEqual(["a:sell", "b:hold"]);
  });
  it("rounds percentages and guards zero totals", () => {
    expect(h.pctOf(1, 3)).toBe(33);
    expect(h.pctOf(0, 0)).toBe(0);
  });
  it("counts age in whole days", () => {
    expect(h.daysOld(new Date(Date.now() - 31 * 86400000).toISOString())).toBe(31);
  });
});

describe("portfolio history", () => {
  const series = [
    { t: "2026-08-01", value: 0, cost: 0 },
    { t: "2026-08-02", value: 100, cost: 100 },
    { t: "2026-08-03", value: 110, cost: 100 },
    { t: "2026-08-04", value: 160, cost: 150 }, // deposit of 50, no gain
  ];
  it("ignores leading zero days and money added", () => {
    expect(h.periodReturn(series, 0)).toBeCloseTo(10);
  });
  it("returns null when there is nothing to measure", () => {
    expect(h.periodReturn([{ t: "2026-08-01", value: 0, cost: 0 }], 0)).toBeNull();
    expect(h.periodReturn(series, 3)).toBeNull();
  });
  it("finds the last point on or before a time", () => {
    expect(h.idxOnOrBefore(series, new Date("2026-08-03T12:00:00Z").getTime())).toBe(2);
    expect(h.idxOnOrBefore(series, new Date("2026-07-01").getTime())).toBe(-1);
  });
  it("ALL starts one point before the first real valuation", () => {
    const cut = h.cutSeries(series, "all");
    expect(cut[0].t).toBe("2026-08-01");
    expect(cut).toHaveLength(4);
  });
});

describe("listing helpers", () => {
  it("derives the exchange from the ticker suffix", () => {
    expect(h.exchangeOf("NOKIA.HE", "EUR")).toBe("Nasdaq Helsinki");
    expect(h.exchangeOf("ASML.AS", "EUR")).toBe("Euronext Amsterdam");
    expect(h.exchangeOf("NVDA", "USD")).toBe("US");
    expect(h.exchangeOf("XYZ", "EUR")).toBe("");
  });
  it("recognises funds and ETFs", () => {
    expect(h.isFund({ type: "ETF", name: "Vanguard S&P 500" })).toBe(true);
    expect(h.isFund({ type: "Stock", name: "Nvidia" })).toBe(false);
  });
});

describe("withTimeout", () => {
  it("resolves the fallback when the promise hangs", async () => {
    const never = new Promise(() => {});
    const r = await h.withTimeout(never, 20, { data: "fallback" });
    expect(r).toEqual({ data: "fallback" });
  });
  it("passes through a fast result", async () => {
    expect(await h.withTimeout(Promise.resolve(7), 50, 0)).toBe(7);
  });
});

describe("unvote — removing / changing a Buy · Hold · Sell vote", () => {
  const me = "me";
  const base = () => ({ buy: 6, hold: 3, sell: 1, total: 10, mine: { vote: "buy", reason: "AI demand", created_at: new Date().toISOString() },
    reasons: [{ user_id: me, vote: "buy", reason: "AI demand" }, { user_id: "x", vote: "sell", reason: "pricey" }] });
  const pcts = (s) => [h.pctOf(s.buy, s.total), h.pctOf(s.hold, s.total), h.pctOf(s.sell, s.total)];

  it("vote → unvote removes only my vote and recalculates total and percentages", () => {
    const s = h.tallyAfterVote(base(), "buy", null, { userId: me });
    expect([s.buy, s.hold, s.sell, s.total]).toEqual([5, 3, 1, 9]);
    expect(s.mine).toBeNull();
    expect(pcts(s)).toEqual([56, 33, 11]);
    expect(s.reasons.map((r) => r.user_id)).toEqual(["x"]);   // my reason no longer shown
  });
  it("vote → change vote moves one vote between buckets, total unchanged", () => {
    const s = h.tallyAfterVote(base(), "buy", "sell", { userId: me, reason: "too hot" });
    expect([s.buy, s.hold, s.sell, s.total]).toEqual([5, 3, 2, 10]);
    expect(s.mine.vote).toBe("sell");
    expect(s.reasons[0]).toMatchObject({ user_id: me, vote: "sell", reason: "too hot" });
    expect(pcts(s)).toEqual([50, 30, 20]);
  });
  it("unvote → vote again restores the original tally", () => {
    const gone = h.tallyAfterVote(base(), "buy", null, { userId: me });
    const back = h.tallyAfterVote(gone, null, "buy", { userId: me });
    expect([back.buy, back.hold, back.sell, back.total]).toEqual([6, 3, 1, 10]);
    expect(back.mine.vote).toBe("buy");
  });
  it("repeated rapid taps: the last tap wins and counts never drift or go negative", () => {
    let s = base(); let prev = "buy";
    for (const next of ["hold", null, "sell", null, "buy", null, "hold"]) { s = h.tallyAfterVote(s, prev, next, { userId: me }); prev = next; }
    expect([s.buy, s.hold, s.sell, s.total]).toEqual([5, 4, 1, 10]);
    expect(s.mine.vote).toBe("hold");
    let z = { buy: 0, hold: 0, sell: 0, total: 0, mine: null };
    z = h.tallyAfterVote(z, null, null); z = h.tallyAfterVote(z, "buy", null);   // stale/unknown prev never counted below zero
    expect([z.buy, z.total]).toEqual([0, 0]);
  });
  it("a stale (uncounted) vote being removed leaves the tally untouched", () => {
    const s = h.tallyAfterVote(base(), null, null, { userId: me });
    expect([s.buy, s.total, s.mine]).toEqual([6, 10, null]);
  });
  it("one user, one vote: a removal row hides the user from every call list", () => {
    const rows = [
      { user_id: "a", ticker: "NVDA", vote: "none", created_at: "2026-09-03" },
      { user_id: "a", ticker: "NVDA", vote: "buy", created_at: "2026-09-01" },
      { user_id: "b", ticker: "NVDA", vote: "sell", created_at: "2026-09-02" },
      { user_id: "a", ticker: "AAPL", vote: "hold", created_at: "2026-08-30" },
    ];
    expect(h.activeCalls(rows).map((r) => `${r.user_id}:${r.ticker}:${r.vote}`)).toEqual(["b:NVDA:sell", "a:AAPL:hold"]);
    expect(h.activeCalls(rows, (r) => r.user_id).map((r) => r.user_id)).toEqual(["b"]);
    const again = [{ user_id: "a", ticker: "NVDA", vote: "hold", created_at: "2026-09-04" }, ...rows];
    expect(h.activeCalls(again, (r) => r.user_id).map((r) => `${r.user_id}:${r.vote}`)).toEqual(["a:hold", "b:sell"]);
  });
  it("percentages stay hidden below the minimum sample after an unvote", () => {
    const s = h.tallyAfterVote({ buy: 3, hold: 1, sell: 1, total: 5, mine: { vote: "buy", created_at: new Date().toISOString() } }, "buy", null);
    expect(s.total).toBe(4);
    expect(h.pctOf(s.buy, s.total)).toBe(50);
  });
});

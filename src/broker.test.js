import { describe, it, expect } from "vitest";
import { diffSnapshot } from "./broker-types.js";

describe("broker snapshot diff (isolated, no provider)", () => {
  const holdings = [
    { ticker: "NVDA", shares: 10, buyPrice: 100, brokerAccountId: "acc1", externalSymbol: "NVDA:NASDAQ" },
    { ticker: "TSM", shares: 4, buyPrice: 200, brokerAccountId: "acc1", externalSymbol: "TSM:NYSE" },
    { ticker: "MANUAL", shares: 1, buyPrice: 1 },
  ];
  const snapshot = { accountId: "acc1", positions: [
    { externalSymbol: "NVDA:NASDAQ", ticker: "NVDA", units: 12, avgPrice: 100, currency: "USD" },
    { externalSymbol: "AAPL:NASDAQ", ticker: "AAPL", units: 3, avgPrice: 180, currency: "USD" },
    { externalSymbol: "WEIRD-BOND", ticker: null, units: 1, unsupported: true, currency: "EUR" },
  ] };
  it("classifies added, updated, missing and unsupported without touching manual lots", () => {
    const d = diffSnapshot(snapshot, holdings);
    expect(d.added.map((p) => p.ticker)).toEqual(["AAPL"]);
    expect(d.updated[0].from.ticker).toBe("NVDA");
    expect(d.missing.map((h) => h.ticker)).toEqual(["TSM"]);
    expect(d.unsupported).toHaveLength(1);
  });
});

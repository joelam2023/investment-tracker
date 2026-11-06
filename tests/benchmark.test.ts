import assert from "node:assert/strict";
import test from "node:test";
import { calculateMarketAnnualReturns, calculateSameCashFlowBenchmark, type MarketSeries } from "../src/market/benchmark";
import type { AnnualReturnResult } from "../src/types";
import { MarketCacheStore, mergeCompatibleMarketSeries, parseManualMarketCsv } from "../src/market/cache";
import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import { parseFredCsv } from "../src/market/fred-provider";

const market: MarketSeries = {
  benchmarkId: "sp500",
  currency: "USD",
  points: [
    { date: "2024-01-05", close: 100 },
    { date: "2024-01-08", close: 101 },
    { date: "2025-01-06", close: 110 },
  ],
  sourceLabel: "test",
  fetchedAt: "2025-01-06T00:00:00.000Z",
  warnings: [],
  origin: "manual",
};

test("weekend contributions use the next trading day", () => {
  const result = calculateSameCashFlowBenchmark(
    [{ date: "2024-01-06", direction: "contribution", amount: 101 }],
    "2025-01-06",
    110,
    null,
    "USD",
    market,
  );
  assert.equal(result.result.status, "ok");
  assert.ok(result.result.virtualValue !== null);
  assert.ok(Math.abs(result.result.virtualValue - 110) < 1e-8);
});

test("a weekend contribution on the valuation date is invested at the last close", () => {
  const fridayClose: MarketSeries = {
    ...market,
    points: [
      { date: "2024-01-05", close: 100 },
      { date: "2025-01-03", close: 110 },
    ],
  };
  const result = calculateSameCashFlowBenchmark(
    [
      { date: "2024-01-05", direction: "contribution", amount: 100 },
      { date: "2025-01-04", direction: "contribution", amount: 50 },
    ],
    "2025-01-04",
    160,
    null,
    "USD",
    fridayClose,
  );
  assert.equal(result.result.status, "ok");
  assert.ok(result.result.virtualValue !== null && Math.abs(result.result.virtualValue - 160) < 1e-8);
  assert.ok(result.result.excessValue !== null && Math.abs(result.result.excessValue) < 1e-8);
});

test("a gap in market data before the last close still stops the comparison", () => {
  const gapped: MarketSeries = {
    ...market,
    points: [
      { date: "2024-01-05", close: 100 },
      { date: "2024-03-01", close: 104 },
      { date: "2025-01-03", close: 110 },
    ],
  };
  const result = calculateSameCashFlowBenchmark(
    [
      { date: "2024-01-05", direction: "contribution", amount: 100 },
      { date: "2024-02-01", direction: "contribution", amount: 50 },
    ],
    "2025-01-03",
    160,
    null,
    "USD",
    gapped,
  );
  assert.equal(result.result.status, "unavailable");
});

test("portfolio matching the same-cash-flow benchmark has zero excess", () => {
  const result = calculateSameCashFlowBenchmark(
    [{ date: "2024-01-05", direction: "contribution", amount: 100 }],
    "2025-01-06",
    110,
    0.1,
    "USD",
    market,
  );
  assert.equal(result.result.status, "ok");
  assert.ok(result.result.excessValue !== null && Math.abs(result.result.excessValue) < 1e-8);
  assert.ok(result.result.excessRate !== null && Math.abs(result.result.excessRate) < 0.001);
});

test("missing market coverage returns unavailable rather than interpolating", () => {
  const result = calculateSameCashFlowBenchmark(
    [{ date: "2023-01-01", direction: "contribution", amount: 100 }],
    "2025-01-06",
    110,
    0.1,
    "USD",
    market,
  );
  assert.equal(result.result.status, "unavailable");
  assert.equal(result.result.virtualValue, null);
});

test("empty cache returns unavailable", () => {
  const result = calculateSameCashFlowBenchmark(
    [{ date: "2024-01-05", direction: "contribution", amount: 100 }],
    "2025-01-06",
    110,
    0.1,
    "USD",
    { ...market, points: [] },
  );
  assert.equal(result.result.status, "unavailable");
});

test("currency mismatch and stale endpoints stop benchmark calculation", () => {
  const mismatch = calculateSameCashFlowBenchmark(
    [{ date: "2024-01-05", direction: "contribution", amount: 100 }],
    "2025-01-06",
    110,
    0.1,
    "SGD",
    market,
  );
  assert.equal(mismatch.result.status, "unavailable");

  const stale = calculateSameCashFlowBenchmark(
    [{ date: "2024-01-05", direction: "contribution", amount: 100 }],
    "2025-02-01",
    110,
    0.1,
    "USD",
    market,
  );
  assert.equal(stale.result.status, "unavailable");
});

test("invalid flows are rejected instead of silently filtered", () => {
  const result = calculateSameCashFlowBenchmark(
    [{ date: "2026-01-01", direction: "contribution", amount: 100 }],
    "2025-01-06",
    110,
    0.1,
    "USD",
    market,
  );
  assert.equal(result.result.status, "unavailable");
  assert.ok(result.result.warnings.some((warning) => warning.includes("Cash flow")));
});

test("parses FRED and manual CSV formats", () => {
  assert.deepEqual(parseFredCsv("observation_date,SP500\n2025-01-02,5900.00\n2025-01-03,.\n"), [
    { date: "2025-01-02", close: 5900 },
  ]);
  const manual = parseManualMarketCsv("date,close\n2025-01-02,5900\n", "SGD");
  assert.equal(manual.currency, "SGD");
  assert.equal(manual.points[0]?.close, 5900);
  assert.throws(() => parseManualMarketCsv("date,close\n2025-02-31,5900\n", "SGD"), /Invalid CSV/);
});

test("compatible cache updates merge dates instead of erasing long history", () => {
  const prior: MarketSeries = {
    ...market,
    points: [{ date: "2020-01-02", close: 90 }],
  };
  const next: MarketSeries = {
    ...market,
    sourceLabel: "Localized display label",
    points: [{ date: "2025-01-06", close: 110 }],
  };
  const merged = mergeCompatibleMarketSeries(prior, next);
  assert.deepEqual(merged.points.map((point) => point.date), ["2020-01-02", "2025-01-06"]);
});

test("benchmark annual rates use prior trading close at the calendar boundary", () => {
  const row: AnnualReturnResult = { year: 2024, rate: 0.2, startDate: "2024-01-01", endDate: "2024-12-31", period: "full-year", quality: "complete", status: "ok", needsOpeningValuation: false, details: [] };
  const result = calculateMarketAnnualReturns([row], { points: [
    { date: "2023-12-29", close: 100 }, { date: "2024-01-02", close: 150 }, { date: "2024-12-31", close: 120 },
  ] });
  assert.ok(Math.abs(result[0]!.rate! - 0.2) < 1e-12);
  assert.equal(calculateMarketAnnualReturns([row], { points: [{ date: "2024-01-02", close: 150 }, { date: "2024-12-31", close: 120 }] })[0]?.rate, null);
});
test("benchmark partial annual rates use the actual period and reject stale boundaries", () => {
  const row: AnnualReturnResult = { year: 2024, rate: 0.2, startDate: "2024-08-01", endDate: "2024-12-31", period: "partial-year", quality: "partial", status: "ok", needsOpeningValuation: false, details: [] };
  assert.ok(Math.abs(calculateMarketAnnualReturns([row], { points: [{ date: "2024-08-02", close: 100 }, { date: "2024-12-31", close: 120 }] })[0]!.rate! - 0.2) < 1e-12);
  assert.equal(calculateMarketAnnualReturns([row], { points: [{ date: "2024-08-10", close: 100 }, { date: "2024-12-31", close: 120 }] })[0]?.rate, null);
});
test("different benchmark identities are never merged", () => {
  const nasdaq: MarketSeries = { ...market, benchmarkId: "nasdaq100", points: [{ date: "2025-01-06", close: 999 }] };
  assert.equal(mergeCompatibleMarketSeries(market, nasdaq), nasdaq);
  assert.equal(calculateSameCashFlowBenchmark([{ date: "2024-01-05", direction: "contribution", amount: 100 }], "2025-01-06", 100, null, "USD", { ...market, benchmarkId: "nasdaq100" }).result.benchmarkId, "nasdaq100");
});

test("cache schema 1 remains S&P-only and schema 2 validates benchmark identity", async () => {
  let payload: unknown = { schemaVersion: 1, ...market };
  const file = new TFile();
  const vault = { getAbstractFileByPath: () => file, cachedRead: async () => JSON.stringify(payload) } as unknown as Vault;
  const cache = new MarketCacheStore(vault, "synthetic-cache");
  assert.equal((await cache.load("USD", "sp500"))?.benchmarkId, "sp500");
  await assert.rejects(cache.load("USD", "nasdaq100"), /Invalid market data source/);
  payload = { schemaVersion: 2, ...market, benchmarkId: "nasdaq100", origin: "automatic" };
  assert.equal((await cache.load("USD", "nasdaq100"))?.benchmarkId, "nasdaq100");
  await assert.rejects(cache.load("USD", "sp500"), /Invalid market data source/);
  payload = { schemaVersion: 2, ...market, benchmarkId: "other" };
  await assert.rejects(cache.load(), /Invalid market data source/);
});

test("a December 31 year start on a weekend uses the last close of the old year", () => {
  const row: AnnualReturnResult = { year: 2024, rate: 0.2, startDate: "2023-12-31", endDate: "2024-12-31", period: "full-year", quality: "complete", status: "ok", needsOpeningValuation: false, details: [] };
  const result = calculateMarketAnnualReturns([row], { points: [
    { date: "2023-12-29", close: 100 }, { date: "2024-01-02", close: 150 }, { date: "2024-12-31", close: 120 },
  ] });
  assert.ok(Math.abs(result[0]!.rate! - 0.2) < 1e-12);
});

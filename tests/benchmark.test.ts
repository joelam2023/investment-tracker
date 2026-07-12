import assert from "node:assert/strict";
import test from "node:test";
import { calculateSameCashFlowBenchmark, type MarketSeries } from "../src/market/benchmark";
import { mergeCompatibleMarketSeries, parseManualMarketCsv } from "../src/market/cache";
import { parseFredCsv } from "../src/market/fred-provider";

const market: MarketSeries = {
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

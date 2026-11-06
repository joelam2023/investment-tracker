import assert from "node:assert/strict";
import test from "node:test";
import {
  convertUsdPriceToCurrency,
  findExchangeRateAtOrBefore,
  FRED_CURRENCY_CONFIG,
  MAX_FX_AGE_DAYS,
  FRED_BENCHMARKS,
  fredMarketMetadata,
  FredBenchmarkProvider,
} from "../src/market/fred-provider";
import { SUPPORTED_CURRENCIES } from "../src/types";
import { setTestRequestHandler } from "./obsidian-stub";

test("FRED currency configuration covers every supported currency with an explicit quote direction", () => {
  assert.deepEqual(Object.keys(FRED_CURRENCY_CONFIG), [...SUPPORTED_CURRENCIES]);
  assert.deepEqual(FRED_CURRENCY_CONFIG, {
    USD: { seriesId: null, quoteDirection: "identity" },
    GBP: { seriesId: "DEXUSUK", quoteDirection: "divide" },
    SGD: { seriesId: "DEXSIUS", quoteDirection: "multiply" },
    CNY: { seriesId: "DEXCHUS", quoteDirection: "multiply" },
    TWD: { seriesId: "DEXTAUS", quoteDirection: "multiply" },
    JPY: { seriesId: "DEXJPUS", quoteDirection: "multiply" },
    KRW: { seriesId: "DEXKOUS", quoteDirection: "multiply" },
    EUR: { seriesId: "DEXUSEU", quoteDirection: "divide" },
    BRL: { seriesId: "DEXBZUS", quoteDirection: "multiply" },
  });
});

test("USD conversion applies identity, multiply, and divide quotes correctly", () => {
  assert.equal(convertUsdPriceToCurrency(6_000, undefined, "identity"), 6_000);
  assert.equal(convertUsdPriceToCurrency(6_000, 150, "multiply"), 900_000);
  assert.ok(Math.abs((convertUsdPriceToCurrency(6_000, 1.1, "divide") ?? 0) - 5_454.545454545454) < 1e-10);
});

test("conversion rejects invalid inputs and overflow", () => {
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1]) {
    assert.equal(convertUsdPriceToCurrency(invalid, 1, "multiply"), null);
    assert.equal(convertUsdPriceToCurrency(100, invalid, "multiply"), null);
    assert.equal(convertUsdPriceToCurrency(100, invalid, "divide"), null);
  }
  assert.equal(convertUsdPriceToCurrency(Number.MAX_VALUE, 2, "multiply"), null);
});

test("exchange-rate lookup uses the most recent valid rate no later than the S&P date", () => {
  const points = [
    { date: "2025-01-11", close: 999 },
    { date: "2025-01-03", close: 1.2 },
    { date: "2025-01-09", close: 1.3 },
    { date: "2025-01-08", close: 0 },
  ];
  assert.deepEqual(findExchangeRateAtOrBefore(points, "2025-01-10"), { date: "2025-01-09", close: 1.3 });
});

test("exchange-rate lookup accepts seven-day-old data and rejects anything older", () => {
  assert.equal(MAX_FX_AGE_DAYS, 7);
  assert.deepEqual(findExchangeRateAtOrBefore([{ date: "2025-01-03", close: 1.2 }], "2025-01-10"), {
    date: "2025-01-03",
    close: 1.2,
  });
  assert.equal(findExchangeRateAtOrBefore([{ date: "2025-01-02", close: 1.2 }], "2025-01-10"), undefined);
});

test("exchange-rate lookup rejects invalid dates, rates, and age limits", () => {
  assert.equal(findExchangeRateAtOrBefore([{ date: "2025-02-31", close: 1.2 }], "2025-03-01"), undefined);
  assert.equal(findExchangeRateAtOrBefore([{ date: "2025-02-28", close: Number.NaN }], "2025-03-01"), undefined);
  assert.equal(findExchangeRateAtOrBefore([{ date: "2025-02-28", close: 1.2 }], "not-a-date"), undefined);
  assert.equal(findExchangeRateAtOrBefore([{ date: "2025-02-28", close: 1.2 }], "2025-03-01", -1), undefined);
});

test("both FRED benchmark identities have independent metadata", () => {
  assert.equal(FRED_BENCHMARKS.sp500.seriesId, "SP500");
  assert.equal(FRED_BENCHMARKS.nasdaq100.seriesId, "NASDAQ100");
  const nasdaq = fredMarketMetadata("USD", "nasdaq100");
  assert.match(nasdaq.sourceLabel, /Nasdaq-100/);
  assert.ok(nasdaq.warnings.some((warning) => warning.includes("excludes dividends")));
  assert.ok(nasdaq.warnings.some((warning) => warning.includes("non-commercial")));
});

test("automatic Nasdaq fetch keeps prior-year closing data and sends only public GET parameters", async () => {
  const requests: Record<string, unknown>[] = [];
  setTestRequestHandler(async (params) => {
    requests.push(params);
    return { status: 200, text: "observation_date,NASDAQ100\n2023-12-29,100\n2024-01-02,150\n2024-12-31,120\n" };
  });
  try {
    const market = await new FredBenchmarkProvider().fetch("nasdaq100", "USD", "2024-01-01", "2024-12-31");
    assert.equal(market.benchmarkId, "nasdaq100");
    assert.equal(market.points[0]?.date, "2023-12-29");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.method, "GET");
    assert.equal("body" in requests[0]!, false);
    const url = new URL(String(requests[0]!.url));
    assert.equal(url.origin, "https://fred.stlouisfed.org");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["coed", "cosd", "id"]);
    assert.equal(url.searchParams.get("id"), "NASDAQ100");
  } finally { setTestRequestHandler(null); }
});

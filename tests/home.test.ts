import assert from "node:assert/strict";
import test from "node:test";
import type { AccountState, CashFlowEvent, LedgerEvent, ValuationEvent } from "../src/types";
import type { MarketSeries } from "../src/market/benchmark";
import { calculateLinkedReport } from "../src/domain/linked-return";
import { compareYears, currentYearComparison, marketRange, outcomeLabel, outcomeOf, yearProfit, type YearComparison } from "../src/ui/home";

const account = (id: string): AccountState => ({ accountId: id, name: "Synthetic", currency: "USD", benchmarkId: "sp500", openedOn: "2025-01-01", archived: false });
const a = account("synthetic-a");
const b = account("synthetic-b");
const base = (owner: AccountState, date: string) => ({
  schemaVersion: 1 as const, eventId: `${owner.accountId}-${date}`, recordedAt: `${date}T00:00:00Z`, effectiveDate: date, accountId: owner.accountId, currency: owner.currency,
});
const v = (owner: AccountState, date: string, amount: number): ValuationEvent => ({ ...base(owner, date), type: "valuation", totalValue: String(amount) });
const f = (owner: AccountState, date: string, amount: number): CashFlowEvent => ({ ...base(owner, date), eventId: `${owner.accountId}-${date}-flow`, type: "cash-flow", direction: "contribution", amount: String(amount) });
const market = (benchmarkId: "sp500" | "nasdaq100", closes: Array<[string, number]>): MarketSeries => ({
  benchmarkId, currency: "USD", points: closes.map(([date, close]) => ({ date, close })), sourceLabel: "synthetic", fetchedAt: "2026-10-01T00:00:00.000Z", warnings: [], origin: "manual",
});
const near = (value: number | null | undefined, expected: number) => assert.ok(typeof value === "number" && Math.abs(value - expected) < 1e-8, `${value} != ${expected}`);

test("this year closes on the latest day every account was valued when update dates differ", () => {
  const events: LedgerEvent[] = [
    v(a, "2025-12-31", 100), v(b, "2025-12-31", 50),
    v(a, "2026-09-30", 110), v(b, "2026-09-30", 55),
    v(a, "2026-11-05", 115),
  ];
  const report = calculateLinkedReport([a, b], events, "USD", "2026-11-07");
  const row = report.years.find((year) => year.year === 2026)!;
  assert.equal(row.end, "2026-09-30");
  assert.equal(row.openingValue, 150);
  assert.equal(row.closingValue, 165);
  near(row.moneyWeightedRate, 0.1);
});

test("each year pairs my return with both indices bought with the same money on the same dates", () => {
  const events: LedgerEvent[] = [v(a, "2025-12-31", 100), v(a, "2026-09-30", 110)];
  const report = calculateLinkedReport([a], events, "USD", "2026-10-01", a);
  const rows = compareYears(report, {
    sp500: market("sp500", [["2025-12-31", 100], ["2026-09-30", 105]]),
    nasdaq100: market("nasdaq100", [["2025-12-31", 100], ["2026-09-30", 120]]),
  });
  const row = currentYearComparison(rows, 2026)!;
  near(row.mine, 0.1);
  near(row.sp500, 0.05);
  near(row.nasdaq100, 0.2);
  near(yearProfit(row), 10);
  assert.equal(outcomeOf(row, true), "mixed");
  assert.equal(outcomeLabel(row, true), "Beat the S&P 500 only");
  assert.equal(outcomeOf(row, false), "good");
  assert.deepEqual(marketRange([report]), { start: "2025-12-31", end: "2026-09-30" });
});

test("money added during the year is not counted as this year's profit", () => {
  const events: LedgerEvent[] = [v(a, "2025-12-31", 100), f(a, "2026-06-30", 50), v(a, "2026-06-30", 150), v(a, "2026-09-30", 165)];
  const row = currentYearComparison(compareYears(calculateLinkedReport([a], events, "USD", "2026-10-01", a), {}), 2026)!;
  assert.equal(row.netFlow, 50);
  near(yearProfit(row), 15);
  assert.equal(row.sp500, null);
  assert.equal(outcomeOf(row, true), "unknown");
});

test("outcomes need my return and at least one index", () => {
  const row = (mine: number | null, sp500: number | null, nasdaq100: number | null): YearComparison => ({
    year: 2026, start: "2025-12-31", end: "2026-09-30", mine, sp500, nasdaq100, estimated: false, boundaryEstimates: [], openingValue: 100, closingValue: 110, netFlow: 0,
  });
  assert.equal(outcomeOf(row(0.1, 0.05, 0.08), true), "good");
  assert.equal(outcomeLabel(row(0.1, 0.05, 0.08), true), "Beat both");
  assert.equal(outcomeOf(row(0.01, 0.05, 0.08), true), "bad");
  assert.equal(outcomeLabel(row(0.01, 0.05, 0.08), true), "Trailed both");
  assert.equal(outcomeLabel(row(0.06, 0.05, null), true), "Beat the S&P 500");
  assert.equal(outcomeOf(row(null, 0.05, 0.08), true), "unknown");
  assert.equal(outcomeOf(row(0.1, null, null), true), "unknown");
});

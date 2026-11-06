import assert from "node:assert/strict";
import test from "node:test";
import type { AccountState, CashFlowEvent, LedgerEvent, ValuationEvent } from "../src/types";
import type { MarketSeries } from "../src/market/benchmark";
import { calculateLinkedReport, moneyWeightedAnnualRows, moneyWeightedPeriod } from "../src/domain/linked-return";
import { calculateAccountAnnualReturns } from "../src/domain/calculations";
import { calculateInceptionReturn } from "../src/domain/inception-return";
import { annualMoneyWeightedIndex } from "../src/market/annual-money-weighted";

const a: AccountState = { accountId: "synthetic", name: "Synthetic", currency: "USD", benchmarkId: "sp500", openedOn: "2024-01-01", archived: false };
const base = (date: string) => ({ schemaVersion: 1 as const, eventId: date, recordedAt: date + "T00:00:00Z", effectiveDate: date, accountId: a.accountId, currency: a.currency });
const v = (date: string, amount: number): ValuationEvent => ({ ...base(date), type: "valuation", totalValue: String(amount) });
const f = (date: string, amount: number, direction: "contribution" | "withdrawal" = "contribution"): CashFlowEvent => ({ ...base(date), type: "cash-flow", direction, amount: String(amount) });
const calc = (events: LedgerEvent[]) => calculateLinkedReport([a], events, "USD", "2026-10-06", a);
const near = (rate: number | null | undefined, expected: number) => assert.ok(typeof rate === "number" && Math.abs(rate - expected) < 1e-8, `${rate} != ${expected}`);

test("late December deposit is included in carried opening, not misclassified as next-year gain", () => {
  const events = [f("2024-01-01", 100), v("2025-12-20", 100), f("2025-12-25", 20), v("2026-03-31", 120)];
  const old = calculateAccountAnnualReturns(a, events, "2026-10-06").find(r => r.year === 2026)!;
  near(old.rate, 0.2); // Regression reproduced with the previous implementation.
  const row = calc(events).years.find(r => r.year === 2026)!;
  near(row.moneyWeightedRate, 0);
  near(row.rate, 0);
  assert.equal(row.openingValue, 120);
  assert.equal(row.estimated, true);
  assert.deepEqual(row.boundaryEstimates, [{ date: "2025-12-31", sources: ["2025-12-20"] }]);
  near(calculateInceptionReturn([a], events, "USD", a).xirr, 0);
});

test("late December withdrawal decreases carried opening instead of becoming next-year loss", () => {
  const row = calc([v("2025-12-20", 100), f("2025-12-25", 20, "withdrawal"), v("2026-03-31", 80)]).years.at(-1)!;
  assert.equal(row.openingValue, 80);
  near(row.moneyWeightedRate, 0);
});

test("valuation-day flows are already in the valuation and December 31 flows are counted once", () => {
  const row = calc([f("2025-12-20", 100), v("2025-12-20", 100), f("2025-12-31", 20), v("2026-03-31", 120)]).years.at(-1)!;
  assert.equal(row.openingValue, 120);
  near(row.moneyWeightedRate, 0);
});

test("new-year flows remain in the next year and are not absorbed into estimated opening", () => {
  const row = calc([v("2025-12-20", 100), f("2025-12-25", 20), f("2026-01-01", 30), v("2026-03-31", 150)]).years.at(-1)!;
  assert.equal(row.openingValue, 120);
  assert.equal(row.cashFlows!.length, 1);
  near(row.moneyWeightedRate, 0);
});

test("a later real year-end valuation replaces the estimate and recomputes both years", () => {
  const events = [v("2025-12-20", 100), f("2025-12-25", 20), v("2026-03-31", 130)];
  const before = calc(events), after = calc([...events, v("2025-12-31", 125)]);
  assert.equal(before.years.at(-1)!.openingValue, 120);
  assert.equal(after.years.at(-1)!.openingValue, 125);
  assert.deepEqual(after.years.at(-1)!.boundaryEstimates, []);
  near(after.years.at(-1)!.moneyWeightedRate, 0.04);
  assert.notEqual(before.years[0]!.moneyWeightedRate, after.years[0]!.moneyWeightedRate);
});

test("January 1 end-of-day valuation is an explicit boundary, not counted twice", () => {
  const row = calc([v("2025-12-20", 100), f("2025-12-25", 20), f("2026-01-01", 30), v("2026-01-01", 150), v("2026-03-31", 150)]).years.at(-1)!;
  assert.equal(row.start, "2026-01-01");
  assert.equal(row.openingValue, 150);
  near(row.moneyWeightedRate, 0);
  assert.deepEqual(row.boundaryEstimates, []);
});

test("no valuation in the new year means no invented YTD return or fresh-as-of date", () => {
  const report = calc([v("2025-12-20", 100), v("2025-12-30", 110), f("2026-02-01", 30)]);
  assert.equal(report.years.at(-1)!.year, 2025);
  assert.equal(report.summary.end, "2025-12-30");
});

test("stale boundaries disclose their original dates, including across multiple missing years", () => {
  const report = calc([v("2024-01-01", 100), v("2026-03-31", 110)]);
  assert.deepEqual(report.years.at(-1)!.boundaryEstimates, [{ date: "2025-12-31", sources: ["2024-01-01"] }]);
  assert.equal(report.summary.estimated, true);
});

test("negative carried balances are rejected without blocking inception XIRR calculation", () => {
  const events = [f("2025-01-01", 100), v("2025-12-20", 100), f("2025-12-25", 120, "withdrawal"), v("2026-03-31", 10)];
  const row = calc(events).years.at(-1)!;
  assert.equal(row.start, null);
  assert.equal(row.moneyWeightedRate, null);
  assert.ok(calculateInceptionReturn([a], events, "USD", a).xirr !== null);
});

test("annual Modified Dietz is a single period calculation, not linked returns or XIRR", () => {
  const events = [v("2025-01-01", 100), f("2025-07-01", 100), v("2025-07-01", 220), v("2025-12-31", 198)];
  const r = calc(events), row = r.years[0]!;
  near(row.rate, 0.08);
  near(row.moneyWeightedRate, -2 / (100 + 100 * 183 / 364));
  assert.ok(row.moneyWeightedRate! < 0 && row.rate! > 0);
  near(moneyWeightedAnnualRows(r)[0]!.rate, row.moneyWeightedRate!);
  const inserted = calc([...events, v("2025-10-01", 210)]);
  near(inserted.years[0]!.moneyWeightedRate, row.moneyWeightedRate!);
});

test("annual index comparisons reproduce the same opening capital and dated cash flows", () => {
  const r = calc([v("2025-01-01", 100), f("2025-07-01", 100), v("2025-07-01", 220), v("2025-12-31", 198)]);
  for (const benchmarkId of ["sp500", "nasdaq100"] as const) {
    const market: MarketSeries = { benchmarkId, currency: "USD", origin: "manual", sourceLabel: "Synthetic", fetchedAt: "2026-10-06", warnings: [], points: [{ date: "2025-01-01", close: 100 }, { date: "2025-07-01", close: 120 }, { date: "2025-12-31", close: 108 }] };
    const result = annualMoneyWeightedIndex(r, market);
    near(result.years[0]!.rate, r.years[0]!.moneyWeightedRate!);
    assert.equal(result.summary.rate, null);
    assert.equal(annualMoneyWeightedIndex(r, { ...market, currency: "CNY" }).years[0]!.rate, null);
    assert.equal(annualMoneyWeightedIndex(r, { ...market, points: market.points.slice(0, 2) }).years[0]!.rate, null);
  }
});

test("portfolio boundary carry uses each account's own last value and post-valuation flows", () => {
  const other = { ...a, accountId: "other" };
  const events = [v("2025-12-20", 100), f("2025-12-25", 20), v("2026-03-31", 120),
    ...[v("2025-12-22", 200), f("2025-12-28", 20, "withdrawal"), v("2026-03-31", 180)].map(e => ({ ...e, accountId: "other" }))];
  const row = calculateLinkedReport([a, other], events, "USD", "2026-10-06").years.at(-1)!;
  assert.equal(row.openingValue, 300);
  near(row.moneyWeightedRate, 0);
  assert.deepEqual(row.boundaryEstimates, [{ date: "2025-12-31", sources: ["2025-12-20", "2025-12-22"] }]);
});

test("estimates never mutate event input or manufacture a valuation event", () => {
  const events = [v("2025-12-20", 100), f("2025-12-25", 20), v("2026-03-31", 120)];
  const before = JSON.stringify(events);
  calc(events);
  assert.equal(JSON.stringify(events), before);
  assert.equal(events.length, 3);
});

test("whole-period Dietz permits zero idle balances and total loss, but rejects invalid denominators", () => {
  near(moneyWeightedPeriod(0, 0, [], "2025-01-01", "2025-12-31"), 0);
  near(moneyWeightedPeriod(100, 0, [], "2025-01-01", "2025-12-31"), -1);
  assert.equal(moneyWeightedPeriod(0, 100, [], "2025-01-01", "2025-12-31"), null);
});

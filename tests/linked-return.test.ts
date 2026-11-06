import assert from "node:assert/strict";
import test from "node:test";
import type { AccountState, CashFlowEvent, LedgerEvent, ValuationEvent } from "../src/types";
import type { MarketSeries } from "../src/market/benchmark";
import { calculateLinkedReport, linkedIndexReport, linkedAnnualRows, summarizeLinked } from "../src/domain/linked-return";

const account: AccountState = { accountId: "synthetic", name: "Synthetic", currency: "USD", benchmarkId: "sp500", openedOn: "2023-01-01", archived: false };
const base = (date: string) => ({ schemaVersion: 1 as const, eventId: date, recordedAt: date + "T00:00:00Z", effectiveDate: date, accountId: account.accountId, currency: account.currency });
const value = (date: string, totalValue: string): ValuationEvent => ({ ...base(date), type: "valuation", totalValue });
const flow = (date: string, amount: string, direction: "contribution" | "withdrawal" = "contribution"): CashFlowEvent => ({ ...base(date), type: "cash-flow", amount, direction });
const report = (events: LedgerEvent[], filter = false, today = "2026-10-05") => calculateLinkedReport([account], events, "USD", today, account, filter);
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const elapsed = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / 86_400_000;
const history = [value("2024-01-01", "100"), value("2024-12-31", "120"), value("2025-12-31", "108"), value("2026-10-05", "118.8")];

test("annual returns compound geometrically and partial current year uses actual total days", () => {
  const result = report(history, true);
  assert.deepEqual(result.years.map(y => y.included), [true, true, true]);
  [0.2, -0.1, 0.1].forEach((rate, i) => near(result.years[i]!.rate, rate));
  near(result.summary.cumulative, 0.188);
  near(result.summary.rate, Math.pow(1.188, 365 / elapsed("2024-01-01", "2026-10-05")) - 1);
  assert.notEqual(result.summary.rate, Math.pow(1.188, 1 / 3) - 1);
  assert.equal(result.summary.estimated, false);
});

test("six-month display gate is strict and does not remove a calendar year by default", () => {
  assert.equal(report([value("2026-01-01", "100"), value("2026-07-01", "110")]).summary.annualized, false);
  near(report([value("2026-01-01", "100"), value("2026-07-01", "110")]).summary.rate, 0.1);
  assert.equal(report([value("2026-01-01", "100"), value("2026-07-02", "110")]).summary.annualized, true);
  const r = report([...history.slice(0, 3), value("2026-05-01", "118.8")]);
  assert.equal(r.years.at(-1)!.included, true);
  assert.equal(r.summary.end, "2026-05-01");
});

test("custom filter excludes a short first and current year but accepts January 1 opening", () => {
  const r = report([flow("2023-08-01", "100"), ...history.slice(0, 3), value("2026-05-01", "118.8")], true);
  assert.deepEqual(r.years.map(y => y.included), [false, true, true, false]);
  assert.equal(r.summary.start, "2024-01-01");
  assert.equal(r.summary.end, "2025-12-31");
  near(r.summary.cumulative, 0.08);
});

test("current-year eligibility uses recorded valuation, not today's date", () => {
  for (const [end, eligible] of [["2026-07-01", false], ["2026-07-02", true]] as const) {
    const r = report([...history.slice(0, 3), value(end, "118.8")], true);
    assert.equal(r.years.at(-1)!.included, eligible);
  }
});

test("valuations at each cash-flow boundary produce linked returns, not multi-year XIRR", () => {
  const r = report([value("2025-01-01", "100"), flow("2025-07-01", "100"), value("2025-07-01", "220"), value("2025-12-31", "198")]);
  near(r.years[0]!.rate, 1.2 * 0.9 - 1);
  assert.equal(r.summary.estimated, false);
});

test("interior cash flows use daily-weighted Modified Dietz and are labeled estimated", () => {
  const r = report([value("2025-01-01", "100"), flow("2025-01-06", "50"), value("2025-01-11", "165")]);
  near(r.summary.rate, 0.12);
  assert.equal(r.summary.estimated, true);
  assert.equal(linkedAnnualRows(r)[0]!.quality, "estimated");
});

test("withdrawals and end-of-day contributions are removed from investment profit", () => {
  near(report([value("2025-01-01", "100"), flow("2025-01-06", "20", "withdrawal"), value("2025-01-11", "90")]).summary.rate, 10 / 90);
  near(report([value("2025-01-01", "100"), flow("2025-01-11", "50"), value("2025-01-11", "160")]).summary.rate, 0.1);
});

test("missing annual boundary is estimated and disclosed while preserving other annual rows", () => {
  const r = report([history[0]!, ...history.slice(2)]);
  assert.ok(r.summary.rate !== null);
  assert.equal(r.summary.estimated, true);
  near(r.years.at(-1)!.rate, 0.1);
  near(r.years[0]!.rate, 0);
  near(r.years[1]!.rate, 0.08);
  assert.deepEqual(r.years[1]!.boundaryEstimates, [{ date: "2024-12-31", sources: ["2024-01-01"] }]);
});

test("missing or discontinuous years are not silently dropped from compound totals", () => {
  const rows = report(history).years;
  assert.equal(summarizeLinked([rows[0]!, rows[2]!]).rate, null);
  assert.equal(summarizeLinked([rows[0]!, { ...rows[1]!, rate: null }, rows[2]!]).rate, null);
});

test("zero idle balances and total losses do not yield Infinity or invalid roots", () => {
  near(report([value("2025-01-01", "0"), value("2025-12-31", "0")]).summary.rate, 0);
  near(report([value("2025-01-01", "100"), value("2025-12-31", "0")]).summary.rate, -1);
  assert.equal(report([value("2025-01-01", "0"), value("2025-12-31", "100")]).summary.rate, null);
});

test("initial funding can supply an opening estimate and future valuations are ignored", () => {
  const r = report([flow("2026-01-01", "100"), value("2026-10-05", "110"), value("2027-01-01", "200")]);
  assert.equal(r.summary.end, "2026-10-05");
  assert.equal(r.summary.estimated, true);
  near(r.summary.cumulative, 0.1);
});

test("portfolio requires aligned valuation dates and ignores archived and other-currency accounts", () => {
  const other = { ...account, accountId: "other" };
  const events = [...history, ...history.map(e => ({ ...e, accountId: "other" }))];
  const aggregate = calculateLinkedReport([account, other], events, "USD", "2026-10-05");
  near(aggregate.summary.cumulative, 0.188);
  const unaligned = [...history, ...history.map(e => ({ ...e, accountId: "other", effectiveDate: e.effectiveDate === "2026-10-05" ? "2026-10-04" : e.effectiveDate }))];
  assert.equal(calculateLinkedReport([account, other], unaligned, "USD", "2026-10-05").summary.rate, null);
  near(calculateLinkedReport([account, { ...other, archived: true }], events, "USD", "2026-10-05").summary.cumulative, 0.188);
  near(calculateLinkedReport([account, { ...other, currency: "CNY" }], events, "USD", "2026-10-05").summary.cumulative, 0.188);
});

test("both indices use the same dates and geometric annualization, not simulated deposits", () => {
  const own = report(history, true);
  for (const benchmarkId of ["sp500", "nasdaq100"] as const) {
    const market: MarketSeries = { benchmarkId, currency: "USD", points: history.map(v => ({ date: v.effectiveDate, close: Number(v.totalValue) })), sourceLabel: "Synthetic", fetchedAt: "2026-10-05", origin: "manual", warnings: [] };
    const index = linkedIndexReport(own, market);
    near(index.summary.rate, own.summary.rate!);
    assert.deepEqual(index.years.map(y => [y.start, y.end, y.included]), own.years.map(y => [y.start, y.end, y.included]));
    assert.equal(linkedIndexReport(own, { ...market, currency: "CNY" }).summary.rate, null);
    assert.equal(linkedIndexReport(own, { ...market, points: market.points.slice(1) }).years[0]!.rate, null);
  }
});

test("weekend index closes are allowed, stale or future-only boundary prices are not", () => {
  const own = report([value("2026-01-01", "100"), value("2026-10-05", "110")]);
  const market: MarketSeries = { benchmarkId: "sp500", currency: "USD", points: [{ date: "2025-12-31", close: 100 }, { date: "2026-10-02", close: 110 }], sourceLabel: "Synthetic", fetchedAt: "2026-10-05", origin: "manual", warnings: [] };
  near(linkedIndexReport(own, market).summary.cumulative, 0.1);
  assert.equal(linkedIndexReport(own, { ...market, points: [{ date: "2025-12-01", close: 100 }, market.points[1]!] }).summary.rate, null);
  assert.equal(linkedIndexReport(own, { ...market, points: [{ date: "2026-01-02", close: 100 }, market.points[1]!] }).summary.rate, null);
});

test("calculation does not mutate ledger input and latest same-day valuation wins", () => {
  const events = [...history, { ...history.at(-1)!, totalValue: "129.6", recordedAt: "2026-10-05T12:00:00Z" }];
  const before = JSON.stringify(events);
  near(report(events).summary.cumulative, 0.296);
  assert.equal(JSON.stringify(events), before);
});

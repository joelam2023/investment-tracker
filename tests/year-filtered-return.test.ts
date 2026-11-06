import assert from "node:assert/strict";
import test from "node:test";
import type { AccountState, LedgerEvent, CashFlowEvent, ValuationEvent } from "../src/types";
import { calculateYearFilteredReturn } from "../src/domain/year-filtered-return";
import { calculateInceptionReturn, displayedInceptionRate } from "../src/domain/inception-return";
import { loadPeriodComparisons } from "../src/market/period-comparison";

const account: AccountState = { accountId: "synthetic", name: "Synthetic", currency: "USD", benchmarkId: "sp500", openedOn: "2023-01-01", archived: false };
const base = (date: string) => ({ schemaVersion: 1 as const, eventId: date, recordedAt: `${date}T00:00:00Z`, effectiveDate: date, accountId: account.accountId, currency: account.currency });
const flow = (date: string, amount: string, direction: "contribution" | "withdrawal" = "contribution"): CashFlowEvent => ({ ...base(date), type: "cash-flow", direction, amount });
const value = (date: string, totalValue: string): ValuationEvent => ({ ...base(date), type: "valuation", totalValue });
const calc = (events: LedgerEvent[]) => calculateYearFilteredReturn([account], events, "USD", account);
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("early current year excludes its cash flows AND current balance", () => {
  const events = [flow("2024-01-01", "100"), value("2025-12-31", "121"), flow("2026-02-01", "1000"), value("2026-05-31", "1500")];
  const before = JSON.stringify(events);
  const result = calc(events);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.excludedYears, [2026]);
  assert.equal(result.period.endDate, "2025-12-31");
  assert.equal(result.endingValue, 121);
  assert.equal(result.period.flows.length, 1);
  close(result.period.xirr, Math.pow(1.21, 365 / result.period.days) - 1);
  assert.equal(JSON.stringify(events), before);
});

test("current year is included only strictly after six calendar months, including leap years", () => {
  for (const year of [2024, 2026]) for (const [suffix, included] of [["06-30", false], ["07-01", false], ["07-02", true], ["07-31", true]] as const) {
    const result = calc([flow(`${year - 1}-01-01`, "100"), value(`${year - 1}-12-31`, "110"), value(`${year}-${suffix}`, "120")]);
    assert.equal(result.status, "ok");
    assert.equal(result.excludedYears.includes(year), !included);
    assert.equal(result.period.endDate, included ? `${year}-${suffix}` : `${year - 1}-12-31`);
  }
});

test("latest recorded valuation controls filtering; current system year is irrelevant", () => {
  const result = calc([flow("2023-01-01", "100"), value("2024-12-31", "110"), value("2025-05-31", "150")]);
  assert.equal(result.period.endDate, "2024-12-31");
  assert.deepEqual(result.excludedYears, [2025]);
});

test("excluded short first year is rebased without double counting boundary-day flows", () => {
  const result = calc([flow("2023-08-01", "100"), flow("2023-12-31", "20"), value("2023-12-31", "150"), flow("2024-04-01", "30"), value("2025-12-31", "230"), flow("2026-04-01", "1000"), value("2026-05-31", "1500")]);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.excludedYears, [2023, 2026]);
  assert.equal(result.period.startDate, "2023-12-31");
  assert.equal(result.period.endDate, "2025-12-31");
  assert.deepEqual(result.period.flows, [{ date: "2023-12-31", direction: "contribution", amount: 150 }, { date: "2024-04-01", direction: "contribution", amount: 30 }]);
  assert.equal(result.rebased, true);
});

test("missing year-end boundary blocks results, even when a nearby or later valuation exists", () => {
  for (const date of ["2025-12-30", "2026-01-01"]) {
    const result = calc([flow("2024-01-01", "100"), value(date, "110"), value("2026-05-31", "120")]);
    assert.equal(result.status, "missing-boundary");
    assert.deepEqual(result.missingDates, ["2025-12-31"]);
    assert.equal(displayedInceptionRate(result.period), null);
  }
  const openingMissing = calc([flow("2023-08-01", "100"), value("2025-12-31", "130")]);
  assert.equal(openingMissing.status, "missing-boundary");
  assert.deepEqual(openingMissing.missingDates, ["2023-12-31"]);
});

test("no eligible years produces no rate and a single-year investment is checked from first funding", () => {
  const short = calc([flow("2026-08-01", "100"), value("2026-12-31", "110")]);
  assert.equal(short.status, "no-period");
  assert.deepEqual(short.excludedYears, [2026]);
  assert.equal(displayedInceptionRate(short.period), null);
  const long = calc([flow("2026-01-01", "100"), value("2026-09-01", "108")]);
  assert.equal(long.status, "ok");
  close(long.period.xirr, Math.pow(1.08, 365 / long.period.days) - 1);
});

test("no excluded years equals the unchanged inception calculation", () => {
  const events = [flow("2023-01-01", "100"), flow("2025-03-01", "30"), flow("2025-08-01", "10", "withdrawal"), value("2026-09-01", "150")];
  const result = calc(events);
  assert.deepEqual(result.excludedYears, []);
  close(result.period.xirr, calculateInceptionReturn([account], events, "USD", account).xirr!);
});

test("portfolio boundaries require every relevant account; future accounts and other currencies do not contaminate cutoff", () => {
  const other = { ...account, accountId: "other" };
  const events: LedgerEvent[] = [flow("2024-01-01", "100"), value("2025-12-31", "110"), value("2026-05-31", "120"),
    { ...flow("2024-01-01", "100"), accountId: "other" }, { ...value("2026-05-31", "130"), accountId: "other" }];
  assert.equal(calculateYearFilteredReturn([account, other], events, "USD").status, "missing-boundary");
  events.push({ ...value("2025-12-31", "115"), accountId: "other" });
  const foreign = { ...account, accountId: "foreign", currency: "SGD" as const };
  const future = { ...account, accountId: "future", openedOn: "2026-03-01" };
  events.push({ ...flow("2026-03-01", "1000"), accountId: "future" }, { ...value("2026-05-31", "1500"), accountId: "future" },
    { ...flow("2020-01-01", "9999"), accountId: "foreign", currency: "SGD" });
  const result = calculateYearFilteredReturn([account, other, foreign, future], events, "USD");
  assert.equal(result.status, "ok");
  assert.equal(result.endingValue, 225);
  assert.equal(result.period.flows.length, 2);
});

test("zero opening value is not a fictitious contribution; corrections use the latest recorded boundary value", () => {
  const result = calc([flow("2023-08-01", "100"), value("2023-12-31", "0"), flow("2024-02-01", "50"), value("2024-12-31", "55")]);
  assert.equal(result.status, "ok");
  assert.equal(result.period.startDate, "2024-02-01");
  assert.equal(result.period.flows.length, 1);
  const corrected = calc([flow("2024-01-01", "100"), value("2025-12-31", "110"), { ...value("2025-12-31", "120"), recordedAt: "2026-01-02T00:00:00Z" }, value("2026-05-31", "130")]);
  assert.equal(corrected.endingValue, 120);
});

test("both indices receive the filtered opening money, dates and XIRR; loaders only receive public metadata", async () => {
  const result = calc([flow("2023-08-01", "100"), value("2023-12-31", "150"), value("2025-12-31", "180"), value("2026-05-31", "999")]);
  const calls: unknown[][] = [];
  const comparisons = await loadPeriodComparisons(result, ["sp500", "nasdaq100"], async (...args) => {
    calls.push(args);
    const [id, currency, start, end] = args;
    return { warning: null, market: { benchmarkId: id, currency, points: [{ date: start, close: 100 }, { date: end, close: 120 }], sourceLabel: "Synthetic", fetchedAt: end, warnings: [], origin: "manual" } };
  });
  assert.deepEqual(calls, [["sp500", "USD", "2023-12-31", "2025-12-31"], ["nasdaq100", "USD", "2023-12-31", "2025-12-31"]]);
  for (const id of ["sp500", "nasdaq100"] as const) {
    close(comparisons[id]!.virtualValue, 180);
    close(comparisons[id]!.xirr, result.period.xirr!);
  }
});

test("invalid periods never fetch; opt-out and single-index failure remain isolated", async () => {
  let calls = 0;
  const invalid = calc([flow("2026-01-01", "100"), value("2026-05-01", "110")]);
  assert.deepEqual(await loadPeriodComparisons(invalid, ["sp500", "nasdaq100"], async () => { calls++; throw Error("unexpected"); }), {});
  assert.equal(calls, 0);
  const valid = calc([flow("2024-01-01", "100"), value("2025-12-31", "110")]);
  assert.deepEqual(await loadPeriodComparisons(valid, [], async () => { throw Error("unexpected"); }), {});
  const loaded = await loadPeriodComparisons(valid, ["sp500", "nasdaq100"], async (id, currency, start, end) => {
    if (id === "sp500") throw Error("offline");
    return { warning: null, market: { benchmarkId: id, currency, points: [{ date: start, close: 100 }, { date: end, close: 110 }], sourceLabel: "Synthetic", fetchedAt: end, warnings: [], origin: "manual" } };
  });
  assert.equal(loaded.sp500!.status, "unavailable");
  assert.equal(loaded.nasdaq100!.status, "ok");
});

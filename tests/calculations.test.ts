import assert from "node:assert/strict";
import test from "node:test";
import type { AccountState, LedgerEvent } from "../src/types";
import {
  calculateAccountAnnualReturns,
  calculateAccountMetrics,
  calculatePortfolioAnnualReturns,
  calculatePortfolioMetrics,
} from "../src/domain/calculations";
import { calculateXirr } from "../src/domain/xirr";

test("XIRR: one year from 100 to 110 is 10%", () => {
  const result = calculateXirr([
    { date: "2023-01-01", amount: -100 },
    { date: "2024-01-01", amount: 110 },
  ]);
  assert.equal(result.status, "ok");
  assert.ok(result.value !== null);
  assert.ok(Math.abs(result.value - 0.1) < 1e-8);
});

test("XIRR aggregates same-day flows and handles a leap year with Actual/365", () => {
  const result = calculateXirr([
    { date: "2024-01-01", amount: -60 },
    { date: "2024-01-01", amount: -40 },
    { date: "2025-01-01", amount: 110 },
  ]);
  assert.equal(result.status, "ok");
  assert.ok(result.value !== null && result.value > 0.099 && result.value < 0.101);
});

test("XIRR handles mid-period contributions and withdrawals", () => {
  const contribution = calculateXirr([
    { date: "2024-01-01", amount: -100 },
    { date: "2024-07-01", amount: -50 },
    { date: "2025-01-01", amount: 165 },
  ]);
  const withdrawal = calculateXirr([
    { date: "2024-01-01", amount: -100 },
    { date: "2024-07-01", amount: 20 },
    { date: "2025-01-01", amount: 90 },
  ]);
  assert.equal(contribution.status, "ok");
  assert.equal(withdrawal.status, "ok");
  assert.ok(contribution.value !== null && contribution.value > 0);
  assert.ok(withdrawal.value !== null && withdrawal.value > 0);
});

test("XIRR annualizes periods shorter than one year", () => {
  const result = calculateXirr([
    { date: "2025-01-01", amount: -100 },
    { date: "2025-07-02", amount: 105 },
  ]);
  assert.equal(result.status, "ok");
  assert.ok(result.value !== null && result.value > 0.1);
});

test("XIRR reports insufficient data and multiple roots instead of guessing", () => {
  assert.equal(calculateXirr([{ date: "2025-01-01", amount: -100 }]).status, "insufficient-data");
  assert.equal(
    calculateXirr([
      { date: "2025-01-01", amount: -100 },
      { date: "2026-01-01", amount: -10 },
    ]).status,
    "no-root",
  );
  const multiple = calculateXirr([
    { date: "2023-01-01", amount: -100 },
    { date: "2024-01-01", amount: 230 },
    { date: "2025-01-01", amount: -132 },
  ]);
  assert.equal(multiple.status, "multiple-roots");
  assert.equal(multiple.value, null);
});

test("XIRR rejects calendar dates that JavaScript would otherwise normalize", () => {
  assert.throws(
    () => calculateXirr([
      { date: "2025-02-30", amount: -100 },
      { date: "2026-02-28", amount: 110 },
    ]),
    /Invalid date/,
  );
});

const account: AccountState = {
  accountId: "a1",
  name: "Long-term investment",
  currency: "SGD",
  benchmarkId: "sp500",
  openedOn: "2023-01-01",
  archived: false,
};

function baseEvents(): LedgerEvent[] {
  return [
    {
      schemaVersion: 1,
      eventId: "flow-1",
      recordedAt: "2023-01-01T00:00:00.000Z",
      effectiveDate: "2023-01-01",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "value-1",
      recordedAt: "2024-01-01T00:00:00.000Z",
      effectiveDate: "2024-01-01",
      type: "valuation",
      accountId: "a1",
      totalValue: "110.00",
      currency: "SGD",
    },
  ];
}

test("account and portfolio profit reconcile", () => {
  const events = baseEvents();
  const metrics = calculateAccountMetrics(account, events);
  assert.equal(metrics.currentValue, 110);
  assert.equal(metrics.netContributions, 100);
  assert.equal(metrics.cumulativeProfit, 10);
  assert.ok(metrics.xirr !== null && Math.abs(metrics.xirr - 0.1) < 1e-8);
  const portfolio = calculatePortfolioMetrics([account], events, "SGD");
  assert.equal(portfolio.currentValue, 110);
  assert.equal(portfolio.cumulativeProfit, 10);
  assert.ok(portfolio.xirr !== null && Math.abs(portfolio.xirr - metrics.xirr) < 1e-10);
});

test("account ignores mismatched-currency events and reports a warning", () => {
  const events: LedgerEvent[] = [
    ...baseEvents(),
    {
      schemaVersion: 1,
      eventId: "usd-flow",
      recordedAt: "2023-06-01T00:00:00.000Z",
      effectiveDate: "2023-06-01",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "999.00",
      currency: "USD",
    },
  ];
  const metrics = calculateAccountMetrics(account, events);
  assert.equal(metrics.netContributions, 100);
  assert.ok(metrics.warnings.some((warning) => warning.includes("currency")));
});

test("portfolio does not calculate XIRR across misaligned valuation dates", () => {
  const second: AccountState = { ...account, accountId: "a2", name: "Education fund" };
  const events: LedgerEvent[] = [
    ...baseEvents(),
    {
      schemaVersion: 1,
      eventId: "a2-flow",
      recordedAt: "2023-01-01T00:00:00.000Z",
      effectiveDate: "2023-01-01",
      type: "cash-flow",
      accountId: "a2",
      direction: "contribution",
      amount: "50.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "a2-value",
      recordedAt: "2024-02-01T00:00:00.000Z",
      effectiveDate: "2024-02-01",
      type: "valuation",
      accountId: "a2",
      totalValue: "55.00",
      currency: "SGD",
    },
  ];
  const portfolio = calculatePortfolioMetrics([account, second], events, "SGD");
  assert.equal(portfolio.currentValue, 165);
  assert.equal(portfolio.xirr, null);
  assert.equal(portfolio.asOf, null);
  assert.ok(portfolio.warnings.some((warning) => warning.includes("valuation dates differ")));
});

test("current-year return is YTD rather than an annualized short-period rate", () => {
  const ytdAccount: AccountState = { ...account, openedOn: "2025-01-01" };
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "ytd-flow",
      recordedAt: "2025-01-01T00:00:00.000Z",
      effectiveDate: "2025-01-01",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "ytd-open",
      recordedAt: "2025-01-01T00:00:01.000Z",
      effectiveDate: "2025-01-01",
      type: "valuation",
      accountId: "a1",
      totalValue: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "ytd-close",
      recordedAt: "2025-07-02T00:00:00.000Z",
      effectiveDate: "2025-07-02",
      type: "valuation",
      accountId: "a1",
      totalValue: "105.00",
      currency: "SGD",
    },
  ];
  const [row] = calculateAccountAnnualReturns(ytdAccount, events, "2025-07-02");
  assert.equal(row?.period, "ytd");
  assert.equal(row?.status, "ok");
  assert.equal(row?.quality, "complete");
  assert.equal(row?.needsOpeningValuation, false);
  assert.ok(row?.rate !== null && Math.abs(row.rate - 0.05) < 1e-8);
});

test("historical annual return uses boundary valuation and marks complete coverage", () => {
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "opening-2025",
      recordedAt: "2024-12-31T00:00:00.000Z",
      effectiveDate: "2024-12-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "closing-2025",
      recordedAt: "2025-12-31T00:00:00.000Z",
      effectiveDate: "2025-12-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "110.00",
      currency: "SGD",
    },
  ];
  const row = calculateAccountAnnualReturns(account, events, "2026-07-01")
    .find((candidate) => candidate.year === 2025);
  assert.equal(row?.period, "full-year");
  assert.equal(row?.status, "ok");
  assert.equal(row?.quality, "complete");
  assert.equal(row?.needsOpeningValuation, false);
  assert.ok(row?.rate !== null && Math.abs(row.rate - 0.1) < 1e-8);
});

test("a recent prior-year valuation is carried forward and marked estimated", () => {
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "recent-prior-close",
      recordedAt: "2025-12-20T00:00:00.000Z",
      effectiveDate: "2025-12-20",
      type: "valuation",
      accountId: "a1",
      totalValue: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "current-close",
      recordedAt: "2026-01-31T00:00:00.000Z",
      effectiveDate: "2026-01-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "105.00",
      currency: "SGD",
    },
  ];
  const row = calculateAccountAnnualReturns(account, events, "2026-01-31")
    .find((candidate) => candidate.year === 2026);
  assert.equal(row?.status, "ok");
  assert.equal(row?.period, "ytd");
  assert.equal(row?.quality, "estimated");
  assert.equal(row?.needsOpeningValuation, false);
  assert.equal(row?.startDate, "2026-01-01");
  assert.ok(row?.details.some((detail) => detail.includes("2025-12-20")));
});

test("a stale prior-year valuation marks the year partial and requests an opening valuation", () => {
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "stale-prior-close",
      recordedAt: "2025-10-01T00:00:00.000Z",
      effectiveDate: "2025-10-01",
      type: "valuation",
      accountId: "a1",
      totalValue: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "stale-current-close",
      recordedAt: "2026-01-31T00:00:00.000Z",
      effectiveDate: "2026-01-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "105.00",
      currency: "SGD",
    },
  ];
  const row = calculateAccountAnnualReturns(account, events, "2026-01-31")
    .find((candidate) => candidate.year === 2026);
  assert.equal(row?.status, "ok");
  assert.equal(row?.period, "ytd");
  assert.equal(row?.quality, "partial");
  assert.equal(row?.needsOpeningValuation, true);
  assert.equal(row?.suggestedOpeningDate, "2026-01-01");
  assert.ok(row?.details.some((detail) => detail.includes("too old")));
});

test("an account opened midyear reports a partial-year period return", () => {
  const partialAccount: AccountState = { ...account, openedOn: "2025-07-01" };
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "partial-flow",
      recordedAt: "2025-07-01T00:00:00.000Z",
      effectiveDate: "2025-07-01",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "partial-close",
      recordedAt: "2025-12-31T00:00:00.000Z",
      effectiveDate: "2025-12-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "110.00",
      currency: "SGD",
    },
  ];
  const row = calculateAccountAnnualReturns(partialAccount, events, "2026-07-01")
    .find((candidate) => candidate.year === 2025);
  assert.equal(row?.period, "partial-year");
  assert.equal(row?.status, "ok");
  assert.equal(row?.quality, "partial");
  assert.ok(row?.rate !== null && Math.abs(row.rate - 0.1) < 1e-8);
});

test("portfolio annual returns aggregate only accounts in the selected currency", () => {
  const sgdSecond: AccountState = { ...account, accountId: "a2", name: "Second account", openedOn: "2025-01-01" };
  const usdAccount: AccountState = { ...account, accountId: "a3", name: "USD account", currency: "USD", openedOn: "2025-01-01" };
  const sgdFirst: AccountState = { ...account, openedOn: "2025-01-01" };
  const events: LedgerEvent[] = [
    ...[
      ["a1", "100.00", "110.00", "SGD"],
      ["a2", "100.00", "121.00", "SGD"],
      ["a3", "999.00", "1099.00", "USD"],
    ].flatMap(([accountId, contribution, value, currency], index): LedgerEvent[] => [
      {
        schemaVersion: 1,
        eventId: `currency-flow-${index}`,
        recordedAt: `2025-01-01T00:00:0${index}.000Z`,
        effectiveDate: "2025-01-01",
        type: "cash-flow",
        accountId: accountId!,
        direction: "contribution",
        amount: contribution!,
        currency: currency as "SGD" | "USD",
      },
      {
        schemaVersion: 1,
        eventId: `currency-value-${index}`,
        recordedAt: `2025-12-31T00:00:0${index}.000Z`,
        effectiveDate: "2025-12-31",
        type: "valuation",
        accountId: accountId!,
        totalValue: value!,
        currency: currency as "SGD" | "USD",
      },
    ]),
  ];
  const row = calculatePortfolioAnnualReturns(
    [sgdFirst, sgdSecond, usdAccount],
    events,
    "SGD",
    "2026-07-01",
  ).find((candidate) => candidate.year === 2025);
  assert.equal(row?.status, "ok");
  assert.ok(row?.rate !== null && Math.abs(row.rate - 0.155) < 1e-8);
});

test("a single-account portfolio reuses the account annual result", () => {
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "single-open",
      recordedAt: "2024-07-01T00:00:00.000Z",
      effectiveDate: "2024-07-01",
      type: "valuation",
      accountId: "a1",
      totalValue: "100.00",
      currency: "SGD",
    },
    {
      schemaVersion: 1,
      eventId: "single-close",
      recordedAt: "2024-12-31T00:00:00.000Z",
      effectiveDate: "2024-12-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "110.00",
      currency: "SGD",
    },
  ];
  const accountRow = calculateAccountAnnualReturns(account, events, "2025-07-01")
    .find((candidate) => candidate.year === 2024);
  const portfolioRow = calculatePortfolioAnnualReturns([account], events, "SGD", "2025-07-01")
    .find((candidate) => candidate.year === 2024);
  assert.deepEqual(portfolioRow, accountRow);
});

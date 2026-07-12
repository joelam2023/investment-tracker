import assert from "node:assert/strict";
import test from "node:test";
import type { AccountState, LedgerEvent } from "../src/types";
import {
  applyBenchmarkToMonthlyPerformance,
  calculateAccountMonthlyPerformance,
  calculatePortfolioMonthlyPerformance,
} from "../src/domain/monthly-performance";

const account: AccountState = {
  accountId: "a1",
  name: "Monthly account",
  currency: "USD",
  benchmarkId: "sp500",
  openedOn: "2025-01-01",
  archived: false,
};

test("opening-month Modified Dietz return removes the initial contribution", () => {
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "flow",
      recordedAt: "2025-01-01T00:00:00.000Z",
      effectiveDate: "2025-01-01",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "100.00",
      currency: "USD",
    },
    {
      schemaVersion: 1,
      eventId: "value",
      recordedAt: "2025-01-31T00:00:00.000Z",
      effectiveDate: "2025-01-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "110.00",
      currency: "USD",
    },
  ];
  const row = calculateAccountMonthlyPerformance(account, events, "2025-01-31").rows[0];
  assert.equal(row?.status, "mtd");
  assert.ok(row?.returnRate !== null && Math.abs(row.returnRate - 0.1) < 1e-10);
});

test("Modified Dietz weights a midmonth contribution by remaining days", () => {
  const existing = { ...account, openedOn: "2024-01-01" };
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "opening",
      recordedAt: "2024-12-31T00:00:00.000Z",
      effectiveDate: "2024-12-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "100.00",
      currency: "USD",
    },
    {
      schemaVersion: 1,
      eventId: "mid-flow",
      recordedAt: "2025-01-16T00:00:00.000Z",
      effectiveDate: "2025-01-16",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "100.00",
      currency: "USD",
    },
    {
      schemaVersion: 1,
      eventId: "closing",
      recordedAt: "2025-01-31T00:00:00.000Z",
      effectiveDate: "2025-01-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "205.00",
      currency: "USD",
    },
  ];
  const row = calculateAccountMonthlyPerformance(existing, events, "2025-02-01").rows
    .find((candidate) => candidate.month === "2025-01");
  assert.ok(row);
  assert.ok(row.returnRate !== null && Math.abs(row.returnRate - 1 / 30) < 1e-10);
  assert.equal(row.status, "complete");
});

test("months without a valuation remain explicit missing rows", () => {
  const result = calculateAccountMonthlyPerformance(account, [], "2025-03-15");
  assert.deepEqual(result.rows.map((row) => row.month), ["2025-01", "2025-02", "2025-03"]);
  assert.ok(result.rows.every((row) => row.status === "missing" && row.closingValue === null));
});

test("portfolio monthly rows do not mix currencies", () => {
  const sgd = { ...account, accountId: "sgd", currency: "SGD" as const };
  const events: LedgerEvent[] = [
    {
      schemaVersion: 1,
      eventId: "usd-flow",
      recordedAt: "2025-01-01T00:00:00.000Z",
      effectiveDate: "2025-01-01",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "100.00",
      currency: "USD",
    },
    {
      schemaVersion: 1,
      eventId: "usd-value",
      recordedAt: "2025-01-31T00:00:00.000Z",
      effectiveDate: "2025-01-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "110.00",
      currency: "USD",
    },
  ];
  const result = calculatePortfolioMonthlyPerformance([account, sgd], events, "USD", "2025-01-31");
  assert.equal(result.currency, "USD");
  assert.equal(result.rows[0]?.closingValue, 110);
});

test("benchmark monthly values add same-cash-flow return and excess", () => {
  const base = calculateAccountMonthlyPerformance(account, [
    {
      schemaVersion: 1,
      eventId: "flow",
      recordedAt: "2025-01-01T00:00:00.000Z",
      effectiveDate: "2025-01-01",
      type: "cash-flow",
      accountId: "a1",
      direction: "contribution",
      amount: "100.00",
      currency: "USD",
    },
    {
      schemaVersion: 1,
      eventId: "value",
      recordedAt: "2025-01-31T00:00:00.000Z",
      effectiveDate: "2025-01-31",
      type: "valuation",
      accountId: "a1",
      totalValue: "110.00",
      currency: "USD",
    },
  ], "2025-01-31");
  const result = applyBenchmarkToMonthlyPerformance(
    base,
    [{ date: "2025-01-31", amount: 105 }],
    [{ date: "2025-01-01", direction: "contribution", amount: 100 }],
  );
  const row = result.rows[0];
  assert.ok(row);
  assert.ok(row.benchmarkReturn !== null && Math.abs(row.benchmarkReturn - 0.05) < 1e-10);
  assert.ok(row.excessReturn !== null && Math.abs(row.excessReturn - 0.05) < 1e-10);
});

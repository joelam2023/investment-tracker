import assert from "node:assert/strict";
import test from "node:test";
import type { MonthlyPerformanceRow } from "../src/types";
import { samplePerformanceRows } from "../src/domain/performance-sampling";

function row(month: string, cumulativeReturn: number | null): MonthlyPerformanceRow {
  return {
    month,
    startDate: `${month}-01`,
    endDate: `${month}-28`,
    valuationDate: cumulativeReturn === null ? null : `${month}-23`,
    openingValue: cumulativeReturn === null ? null : 100,
    closingValue: cumulativeReturn === null ? null : 110,
    contributions: 0,
    withdrawals: 0,
    netFlow: 0,
    returnRate: cumulativeReturn,
    cumulativeReturn,
    benchmarkValue: cumulativeReturn === null ? null : 108,
    benchmarkReturn: cumulativeReturn,
    benchmarkCumulativeReturn: cumulativeReturn,
    excessReturn: cumulativeReturn,
    status: cumulativeReturn === null ? "missing" : "complete",
    details: [],
  };
}

test("year sampling keeps the current year's latest usable YTD row", () => {
  const rows = [
    row("2024-12", 0.2),
    row("2025-12", 0.4),
    row("2026-06", 0.5),
    row("2026-07", null),
  ];
  const sampled = samplePerformanceRows(rows, "year", (candidate) => candidate.cumulativeReturn !== null);
  assert.deepEqual(sampled.map((candidate) => candidate.month), ["2024-12", "2025-12", "2026-06"]);
});

test("quarter sampling chooses the latest usable row inside each quarter", () => {
  const rows = [row("2026-04", 0.4), row("2026-05", 0.5), row("2026-06", null)];
  const sampled = samplePerformanceRows(rows, "quarter", (candidate) => candidate.closingValue !== null);
  assert.deepEqual(sampled.map((candidate) => candidate.month), ["2026-05"]);
});

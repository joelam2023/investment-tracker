import type { LinkedReport } from "../domain/linked-return";
import { moneyWeightedPeriod, summarizeLinked } from "../domain/linked-return";
import { calculateSameCashFlowBenchmark, type MarketSeries } from "./benchmark";

// Annual personal comparisons use the same opening capital and dated flows.
// No account names, amounts or cash-flow dates are passed to market providers.
export function annualMoneyWeightedIndex(report: LinkedReport, market?: MarketSeries | null): LinkedReport {
  const years = report.years.map(row => {
    let rate: number | null = null;
    if (market && row.start && row.end && row.openingValue !== undefined && row.cashFlows) {
      const funding = [...(row.openingValue > 0 ? [{ date: row.start, direction: "contribution" as const, amount: row.openingValue }] : []), ...row.cashFlows];
      const result = calculateSameCashFlowBenchmark(funding, row.end, 0, null, report.currency, market).result;
      if (result.status === "ok" && result.virtualValue !== null) rate = moneyWeightedPeriod(row.openingValue, result.virtualValue, row.cashFlows, row.start, row.end);
    }
    return { ...row, rate, estimated: !!row.boundaryEstimates?.length };
  });
  // Annual money-weighted rates are never silently compounded into an XIRR.
  return { ...report, years, summary: summarizeLinked([]) };
}

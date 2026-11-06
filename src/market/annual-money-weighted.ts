import type { LinkedReport } from "../domain/linked-return";
import { moneyWeightedPeriod, summarizeLinked } from "../domain/linked-return";
import { calculateSameCashFlowBenchmark, type MarketSeries } from "./benchmark";

// Annual personal comparisons use the same opening capital and dated flows.
// No account names, amounts or cash-flow dates are passed to market providers.
const DAY_MS = 86_400_000;

export function annualMoneyWeightedIndex(report: LinkedReport, market?: MarketSeries | null): LinkedReport {
  const points = market ? market.points.filter(p => Number.isFinite(p.close) && p.close > 0).sort((x, y) => x.date.localeCompare(y.date)) : [];
  const years = report.years.map(row => {
    let rate: number | null = null;
    if (market && row.start && row.end && row.openingValue !== undefined && row.cashFlows) {
      // The opening value is an end-of-day valuation, not new cash, so it is priced at the
      // last close on or before the start date. December 31 can fall on a weekend; buying
      // at the next close would skip the first trading day of the year.
      const start = row.start;
      const prior = points.filter(p => p.date <= start).at(-1);
      const openingDate = prior && (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${prior.date}T00:00:00Z`)) / DAY_MS <= 7 ? prior.date : start;
      const funding = [...(row.openingValue > 0 ? [{ date: openingDate, direction: "contribution" as const, amount: row.openingValue }] : []), ...row.cashFlows];
      const result = calculateSameCashFlowBenchmark(funding, row.end, 0, null, report.currency, market).result;
      if (result.status === "ok" && result.virtualValue !== null) rate = moneyWeightedPeriod(row.openingValue, result.virtualValue, row.cashFlows, row.start, row.end);
    }
    return { ...row, rate, estimated: !!row.boundaryEstimates?.length };
  });
  // Annual money-weighted rates are never silently compounded into an XIRR.
  return { ...report, years, summary: summarizeLinked([]) };
}

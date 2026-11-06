import type { BenchmarkResult, Currency, MarketBenchmarkId } from "../types";
import type { YearFilteredReturn } from "../domain/year-filtered-return";
import { calculateSameCashFlowBenchmark, type MarketSeries } from "./benchmark";

export type PeriodComparisons = Partial<Record<MarketBenchmarkId, BenchmarkResult>>;
export type PeriodMarketLoader = (id: MarketBenchmarkId, currency: Currency, start: string, end: string) => Promise<{ market: MarketSeries | null; warning: string | null }>;

export async function loadPeriodComparisons(filtered: YearFilteredReturn, ids: MarketBenchmarkId[], load: PeriodMarketLoader): Promise<PeriodComparisons> {
  const { period } = filtered;
  if (filtered.status !== "ok" || !period.startDate || !period.endDate) return {};
  const start = period.startDate, end = period.endDate;
  return Object.fromEntries(await Promise.all(ids.map(async (id) => {
    try {
      // Only public index/currency/date metadata crosses this loader boundary.
      // Financial flows and amounts are used exclusively in the local simulator.
      const loaded = await load(id, period.currency, start, end);
      if (loaded.market) return [id, calculateSameCashFlowBenchmark(period.flows, end, filtered.endingValue, period.xirr, period.currency, loaded.market).result];
    } catch { /* Preserve the other comparison when one provider fails. */ }
    return [id, { status: "unavailable", benchmarkId: id, asOf: null, virtualValue: null, xirr: null,
      excessValue: null, excessRate: null, sourceLabel: id, warnings: [] } satisfies BenchmarkResult];
  }))) as PeriodComparisons;
}

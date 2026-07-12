import type { BenchmarkResult, Currency, DatedAmount, MarketPoint } from "../types";
import { calculateXirr } from "../domain/xirr";
import { t } from "../i18n";

export interface ExternalBenchmarkFlow {
  date: string;
  direction: "contribution" | "withdrawal";
  amount: number;
}

export interface MarketSeries {
  currency: Currency;
  points: MarketPoint[];
  sourceLabel: string;
  fetchedAt: string;
  warnings: string[];
  origin: "automatic" | "manual";
}

export interface CalculatedBenchmark {
  result: BenchmarkResult;
  series: DatedAmount[];
}

function unavailable(sourceLabel: string, warnings: string[]): CalculatedBenchmark {
  return {
    result: {
      status: "unavailable",
      benchmarkId: "sp500",
      asOf: null,
      virtualValue: null,
      xirr: null,
      excessValue: null,
      excessRate: null,
      sourceLabel,
      warnings,
    },
    series: [],
  };
}

function dayDifference(earlier: string, later: string): number {
  return (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000;
}

function isStrictDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function calculateSameCashFlowBenchmark(
  inputFlows: ExternalBenchmarkFlow[],
  asOf: string,
  actualValue: number,
  actualXirr: number | null,
  expectedCurrency: Currency,
  market: MarketSeries,
): CalculatedBenchmark {
  if (market.currency !== expectedCurrency) {
    return unavailable(market.sourceLabel, [t("Market currency {marketCurrency} does not match account currency {accountCurrency}; calculation stopped", {
      marketCurrency: market.currency,
      accountCurrency: expectedCurrency,
    })]);
  }
  if (!isStrictDate(asOf) || !Number.isFinite(actualValue) || actualValue < 0) {
    return unavailable(market.sourceLabel, [t("Invalid valuation date or amount")]);
  }
  if (
    inputFlows.length === 0 ||
    inputFlows.some(
      (flow) =>
        !isStrictDate(flow.date) ||
        flow.date > asOf ||
        !Number.isFinite(flow.amount) ||
        flow.amount <= 0 ||
        (flow.direction !== "contribution" && flow.direction !== "withdrawal"),
    )
  ) {
    return unavailable(market.sourceLabel, [t("Cash flow contains an invalid amount, date, or direction; benchmark calculation stopped")]);
  }
  const points = [...market.points]
    .filter((point) => point.date <= asOf && Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const flows = [...inputFlows].sort((a, b) => a.date.localeCompare(b.date));
  const warnings = [...market.warnings];
  if (points.length === 0) return unavailable(market.sourceLabel, [...warnings, t("No benchmark data covers the valuation period")]);
  if (flows.length === 0 || !flows.some((flow) => flow.direction === "contribution")) {
    return unavailable(market.sourceLabel, [...warnings, t("No contribution records are available for the benchmark simulation")]);
  }

  const mapped = flows.map((flow) => ({
    flow,
    point: points.find((point) => point.date >= flow.date && dayDifference(flow.date, point.date) <= 7),
  }));
  if (mapped.some((item) => !item.point)) {
    return unavailable(market.sourceLabel, [...warnings, t("Benchmark data does not cover one or more cash-flow dates; no interpolation was used")]);
  }
  const endPoint = points.at(-1);
  if (!endPoint) return unavailable(market.sourceLabel, warnings);
  if (dayDifference(endPoint.date, asOf) > 7) {
    return unavailable(market.sourceLabel, [...warnings, t("Benchmark data is only available through {date}, more than 7 days before the valuation date", { date: endPoint.date })]);
  }

  const flowsByTradingDate = new Map<string, ExternalBenchmarkFlow[]>();
  for (const item of mapped) {
    const date = item.point?.date;
    if (!date) continue;
    const onDate = flowsByTradingDate.get(date) ?? [];
    onDate.push(item.flow);
    flowsByTradingDate.set(date, onDate);
  }

  let shares = 0;
  const series: DatedAmount[] = [];
  for (const point of points) {
    for (const flow of flowsByTradingDate.get(point.date) ?? []) {
      const delta = flow.amount / point.close;
      shares += flow.direction === "contribution" ? delta : -delta;
      if (shares < -1e-10) {
        return unavailable(market.sourceLabel, [...warnings, t("The benchmark portfolio became negative after a withdrawal; comparison cannot continue")]);
      }
      if (Math.abs(shares) < 1e-10) shares = 0;
    }
    if (shares > 0) series.push({ date: point.date, amount: shares * point.close });
  }
  const virtualValue = Math.max(0, shares * endPoint.close);
  const benchmarkCashFlows: DatedAmount[] = flows.map((flow) => ({
    date: flow.date,
    amount: flow.direction === "contribution" ? -flow.amount : flow.amount,
  }));
  benchmarkCashFlows.push({ date: asOf, amount: virtualValue });
  const benchmarkXirr = calculateXirr(benchmarkCashFlows);
  if (benchmarkXirr.status !== "ok") warnings.push(t("Benchmark cash flows do not produce a unique XIRR"));
  return {
    result: {
      status: "ok",
      benchmarkId: "sp500",
      asOf: endPoint.date,
      virtualValue,
      xirr: benchmarkXirr.value,
      excessValue: actualValue - virtualValue,
      excessRate: actualXirr !== null && benchmarkXirr.value !== null ? actualXirr - benchmarkXirr.value : null,
      sourceLabel: market.sourceLabel,
      warnings,
    },
    series,
  };
}

import type { AccountState, BenchmarkResult, CashFlowEvent, Currency, LedgerEvent } from "../types";
import type { ExternalBenchmarkFlow } from "../market/benchmark";
import { calculateAccountMetrics, calculatePortfolioMetrics } from "./calculations";
import { parsePositiveMoneyStrict } from "./money";

const DAY_MS = 86_400_000;

export interface InceptionReturn {
  currency: Currency;
  startDate: string | null;
  endDate: string | null;
  days: number;
  annualizationEligible: boolean;
  xirr: number | null;
  periodReturn: number | null;
  flows: ExternalBenchmarkFlow[];
  warnings: string[];
}

function timestamp(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : null;
}

// The display rule is strictly MORE than six calendar months, not 180 days.
// Month-end dates are clamped, e.g. August 31 -> February 28/29.
export function canShowAnnualized(start: string | null, end: string | null): boolean {
  if (!start || !end || timestamp(start) === null || timestamp(end) === null) return false;
  const initial = new Date(timestamp(start)!);
  const target = new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth() + 6, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(initial.getUTCDate(), lastDay));
  return timestamp(end)! > target.getTime();
}

// Money-weighted PERIOD return (Modified Dietz), not an annualized XIRR
// converted back to a period return. Inception has an opening value of zero.
export function inceptionPeriodReturn(flows: ExternalBenchmarkFlow[], end: string, endingValue: number): number | null {
  const start = [...flows].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  const startMs = start ? timestamp(start) : null;
  const endMs = timestamp(end);
  if (startMs === null || endMs === null || endMs <= startMs || !Number.isFinite(endingValue) || endingValue < 0) return null;
  let net = 0, weighted = 0;
  for (const flow of flows) {
    const date = timestamp(flow.date);
    if (date === null || date < startMs || date > endMs || !Number.isFinite(flow.amount) || flow.amount <= 0 ||
      (flow.direction !== "contribution" && flow.direction !== "withdrawal")) return null;
    const amount = flow.direction === "contribution" ? flow.amount : -flow.amount;
    net += amount;
    weighted += amount * (endMs - date) / (endMs - startMs);
  }
  if (weighted <= 0) return null;
  const rate = (endingValue - net) / weighted;
  return Number.isFinite(rate) && rate >= -1 ? rate : null;
}

export function calculateInceptionReturn(
  accounts: AccountState[], events: LedgerEvent[], currency: Currency, account: AccountState | null = null,
): InceptionReturn {
  const metrics = account ? calculateAccountMetrics(account, events) : calculatePortfolioMetrics(accounts, events, currency);
  const ids = new Set(account ? [account.accountId] : accounts.filter((item) => !item.archived && item.currency === currency).map((item) => item.accountId));
  const flows: ExternalBenchmarkFlow[] = metrics.asOf ? events.filter((event): event is CashFlowEvent =>
    event.type === "cash-flow" && ids.has(event.accountId) && event.currency === currency && event.effectiveDate <= metrics.asOf!,
  ).map((event) => ({ date: event.effectiveDate, direction: event.direction, amount: parsePositiveMoneyStrict(event.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date)) : [];
  const startDate = flows[0]?.date ?? null;
  const endDate = metrics.asOf;
  const days = startDate && endDate ? (timestamp(endDate)! - timestamp(startDate)!) / DAY_MS : 0;
  return {
    currency, startDate, endDate, days,
    annualizationEligible: canShowAnnualized(startDate, endDate),
    xirr: metrics.xirr,
    periodReturn: endDate ? inceptionPeriodReturn(flows, endDate, metrics.currentValue) : null,
    flows, warnings: metrics.warnings,
  };
}

export function displayedInceptionRate(period: InceptionReturn, benchmark?: BenchmarkResult): number | null {
  if (!period.startDate || !period.endDate || period.days <= 0) return null;
  if (benchmark) {
    if (benchmark.status !== "ok" || benchmark.virtualValue === null) return null;
    return period.annualizationEligible ? benchmark.xirr : inceptionPeriodReturn(period.flows, period.endDate, benchmark.virtualValue);
  }
  return period.annualizationEligible ? period.xirr : period.periodReturn;
}

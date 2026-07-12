import type {
  AccountState,
  CashFlowEvent,
  Currency,
  DatedAmount,
  LedgerEvent,
  MonthlyPerformanceResult,
  MonthlyPerformanceRow,
  ValuationEvent,
} from "../types";
import { parseMoneyStrict, parsePositiveMoneyStrict } from "./money";
import { calculateXirr } from "./xirr";
import { t } from "../i18n";

const DAY_MS = 86_400_000;
const COMPLETE_WINDOW_DAYS = 7;

export interface MonthlyExternalFlow {
  date: string;
  direction: "contribution" | "withdrawal";
  amount: number;
}

function timestamp(date: string): number {
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) {
    throw new Error(t("Invalid date: {date}", { date }));
  }
  return value;
}

function daysBetween(start: string, end: string): number {
  return (timestamp(end) - timestamp(start)) / DAY_MS;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function monthEnd(month: string): string {
  const [year, number] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year!, number!, 0));
  return value.toISOString().slice(0, 10);
}

function addMonths(month: string, amount: number): string {
  const [year, number] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year!, number! - 1 + amount, 1));
  return value.toISOString().slice(0, 7);
}

function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let month = first; month <= last; month = addMonths(month, 1)) months.push(month);
  return months;
}

function accountEvents<T extends CashFlowEvent | ValuationEvent>(
  accountId: string,
  events: LedgerEvent[],
  type: T["type"],
): T[] {
  return events.filter(
    (event): event is T => event.type === type && "accountId" in event && event.accountId === accountId,
  );
}

function signedNetFlow(flow: MonthlyExternalFlow): number {
  return flow.direction === "contribution" ? flow.amount : -flow.amount;
}

function modifiedDietz(
  openingValue: number,
  closingValue: number,
  flows: MonthlyExternalFlow[],
  startDate: string,
  endDate: string,
): number | null {
  const duration = daysBetween(startDate, endDate);
  if (duration <= 0) return null;
  let netFlow = 0;
  let weightedFlow = 0;
  for (const flow of flows) {
    const signed = signedNetFlow(flow);
    const elapsed = Math.min(duration, Math.max(0, daysBetween(startDate, flow.date)));
    const weight = (duration - elapsed) / duration;
    netFlow += signed;
    weightedFlow += signed * weight;
  }
  const denominator = openingValue + weightedFlow;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  const rate = (closingValue - openingValue - netFlow) / denominator;
  return Number.isFinite(rate) && rate > -1 ? rate : null;
}

function periodRateFromAnnualized(rate: number, startDate: string, endDate: string): number | null {
  const days = daysBetween(startDate, endDate);
  if (days <= 0 || rate <= -1) return null;
  const value = Math.expm1(Math.log1p(rate) * (days / 365));
  return Number.isFinite(value) ? value : null;
}

function cumulativeMoneyWeightedReturn(
  flows: MonthlyExternalFlow[],
  closingValue: number,
  endDate: string,
): number | null {
  const eligible = flows.filter((flow) => flow.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
  const startDate = eligible[0]?.date;
  if (!startDate || startDate >= endDate) return null;
  const cashFlows: DatedAmount[] = eligible.map((flow) => ({
    date: flow.date,
    amount: flow.direction === "contribution" ? -flow.amount : flow.amount,
  }));
  cashFlows.push({ date: endDate, amount: closingValue });
  const result = calculateXirr(cashFlows);
  return result.status === "ok" && result.value !== null
    ? periodRateFromAnnualized(result.value, startDate, endDate)
    : null;
}

function emptyRow(month: string, today: string, flows: MonthlyExternalFlow[], details: string[]): MonthlyPerformanceRow {
  const endDate = month === monthKey(today) ? today : monthEnd(month);
  const contributions = flows
    .filter((flow) => flow.direction === "contribution")
    .reduce((sum, flow) => sum + flow.amount, 0);
  const withdrawals = flows
    .filter((flow) => flow.direction === "withdrawal")
    .reduce((sum, flow) => sum + flow.amount, 0);
  return {
    month,
    startDate: monthStart(month),
    endDate,
    valuationDate: null,
    openingValue: null,
    closingValue: null,
    contributions,
    withdrawals,
    netFlow: contributions - withdrawals,
    returnRate: null,
    cumulativeReturn: null,
    benchmarkValue: null,
    benchmarkReturn: null,
    benchmarkCumulativeReturn: null,
    excessReturn: null,
    status: "missing",
    details,
  };
}

function mapCashFlows(events: CashFlowEvent[]): MonthlyExternalFlow[] {
  return events.map((event) => ({
    date: event.effectiveDate,
    direction: event.direction,
    amount: parsePositiveMoneyStrict(event.amount),
  }));
}

export function calculateAccountMonthlyPerformance(
  account: AccountState,
  events: LedgerEvent[],
  today: string,
): MonthlyPerformanceResult {
  timestamp(today);
  const valuations = accountEvents<ValuationEvent>(account.accountId, events, "valuation")
    .filter((event) => event.currency === account.currency)
    .sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.recordedAt.localeCompare(b.recordedAt),
    );
  const cashFlows = mapCashFlows(
    accountEvents<CashFlowEvent>(account.accountId, events, "cash-flow")
      .filter((event) => event.currency === account.currency),
  ).sort((a, b) => a.date.localeCompare(b.date));
  const firstMonth = monthKey(account.openedOn);
  const lastMonth = monthKey(today);
  const rows = monthsBetween(firstMonth, lastMonth).map((month): MonthlyPerformanceRow => {
    const start = monthStart(month);
    const cap = month === lastMonth ? today : monthEnd(month);
    const monthFlows = cashFlows.filter((flow) => monthKey(flow.date) === month && flow.date <= cap);
    const closing = valuations.filter(
      (event) => monthKey(event.effectiveDate) === month && event.effectiveDate <= cap,
    ).at(-1);
    if (!closing) return emptyRow(month, today, monthFlows, [t("Missing month-end valuation")]);

    const contributions = monthFlows
      .filter((flow) => flow.direction === "contribution")
      .reduce((sum, flow) => sum + flow.amount, 0);
    const withdrawals = monthFlows
      .filter((flow) => flow.direction === "withdrawal")
      .reduce((sum, flow) => sum + flow.amount, 0);
    const details: string[] = [];
    const isOpeningMonth = month === firstMonth;
    const opening = valuations.filter((event) => event.effectiveDate < start).at(-1);
    let openingValue: number | null = opening ? parseMoneyStrict(opening.totalValue) : null;
    let calculationStart = start;
    if (isOpeningMonth && !opening) {
      openingValue = 0;
      calculationStart = account.openedOn;
      details.push(t("Account started on {date}", { date: account.openedOn }));
    }
    if (opening && monthKey(opening.effectiveDate) !== addMonths(month, -1)) {
      details.push(t("Previous valuation is dated {date}", { date: opening.effectiveDate }));
      openingValue = null;
    }
    const closingValue = parseMoneyStrict(closing.totalValue);
    const endGap = daysBetween(closing.effectiveDate, cap);
    const status = month === lastMonth
      ? "mtd"
      : endGap <= COMPLETE_WINDOW_DAYS && openingValue !== null
        ? "complete"
        : "partial";
    if (endGap > COMPLETE_WINDOW_DAYS) {
      details.push(t("This month's valuation is dated {date}", { date: closing.effectiveDate }));
    }
    if (openingValue === null) details.push(t("Previous month-end valuation is missing; monthly return is unavailable"));
    const returnRate = openingValue === null
      ? null
      : modifiedDietz(openingValue, closingValue, monthFlows, calculationStart, closing.effectiveDate);
    return {
      month,
      startDate: calculationStart,
      endDate: cap,
      valuationDate: closing.effectiveDate,
      openingValue,
      closingValue,
      contributions,
      withdrawals,
      netFlow: contributions - withdrawals,
      returnRate,
      cumulativeReturn: cumulativeMoneyWeightedReturn(cashFlows, closingValue, closing.effectiveDate),
      benchmarkValue: null,
      benchmarkReturn: null,
      benchmarkCumulativeReturn: null,
      excessReturn: null,
      status,
      details,
    };
  });
  return { currency: account.currency, rows, warnings: [] };
}

export function calculatePortfolioMonthlyPerformance(
  accounts: AccountState[],
  events: LedgerEvent[],
  currency: Currency,
  today: string,
): MonthlyPerformanceResult {
  const active = accounts.filter((account) => !account.archived && account.currency === currency);
  if (active.length === 0) return { currency, rows: [], warnings: [] };
  if (active.length === 1 && active[0]) return calculateAccountMonthlyPerformance(active[0], events, today);
  const firstOpened = [...active].sort((a, b) => a.openedOn.localeCompare(b.openedOn))[0]?.openedOn;
  if (!firstOpened) return { currency, rows: [], warnings: [] };
  const allCashFlows = active.flatMap((account) =>
    mapCashFlows(
      accountEvents<CashFlowEvent>(account.accountId, events, "cash-flow")
        .filter((event) => event.currency === currency),
    ),
  ).sort((a, b) => a.date.localeCompare(b.date));
  const lastMonth = monthKey(today);
  const rows = monthsBetween(monthKey(firstOpened), lastMonth).map((month): MonthlyPerformanceRow => {
    const start = monthStart(month);
    const cap = month === lastMonth ? today : monthEnd(month);
    const included = active.filter((account) => account.openedOn <= cap);
    const monthFlows = allCashFlows.filter((flow) => monthKey(flow.date) === month && flow.date <= cap);
    const closings = included.map((account) => ({
      account,
      value: accountEvents<ValuationEvent>(account.accountId, events, "valuation")
        .filter(
          (event) => event.currency === currency && monthKey(event.effectiveDate) === month && event.effectiveDate <= cap,
        )
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
        .at(-1),
    }));
    const missing = closings.filter((item) => !item.value).map((item) => item.account.name);
    if (missing.length > 0) {
      return emptyRow(month, today, monthFlows, [t("Missing month-end valuation: {accounts}", { accounts: missing.join(", ") })]);
    }
    let openingValue = 0;
    const details: string[] = [];
    let hasOpeningGap = false;
    for (const account of included) {
      if (account.openedOn >= start) continue;
      const opening = accountEvents<ValuationEvent>(account.accountId, events, "valuation")
        .filter((event) => event.currency === currency && event.effectiveDate < start)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
        .at(-1);
      if (!opening || monthKey(opening.effectiveDate) !== addMonths(month, -1)) {
        hasOpeningGap = true;
        continue;
      }
      openingValue += parseMoneyStrict(opening.totalValue);
    }
    if (hasOpeningGap) details.push(t("Some accounts are missing a previous month-end valuation; monthly return is unavailable"));
    const closingValue = closings.reduce((sum, item) => sum + parseMoneyStrict(item.value!.totalValue), 0);
    const valuationDates = closings.map((item) => item.value!.effectiveDate).sort();
    const valuationDate = valuationDates.at(-1) ?? cap;
    if (new Set(valuationDates).size > 1) {
      details.push(t("Account valuation dates differ; the latest value within the month is used for each account"));
    }
    const contributions = monthFlows.filter((flow) => flow.direction === "contribution").reduce((sum, flow) => sum + flow.amount, 0);
    const withdrawals = monthFlows.filter((flow) => flow.direction === "withdrawal").reduce((sum, flow) => sum + flow.amount, 0);
    const endGap = Math.max(...valuationDates.map((date) => daysBetween(date, cap)));
    const status = month === lastMonth
      ? "mtd"
      : endGap <= COMPLETE_WINDOW_DAYS && !hasOpeningGap
        ? "complete"
        : "partial";
    const returnRate = hasOpeningGap
      ? null
      : modifiedDietz(openingValue, closingValue, monthFlows, start, cap);
    return {
      month,
      startDate: start,
      endDate: cap,
      valuationDate,
      openingValue: hasOpeningGap ? null : openingValue,
      closingValue,
      contributions,
      withdrawals,
      netFlow: contributions - withdrawals,
      returnRate,
      cumulativeReturn: cumulativeMoneyWeightedReturn(allCashFlows, closingValue, cap),
      benchmarkValue: null,
      benchmarkReturn: null,
      benchmarkCumulativeReturn: null,
      excessReturn: null,
      status,
      details,
    };
  });
  return { currency, rows, warnings: [] };
}

export function applyBenchmarkToMonthlyPerformance(
  performance: MonthlyPerformanceResult,
  benchmarkSeries: DatedAmount[],
  flows: MonthlyExternalFlow[],
): MonthlyPerformanceResult {
  const series = [...benchmarkSeries].sort((a, b) => a.date.localeCompare(b.date));
  const rows = performance.rows.map((row): MonthlyPerformanceRow => {
    if (row.closingValue === null || !row.valuationDate) return row;
    const valuationDate = row.valuationDate;
    const closing = series.filter((point) => point.date <= valuationDate).at(-1);
    if (!closing) return row;
    const opening = series.filter((point) => point.date < row.startDate).at(-1);
    const monthFlows = flows.filter((flow) => monthKey(flow.date) === row.month && flow.date <= valuationDate);
    const openingValue = opening?.amount ?? 0;
    const benchmarkReturn = modifiedDietz(
      openingValue,
      closing.amount,
      monthFlows,
      row.startDate,
      valuationDate,
    );
    const benchmarkCumulativeReturn = cumulativeMoneyWeightedReturn(flows, closing.amount, closing.date);
    return {
      ...row,
      benchmarkValue: closing.amount,
      benchmarkReturn,
      benchmarkCumulativeReturn,
      excessReturn: row.returnRate !== null && benchmarkReturn !== null ? row.returnRate - benchmarkReturn : null,
    };
  });
  return { ...performance, rows };
}

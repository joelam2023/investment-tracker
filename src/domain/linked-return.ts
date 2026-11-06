import type { AccountState, AnnualReturnResult, Currency, LedgerEvent } from "../types";
import { parseMoneyStrict, parsePositiveMoneyStrict } from "./money";
import { canShowAnnualized } from "./inception-return";
import type { MarketSeries, ExternalBenchmarkFlow } from "../market/benchmark";
import { t } from "../i18n";

export interface LinkedYear {
  year: number;
  start: string | null;
  end: string | null;
  rate: number | null;
  estimated: boolean;
  included: boolean;
  partial: boolean;
  moneyWeightedRate?: number | null;
  openingValue?: number;
  closingValue?: number;
  cashFlows?: ExternalBenchmarkFlow[];
  boundaryEstimates?: Array<{ date: string; sources: string[] }>;
}
export interface LinkedSummary {
  rate: number | null;
  cumulative: number | null;
  start: string | null;
  end: string | null;
  days: number;
  annualized: boolean;
  estimated: boolean;
}
export interface LinkedReport { currency: Currency; years: LinkedYear[]; summary: LinkedSummary; }
const days = (a: string, b: string) => (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000;

// One Modified Dietz calculation over the WHOLE requested interval. This must
// not be replaced by a product of subperiod returns or deannualized XIRR.
export function moneyWeightedPeriod(opening: number, closing: number, cash: ExternalBenchmarkFlow[], start: string, end: string): number | null {
  const duration = days(start, end);
  if (duration <= 0 || !Number.isFinite(duration) || !Number.isFinite(opening) || !Number.isFinite(closing) || opening < 0 || closing < 0) return null;
  let net = 0, weighted = 0;
  for (const flow of cash) {
    if (flow.date <= start || flow.date > end || !Number.isFinite(flow.amount) || flow.amount <= 0) return null;
    const amount = flow.amount * (flow.direction === "contribution" ? 1 : -1);
    net += amount;
    weighted += amount * days(flow.date, end) / duration;
  }
  const denominator = opening + weighted, profit = closing - opening - net;
  const rate = denominator > 0 ? profit / denominator : denominator === 0 && profit === 0 ? 0 : null;
  return rate !== null && Number.isFinite(rate) && rate >= -1 ? rate : null;
}

export function summarizeLinked(years: LinkedYear[]): LinkedSummary {
  const selected = years.filter(y => y.included).sort((a, b) => a.year - b.year);
  const start = selected[0]?.start ?? null, end = selected.at(-1)?.end ?? null;
  const summary: LinkedSummary = { rate: null, cumulative: null, start, end, days: 0,
    annualized: false, estimated: selected.some(y => y.estimated) };
  if (!selected.length || !start || !end) return summary;
  let factor = 1;
  for (let i = 0; i < selected.length; i++) {
    const row = selected[i]!;
    if (!row.start || !row.end || row.rate === null || !Number.isFinite(row.rate) || row.rate < -1 ||
      (i > 0 && selected[i - 1]!.end !== row.start)) return { ...summary, days: 0 };
    const duration = days(row.start, row.end);
    if (duration <= 0) return { ...summary, days: 0 };
    summary.days += duration;
    factor *= 1 + row.rate;
  }
  if (!Number.isFinite(factor) || summary.days <= 0) return { ...summary, days: 0 };
  summary.cumulative = factor - 1;
  summary.annualized = canShowAnnualized(start, end);
  summary.rate = summary.annualized ? Math.pow(factor, 365 / summary.days) - 1 : summary.cumulative;
  if (!Number.isFinite(summary.rate)) summary.rate = null;
  return summary;
}

// End-of-day valuations and flows. A valuation at each flow date gives an
// exact linked return under that convention. Interior flows without valuations
// use daily-weighted Modified Dietz and are explicitly marked estimated.
export function calculateLinkedReport(accounts: AccountState[], events: LedgerEvent[], currency: Currency,
  today: string, account: AccountState | null = null, excludeShortYears = false): LinkedReport {
  const selected = account ? [account] : accounts.filter(a => !a.archived && a.currency === currency);
  const ids = new Set(selected.map(a => a.accountId));
  const scoped = events.filter(e => "accountId" in e && ids.has(e.accountId) && "currency" in e && e.currency === currency &&
    e.effectiveDate <= today && (e.type === "valuation" || e.type === "cash-flow"));
  const flows: ExternalBenchmarkFlow[] = scoped.flatMap(e => e.type === "cash-flow" ? [{ date: e.effectiveDate,
    direction: e.direction, amount: parsePositiveMoneyStrict(e.amount) }] : []);
  const valuations = scoped.filter(e => e.type === "valuation").sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate) || a.recordedAt.localeCompare(b.recordedAt));
  const first = scoped.map(e => e.effectiveDate).sort()[0];
  const last = valuations.at(-1)?.effectiveDate;
  if (!first || !last || first >= last) return { currency, years: [], summary: summarizeLinked([]) };
  const starts = new Map(selected.map(a => [a.accountId, scoped.filter(e => "accountId" in e && e.accountId === a.accountId).map(e => e.effectiveDate).sort()[0]]));
  const values = new Map<string, number>();
  const dates = [...new Set([first, ...valuations.map(v => v.effectiveDate)])].sort();
  let syntheticOpening = false;
  for (const date of dates) {
    let total = 0, valid = true;
    for (const a of selected) {
      const began = starts.get(a.accountId);
      if (!began || began > date) continue;
      const value = valuations.filter(v => v.accountId === a.accountId && v.effectiveDate === date).at(-1);
      if (value) total += parseMoneyStrict(value.totalValue);
      else if (date === first) {
        const opening = scoped.filter(e => e.type === "cash-flow" && e.accountId === a.accountId && e.effectiveDate === first)
          .reduce((sum, e) => sum + (e.type === "cash-flow" ? parsePositiveMoneyStrict(e.amount) * (e.direction === "contribution" ? 1 : -1) : 0), 0);
        if (opening <= 0) valid = false;
        else { total += opening; syntheticOpening = true; }
      } else valid = false;
    }
    if (valid) values.set(date, total);
  }
  const estimatedBoundaries = new Map<string, string[]>();
  const boundary = (year: number): string | null => {
    const date = `${year - 1}-12-31`;
    if (values.has(date)) return date;
    // January 1 is an explicit end-of-day boundary, never relabeled as Dec 31.
    if (values.has(`${year}-01-01`)) return `${year}-01-01`;
    if (date < first || date >= last) return null;
    let total = 0;
    const sources: string[] = [];
    for (const a of selected) {
      const began = starts.get(a.accountId);
      if (!began || began > date) continue;
      const previous = valuations.filter(v => v.accountId === a.accountId && v.effectiveDate <= date).at(-1);
      const cash = scoped.filter(e => e.type === "cash-flow" && e.accountId === a.accountId &&
        e.effectiveDate <= date && (!previous || e.effectiveDate > previous.effectiveDate));
      const net = cash.reduce((sum, e) => sum + (e.type === "cash-flow" ? parsePositiveMoneyStrict(e.amount) * (e.direction === "contribution" ? 1 : -1) : 0), 0);
      const carried = (previous ? parseMoneyStrict(previous.totalValue) : 0) + net;
      if (!Number.isFinite(carried) || carried < 0 || (!previous && !cash.length)) return null;
      total += carried;
      if (!previous || previous.effectiveDate !== date) sources.push(previous?.effectiveDate ?? began);
    }
    // Derived only in memory: no ledger event is created or changed.
    values.set(date, total);
    estimatedBoundaries.set(date, [...new Set(sources)].sort());
    return date;
  };
  // When accounts were last valued on different days, the latest date on which
  // every account has a real valuation closes the current year instead.
  const latestAligned = (after: string | null): string | null => [...values.keys()]
    .filter(date => (!after || date > after) && date <= last && !estimatedBoundaries.has(date)).sort().at(-1) ?? null;
  const years: LinkedYear[] = [];
  for (let year = Number(first.slice(0, 4)); year <= Number(last.slice(0, 4)); year++) {
    const firstYear = year === Number(first.slice(0, 4)), lastYear = year === Number(last.slice(0, 4));
    const start = firstYear ? (values.has(first) ? first : null) : boundary(year);
    const end = lastYear ? (values.has(last) ? last : latestAligned(start)) : boundary(year + 1);
    const eligibilityStart = firstYear ? first : `${year}-01-01`;
    const eligibilityEnd = lastYear ? last : `${year}-12-31`;
    if (eligibilityEnd <= eligibilityStart) continue;
    const included = eligibilityEnd > eligibilityStart && (!excludeShortYears || canShowAnnualized(eligibilityStart, eligibilityEnd));
    const row: LinkedYear = { year, start, end, rate: null, included, estimated: firstYear && syntheticOpening,
      partial: (firstYear && first.slice(5) !== "01-01") || (lastYear && last.slice(5) !== "12-31") };
    row.boundaryEstimates = [start, end].flatMap(date => date && estimatedBoundaries.has(date)
      ? [{ date, sources: estimatedBoundaries.get(date)! }] : []);
    row.estimated ||= row.boundaryEstimates.length > 0;
    row.moneyWeightedRate = null;
    if (start && end && start < end) {
      row.openingValue = values.get(start)!;
      row.closingValue = values.get(end)!;
      row.cashFlows = flows.filter(f => f.date > start && f.date <= end);
      row.moneyWeightedRate = moneyWeightedPeriod(row.openingValue, values.get(end)!, row.cashFlows, start, end);
      let factor = 1, previous = start, valid = true;
      for (const date of [...values.keys()].filter(d => d > start && d <= end).sort()) {
        const opening = values.get(previous)!, closing = values.get(date)!;
        const cash = flows.filter(f => f.date > previous && f.date <= date);
        const rate = moneyWeightedPeriod(opening, closing, cash, previous, date);
        row.estimated ||= cash.some(f => f.date < date);
        if (rate === null || !Number.isFinite(rate) || rate < -1) { valid = false; break; }
        factor *= 1 + rate;
        previous = date;
      }
      if (valid && previous === end && Number.isFinite(factor)) row.rate = factor - 1;
    }
    years.push(row);
  }
  return { currency, years, summary: summarizeLinked(years) };
}

export function boundaryEstimateNotes(row: LinkedYear): string[] {
  return (row.boundaryEstimates ?? []).map(item => t("Estimated boundary {date}: carried from {sources}, adjusted for net cash flows. Unrecorded market movement is unknown.",
    { date: item.date, sources: item.sources.join(", ") }));
}

export function moneyWeightedAnnualRows(report: LinkedReport): AnnualReturnResult[] {
  const annual = { ...report, years: report.years.map(y => ({ ...y, rate: y.moneyWeightedRate ?? null })) };
  return linkedAnnualRows(annual).map(row => {
    const year = report.years.find(y => y.year === row.year)!;
    return { ...row,
      needsOpeningValuation: !row.startDate || !!year.boundaryEstimates?.some(b => b.date === row.startDate),
      details: [t("Annual money-weighted return uses one Modified Dietz calculation over the displayed period, not linked subperiods or XIRR."), ...boundaryEstimateNotes(year),
        ...(row.rate === null ? [t("Insufficient data")] : [])] };
  });
}

// Benchmarks here are buy-and-hold index price returns, not cash-flow XIRRs.
// The same annual boundaries and elapsed days as the portfolio are used.
export function linkedIndexReport(report: LinkedReport, market?: MarketSeries | null): LinkedReport {
  const points = market?.currency === report.currency ? market.points.filter(p => Number.isFinite(p.close) && p.close > 0).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const years = report.years.map(row => {
    const opening = row.start ? points.filter(p => p.date <= row.start!).at(-1) : undefined;
    const closing = row.end ? points.filter(p => p.date <= row.end!).at(-1) : undefined;
    const valid = opening && closing && row.start && row.end && opening.date < closing.date &&
      days(opening.date, row.start) <= 7 && days(closing.date, row.end) <= 7;
    return { ...row, rate: valid ? closing.close / opening.close - 1 : null, estimated: false };
  });
  return { currency: report.currency, years, summary: summarizeLinked(years) };
}

export function linkedAnnualRows(report: LinkedReport): AnnualReturnResult[] {
  return report.years.map((row): AnnualReturnResult => ({ year: row.year, rate: row.rate, startDate: row.start, endDate: row.end,
    period: row.partial ? "partial-year" : "full-year", quality: row.estimated ? "estimated" : row.partial ? "partial" : "complete",
    status: row.rate === null ? "insufficient-data" : "ok", needsOpeningValuation: !row.start,
    ...(!row.start ? { suggestedOpeningDate: `${row.year}-01-01` } : {}),
    details: [row.rate === null ? t("Missing boundary valuation or invalid segment; available years remain visible.")
      : row.estimated ? t("Linked Modified Dietz estimate: cash-flow-date valuations are incomplete.") : t("Valuation-linked return; cash flows are treated as end-of-day.")] })).reverse();
}

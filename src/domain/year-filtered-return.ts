import type { AccountState, Currency, LedgerEvent, ValuationEvent } from "../types";
import { calculateInceptionReturn, canShowAnnualized, inceptionPeriodReturn, type InceptionReturn } from "./inception-return";
import { parseMoneyStrict, parsePositiveMoneyStrict } from "./money";
import { calculateXirr } from "./xirr";

export interface YearFilteredReturn {
  period: InceptionReturn;
  endingValue: number;
  excludedYears: number[];
  missingDates: string[];
  status: "ok" | "no-period" | "missing-boundary";
  rebased: boolean;
}

// This is a local reporting projection, never a mutation of ledger records.
// Only the first/last partial calendar years can be removed. Full interior
// years remain continuous; an absent required boundary blocks calculation.
export function calculateYearFilteredReturn(
  accounts: AccountState[], events: LedgerEvent[], currency: Currency, account: AccountState | null = null,
): YearFilteredReturn {
  const original = calculateInceptionReturn(accounts, events, currency, account);
  const blank = (): InceptionReturn => ({ ...original, startDate: null, endDate: null, days: 0,
    annualizationEligible: false, xirr: null, periodReturn: null, flows: [] });
  const result: YearFilteredReturn = { period: blank(), endingValue: 0, excludedYears: [], missingDates: [], status: "no-period", rebased: false };
  if (!original.startDate || !original.endDate || original.days <= 0) return result;
  const first = Number(original.startDate.slice(0, 4));
  const last = Number(original.endDate.slice(0, 4));
  const included: number[] = [];
  for (let year = first; year <= last; year++) {
    const start = year === first ? original.startDate : `${year}-01-01`;
    const end = year === last ? original.endDate : `${year}-12-31`;
    (canShowAnnualized(start, end) ? included : result.excludedYears).push(year);
  }
  if (!included.length) return result;
  const rebased = included[0] !== first;
  const startDate = rebased ? `${included[0]! - 1}-12-31` : original.startDate;
  const endDate = included.at(-1) === last ? original.endDate : `${included.at(-1)}-12-31`;
  result.rebased = rebased;
  const selected = account ? [account] : accounts.filter((item) => !item.archived && item.currency === currency);
  const relevant = events.filter((event) => "currency" in event && event.currency === currency);
  const boundaryValue = (item: AccountState, date: string): number => {
    const valuations = relevant.filter((event): event is ValuationEvent => event.type === "valuation" && event.accountId === item.accountId && event.effectiveDate === date)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const valuation = valuations.at(-1);
    if (!valuation) { result.missingDates.push(date); return 0; }
    return parseMoneyStrict(valuation.totalValue);
  };
  // An account first funded after the reporting cutoff has no balance in it.
  const active = selected.filter((item) => relevant.some((event) =>
    "accountId" in event && event.accountId === item.accountId &&
    (event.type === "cash-flow" || event.type === "valuation") && event.effectiveDate <= endDate));
  const ids = new Set(active.map((item) => item.accountId));
  let openingValue = 0;
  for (const item of active) {
    result.endingValue += boundaryValue(item, endDate);
    if (rebased && relevant.some((event) => "accountId" in event && event.accountId === item.accountId &&
      (event.type === "cash-flow" || event.type === "valuation") && event.effectiveDate <= startDate)) {
      openingValue += boundaryValue(item, startDate);
    }
  }
  result.missingDates = [...new Set(result.missingDates)].sort();
  if (result.missingDates.length) { result.status = "missing-boundary"; return result; }
  const flows = relevant.flatMap((event) => event.type === "cash-flow" && ids.has(event.accountId) &&
    event.effectiveDate <= endDate && (!rebased || event.effectiveDate > startDate)
    ? [{ date: event.effectiveDate, direction: event.direction, amount: parsePositiveMoneyStrict(event.amount) }] : []);
  if (rebased && openingValue > 0) flows.push({ date: startDate, direction: "contribution", amount: openingValue });
  flows.sort((a, b) => a.date.localeCompare(b.date));
  // Zero opening balance: the real first funded date is the actual start.
  const actualStart = flows[0]?.date;
  if (!actualStart || actualStart >= endDate) return result;
  const xirr = calculateXirr([...flows.map((flow) => ({ date: flow.date,
    amount: flow.direction === "contribution" ? -flow.amount : flow.amount })), { date: endDate, amount: result.endingValue }]);
  result.period = { ...original, startDate: actualStart, endDate,
    days: (Date.parse(endDate) - Date.parse(actualStart)) / 86_400_000,
    annualizationEligible: canShowAnnualized(actualStart, endDate),
    xirr: xirr.status === "ok" ? xirr.value : null,
    periodReturn: inceptionPeriodReturn(flows, endDate, result.endingValue), flows };
  result.status = "ok";
  return result;
}

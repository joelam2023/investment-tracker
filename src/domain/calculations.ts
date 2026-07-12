import type {
  AnnualReturnResult,
  AccountMetrics,
  AccountState,
  CashFlowEvent,
  Currency,
  DatedAmount,
  LedgerEvent,
  ValuationEvent,
} from "../types";
import { parseMoneyStrict, parsePositiveMoneyStrict } from "./money";
import { calculateXirr } from "./xirr";
import { t } from "../i18n";

const DAY_MS = 86_400_000;
const BOUNDARY_WINDOW_DAYS = 45;
const EXACT_BOUNDARY_DAYS = 1;

export interface PortfolioMetrics {
  currency: Currency;
  currentValue: number;
  netContributions: number;
  cumulativeProfit: number;
  xirr: number | null;
  asOf: string | null;
  warnings: string[];
}

function accountEvents<T extends CashFlowEvent | ValuationEvent>(
  accountId: string,
  events: LedgerEvent[],
  type: T["type"],
): T[] {
  return events.filter(
    (event): event is T =>
      event.type === type && "accountId" in event && event.accountId === accountId,
  );
}

function latestValuationAtOrBefore(
  accountId: string,
  events: LedgerEvent[],
  currency: Currency,
  date?: string,
): ValuationEvent | null {
  const valuations = accountEvents<ValuationEvent>(accountId, events, "valuation")
    .filter((event) => event.currency === currency)
    .filter((event) => !date || event.effectiveDate <= date)
    .sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.recordedAt.localeCompare(b.recordedAt),
    );
  return valuations.at(-1) ?? null;
}

function dateTimestamp(date: string): number {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp)) {
    throw new Error(t("Invalid date: {date}", { date }));
  }
  return timestamp;
}

function daysBetween(start: string, end: string): number {
  return (dateTimestamp(end) - dateTimestamp(start)) / DAY_MS;
}

function earlierDate(current: string | null, candidate: string): string {
  return current === null || candidate < current ? candidate : current;
}

function periodRateFromAnnualized(rate: number, startDate: string, endDate: string): number {
  const days = daysBetween(startDate, endDate);
  if (days <= 0) throw new Error(t("Invalid start or end date for annual return"));
  return Math.expm1(Math.log1p(rate) * (days / 365));
}

function cashFlowAmount(event: CashFlowEvent): number {
  const amount = parsePositiveMoneyStrict(event.amount);
  return event.direction === "contribution" ? -amount : amount;
}

function annualStatus(
  flows: DatedAmount[],
  startDate: string,
  endDate: string,
): Pick<AnnualReturnResult, "rate" | "status"> {
  if (daysBetween(startDate, endDate) <= 0) return { rate: null, status: "insufficient-data" };
  const result = calculateXirr(flows);
  if (result.status !== "ok" || result.value === null) {
    return { rate: null, status: result.status };
  }
  return {
    rate: periodRateFromAnnualized(result.value, startDate, endDate),
    status: "ok",
  };
}

function annualYears(openedOn: string, today: string): number[] {
  const first = Number(openedOn.slice(0, 4));
  const last = Number(today.slice(0, 4));
  if (!Number.isInteger(first) || !Number.isInteger(last) || first > last) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => last - index);
}

function insufficientAnnualReturn(
  year: number,
  currentYear: number,
  details: string[],
  startDate: string | null = null,
  endDate: string | null = null,
  needsOpeningValuation = false,
): AnnualReturnResult {
  return {
    year,
    rate: null,
    startDate,
    endDate,
    period: year === currentYear ? "ytd" : "partial-year",
    quality: "partial",
    needsOpeningValuation,
    ...(needsOpeningValuation ? { suggestedOpeningDate: `${year}-01-01` } : {}),
    status: "insufficient-data",
    details,
  };
}

export function calculateAccountAnnualReturns(
  account: AccountState,
  events: LedgerEvent[],
  today: string,
): AnnualReturnResult[] {
  dateTimestamp(today);
  const currentYear = Number(today.slice(0, 4));
  const valuations = accountEvents<ValuationEvent>(account.accountId, events, "valuation")
    .filter((event) => event.currency === account.currency)
    .sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.recordedAt.localeCompare(b.recordedAt),
    );
  const cashFlows = accountEvents<CashFlowEvent>(account.accountId, events, "cash-flow")
    .filter((event) => event.currency === account.currency)
    .sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.recordedAt.localeCompare(b.recordedAt),
    );

  return annualYears(account.openedOn, today).map((year) => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const cap = year === currentYear ? today : yearEnd;
    const closing = valuations.filter(
      (event) => event.effectiveDate >= yearStart && event.effectiveDate <= cap,
    ).at(-1);
    if (!closing) {
      return insufficientAnnualReturn(year, currentYear, [t("Year-end valuation is missing")]);
    }

    const details: string[] = [];
    const calculationFlows: DatedAmount[] = [];
    let startDate: string | null = null;
    let openingQuality: AnnualReturnResult["quality"] = "partial";
    let needsOpeningValuation = false;
    if (account.openedOn < yearStart) {
      const opening = valuations.filter((event) => event.effectiveDate <= yearStart).at(-1);
      if (opening) {
        startDate = yearStart;
        calculationFlows.push({ date: yearStart, amount: -parseMoneyStrict(opening.totalValue) });
        const openingGap = daysBetween(opening.effectiveDate, yearStart);
        openingQuality = openingGap <= EXACT_BOUNDARY_DAYS
          ? "complete"
          : openingGap <= BOUNDARY_WINDOW_DAYS
            ? "estimated"
            : "partial";
        needsOpeningValuation = openingGap > BOUNDARY_WINDOW_DAYS;
        if (opening.effectiveDate !== yearStart) {
          details.push(
            openingGap <= BOUNDARY_WINDOW_DAYS
              ? t("Opening valuation carried forward from {date}", { date: opening.effectiveDate })
              : t("Opening valuation from {date} is too old; add a valuation for {suggestedDate}", {
                  date: opening.effectiveDate,
                  suggestedDate: yearStart,
                }),
          );
        }
        for (const event of cashFlows) {
          const isAfterOpening = opening.effectiveDate < yearStart
            ? event.effectiveDate >= yearStart
            : event.effectiveDate > yearStart;
          if (isAfterOpening && event.effectiveDate <= closing.effectiveDate) {
            calculationFlows.push({ date: event.effectiveDate, amount: cashFlowAmount(event) });
          }
        }
      } else {
        const fallback = valuations.find(
          (event) => event.effectiveDate >= yearStart && event.effectiveDate < closing.effectiveDate,
        );
        if (!fallback) {
          return insufficientAnnualReturn(
            year,
            currentYear,
            [t("Opening valuation is missing; return cannot be calculated")],
            null,
            closing.effectiveDate,
            true,
          );
        }
        startDate = fallback.effectiveDate;
        calculationFlows.push({ date: startDate, amount: -parseMoneyStrict(fallback.totalValue) });
        details.push(t("Start-of-year valuation is missing; calculation starts on {date}", { date: startDate }));
        needsOpeningValuation = true;
        for (const event of cashFlows) {
          if (event.effectiveDate > startDate && event.effectiveDate <= closing.effectiveDate) {
            calculationFlows.push({ date: event.effectiveDate, amount: cashFlowAmount(event) });
          }
        }
      }
    } else {
      const openingFlows = cashFlows.filter(
        (event) => event.effectiveDate >= account.openedOn && event.effectiveDate <= closing.effectiveDate,
      );
      if (openingFlows.length > 0) {
        startDate = openingFlows[0]?.effectiveDate ?? account.openedOn;
        for (const event of openingFlows) {
          calculationFlows.push({ date: event.effectiveDate, amount: cashFlowAmount(event) });
        }
      } else {
        const fallback = valuations.find((event) => event.effectiveDate < closing.effectiveDate);
        if (!fallback) {
          return insufficientAnnualReturn(
            year,
            currentYear,
            [t("The opening year is missing a contribution and a second valuation")],
            account.openedOn,
            closing.effectiveDate,
          );
        }
        startDate = fallback.effectiveDate;
        calculationFlows.push({ date: startDate, amount: -parseMoneyStrict(fallback.totalValue) });
      }
      details.push(t("Account started on {date}", { date: account.openedOn }));
      openingQuality = account.openedOn === yearStart ? "complete" : "partial";
    }

    if (!startDate) {
      return insufficientAnnualReturn(year, currentYear, [t("Unable to determine the calculation start date")], null, closing.effectiveDate);
    }
    calculationFlows.push({ date: closing.effectiveDate, amount: parseMoneyStrict(closing.totalValue) });
    const calculated = annualStatus(calculationFlows, startDate, closing.effectiveDate);
    if (calculated.status === "no-root") details.push(t("Cash flows do not produce a return rate"));
    if (calculated.status === "multiple-roots") details.push(t("Cash flows produce multiple possible results"));

    const endGap = daysBetween(closing.effectiveDate, cap);
    if (year === currentYear && endGap > BOUNDARY_WINDOW_DAYS) {
      details.push(t("Latest valuation is dated {date}", { date: closing.effectiveDate }));
    }
    if (year !== currentYear && endGap > BOUNDARY_WINDOW_DAYS) {
      details.push(t("Year-end valuation is dated {date}", { date: closing.effectiveDate }));
    }
    const closingReliable = endGap <= BOUNDARY_WINDOW_DAYS;
    const quality: AnnualReturnResult["quality"] = !closingReliable || openingQuality === "partial"
      ? "partial"
      : year !== currentYear && endGap > EXACT_BOUNDARY_DAYS
        ? "estimated"
        : openingQuality;
    const period = year === currentYear ? "ytd" : quality === "partial" ? "partial-year" : "full-year";
    return {
      year,
      ...calculated,
      startDate,
      endDate: closing.effectiveDate,
      period,
      quality,
      needsOpeningValuation,
      ...(needsOpeningValuation ? { suggestedOpeningDate: yearStart } : {}),
      details,
    };
  });
}

export function calculatePortfolioAnnualReturns(
  accounts: AccountState[],
  events: LedgerEvent[],
  currency: Currency,
  today: string,
): AnnualReturnResult[] {
  dateTimestamp(today);
  const active = accounts.filter((account) => !account.archived && account.currency === currency);
  if (active.length === 0) return [];
  if (active.length === 1 && active[0]) {
    return calculateAccountAnnualReturns(active[0], events, today);
  }
  const currentYear = Number(today.slice(0, 4));
  const firstOpenedOn = [...active].sort((a, b) => a.openedOn.localeCompare(b.openedOn))[0]?.openedOn;
  if (!firstOpenedOn) return [];

  return annualYears(firstOpenedOn, today).map((year) => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const cap = year === currentYear ? today : yearEnd;
    const eligible = active.filter((account) => account.openedOn <= cap);
    const latestDates = eligible.map((account) =>
      accountEvents<ValuationEvent>(account.accountId, events, "valuation")
        .filter(
          (event) =>
            event.currency === currency &&
            event.effectiveDate >= yearStart &&
            event.effectiveDate <= cap,
        )
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
        .at(-1)?.effectiveDate ?? null,
    );
    if (latestDates.some((date) => date === null)) {
      return insufficientAnnualReturn(year, currentYear, [t("Some accounts are missing a year-end valuation")]);
    }
    const commonEnd: string | undefined = (latestDates as string[]).sort()[0];
    if (!commonEnd) return insufficientAnnualReturn(year, currentYear, [t("Unable to determine a common valuation date")]);
    const included = eligible.filter((account) => account.openedOn <= commonEnd);
    if (included.length === 0) {
      return insufficientAnnualReturn(year, currentYear, [t("No accounts can be included before the common valuation date")]);
    }

    const calculationFlows: DatedAmount[] = [];
    const details: string[] = [];
    let portfolioStart: string | null = null;
    let reliableOpening = true;
    let exactOpening = true;
    let needsOpeningValuation = false;
    let usedCarriedClosing = false;
    for (const account of included) {
      const valuations = accountEvents<ValuationEvent>(account.accountId, events, "valuation")
        .filter((event) => event.currency === currency)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
      const closing: ValuationEvent | undefined = valuations
        .filter((event) => event.effectiveDate <= commonEnd)
        .at(-1);
      if (!closing) {
        return insufficientAnnualReturn(year, currentYear, [t("Account {account} is missing a closing valuation", { account: account.name })]);
      }
      if (closing.effectiveDate !== commonEnd) usedCarriedClosing = true;

      const accountFlows = accountEvents<CashFlowEvent>(account.accountId, events, "cash-flow")
        .filter((event) => event.currency === currency)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
      if (account.openedOn < yearStart) {
        const opening = valuations.filter((event) => event.effectiveDate <= yearStart).at(-1);
        if (!opening) {
          return insufficientAnnualReturn(
            year,
            currentYear,
            [t("Account {account} is missing a start-of-year valuation", { account: account.name })],
            null,
            commonEnd,
            true,
          );
        }
        calculationFlows.push({ date: yearStart, amount: -parseMoneyStrict(opening.totalValue) });
        portfolioStart = earlierDate(portfolioStart, yearStart);
        const openingGap = daysBetween(opening.effectiveDate, yearStart);
        reliableOpening &&= openingGap <= BOUNDARY_WINDOW_DAYS;
        exactOpening &&= openingGap <= EXACT_BOUNDARY_DAYS;
        needsOpeningValuation ||= openingGap > BOUNDARY_WINDOW_DAYS;
        if (openingGap > EXACT_BOUNDARY_DAYS) {
          details.push(
            openingGap <= BOUNDARY_WINDOW_DAYS
              ? t("Opening valuation for account {account} carried forward from {date}", {
                  account: account.name,
                  date: opening.effectiveDate,
                })
              : t("Opening valuation for account {account} from {date} is too old", {
                  account: account.name,
                  date: opening.effectiveDate,
                }),
          );
        }
        for (const event of accountFlows) {
          const isAfterOpening = opening.effectiveDate < yearStart
            ? event.effectiveDate >= yearStart
            : event.effectiveDate > yearStart;
          if (isAfterOpening && event.effectiveDate <= commonEnd) {
            calculationFlows.push({ date: event.effectiveDate, amount: cashFlowAmount(event) });
          }
        }
      } else {
        const newFlows = accountFlows.filter(
          (event) => event.effectiveDate >= account.openedOn && event.effectiveDate <= commonEnd,
        );
        if (newFlows.length > 0) {
          for (const event of newFlows) {
            calculationFlows.push({ date: event.effectiveDate, amount: cashFlowAmount(event) });
          }
          const firstFlowDate = newFlows[0]?.effectiveDate ?? account.openedOn;
          portfolioStart = earlierDate(portfolioStart, firstFlowDate);
        } else {
          const fallback = valuations.find(
            (event) => event.effectiveDate >= account.openedOn && event.effectiveDate < commonEnd,
          );
          if (!fallback) {
            return insufficientAnnualReturn(year, currentYear, [t("Account {account} is missing an initial contribution or valuation", { account: account.name })]);
          }
          calculationFlows.push({ date: fallback.effectiveDate, amount: -parseMoneyStrict(fallback.totalValue) });
          portfolioStart = earlierDate(portfolioStart, fallback.effectiveDate);
        }
      }
      calculationFlows.push({ date: commonEnd, amount: parseMoneyStrict(closing.totalValue) });
    }

    if (!portfolioStart) {
      return insufficientAnnualReturn(year, currentYear, [t("Unable to determine the portfolio calculation start date")], null, commonEnd);
    }
    if (usedCarriedClosing) details.push(t("Some accounts use their latest valuation before the common end date"));
    const endGap = daysBetween(commonEnd, cap);
    if (year === currentYear && endGap > BOUNDARY_WINDOW_DAYS) {
      details.push(t("Latest common valuation is dated {date}", { date: commonEnd }));
    }
    if (year !== currentYear && endGap > BOUNDARY_WINDOW_DAYS) {
      details.push(t("Year-end common valuation is dated {date}", { date: commonEnd }));
    }
    const calculated = annualStatus(calculationFlows, portfolioStart, commonEnd);
    if (calculated.status === "no-root") details.push(t("Portfolio cash flows do not produce a return rate"));
    if (calculated.status === "multiple-roots") details.push(t("Portfolio cash flows produce multiple possible results"));
    const existedAtStart = included.some((account) => account.openedOn <= yearStart);
    const reliable = existedAtStart && reliableOpening && endGap <= BOUNDARY_WINDOW_DAYS;
    const quality: AnnualReturnResult["quality"] = !reliable
      ? "partial"
      : !exactOpening || (year !== currentYear && endGap > EXACT_BOUNDARY_DAYS)
        ? "estimated"
        : "complete";
    const period = year === currentYear ? "ytd" : quality === "partial" ? "partial-year" : "full-year";
    return {
      year,
      ...calculated,
      startDate: portfolioStart,
      endDate: commonEnd,
      period,
      quality,
      needsOpeningValuation,
      ...(needsOpeningValuation ? { suggestedOpeningDate: yearStart } : {}),
      details,
    };
  });
}

export function buildAccountCashFlows(
  accountId: string,
  events: LedgerEvent[],
  currency: Currency,
  asOf?: string,
): { flows: DatedAmount[]; valuation: ValuationEvent | null; warnings: string[] } {
  const warnings: string[] = [];
  const mismatched = events.filter(
    (event) =>
      (event.type === "cash-flow" || event.type === "valuation") &&
      event.accountId === accountId &&
      event.currency !== currency,
  );
  if (mismatched.length > 0) warnings.push(t("Records whose currency does not match the account were ignored"));
  const valuation = latestValuationAtOrBefore(accountId, events, currency, asOf);
  if (!valuation) return { flows: [], valuation: null, warnings: [t("No asset valuation has been recorded yet")] };
  const flows: DatedAmount[] = accountEvents<CashFlowEvent>(accountId, events, "cash-flow")
    .filter((event) => event.currency === currency && event.effectiveDate <= valuation.effectiveDate)
    .map((event) => ({
      date: event.effectiveDate,
      amount:
        event.direction === "contribution"
          ? -parsePositiveMoneyStrict(event.amount)
          : parsePositiveMoneyStrict(event.amount),
    }));
  flows.push({ date: valuation.effectiveDate, amount: parseMoneyStrict(valuation.totalValue) });
  const laterFlows = accountEvents<CashFlowEvent>(accountId, events, "cash-flow").filter(
    (event) => event.currency === currency && event.effectiveDate > valuation.effectiveDate,
  );
  if (laterFlows.length > 0) {
    warnings.push(t("Some cash-flow records are later than the latest valuation; returns are calculated only through the latest valuation date"));
  }
  return { flows, valuation, warnings };
}

export function calculateAccountMetrics(account: AccountState, events: LedgerEvent[]): AccountMetrics {
  const { flows, valuation, warnings } = buildAccountCashFlows(account.accountId, events, account.currency);
  if (!valuation) {
    return {
      account,
      asOf: null,
      currentValue: 0,
      netContributions: 0,
      cumulativeProfit: 0,
      xirr: null,
      xirrStatus: "insufficient-data",
      warnings,
    };
  }
  const asOf = valuation.effectiveDate;
  const currentValue = parseMoneyStrict(valuation.totalValue);
  const cashFlows = accountEvents<CashFlowEvent>(account.accountId, events, "cash-flow").filter(
    (event) => event.currency === account.currency && event.effectiveDate <= asOf,
  );
  const netContributions = cashFlows.reduce((total, event) => {
    const amount = parsePositiveMoneyStrict(event.amount);
    return total + (event.direction === "contribution" ? amount : -amount);
  }, 0);
  const xirr = calculateXirr(flows);
  if (xirr.status === "no-root") warnings.push(t("Current cash flows do not produce a unique annualized return"));
  if (xirr.status === "multiple-roots") warnings.push(t("Current cash flows produce multiple possible annualized returns; XIRR is hidden"));
  return {
    account,
    asOf,
    currentValue,
    netContributions,
    cumulativeProfit: currentValue - netContributions,
    xirr: xirr.value,
    xirrStatus: xirr.status,
    warnings,
  };
}

export function calculatePortfolioMetrics(accounts: AccountState[], events: LedgerEvent[], currency: Currency): PortfolioMetrics {
  const active = accounts.filter((account) => !account.archived && account.currency === currency);
  if (active.length === 0) {
    return {
      currency,
      currentValue: 0,
      netContributions: 0,
      cumulativeProfit: 0,
      xirr: null,
      asOf: null,
      warnings: [],
    };
  }
  const warnings: string[] = [];
  if (accounts.some((account) => !account.archived && account.currency !== currency)) {
    warnings.push(t("The portfolio includes only {currency} accounts; accounts in other currencies were excluded", { currency }));
  }
  const latestDates = active
    .map((account) => latestValuationAtOrBefore(account.accountId, events, currency)?.effectiveDate ?? null)
    .filter((date): date is string => date !== null);
  if (latestDates.length !== active.length) {
    return {
      currency,
      currentValue: 0,
      netContributions: 0,
      cumulativeProfit: 0,
      xirr: null,
      asOf: null,
      warnings: [...warnings, t("Some accounts have no asset valuation; portfolio returns are unavailable")],
    };
  }
  const asOf = latestDates[0] ?? null;
  if (!asOf) throw new Error(t("Unable to determine the portfolio valuation date"));
  const aligned = new Set(latestDates).size === 1;

  let currentValue = 0;
  let netContributions = 0;
  const flows: DatedAmount[] = [];
  for (const account of active) {
    const built = buildAccountCashFlows(account.accountId, events, currency);
    if (!built.valuation) {
      return {
        currency,
        currentValue: 0,
        netContributions: 0,
        cumulativeProfit: 0,
        xirr: null,
        asOf: null,
        warnings: [...warnings, t("Account {account} has no valid valuation; portfolio calculation stopped", { account: account.name })],
      };
    }
    currentValue += parseMoneyStrict(built.valuation.totalValue);
    const accountCashFlows = accountEvents<CashFlowEvent>(account.accountId, events, "cash-flow").filter(
      (event) => event.currency === currency && event.effectiveDate <= built.valuation!.effectiveDate,
    );
    for (const event of accountCashFlows) {
      const amount = parsePositiveMoneyStrict(event.amount);
      netContributions += event.direction === "contribution" ? amount : -amount;
      if (aligned) {
        flows.push({ date: event.effectiveDate, amount: event.direction === "contribution" ? -amount : amount });
      }
    }
  }
  if (!aligned) {
    warnings.push(t("Account valuation dates differ; assets and profit are summed using each account's latest record, and portfolio XIRR is unavailable"));
    return {
      currency,
      currentValue,
      netContributions,
      cumulativeProfit: currentValue - netContributions,
      xirr: null,
      asOf: null,
      warnings,
    };
  }
  flows.push({ date: asOf, amount: currentValue });
  const xirr = calculateXirr(flows);
  if (xirr.status !== "ok" && xirr.status !== "insufficient-data") {
    warnings.push(t("Portfolio cash flows do not produce a unique XIRR"));
  }
  return {
    currency,
    currentValue,
    netContributions,
    cumulativeProfit: currentValue - netContributions,
    xirr: xirr.value,
    asOf,
    warnings,
  };
}

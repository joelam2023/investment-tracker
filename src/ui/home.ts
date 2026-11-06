import { setIcon } from "obsidian";
import type { AccountState, Currency, LedgerEvent } from "../types";
import { calculateLinkedReport, type LinkedReport } from "../domain/linked-return";
import { annualMoneyWeightedIndex } from "../market/annual-money-weighted";
import type { LinkedMarkets } from "./linked-return";
import { getIntlLocale, t } from "../i18n";
import { formatDate, formatMoney, renderAnnualReturnChart } from "./components";
import { HIDDEN_FINANCIAL_VALUE } from "./privacy";

/** One calendar year (or the part of it with data) for the owner and both indices. */
export interface YearComparison {
  year: number;
  start: string | null;
  end: string | null;
  /** Money-weighted return over the whole period (one Modified Dietz calculation). */
  mine: number | null;
  /** Indices bought with the same opening value and dated cash flows. */
  sp500: number | null;
  nasdaq100: number | null;
  estimated: boolean;
  boundaryEstimates: Array<{ date: string; sources: string[] }>;
  openingValue: number | null;
  closingValue: number | null;
  netFlow: number;
}

export type Outcome = "good" | "mixed" | "bad" | "unknown";

const DAY_MS = 86_400_000;

export function compareYears(report: LinkedReport, markets: LinkedMarkets): YearComparison[] {
  const sp = markets.sp500 ? annualMoneyWeightedIndex(report, markets.sp500) : null;
  const ndx = markets.nasdaq100 ? annualMoneyWeightedIndex(report, markets.nasdaq100) : null;
  return report.years.map((row) => {
    const netFlow = (row.cashFlows ?? []).reduce((sum, flow) => sum + (flow.direction === "contribution" ? flow.amount : -flow.amount), 0);
    return {
      year: row.year,
      start: row.start,
      end: row.end,
      mine: row.moneyWeightedRate ?? null,
      sp500: sp?.years.find((item) => item.year === row.year)?.rate ?? null,
      nasdaq100: ndx?.years.find((item) => item.year === row.year)?.rate ?? null,
      estimated: (row.boundaryEstimates?.length ?? 0) > 0,
      boundaryEstimates: row.boundaryEstimates ?? [],
      openingValue: row.openingValue ?? null,
      closingValue: row.closingValue ?? null,
      netFlow,
    };
  });
}

export function currentYearComparison(rows: YearComparison[], year: number): YearComparison | null {
  return rows.find((row) => row.year === year) ?? null;
}

export function yearProfit(row: YearComparison | null): number | null {
  if (!row || row.openingValue === null || row.closingValue === null) return null;
  return row.closingValue - row.openingValue - row.netFlow;
}

export function outcomeOf(row: YearComparison, includeNasdaq: boolean): Outcome {
  if (row.mine === null) return "unknown";
  const indices = [row.sp500, ...(includeNasdaq ? [row.nasdaq100] : [])].filter((rate): rate is number => rate !== null);
  if (indices.length === 0) return "unknown";
  const ahead = indices.filter((rate) => row.mine! >= rate).length;
  return ahead === indices.length ? "good" : ahead === 0 ? "bad" : "mixed";
}

export function outcomeLabel(row: YearComparison, includeNasdaq: boolean): string {
  const outcome = outcomeOf(row, includeNasdaq);
  if (outcome === "unknown") return "—";
  if (!includeNasdaq || row.nasdaq100 === null) return outcome === "good" ? t("Beat the S&P 500") : t("Trailed the S&P 500");
  if (row.sp500 === null) return outcome === "good" ? t("Beat the Nasdaq-100") : t("Trailed the Nasdaq-100");
  if (outcome === "good") return t("Beat both");
  if (outcome === "bad") return t("Trailed both");
  return row.mine! >= row.sp500 ? t("Beat the S&P 500 only") : t("Beat the Nasdaq-100 only");
}

/** Last valuation date for each account, used for "not updated for N days". */
export function lastValuationDates(events: LedgerEvent[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "valuation") continue;
    const previous = dates.get(event.accountId);
    if (!previous || event.effectiveDate > previous) dates.set(event.accountId, event.effectiveDate);
  }
  return dates;
}

export function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS);
}

/** This year's comparison for one account, with the same index method as the portfolio. */
export function accountYearComparison(
  accounts: AccountState[],
  events: LedgerEvent[],
  account: AccountState,
  markets: LinkedMarkets,
  today: string,
): YearComparison | null {
  const report = calculateLinkedReport(accounts, events, account.currency, today, account);
  return currentYearComparison(compareYears(report, markets), Number(today.slice(0, 4)));
}

/** Date range that covers every report, so one market download serves all rows. */
export function marketRange(reports: LinkedReport[]): { start: string; end: string } | null {
  const dates = reports.flatMap((report) => report.years.flatMap((row) => [row.start, row.end])).filter((date): date is string => !!date).sort();
  const start = dates[0], end = dates.at(-1);
  return start && end && start < end ? { start, end } : null;
}

/** How each index moved after the comparison end date, and its own return this year. */
export interface IndexUpdate {
  date: string;
  sinceEnd: Partial<Record<"sp500" | "nasdaq100", number>>;
  yearToDate: Partial<Record<"sp500" | "nasdaq100", number>>;
}

/** Comparisons older than this are flagged so "so far" is not read as "up to today". */
export const STALE_COMPARISON_DAYS = 7;

export function indexUpdateAfter(markets: LinkedMarkets, end: string, year: number, today: string): IndexUpdate | null {
  const ids = (["sp500", "nasdaq100"] as const).filter((id) => markets[id]);
  const latestDates = ids.map((id) => markets[id]!.points.filter((point) => point.date <= today && point.close > 0).map((point) => point.date).sort().at(-1))
    .filter((date): date is string => !!date);
  if (latestDates.length === 0) return null;
  const date = latestDates.sort()[0]!;
  if (date <= end) return null;
  const update: IndexUpdate = { date, sinceEnd: {}, yearToDate: {} };
  for (const id of ids) {
    const points = markets[id]!.points.filter((point) => Number.isFinite(point.close) && point.close > 0).sort((a, b) => a.date.localeCompare(b.date));
    const closeOn = (day: string) => points.filter((point) => point.date <= day).at(-1);
    const latest = closeOn(date), atEnd = closeOn(end), yearStart = closeOn(`${year - 1}-12-31`);
    if (latest && atEnd && daysBetween(atEnd.date, end) <= 7) update.sinceEnd[id] = latest.close / atEnd.close - 1;
    if (latest && yearStart && daysBetween(yearStart.date, `${year - 1}-12-31`) <= 7) update.yearToDate[id] = latest.close / yearStart.close - 1;
  }
  return update;
}

function rateText(value: number | null, visible: boolean, digits = 1): string {
  if (!visible) return HIDDEN_FINANCIAL_VALUE;
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(getIntlLocale(), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "exceptZero" })
    .format(value).replace("-", "−");
}

function pointsText(value: number): string {
  return new Intl.NumberFormat(getIntlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value) * 100);
}

function signedPoints(value: number): string {
  return `${value >= 0 ? "+" : "−"}${pointsText(value)}`;
}

function toneClass(value: number | null, visible: boolean): string {
  if (!visible || value === null || value === 0) return "";
  return value > 0 ? " investment-tracker-positive" : " investment-tracker-negative";
}

function shortDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat(getIntlLocale(), { month: "short", day: "numeric" }).format(parsed);
}

function isYearBoundary(date: string | null, year: number): boolean {
  return date === `${year - 1}-12-31` || date === `${year}-01-01`;
}

export interface HeroInput {
  year: number;
  row: YearComparison | null;
  currency: Currency;
  includeNasdaq: boolean;
  visible: boolean;
  /** "loading" while index data is on its way, "unavailable" when it could not be read. */
  marketState: "ready" | "loading" | "unavailable" | "hidden";
  totalValue: number;
  cumulativeProfit: number;
  today: string;
  /** Index moves after the comparison end date; null when not loaded or not newer. */
  latestIndex: IndexUpdate | null;
  onRecord: () => void;
}

export function renderHero(parent: HTMLElement, input: HeroInput): void {
  const { row, visible, year } = input;
  const hero = parent.createDiv({ cls: "investment-tracker-hero" });
  const main = hero.createDiv({ cls: "investment-tracker-hero-year" });

  const staleDays = row?.end ? daysBetween(row.end, input.today) : 0;
  const stale = staleDays > STALE_COMPARISON_DAYS;
  let periodLabel = stale ? t("{year} · through {date}", { year, date: shortDate(row!.end!) }) : t("{year} so far", { year });
  if (row?.start && !isYearBoundary(row.start, year)) periodLabel = t("{year} · since {date}", { year, date: shortDate(row.start) });
  if (row?.end && (!stale || (row.start && !isYearBoundary(row.start, year)))) periodLabel += ` · ${t("through {date}", { date: shortDate(row.end) })}`;
  main.createDiv({ cls: "investment-tracker-hero-label", text: periodLabel });
  if (stale && row?.end) renderStaleNotice(main, row.end, staleDays, input);

  if (!row || row.mine === null) {
    main.createDiv({ cls: "investment-tracker-hero-rate is-empty", text: "—" });
    main.createDiv({
      cls: "investment-tracker-hero-note",
      text: row ? t("This year's return needs a valuation for every account on the same day.") : t("No valuation has been recorded this year yet."),
    });
  } else {
    main.createDiv({ cls: `investment-tracker-hero-rate${toneClass(row.mine, visible)}`, text: rateText(row.mine, visible) });
    renderComparisonBars(main, row, input);
    renderVerdict(main, row, input);
    const basis = main.createDiv({ cls: "investment-tracker-hero-note" });
    basis.setText(row.estimated
      ? t("The starting value is estimated from earlier valuations plus later cash flows. Add a December 31 valuation for an exact figure.")
      : row.start && isYearBoundary(row.start, year)
        ? t("Starts from the actual valuation on {date}. Indices are bought with your same amounts on the same dates.", { date: formatDate(row.start) })
        : t("Indices are bought with your same amounts on the same dates."));
  }

  const side = hero.createDiv({ cls: "investment-tracker-hero-side" });
  side.createDiv({ cls: "investment-tracker-hero-label", text: t("Total assets") });
  side.createDiv({ cls: "investment-tracker-hero-total", text: visible ? formatMoney(input.totalValue, input.currency) : HIDDEN_FINANCIAL_VALUE });
  const stats = side.createDiv({ cls: "investment-tracker-hero-stats" });
  const stat = (label: string, value: number | null, signed: boolean) => {
    const item = stats.createDiv();
    item.createDiv({ cls: "investment-tracker-hero-label", text: label });
    const text = !visible ? HIDDEN_FINANCIAL_VALUE : value === null ? "—" : `${signed && value > 0 ? "+" : ""}${formatMoney(value, input.currency)}`;
    item.createDiv({ cls: `investment-tracker-hero-stat${signed ? toneClass(value, visible) : ""}`, text });
  };
  stat(t("Earned this year"), yearProfit(row), true);
  stat(t("Net contributions this year"), row ? row.netFlow : null, false);
  stat(t("Total profit"), input.cumulativeProfit, true);
}

function renderStaleNotice(parent: HTMLElement, end: string, days: number, input: HeroInput): void {
  const notice = parent.createDiv({ cls: "investment-tracker-stale-notice", attr: { role: "note" } });
  const head = notice.createDiv({ cls: "investment-tracker-stale-notice-head" });
  setIcon(head.createSpan({ cls: "investment-tracker-stale-icon" }), "clock");
  head.createSpan({ text: t("Compared only through {date}, your last update {days} days ago.", { date: shortDate(end), days }) });
  const update = input.latestIndex;
  const names: Record<"sp500" | "nasdaq100", string> = { sp500: t("S&P 500"), nasdaq100: t("Nasdaq-100") };
  const list = (values: IndexUpdate["sinceEnd"]) => (["sp500", "nasdaq100"] as const)
    .filter((id) => values[id] !== undefined && (id === "sp500" || input.includeNasdaq))
    .map((id) => `${names[id]} ${rateText(values[id]!, true)}`).join(" · ");
  if (update) {
    const since = list(update.sinceEnd), ytd = list(update.yearToDate);
    // Index moves are public market data, so they stay visible when amounts are hidden.
    if (since) notice.createDiv({ text: t("Since then, through {date}: {changes}", { date: shortDate(update.date), changes: since }) });
    if (ytd) notice.createDiv({ text: t("Index returns this year through {date}: {changes}", { date: shortDate(update.date), changes: ytd }) });
  }
  const button = notice.createEl("button", { cls: "investment-tracker-stale-notice-button", text: t("Record the latest value") });
  button.addEventListener("click", input.onRecord);
}

function renderComparisonBars(parent: HTMLElement, row: YearComparison, input: HeroInput): void {
  const series: Array<{ label: string; value: number | null; cls: string }> = [
    { label: t("My portfolio"), value: row.mine, cls: "is-actual" },
    { label: t("S&P 500"), value: row.sp500, cls: "is-benchmark" },
    ...(input.includeNasdaq ? [{ label: t("Nasdaq-100"), value: row.nasdaq100, cls: "is-comparison" }] : []),
  ];
  const max = Math.max(...series.map((item) => Math.abs(item.value ?? 0)), 1e-9);
  const bars = parent.createDiv({ cls: "investment-tracker-compare-bars", attr: { role: "list" } });
  series.forEach((item, index) => {
    const line = bars.createDiv({ cls: `investment-tracker-compare-row${index === 0 ? " is-mine" : ""}`, attr: { role: "listitem" } });
    line.createSpan({ cls: "investment-tracker-compare-name", text: item.label });
    const track = line.createDiv({ cls: "investment-tracker-compare-track" });
    const fill = track.createDiv({ cls: `investment-tracker-compare-fill ${item.cls}${(item.value ?? 0) < 0 ? " is-negative" : ""}` });
    const pending = index > 0 && item.value === null;
    fill.style.width = input.visible && item.value !== null ? `${(Math.abs(item.value) / max) * 100}%` : "0%";
    const value = pending
      ? input.marketState === "loading" ? t("Loading…") : input.marketState === "hidden" ? HIDDEN_FINANCIAL_VALUE : "—"
      : rateText(item.value, input.visible);
    line.createSpan({ cls: "investment-tracker-compare-value", text: value });
  });
}

function renderVerdict(parent: HTMLElement, row: YearComparison, input: HeroInput): void {
  if (!input.visible || row.mine === null) return;
  const verdict = parent.createDiv({ cls: "investment-tracker-verdict" });
  const add = (index: string, rate: number | null) => {
    if (rate === null) return;
    const diff = row.mine! - rate;
    const item = verdict.createDiv({ cls: `investment-tracker-verdict-item ${diff >= 0 ? "is-ahead" : "is-behind"}` });
    setIcon(item.createSpan({ cls: "investment-tracker-verdict-icon" }), diff >= 0 ? "circle-check" : "circle-x");
    item.createSpan({ text: diff >= 0
      ? t("{value} pp ahead of {index}", { index, value: pointsText(diff) })
      : t("{value} pp behind {index}", { index, value: pointsText(diff) }) });
  };
  add(t("S&P 500"), row.sp500);
  if (input.includeNasdaq) add(t("Nasdaq-100"), row.nasdaq100);
}

export interface YearSectionInput {
  rows: YearComparison[];
  currentYear: number;
  includeNasdaq: boolean;
  visible: boolean;
  marketState: HeroInput["marketState"];
}

export function renderYearSection(parent: HTMLElement, input: YearSectionInput): void {
  const section = parent.createDiv({ cls: "investment-tracker-section investment-tracker-years-section" });
  const header = section.createDiv({ cls: "investment-tracker-section-header" });
  header.createEl("h2", { text: t("Year by year") });
  const rows = input.rows.filter((row) => row.start && row.end);
  if (rows.length === 0) {
    section.createDiv({ cls: "investment-tracker-empty-chart", text: t("There is not enough annual data to chart this range") });
    return;
  }
  if (!input.visible) {
    section.createDiv({ cls: "investment-tracker-empty-chart", text: t("Select the eye button to show the yearly comparison") });
  } else {
    const chart = section.createDiv({ cls: "investment-tracker-year-chart" });
    const values = (pick: (row: YearComparison) => number | null) =>
      rows.flatMap((row) => pick(row) === null ? [] : [{ year: row.year, amount: pick(row)! }]);
    renderAnnualReturnChart(chart, [
      { label: t("Mine"), values: values((row) => row.mine), className: "is-actual" },
      { label: t("S&P 500"), values: values((row) => row.sp500), className: "is-benchmark" },
      ...(input.includeNasdaq ? [{ label: t("Nasdaq-100"), values: values((row) => row.nasdaq100), className: "is-comparison" }] : []),
    ], input.currentYear);
  }

  const table = section.createEl("table", { cls: "investment-tracker-year-table", attr: { "aria-label": t("Annual return comparison") } });
  const head = table.createEl("thead").createEl("tr");
  for (const label of [t("Year"), t("Mine"), t("S&P 500"), ...(input.includeNasdaq ? [t("Nasdaq-100")] : []), t("Result")]) {
    head.createEl("th", { text: label, attr: { scope: "col" } });
  }
  const body = table.createEl("tbody");
  const pending = input.marketState === "loading" ? t("Loading…") : "—";
  for (const row of [...rows].reverse()) {
    const line = body.createEl("tr", { cls: row.year === input.currentYear ? "is-current" : "" });
    const yearCell = line.createEl("th", { attr: { scope: "row" } });
    yearCell.createDiv({ text: String(row.year) });
    if (row.start && !isYearBoundary(row.start, row.year)) yearCell.createDiv({ cls: "investment-tracker-year-sub", text: t("from {date}", { date: shortDate(row.start) }) });
    else if (row.end && row.end !== `${row.year}-12-31` && row.end !== `${row.year + 1}-01-01`) yearCell.createDiv({ cls: "investment-tracker-year-sub", text: t("through {date}", { date: shortDate(row.end) }) });
    const mine = line.createEl("td", { cls: `is-mine${toneClass(row.mine, input.visible)}`, text: rateText(row.mine, input.visible) });
    if (row.estimated && input.visible) {
      const tag = mine.createSpan({ cls: "investment-tracker-estimate-tag", text: t("Estimated") });
      tag.setAttribute("title", t("A year boundary has no valuation, so it was estimated from earlier valuations plus later cash flows."));
    }
    const index = (rate: number | null) => line.createEl("td", { text: rate === null && input.visible ? pending : rateText(rate, input.visible) });
    index(row.sp500);
    if (input.includeNasdaq) index(row.nasdaq100);
    const result = line.createEl("td", { cls: "investment-tracker-year-result" });
    const outcome = input.visible ? outcomeOf(row, input.includeNasdaq) : "unknown";
    if (outcome === "unknown") {
      result.setText(input.visible ? "—" : HIDDEN_FINANCIAL_VALUE);
    } else {
      const badge = result.createSpan({ cls: `investment-tracker-outcome is-${outcome}` });
      setIcon(badge.createSpan({ cls: "investment-tracker-outcome-icon" }), outcome === "good" ? "circle-check" : outcome === "bad" ? "circle-x" : "circle-minus");
      badge.createSpan({ cls: "investment-tracker-outcome-label", text: outcomeLabel(row, input.includeNasdaq) });
    }
  }
}

export interface AccountRowInput {
  account: AccountState;
  currentValue: number;
  row: YearComparison | null;
  lastValuation: string | null;
}

export interface AccountListInput {
  items: AccountRowInput[];
  today: string;
  includeNasdaq: boolean;
  visible: boolean;
  onOpen: (account: AccountState) => void;
  onUpdate: (account: AccountState) => void;
  onCreate: () => void;
}

const STALE_AFTER_DAYS = 31;

export function renderAccountList(parent: HTMLElement, input: AccountListInput): void {
  const section = parent.createDiv({ cls: "investment-tracker-section investment-tracker-account-section" });
  const header = section.createDiv({ cls: "investment-tracker-section-header" });
  header.createEl("h2", { text: t("Accounts") });
  header.createSpan({ cls: "investment-tracker-account-meta", text: t("This year") });
  const list = section.createDiv({ cls: "investment-tracker-account-list" });
  for (const item of input.items) {
    const { account, row } = item;
    const line = list.createDiv({
      cls: "investment-tracker-account-row",
      attr: { role: "button", tabindex: "0", "aria-label": t("View {account}", { account: account.name }) },
    });
    const name = line.createDiv({ cls: "investment-tracker-account-row-name" });
    name.createDiv({ cls: "investment-tracker-account-name", text: account.name });
    const meta = name.createDiv({ cls: "investment-tracker-account-meta" });
    const age = item.lastValuation ? daysBetween(item.lastValuation, input.today) : null;
    if (age !== null && age > STALE_AFTER_DAYS) {
      const stale = meta.createSpan({ cls: "investment-tracker-stale" });
      setIcon(stale.createSpan({ cls: "investment-tracker-stale-icon" }), "clock");
      stale.createSpan({ text: t("Not updated for {days} days", { days: age }) });
    } else if (item.lastValuation) {
      meta.setText(t("Updated {date}", { date: shortDate(item.lastValuation) }));
    }

    const value = line.createDiv({ cls: "investment-tracker-account-row-value" });
    value.createDiv({ cls: "investment-tracker-account-value", text: input.visible ? formatMoney(item.currentValue, account.currency) : HIDDEN_FINANCIAL_VALUE });
    const startedThisYear = row?.start && !isYearBoundary(row.start, row.year);
    const yearLabel = startedThisYear ? t("Since {date}", { date: shortDate(row!.start!) }) : t("This year");
    value.createDiv({ cls: `investment-tracker-account-row-rate${toneClass(row?.mine ?? null, input.visible)}`, text: `${yearLabel} ${rateText(row?.mine ?? null, input.visible)}` });

    const compare = line.createDiv({ cls: "investment-tracker-account-row-compare" });
    compare.createDiv({ cls: `investment-tracker-account-row-rate${toneClass(row?.mine ?? null, input.visible)}`, text: rateText(row?.mine ?? null, input.visible) });
    if (input.visible && row && row.mine !== null) {
      const parts = [
        row.sp500 !== null ? t("vs S&P {value}", { value: signedPoints(row.mine - row.sp500) }) : null,
        input.includeNasdaq && row.nasdaq100 !== null ? t("vs Nasdaq {value}", { value: signedPoints(row.mine - row.nasdaq100) }) : null,
      ].filter(Boolean);
      compare.createDiv({ cls: "investment-tracker-account-meta", text: [startedThisYear ? yearLabel : null, ...parts].filter(Boolean).join(" · ") });
    }

    const update = line.createEl("button", { cls: "investment-tracker-account-row-update", text: t("Update") });
    update.addEventListener("click", (event) => {
      event.stopPropagation();
      input.onUpdate(account);
    });
    setIcon(line.createSpan({ cls: "investment-tracker-account-row-chevron" }), "chevron-right");
    line.addEventListener("click", () => input.onOpen(account));
    line.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.onOpen(account);
      }
    });
  }
  const add = section.createEl("button", { cls: "investment-tracker-add-account" });
  setIcon(add.createSpan(), "plus");
  add.createSpan({ text: t("New account") });
  add.addEventListener("click", input.onCreate);
}

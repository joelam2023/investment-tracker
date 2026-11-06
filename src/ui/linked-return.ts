import type { LinkedReport } from "../domain/linked-return";
import { boundaryEstimateNotes, linkedIndexReport } from "../domain/linked-return";
import { annualMoneyWeightedIndex } from "../market/annual-money-weighted";
import type { MarketSeries } from "../market/benchmark";
import type { MarketBenchmarkId } from "../types";
import { t } from "../i18n";
import { formatDate, formatSignedRate, renderMetricCard, renderAnnualReturnChart, todayLocal } from "./components";

export type LinkedMarkets = Partial<Record<MarketBenchmarkId, MarketSeries | null>>;

export function renderLinkedReturn(parent: HTMLElement, report: LinkedReport, markets: LinkedMarkets = {}, showNasdaq = true, annualChart = false): void {
  const sp = annualChart ? annualMoneyWeightedIndex(report, markets.sp500) : linkedIndexReport(report, markets.sp500);
  const ndx = annualChart ? annualMoneyWeightedIndex(report, markets.nasdaq100) : linkedIndexReport(report, markets.nasdaq100);
  if (annualChart) report = { ...report, years: report.years.map(y => ({ ...y, rate: y.moneyWeightedRate ?? null })) };
  const { summary } = report;
  const ownLabel = annualChart ? t("Annual money-weighted return") : t("Linked period return");
  parent.createEl("h3", { text: annualChart ? ownLabel : t("Linked annualized return") });
  const notes = parent.createEl("details", { cls: "investment-tracker-annual-chart-note" });
  notes.createEl("summary", { text: t("Calculation notes") });
  notes.createDiv({ text: annualChart
    ? t("Annual money-weighted return uses one Modified Dietz calculation over the displayed period, not linked subperiods or XIRR.")
    : t("Only linked subperiod returns are compounded here, not annual money-weighted returns. Annualization uses actual total days (Actual/365) after more than six calendar months; partial years are not whole years. XIRR is separate.") });
  if (!annualChart) notes.createDiv({ text: t("Calendar-year filter: each included year must contain more than six calendar months of investment history. Uses valuation dates, not today's date.") });
  const excluded = report.years.filter(y => !y.included).map(y => y.year);
  if (!annualChart && excluded.length) parent.createDiv({ cls: "investment-tracker-account-meta", text: t("Excluded years: {years}", { years: excluded.join(", ") }) });
  if (!annualChart && summary.start && summary.end && summary.days > 0) parent.createDiv({ cls: "investment-tracker-account-meta", text:
    t("{start}–{end} · {days} days · {currency}", { start: formatDate(summary.start), end: formatDate(summary.end), days: summary.days, currency: report.currency }) });
  if (!annualChart && summary.rate === null) parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: t("Some selected periods are unavailable; the compound total is withheld, but valid annual returns are shown below. Add a December 31 or January 1 boundary valuation where needed.") });
  notes.createDiv({ text: annualChart
    ? t("Annual index returns use Modified Dietz with the same opening capital and dated cash flows. Non-trading-day flows use the next close within 7 days. Price indices exclude dividends.")
    : t("Index comparisons use matching dates and currency, exclude dividends, and do not simulate your deposits. Missing cash-flow-date valuations make your linked return an estimate, not an exact daily TWR.") });
  for (const warning of new Set(Object.values(markets).flatMap(market => market?.warnings ?? []))) notes.createDiv({ text: warning });
  if (!annualChart) {
    const grid = parent.createDiv({ cls: "investment-tracker-metrics-grid investment-tracker-compound-metrics" });
    const card = (label: string, result: LinkedReport) => renderMetricCard(grid, label, formatSignedRate(result.summary.rate), "neutral",
      result.summary.rate === null ? t("Insufficient current data") : result.summary.annualized ? result.summary.estimated ? t("Estimated") : t("Complete") : t("Not annualized yet"));
    card(summary.annualized ? t("My annualized return") : t("My period return"), report);
    card(sp.summary.annualized ? t("S&P 500 annualized return") : t("S&P 500 period return"), sp);
    if (showNasdaq) card(ndx.summary.annualized ? t("Nasdaq-100 annualized return") : t("Nasdaq-100 period return"), ndx);
    if (summary.annualized && summary.days < 365) parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: t("Less than one year of history: annualization can magnify short-term results and is not a prediction of future returns.") });
  }
  if (annualChart) renderAnnualReturnChart(parent, [
    { label: ownLabel, values: report.years.filter(y => y.rate !== null).map(y => ({ year: y.year, amount: y.rate! })), className: "is-actual" },
    { label: t("S&P 500 annual return"), values: sp.years.filter(y => y.rate !== null).map(y => ({ year: y.year, amount: y.rate! })), className: "is-benchmark" },
    ...(showNasdaq ? [{ label: t("Nasdaq-100 annual return"), values: ndx.years.filter(y => y.rate !== null).map(y => ({ year: y.year, amount: y.rate! })), className: "is-comparison" }] : []),
  ], Number(todayLocal().slice(0, 4)));
  const wrapper = parent.createDiv({ cls: "investment-tracker-monthly-table" });
  wrapper.setAttribute("style", "overflow-x: auto");
  const table = wrapper.createEl("table", { attr: { "aria-label": t("Annual return comparison"), style: "width: 100%; font-variant-numeric: tabular-nums" } });
  const head = table.createEl("thead").createEl("tr");
  for (const label of [t("Year"), ownLabel, t("S&P 500"), ...(showNasdaq ? [t("Nasdaq-100")] : [])]) head.createEl("th", { text: label, attr: { scope: "col" } });
  const body = table.createEl("tbody");
  for (const year of [...report.years].reverse()) {
    const row = body.createEl("tr");
    const label = row.createEl("th", { text: String(year.year), attr: { scope: "row" } });
    if (year.start && year.end) label.createDiv({ cls: "investment-tracker-account-meta", text: `${formatDate(year.start)}–${formatDate(year.end)}` });
    if (!annualChart && !year.included) label.createDiv({ cls: "investment-tracker-account-meta", text: t("Excluded from compound total") });
    for (const note of boundaryEstimateNotes(year)) label.createDiv({ cls: "investment-tracker-account-meta", text: note });
    if (year.partial) label.createDiv({ cls: "investment-tracker-account-meta", text: t("Partial") });
    const actual = row.createEl("td", { text: formatSignedRate(year.rate) });
    actual.createDiv({ cls: "investment-tracker-account-meta", text: year.rate === null ? t("Insufficient data") : year.estimated ? t("Estimated") : t("Complete") });
    if (year.rate === null) actual.createDiv({ cls: "investment-tracker-account-meta", text: t("Boundary needed: {dates}", { dates: [!year.start ? `${year.year - 1}-12-31 / ${year.year}-01-01` : "", !year.end ? `${year.year}-12-31 / ${year.year + 1}-01-01` : ""].filter(Boolean).join("; ") || `${year.start}–${year.end}` }) });
    row.createEl("td", { text: formatSignedRate(sp.years.find(y => y.year === year.year)?.rate ?? null) });
    if (showNasdaq) row.createEl("td", { text: formatSignedRate(ndx.years.find(y => y.year === year.year)?.rate ?? null) });
  }
}

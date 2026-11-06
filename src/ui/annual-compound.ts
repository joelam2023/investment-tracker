import type { AnnualReturnResult, BenchmarkAnnualReturn, Currency } from "../types";
import { calculateAnnualCompound, calculateBenchmarkCompound, compoundYears, type CompoundRange, type CompoundResult } from "../domain/annual-compound";
import { getIntlLocale, t } from "../i18n";
import { formatSignedRate, renderMetricCard, todayLocal } from "./components";

export function renderAnnualCompound(
  parent: HTMLElement,
  actualRows: AnnualReturnResult[],
  benchmarkRows: BenchmarkAnnualReturn[],
  comparisons: Array<{ annualReturns: BenchmarkAnnualReturn[] }>,
  openedOn: string | null,
  range: CompoundRange,
  currency: Currency,
): void {
  const years = compoundYears(openedOn, todayLocal(), range);
  parent.createEl("h3", { text: t("Annual compound return (geometric average)") });
  parent.createDiv({ cls: "investment-tracker-account-meta", text: years.length
    ? t("{start}–{end} · {count} complete calendar years · {currency}", { start: years[0]!, end: years.at(-1)!, count: years.length, currency })
    : t("No complete calendar year is available yet") });
  parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: t("Formula: [(1 + r₁) × … × (1 + rₙ)]^(1/n) − 1. Initial partial years and current YTD are excluded; missing years are never skipped.") });
  const actual = calculateAnnualCompound(actualRows, years);
  const sp500 = calculateBenchmarkCompound(benchmarkRows, actualRows, years);
  const nasdaq = calculateBenchmarkCompound(comparisons.flatMap((item) => item.annualReturns), actualRows, years);
  const grid = parent.createDiv({ cls: "investment-tracker-metrics-grid investment-tracker-compound-metrics" });
  const hint = (result: CompoundResult) => result.rate === null
    ? result.invalidYears.length ? t("Unavailable: incomplete or invalid data for {years}", { years: result.invalidYears.join(", ") }) : t("No complete calendar year is available yet")
    : result.estimated ? t("Includes estimated annual valuations") : t("Same calendar-year span");
  renderMetricCard(grid, t("My annual compound return"), formatSignedRate(actual.rate), "neutral", hint(actual));
  renderMetricCard(grid, t("S&P 500 annual compound return"), formatSignedRate(sp500.rate), "neutral", hint(sp500));
  if (comparisons.length) renderMetricCard(grid, t("Nasdaq-100 annual compound return"), formatSignedRate(nasdaq.rate), "neutral", hint(nasdaq));
  const excess = (label: string, result: CompoundResult) => {
    if (actual.rate === null || result.rate === null) return;
    const value = new Intl.NumberFormat(getIntlLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: "always" }).format((actual.rate - result.rate) * 100);
    parent.createDiv({ cls: "investment-tracker-account-meta", text: t("Excess vs {label}: {value} percentage points/year", { label, value }) });
  };
  excess(t("S&P 500"), sp500);
  if (comparisons.length) excess(t("Nasdaq-100"), nasdaq);
  parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: t("Uses the existing cash-flow-adjusted annual returns, not pure time-weighted returns. XIRR remains separate. Indices use same-period price returns in the same currency and exclude dividends.") });
}

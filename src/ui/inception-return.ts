import type { BenchmarkResult } from "../types";
import { displayedInceptionRate, type InceptionReturn } from "../domain/inception-return";
import { getIntlLocale, t } from "../i18n";
import { formatDate, formatSignedRate, renderMetricCard } from "./components";

export function renderInceptionReturn(parent: HTMLElement, period: InceptionReturn, sp500?: BenchmarkResult, nasdaq?: BenchmarkResult, showNasdaq = !!nasdaq, filtered = false): void {
  parent.createEl("h3", { text: filtered ? t("Annualized comparison after calendar-year filtering") : t("Since-inception return comparison") });
  parent.createDiv({ cls: "investment-tracker-account-meta", text: period.startDate && period.endDate
    ? t("{start}–{end} · {days} days · {currency}", { start: formatDate(period.startDate), end: formatDate(period.endDate), days: period.days, currency: period.currency })
    : t("Valid cash flows and valuations are required") });
  const annualized = period.annualizationEligible;
  parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: annualized
    ? filtered ? t("XIRR uses the selected opening balance, dated cash flows and closing valuation. Partial years count by actual days, not as whole years. Day count: Actual/365.") : t("XIRR uses every dated contribution and withdrawal through the latest valuation, including initial partial years and current YTD. Day count: Actual/365.")
    : t("Annualized returns are shown only after more than six calendar months. Until then, only period returns (Modified Dietz) are shown.") });
  const grid = parent.createDiv({ cls: "investment-tracker-metrics-grid investment-tracker-compound-metrics" });
  const actual = displayedInceptionRate(period);
  const hint = (rate: number | null) => rate === null ? t("Insufficient current data") : annualized ? "XIRR" : t("Not annualized yet");
  renderMetricCard(grid, annualized ? t("My annualized return") : t("My period return"), formatSignedRate(actual), "neutral", hint(actual));
  const renderBenchmark = (result: BenchmarkResult | undefined, label: string) => {
    const rate = result ? displayedInceptionRate(period, result) : null;
    const detail = !result ? t("Benchmark unavailable or loading") : result.status !== "ok" ? t("Benchmark unavailable") : hint(rate);
    const valuationHint = result?.status === "ok" && result.asOf && result.asOf !== period.endDate
      ? `${detail} · ${t("Data as of")} ${formatDate(result.asOf)}` : detail;
    renderMetricCard(grid, label, formatSignedRate(rate), "neutral", valuationHint);
    return rate;
  };
  const spRate = renderBenchmark(sp500, annualized ? t("S&P 500 annualized return") : t("S&P 500 period return"));
  const nasdaqRate = showNasdaq ? renderBenchmark(nasdaq, annualized ? t("Nasdaq-100 annualized return") : t("Nasdaq-100 period return")) : null;
  const excess = (rate: number | null, label: string) => {
    if (actual === null || rate === null) return;
    const value = new Intl.NumberFormat(getIntlLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: "always" }).format((actual - rate) * 100);
    parent.createDiv({ cls: "investment-tracker-account-meta", text: annualized
      ? t("Excess vs {label}: {value} percentage points/year", { label, value })
      : t("Period excess vs {label}: {value} percentage points", { label, value }) });
  };
  excess(spRate, t("S&P 500"));
  excess(nasdaqRate, t("Nasdaq-100"));
  parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: t("Both indices simulate the same amounts, cash-flow dates, currency and valuation date as your investment. Non-trading-day flows use the next available close (within 7 days); the last close on or before valuation is used (within 7 days). Price indices exclude dividends.") });
  if (annualized && period.days < 365) parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: t("Less than one year of history: annualization can magnify short-term results and is not a prediction of future returns.") });
  for (const warning of period.warnings) parent.createDiv({ cls: "investment-tracker-annual-chart-note", text: warning });
}

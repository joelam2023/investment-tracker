import { ItemView, Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type {
  AnnualReturnResult,
  AccountMetrics,
  AccountState,
  BenchmarkResult,
  BenchmarkAnnualReturn,
  ChartComparisonId,
  MarketPoint,
  CashFlowEvent,
  Currency,
  DatedAmount,
  LedgerEvent,
  LedgerSecurityState,
  LedgerSnapshot,
  MonthlyPerformanceResult,
  MonthlyPerformanceRow,
  PluginSettings,
  ValuationEvent,
} from "../types";
import { SUPPORTED_CURRENCIES } from "../types";
import { getIntlLocale, t } from "../i18n";
import { samplePerformanceRows } from "../domain/performance-sampling";
import {
  addIconButton,
  formatDate,
  formatMoney,
  formatRate,
  formatSignedRate,
  renderMetricCard,
  renderPerformanceChart,
  type PerformanceChartSeries,
  todayLocal,
} from "./components";
import {
  HIDDEN_FINANCIAL_VALUE,
  privacyButtonState,
  protectFinancialText,
  protectFinancialTone,
  shouldExposeFinancialDetails,
  type FinancialTone,
} from "./privacy";
import { historyDisclosureState } from "./disclosure";
import { DEFAULT_PERFORMANCE_UI_STATE } from "./performance-defaults";
import { renderInceptionReturn } from "./inception-return";
import { calculateLinkedReport, summarizeLinked } from "../domain/linked-return";
import { renderLinkedReturn, type LinkedMarkets } from "./linked-return";
import { calculateInceptionReturn, displayedInceptionRate } from "../domain/inception-return";
import type { YearFilteredReturn } from "../domain/year-filtered-return";
import type { PeriodComparisons } from "../market/period-comparison";
import { PRIVACY_MASK_EVENT } from "../security/auto-lock";
import {
  ConfirmModal,
  CorrectEventModal,
  CreateAccountModal,
  RecordEntryModal,
  isCorrectableEvent,
  type CreateAccountInput,
  type RecordAccountOption,
  type RecordUpdateInput,
} from "./modals";
import {
  accountYearComparison,
  compareYears,
  currentYearComparison,
  lastValuationDates,
  marketRange,
  renderAccountList,
  renderHero,
  renderYearSection,
  type HeroInput,
} from "./home";

export const INVESTMENT_TRACKER_VIEW = "investment-tracker-view";
const INITIAL_MONTHLY_ROWS = 3;
const MONTHLY_ROWS_PER_LOAD = 5;

export interface PortfolioSummary {
  currency: Currency;
  currentValue: number;
  netContributions: number;
  cumulativeProfit: number;
  xirr: number | null;
  asOf: string | null;
  warnings: string[];
}

export interface BenchmarkViewData {
  result: BenchmarkResult;
  series: DatedAmount[];
  marketPoints: MarketPoint[];
}

export interface PerformanceComparisonViewData {
  benchmarkId: ChartComparisonId;
  result: BenchmarkResult;
  performance: MonthlyPerformanceResult;
  annualReturns: BenchmarkAnnualReturn[];
}

export interface PerformanceBenchmarkViewData {
  performance: MonthlyPerformanceResult;
  result: BenchmarkResult;
  benchmarkAnnualReturns: BenchmarkAnnualReturn[];
  comparisons: PerformanceComparisonViewData[];
}

export interface InvestmentTrackerController {
  loadLinkedMarkets(currency: Currency, start: string, end: string, showSp500: boolean): Promise<LinkedMarkets>;
  loadFilteredReturnBenchmarks(filtered: YearFilteredReturn, showSp500: boolean): Promise<PeriodComparisons>;
  settings: PluginSettings;
  loadSnapshot(): Promise<LedgerSnapshot>;
  accountMetrics(account: AccountState, events: LedgerEvent[]): AccountMetrics;
  accountAnnualReturns(account: AccountState, events: LedgerEvent[]): AnnualReturnResult[];
  accountMonthlyPerformance(account: AccountState, events: LedgerEvent[]): MonthlyPerformanceResult;
  portfolioSummary(snapshot: LedgerSnapshot): PortfolioSummary;
  portfolioAnnualReturns(snapshot: LedgerSnapshot, currency: Currency): AnnualReturnResult[];
  portfolioMonthlyPerformance(snapshot: LedgerSnapshot, currency: Currency): MonthlyPerformanceResult;
  createAccount(input: CreateAccountInput): Promise<void>;
  recordUpdate(account: AccountState, input: RecordUpdateInput): Promise<void>;
  correctEvent(event: LedgerEvent, date: string, amount: string, note: string): Promise<void>;
  voidEvent(event: LedgerEvent): Promise<void>;
  loadBenchmark(account: AccountState, events: LedgerEvent[], metrics: AccountMetrics): Promise<BenchmarkViewData>;
  loadAccountPerformanceBenchmark(
    account: AccountState,
    events: LedgerEvent[],
    metrics: AccountMetrics,
    performance: MonthlyPerformanceResult,
  ): Promise<PerformanceBenchmarkViewData>;
  loadPortfolioPerformanceBenchmark(
    snapshot: LedgerSnapshot,
    currency: Currency,
    performance: MonthlyPerformanceResult,
  ): Promise<PerformanceBenchmarkViewData>;
  openSettings(): void;
  securityState(): Promise<LedgerSecurityState>;
  unlock(secret: string, mode: "password" | "recovery"): Promise<void>;
  lock(refresh?: boolean): Promise<void>;
  touchActivity(): void;
  enableEncryption(password: string): Promise<{ recoveryKey: string; eventCount: number; plaintextRemoved: boolean }>;
}

export class InvestmentTrackerView extends ItemView {
  private selectedAccountId: string | null = null;
  private renderSequence = 0;
  private financialValuesVisible = false;
  private selectedAnnualCurrency: Currency | null = null;
  private historyExpanded = false;
  private performanceMode: "returns" | "assets" = DEFAULT_PERFORMANCE_UI_STATE.mode;
  private performanceReturnView: "linked" | "annualized" | "cumulative" | "annual" = DEFAULT_PERFORMANCE_UI_STATE.returnView;
  private excludeShortYears = false;
  private performanceGranularity: "month" | "quarter" | "year" = DEFAULT_PERFORMANCE_UI_STATE.granularity;
  private performanceRange: "1y" | "3y" | "all" = DEFAULT_PERFORMANCE_UI_STATE.range;
  private performanceRowsVisible = INITIAL_MONTHLY_ROWS;
  private expandedPerformanceMonth: string | null = null;
  private openingReminderDismissedForSession = false;
  private longTermMode: "returns" | "assets" = "returns";
  private longTermRange: "1y" | "3y" | "all" = "all";
  private lastSnapshot: LedgerSnapshot | null = null;
  // Index data for the home page, kept until the ledger or date range changes.
  private homeCache: {
    key: string;
    markets: LinkedMarkets | null;
    benchmark: PerformanceBenchmarkViewData | null;
    marketsDone: boolean;
    benchmarkDone: boolean;
  } | null = null;
  private pendingRecoveryKey: string | null = null;
  private migrationSummary: string | null = null;
  private privacyMaskEpoch = 0;
  private readonly maskForPrivacy = () => {
    this.resetPrivacyState();
    if (this.pendingRecoveryKey) void this.controller.lock(false);
    void this.render();
  };
  private readonly maskForActualLock = () => {
    this.resetPrivacyState();
  };

  private resetPrivacyState(): void {
    this.privacyMaskEpoch += 1;
    this.financialValuesVisible = false;
    this.historyExpanded = false;
  }

  constructor(leaf: WorkspaceLeaf, private readonly controller: InvestmentTrackerController) {
    super(leaf);
  }

  getViewType(): string {
    return INVESTMENT_TRACKER_VIEW;
  }

  getDisplayText(): string {
    return t("Investment Tracker");
  }

  getIcon(): string {
    return "chart-no-axes-combined";
  }

  async onOpen(): Promise<void> {
    this.financialValuesVisible = false;
    this.historyExpanded = false;
    this.registerDomEvent(this.containerEl, "pointerdown", () => this.controller.touchActivity(), { capture: true });
    this.registerDomEvent(this.containerEl, "keydown", () => this.controller.touchActivity(), { capture: true });
    window.addEventListener(PRIVACY_MASK_EVENT, this.maskForPrivacy);
    window.addEventListener("investment-tracker-lock", this.maskForActualLock);
    this.register(() => window.removeEventListener(PRIVACY_MASK_EVENT, this.maskForPrivacy));
    this.register(() => window.removeEventListener("investment-tracker-lock", this.maskForActualLock));
    await this.render();
  }

  async onClose(): Promise<void> {
    this.privacyMaskEpoch += 1;
    this.financialValuesVisible = false;
    this.historyExpanded = false;
    if (this.pendingRecoveryKey) await this.controller.lock(false);
  }

  async refresh(): Promise<void> {
    await this.render();
  }

  showAccount(accountId: string): void {
    this.selectedAccountId = accountId;
    this.historyExpanded = false;
    this.resetPerformanceUi();
    void this.render();
  }

  private financialText(renderVisibleValue: () => string): string {
    return protectFinancialText(this.financialValuesVisible, renderVisibleValue);
  }

  private financialTone(tone: FinancialTone): FinancialTone {
    return protectFinancialTone(this.financialValuesVisible, tone);
  }

  private renderPrivacyToggle(parent: HTMLElement): HTMLButtonElement {
    const state = privacyButtonState(this.financialValuesVisible);
    const button = addIconButton(parent, state.icon, state.label, () => {
      this.financialValuesVisible = !this.financialValuesVisible;
      void this.render();
    });
    button.addClass("investment-tracker-privacy-toggle");
    button.setAttribute("aria-pressed", state.pressed);
    return button;
  }

  private renderLockButton(parent: HTMLElement): HTMLButtonElement {
    const button = addIconButton(parent, "lock-keyhole", t("Lock Investment Tracker now"), () => void this.controller.lock());
    button.addClass("investment-tracker-lock-button");
    return button;
  }

  private annualTone(rate: number | null): FinancialTone {
    if (rate === null || rate === 0) return "neutral";
    return rate > 0 ? "positive" : "negative";
  }

  private annualStatusText(row: AnnualReturnResult): string {
    if (row.status !== "ok") return t("Insufficient data");
    if (row.period === "ytd") {
      return row.quality === "complete" ? "YTD" : row.quality === "estimated" ? t("YTD · Estimated") : t("YTD · Partial");
    }
    return row.quality === "complete" ? t("Complete") : row.quality === "estimated" ? t("Estimated") : t("Partial");
  }

  private openOpeningValuation(account: AccountState, row: AnnualReturnResult): void {
    this.openUpdateAccount(account, {
      effectiveDate: row.suggestedOpeningDate ?? `${row.year}-01-01`,
      flowType: "none",
      flowAmount: "",
      totalValue: "",
      note: t("Opening valuation for {year}", { year: row.year }),
    });
  }

  private renderOpeningReminder(
    shell: HTMLElement,
    issues: Array<{ account: AccountState; row: AnnualReturnResult }>,
  ): void {
    if (this.openingReminderDismissedForSession || todayLocal().slice(5, 7) !== "01" || issues.length === 0) return;
    const reminder = shell.createDiv({ cls: "investment-tracker-opening-reminder" });
    const copy = reminder.createDiv();
    copy.createDiv({ cls: "investment-tracker-opening-reminder-title", text: t("Check the new year's opening valuation") });
    copy.createDiv({
      cls: "investment-tracker-account-meta",
      text: issues.length === 1
        ? t("{account} does not have a reliable opening valuation, so the current year can only be marked as partial.", { account: issues[0]!.account.name })
        : t("{count} accounts do not have reliable opening valuations, so the current year can only be marked as partial.", { count: new Intl.NumberFormat(getIntlLocale()).format(issues.length) }),
    });
    const actions = reminder.createDiv({ cls: "investment-tracker-opening-reminder-actions" });
    const add = actions.createEl("button", { cls: "mod-cta", text: t("Add opening valuation") });
    add.addEventListener("click", () => this.openOpeningValuation(issues[0]!.account, issues[0]!.row));
    const dismiss = actions.createEl("button", { text: t("Ignore for now") });
    dismiss.addEventListener("click", () => {
      this.openingReminderDismissedForSession = true;
      reminder.remove();
    });
  }

  private renderAnnualReturns(
    shell: HTMLElement,
    title: string,
    rows: AnnualReturnResult[],
    currencies?: Currency[],
    onAddOpeningValuation?: (row: AnnualReturnResult) => void,
  ): void {
    const section = shell.createDiv({ cls: "investment-tracker-section investment-tracker-annual-section" });
    const header = section.createDiv({ cls: "investment-tracker-section-header" });
    header.createEl("h2", { text: title });
    section.createDiv({ cls: "investment-tracker-account-meta", text: t("Annual money-weighted return uses one Modified Dietz calculation over the displayed period, not linked subperiods or XIRR.") });
    if (currencies && currencies.length > 0) {
      const tabs = header.createDiv({ cls: "investment-tracker-currency-tabs", attr: { role: "group", "aria-label": t("Select portfolio return currency") } });
      for (const currency of currencies) {
        const active = currency === this.selectedAnnualCurrency;
        const button = tabs.createEl("button", {
          cls: `investment-tracker-currency-tab${active ? " is-active" : ""}`,
          text: currency,
          attr: { "aria-pressed": active ? "true" : "false" },
        });
        button.addEventListener("click", () => {
          if (this.selectedAnnualCurrency !== currency) this.resetPerformanceUi();
          this.selectedAnnualCurrency = currency;
          void this.render();
        });
      }
    }

    if (rows.length === 0) {
      section.createDiv({ cls: "investment-tracker-annual-empty", text: t("No accounts can be calculated in this currency yet") });
      return;
    }
    const table = section.createDiv({ cls: "investment-tracker-annual-table", attr: { role: "table", "aria-label": title } });
    const tableHeader = table.createDiv({ cls: "investment-tracker-annual-row is-header", attr: { role: "row" } });
    tableHeader.createDiv({ text: t("Year"), attr: { role: "columnheader" } });
    tableHeader.createDiv({ text: t("Return"), attr: { role: "columnheader" } });
    tableHeader.createDiv({ text: t("Data range"), attr: { role: "columnheader" } });
    tableHeader.createDiv({ text: t("Status"), attr: { role: "columnheader" } });

    for (const row of rows) {
      const item = table.createDiv({ cls: "investment-tracker-annual-row", attr: { role: "row" } });
      item.createDiv({ cls: "investment-tracker-annual-year", text: String(row.year), attr: { role: "cell" } });
      const tone = this.financialTone(this.annualTone(row.rate));
      item.createDiv({
        cls: `investment-tracker-annual-rate${tone === "positive" ? " investment-tracker-positive" : tone === "negative" ? " investment-tracker-negative" : ""}`,
        text: this.financialText(() => row.status === "ok" ? formatSignedRate(row.rate) : "—"),
        attr: { role: "cell" },
      });
      const range = item.createDiv({ cls: "investment-tracker-annual-range", attr: { role: "cell" } });
      range.createDiv({ text: row.startDate && row.endDate ? `${formatDate(row.startDate)} → ${formatDate(row.endDate)}` : "—" });
      if (row.details.length > 0) {
        range.createDiv({ cls: "investment-tracker-annual-detail", text: row.details.join("; ") });
      }
      const statusCell = item.createDiv({ cls: "investment-tracker-annual-status-cell", attr: { role: "cell" } });
      statusCell.createSpan({
        cls: `investment-tracker-annual-status is-${row.status === "ok" ? row.quality : "insufficient"}`,
        text: this.annualStatusText(row),
      });
      if (row.needsOpeningValuation && onAddOpeningValuation) {
        const addOpening = statusCell.createEl("button", {
          cls: "investment-tracker-link-button investment-tracker-opening-action",
          text: t("Add opening"),
        });
        addOpening.addEventListener("click", () => onAddOpeningValuation(row));
      }
    }
  }

  private resetPerformanceUi(): void {
    this.performanceMode = DEFAULT_PERFORMANCE_UI_STATE.mode;
    this.performanceReturnView = DEFAULT_PERFORMANCE_UI_STATE.returnView;
    this.performanceGranularity = DEFAULT_PERFORMANCE_UI_STATE.granularity;
    this.performanceRange = DEFAULT_PERFORMANCE_UI_STATE.range;
    this.performanceRowsVisible = INITIAL_MONTHLY_ROWS;
    this.expandedPerformanceMonth = null;
  }

  private renderPreservingScroll(): void {
    const scrollTop = this.contentEl.scrollTop;
    void this.render().then(() => {
      window.requestAnimationFrame(() => {
        this.contentEl.scrollTop = scrollTop;
      });
    });
  }

  private renderPerformanceOptions<T extends string>(
    parent: HTMLElement,
    label: string,
    options: Array<{ value: T; label: string }>,
    current: T,
    onChange: (value: T) => void,
  ): void {
    const group = parent.createDiv({ cls: "investment-tracker-performance-option-group", attr: { role: "group", "aria-label": label } });
    for (const option of options) {
      const active = option.value === current;
      const button = group.createEl("button", {
        cls: `investment-tracker-performance-option${active ? " is-active" : ""}`,
        text: option.label,
        attr: { "aria-pressed": active ? "true" : "false" },
      });
      button.addEventListener("click", () => onChange(option.value));
    }
  }

  private performanceStatus(row: MonthlyPerformanceRow): string {
    if (row.status === "mtd") return "MTD";
    if (row.status === "complete") return t("Complete");
    if (row.status === "partial") return t("Partial");
    return t("Missing valuation");
  }

  private performanceRangeRows(rows: MonthlyPerformanceRow[]): MonthlyPerformanceRow[] {
    const count = this.performanceRange === "1y" ? 12 : this.performanceRange === "3y" ? 36 : rows.length;
    return rows.slice(-count);
  }

  private monthActionDate(month: string): string {
    if (month === todayLocal().slice(0, 7)) return todayLocal();
    const [year, value] = month.split("-").map(Number);
    return new Date(Date.UTC(year!, value!, 0)).toISOString().slice(0, 10);
  }

  private performanceRangeAnnualReturns(rows: AnnualReturnResult[]): AnnualReturnResult[] {
    if (this.performanceRange === "all") return rows;
    return rows.slice(-(this.performanceRange === "1y" ? 1 : 3));
  }

  private renderPerformanceCenter(
    section: HTMLElement,
    performance: MonthlyPerformanceResult,
    snapshot: LedgerSnapshot,
    account: AccountState | null,
    benchmarkLabel: string,
    annualReturns: AnnualReturnResult[],
    benchmarkAnnualReturns: BenchmarkAnnualReturn[] = [],
    comparisons: PerformanceComparisonViewData[] = [],
    inceptionBenchmark?: BenchmarkResult,
  ): void {
    section.empty();
    const header = section.createDiv({ cls: "investment-tracker-section-header investment-tracker-performance-header" });
    const heading = header.createDiv();
    heading.createEl("h2", { text: t("Assets and benchmark") });
    heading.createDiv({ cls: "investment-tracker-account-meta", text: [benchmarkLabel, ...comparisons.filter((item) => item.result.status === "ok").map((item) => item.result.sourceLabel)].join(" · ") });
    const controls = section.createDiv({ cls: "investment-tracker-performance-controls" });
    this.renderPerformanceOptions(
      controls,
      t("Display"),
      [{ value: "returns", label: t("Returns") }, { value: "assets", label: t("Asset value") }],
      this.performanceMode,
      (value) => {
        this.performanceMode = value;
        this.renderPreservingScroll();
      },
    );
    if (this.performanceMode === "returns") this.renderPerformanceOptions(
      controls, t("Return view"),
      [{ value: "linked", label: t("Linked annualized return") }, { value: "annualized", label: t("Personal return (XIRR)") }, { value: "cumulative", label: `${t("Cumulative")} (XIRR)` }, { value: "annual", label: t("Annual money-weighted return") }],
      this.performanceReturnView,
      (value) => { this.performanceReturnView = value; this.renderPreservingScroll(); },
    );
    if (this.performanceMode === "returns" && this.performanceReturnView === "linked") {
      const group = controls.createDiv({ cls: "investment-tracker-performance-option-group" });
      const toggle = group.createEl("button", { text: t("Exclude years with no more than six months"),
        attr: { "aria-pressed": String(this.excludeShortYears) }, cls: `investment-tracker-performance-option${this.excludeShortYears ? " is-active" : ""}` });
      toggle.addEventListener("click", () => {
        this.excludeShortYears = !this.excludeShortYears;
        this.renderPerformanceCenter(section, performance, snapshot, account, benchmarkLabel, annualReturns, benchmarkAnnualReturns, comparisons, inceptionBenchmark);
        section.querySelector<HTMLButtonElement>('button[data-year-filter]')?.focus({ preventScroll: true });
      });
      toggle.setAttribute("data-year-filter", "true");
    }
    if (this.performanceMode === "assets" || this.performanceReturnView === "cumulative") this.renderPerformanceOptions(
      controls,
      t("Chart interval"),
      [{ value: "month", label: t("Monthly") }, { value: "quarter", label: t("Quarterly") }, { value: "year", label: t("Yearly") }],
      this.performanceGranularity,
      (value) => {
        this.performanceGranularity = value;
        this.renderPreservingScroll();
      },
    );
    if (this.performanceMode === "assets" || (this.performanceReturnView !== "annualized" && this.performanceReturnView !== "linked")) this.renderPerformanceOptions(
      controls,
      t("Date range"),
      [{ value: "1y", label: t("Past year") }, { value: "3y", label: t("Past 3 years") }, { value: "all", label: t("All") }],
      this.performanceRange,
      (value) => {
        this.performanceRange = value;
        this.renderPreservingScroll();
      },
    );

    const chart = section.createDiv({ cls: "investment-tracker-performance-chart" });
    if (!shouldExposeFinancialDetails(this.financialValuesVisible)) {
      chart.createDiv({ cls: "investment-tracker-empty-chart", text: t("Select the eye button to show monthly returns and asset trends") });
    } else {
      const ranged = this.performanceRangeRows(performance.rows);
      const sampled = samplePerformanceRows(ranged, this.performanceGranularity);
      const firstIndex = performance.rows.indexOf(ranged[0]!);
      const prior = firstIndex > 0 ? performance.rows[firstIndex - 1] : undefined;
      if (this.performanceMode === "returns" && (this.performanceReturnView === "linked" || this.performanceReturnView === "annual")) {
        let report = calculateLinkedReport(snapshot.accounts, snapshot.events, performance.currency, todayLocal(), account, this.performanceReturnView === "linked" && this.excludeShortYears);
        if (this.performanceReturnView === "annual" && this.performanceRange !== "all") {
          const years = report.years.slice(this.performanceRange === "1y" ? -1 : -3);
          report = { ...report, years, summary: summarizeLinked(years) };
        }
        const annualChart = this.performanceReturnView === "annual";
        const renderLinked = (markets: LinkedMarkets = {}) => {
          chart.empty();
          renderLinkedReturn(chart, report, markets, this.controller.settings.chartComparisonIds.includes("nasdaq100"), annualChart);
        };
        renderLinked();
        const dates = report.years.flatMap(row => [row.start, row.end]).filter((date): date is string => date !== null).sort();
        const start = dates[0], end = dates.at(-1);
        if (start && end && start < end) void this.controller.loadLinkedMarkets(performance.currency, start, end, !account || account.benchmarkId !== "none")
          .then(markets => { if (chart.isConnected && this.financialValuesVisible) renderLinked(markets); })
          .catch(() => { if (chart.isConnected && this.financialValuesVisible) chart.createDiv({ cls: "investment-tracker-annual-chart-note", text: t("Benchmark unavailable; local returns are unaffected") }); });
      } else if (this.performanceMode === "returns" && this.performanceReturnView === "annualized") {
        const period = calculateInceptionReturn(snapshot.accounts, snapshot.events, performance.currency, account);
        renderInceptionReturn(chart, period, inceptionBenchmark, comparisons.find((item) => item.benchmarkId === "nasdaq100")?.result, this.controller.settings.chartComparisonIds.includes("nasdaq100"));
      } else if (this.performanceMode === "returns") {
        const actualBase = prior?.cumulativeReturn ?? 0;
        const benchmarkBase = prior?.benchmarkCumulativeReturn ?? 0;
        const normalize = (value: number, base: number) => (1 + value) / Math.max(1 + base, 1e-12) - 1;
        const actualValues: DatedAmount[] = [];
        const benchmarkValues: DatedAmount[] = [];
        const actualSampled = samplePerformanceRows(
          ranged,
          this.performanceGranularity,
          (row) => row.cumulativeReturn !== null,
        );
        const benchmarkSampled = samplePerformanceRows(
          ranged,
          this.performanceGranularity,
          (row) => row.benchmarkCumulativeReturn !== null,
        );
        const baselineDate = ranged[0]?.startDate;
        if (baselineDate) {
          actualValues.push({ date: baselineDate, amount: 0 });
          if (benchmarkSampled.length > 0) {
            benchmarkValues.push({ date: baselineDate, amount: 0 });
          }
        }
        for (const row of actualSampled) {
          const date = row.valuationDate ?? row.endDate;
          if (row.cumulativeReturn !== null) actualValues.push({ date, amount: normalize(row.cumulativeReturn, actualBase) });
        }
        for (const row of benchmarkSampled) {
          const date = row.valuationDate ?? row.endDate;
          if (row.benchmarkCumulativeReturn !== null) {
            benchmarkValues.push({ date, amount: normalize(row.benchmarkCumulativeReturn, benchmarkBase) });
          }
        }
        const chartSeries: PerformanceChartSeries[] = [
          { label: `${t("My cumulative return")} (XIRR)`, values: actualValues, className: "is-actual" },
          { label: t("S&P 500 return for the same period"), values: benchmarkValues, className: "is-benchmark" },
        ];
        for (const comparison of comparisons) {
          if (comparison.result.status !== "ok") continue;
          const rows = comparison.performance.rows.slice(firstIndex, firstIndex + ranged.length);
          const base = (firstIndex > 0 ? comparison.performance.rows[firstIndex - 1] : undefined)?.benchmarkCumulativeReturn ?? 0;
          const points = samplePerformanceRows(rows, this.performanceGranularity, (row) => row.benchmarkCumulativeReturn !== null);
          const values: DatedAmount[] = baselineDate && points.length ? [{ date: baselineDate, amount: 0 }] : [];
          for (const row of points) if (row.benchmarkCumulativeReturn !== null) values.push({ date: row.valuationDate ?? row.endDate, amount: normalize(row.benchmarkCumulativeReturn, base) });
          chartSeries.push({ label: t("Nasdaq-100 return for the same period"), values, className: "is-comparison" });
        }
        renderPerformanceChart(chart, chartSeries, {
          kind: "rate",
          currency: performance.currency,
          flowMarkers: ranged.filter((row) => row.netFlow !== 0).map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.netFlow })),
        });
      } else {
        let cumulativeNetFlow = 0;
        const netByMonth = new Map<string, number>();
        for (const row of performance.rows) {
          cumulativeNetFlow += row.netFlow;
          netByMonth.set(row.month, cumulativeNetFlow);
        }
        const chartSeries: PerformanceChartSeries[] = [
          {
            label: t("My assets"),
            values: samplePerformanceRows(ranged, this.performanceGranularity, (row) => row.closingValue !== null)
              .map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.closingValue! })),
            className: "is-actual",
          },
          {
            label: t("Cumulative net contributions"),
            values: sampled.map((row) => ({ date: row.valuationDate ?? row.endDate, amount: netByMonth.get(row.month) ?? 0 })),
            className: "is-contributions",
          },
          {
            label: t("S&P 500 with matching cash flows"),
            values: samplePerformanceRows(ranged, this.performanceGranularity, (row) => row.benchmarkValue !== null)
              .map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.benchmarkValue! })),
            className: "is-benchmark",
          },
        ];
        for (const comparison of comparisons) {
          if (comparison.result.status !== "ok") continue;
          const rows = comparison.performance.rows.slice(firstIndex, firstIndex + ranged.length);
          chartSeries.push({ label: t("Nasdaq-100 with matching cash flows"), values: samplePerformanceRows(rows, this.performanceGranularity, (row) => row.benchmarkValue !== null).map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.benchmarkValue! })), className: "is-comparison" });
        }
        renderPerformanceChart(chart, chartSeries, {
          kind: "money",
          currency: performance.currency,
          flowMarkers: ranged.filter((row) => row.netFlow !== 0).map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.netFlow })),
        });
      }
    }

    const monthlyHeader = section.createDiv({ cls: "investment-tracker-monthly-header" });
    monthlyHeader.createEl("h3", { text: t("Monthly data") });
    monthlyHeader.createSpan({ cls: "investment-tracker-account-meta", text: t("Monthly returns use Modified Dietz and are not annualized") });
    const table = section.createDiv({ cls: "investment-tracker-monthly-table", attr: { role: "table", "aria-label": t("Monthly performance data") } });
    const tableHeader = table.createDiv({ cls: "investment-tracker-monthly-row is-header", attr: { role: "row" } });
    for (const label of [t("Month"), t("Month-end assets"), t("Net contribution"), t("Monthly return"), t("S&P 500 / Excess"), t("Status")]) {
      tableHeader.createDiv({ text: label, attr: { role: "columnheader" } });
    }
    const newest = [...performance.rows].reverse();
    for (const row of newest.slice(0, this.performanceRowsVisible)) {
      const expanded = this.expandedPerformanceMonth === row.month;
      const item = table.createDiv({ cls: "investment-tracker-monthly-item" });
      const line = item.createDiv({ cls: "investment-tracker-monthly-row", attr: { role: "row" } });
      line.createDiv({ cls: "investment-tracker-month-cell", text: row.month, attr: { role: "cell" } });
      line.createDiv({ text: this.financialText(() => row.closingValue === null ? "—" : formatMoney(row.closingValue, performance.currency)), attr: { role: "cell" } });
      line.createDiv({ text: this.financialText(() => row.netFlow === 0 ? "—" : formatMoney(row.netFlow, performance.currency)), attr: { role: "cell" } });
      line.createDiv({ text: this.financialText(() => formatSignedRate(row.returnRate)), attr: { role: "cell" } });
      const comparison = line.createDiv({ cls: "investment-tracker-monthly-comparison", attr: { role: "cell" } });
      comparison.createDiv({ text: this.financialText(() => formatSignedRate(row.benchmarkReturn)) });
      comparison.createDiv({ cls: "investment-tracker-account-meta", text: t("Excess {value}", { value: this.financialText(() => formatSignedRate(row.excessReturn)) }) });
      const stateCell = line.createDiv({ cls: "investment-tracker-monthly-state", attr: { role: "cell" } });
      stateCell.createSpan({ cls: `investment-tracker-annual-status is-${row.status}`, text: this.performanceStatus(row) });
      const expand = stateCell.createEl("button", {
        cls: "investment-tracker-monthly-expand clickable-icon",
        attr: { "aria-label": expanded ? t("Collapse details for {month}", { month: row.month }) : t("Expand details for {month}", { month: row.month }), "aria-expanded": expanded ? "true" : "false" },
      });
      setIcon(expand, expanded ? "chevron-up" : "chevron-down");
      expand.addEventListener("click", () => {
        this.expandedPerformanceMonth = expanded ? null : row.month;
        this.renderPreservingScroll();
      });
      if (expanded) this.renderMonthlyDetails(item, row, performance.currency, snapshot, account);
    }
    if (this.performanceRowsVisible < newest.length) {
      const more = section.createEl("button", { cls: "investment-tracker-load-more", text: t("Load earlier months") });
      more.addEventListener("click", () => {
        this.performanceRowsVisible = Math.min(newest.length, this.performanceRowsVisible + MONTHLY_ROWS_PER_LOAD);
        this.renderPreservingScroll();
      });
    }
  }

  private renderMonthlyDetails(
    parent: HTMLElement,
    row: MonthlyPerformanceRow,
    currency: Currency,
    snapshot: LedgerSnapshot,
    account: AccountState | null,
  ): void {
    const details = parent.createDiv({ cls: "investment-tracker-monthly-details" });
    const summary = details.createDiv({ cls: "investment-tracker-monthly-detail-summary" });
    summary.createSpan({ text: row.valuationDate ? t("Valuation date: {date}", { date: formatDate(row.valuationDate) }) : t("No valuation this month") });
    if (row.details.length > 0) summary.createSpan({ text: row.details.join("; ") });
    const accountIds = account
      ? new Set([account.accountId])
      : new Set(snapshot.accounts.filter((candidate) => !candidate.archived && candidate.currency === currency).map((candidate) => candidate.accountId));
    const events = snapshot.events
      .filter((event): event is CashFlowEvent | ValuationEvent =>
        (event.type === "cash-flow" || event.type === "valuation") &&
        accountIds.has(event.accountId) &&
        event.effectiveDate.slice(0, 7) === row.month,
      )
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.recordedAt.localeCompare(a.recordedAt));
    const list = details.createDiv({ cls: "investment-tracker-monthly-event-list" });
    if (events.length === 0) list.createDiv({ cls: "investment-tracker-account-meta", text: t("There are no cash-flow or valuation records this month") });
    for (const event of events) {
      const eventAccount = snapshot.accounts.find((candidate) => candidate.accountId === event.accountId);
      const value = event.type === "valuation" ? Number(event.totalValue) : Number(event.amount);
      const label = event.type === "valuation" ? t("Asset valuation") : event.direction === "contribution" ? t("Contribution") : t("Withdrawal");
      const item = list.createDiv({ cls: "investment-tracker-monthly-event" });
      const text = item.createDiv();
      text.createDiv({ text: account ? label : t("{account} · {type}", { account: eventAccount?.name ?? t("Unknown account"), type: label }) });
      text.createDiv({
        cls: "investment-tracker-history-meta",
        text: `${formatDate(event.effectiveDate)}${this.financialValuesVisible && event.note ? ` · ${event.note}` : ""}`,
      });
      item.createDiv({ text: this.financialText(() => formatMoney(value, event.currency)) });
    }

    const actions = details.createDiv({ cls: "investment-tracker-monthly-actions" });
    if (account) {
      const actionDate = this.monthActionDate(row.month);
      const update = actions.createEl("button", { text: row.closingValue === null ? t("Add month-end valuation") : t("Update this month") });
      update.addEventListener("click", () => this.openUpdateAccount(account, { effectiveDate: actionDate, note: t("Monthly update for {month}", { month: row.month }) }));
      const contribution = actions.createEl("button", { text: t("Contribution") });
      contribution.addEventListener("click", () => this.openUpdateAccount(account, { effectiveDate: actionDate, flowType: "contribution" }));
      const withdrawal = actions.createEl("button", { text: t("Withdrawal") });
      withdrawal.addEventListener("click", () => this.openUpdateAccount(account, { effectiveDate: actionDate, flowType: "withdrawal" }));
      const latestValuation = events.find((event): event is ValuationEvent => event.type === "valuation");
      if (latestValuation) {
        const correct = actions.createEl("button", { text: t("Correct valuation") });
        correct.disabled = !this.financialValuesVisible;
        if (!this.financialValuesVisible) correct.setAttribute("title", t("Show financial values before correcting a record"));
        correct.addEventListener("click", () => {
          if (!this.financialValuesVisible) return;
          new CorrectEventModal(this.app, latestValuation, async (date, amount, note) => {
            await this.controller.correctEvent(latestValuation, date, amount, note);
            new Notice(t("Correction saved"));
            await this.render();
          }).open();
        });
      }
    } else {
      const accounts = snapshot.accounts.filter((candidate) =>
        !candidate.archived && candidate.currency === currency && events.some((event) => event.accountId === candidate.accountId),
      );
      for (const candidate of accounts) {
        const open = actions.createEl("button", { text: t("View {account}", { account: candidate.name }) });
        open.addEventListener("click", () => this.showAccount(candidate.accountId));
      }
    }
  }

  private async render(): Promise<void> {
    const sequence = ++this.renderSequence;
    const root = this.contentEl;
    root.empty();
    root.addClass("investment-tracker-view");
    const shell = root.createDiv({ cls: "investment-tracker-shell" });
    let securityState: LedgerSecurityState;
    try {
      securityState = await this.controller.securityState();
    } catch (error) {
      this.renderFatalError(shell, error);
      return;
    }
    if (securityState !== "unlocked" || this.pendingRecoveryKey) {
      this.renderSecurityScreen(shell, securityState);
      return;
    }
    shell.createDiv({ cls: "investment-tracker-loading", text: t("Reading investment ledger…") });

    let snapshot: LedgerSnapshot;
    try {
      snapshot = await this.controller.loadSnapshot();
    } catch (error) {
      if (sequence !== this.renderSequence) return;
      shell.empty();
      this.renderFatalError(shell, error);
      return;
    }
    if (sequence !== this.renderSequence) return;
    shell.empty();
    this.lastSnapshot = snapshot;

    const account = this.selectedAccountId
      ? snapshot.accounts.find((candidate) => candidate.accountId === this.selectedAccountId)
      : undefined;
    if (account) {
      await this.renderAccount(shell, snapshot, account, sequence);
    } else {
      this.selectedAccountId = null;
      await this.renderDashboard(shell, snapshot, sequence);
    }
  }

  private renderSecurityScreen(shell: HTMLElement, state: LedgerSecurityState): void {
    shell.empty();
    const card = shell.createDiv({ cls: "investment-tracker-lock-screen" });
    const icon = card.createDiv({ cls: "investment-tracker-lock-icon" });
    const recoveryKey = state === "unlocked" ? this.pendingRecoveryKey : null;
    setIcon(icon, recoveryKey ? "key-round" : state === "setup-required" ? "shield-check" : "lock-keyhole");

    if (recoveryKey) {
      card.createEl("h1", { text: t("Save your recovery key") });
      card.createEl("p", { text: this.migrationSummary ?? t("The ledger is encrypted. Your data cannot be recovered if both the password and recovery key are lost.") });
      const recovery = card.createEl("code", { cls: "investment-tracker-recovery-key", text: recoveryKey });
      const copy = card.createEl("button", { text: t("Copy recovery key") });
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(recovery.textContent ?? "");
        new Notice(t("Recovery key copied. Save it in a password manager"));
      });
      const acknowledgement = card.createDiv({ cls: "investment-tracker-lock-confirm" });
      const checkbox = acknowledgement.createEl("input", { type: "checkbox" });
      acknowledgement.createEl("span", { text: t("I saved the recovery key in a secure location") });
      const enter = card.createEl("button", { cls: "mod-cta", text: t("Open Investment Tracker") });
      enter.disabled = true;
      checkbox.addEventListener("change", () => (enter.disabled = !checkbox.checked));
      enter.addEventListener("click", () => {
        this.pendingRecoveryKey = null;
        this.migrationSummary = null;
        void this.render();
      });
      return;
    }

    if (state === "setup-required") {
      card.createEl("h1", { text: t("Protect your investment ledger") });
      card.createEl("p", { text: t("After you set a separate password, account names, dates, and amounts are stored with AES-256-GCM encryption.") });
      const password = card.createEl("input", { cls: "investment-tracker-lock-input", type: "password", attr: { placeholder: t("Set a password (at least 10 characters)"), autocomplete: "new-password" } });
      const confirmation = card.createEl("input", { cls: "investment-tracker-lock-input", type: "password", attr: { placeholder: t("Enter password again"), autocomplete: "new-password" } });
      const deleteConfirm = card.createDiv({ cls: "investment-tracker-lock-confirm" });
      const checkbox = deleteConfirm.createEl("input", { type: "checkbox" });
      deleteConfirm.createEl("span", { text: t("I understand that the original plaintext event files will be permanently removed after encryption is verified") });
      const submit = card.createEl("button", { cls: "mod-cta", text: t("Enable encryption and migrate") });
      submit.addEventListener("click", async () => {
        if (password.value !== confirmation.value) {
          new Notice(t("The passwords do not match"));
          return;
        }
        if (!checkbox.checked) {
          new Notice(t("Confirm the plaintext cleanup notice first"));
          return;
        }
        submit.disabled = true;
        submit.textContent = t("Encrypting and verifying each record…");
        const startedAtPrivacyMaskEpoch = this.privacyMaskEpoch;
        try {
          const result = await this.controller.enableEncryption(password.value);
          this.pendingRecoveryKey = result.recoveryKey;
          this.migrationSummary = result.plaintextRemoved
            ? t("Encrypted and verified {count} records. The original plaintext events were removed.", { count: new Intl.NumberFormat(getIntlLocale()).format(result.eventCount) })
            : t("Encrypted and verified {count} records, but the plaintext migration backup could not be removed automatically. Stop recording transactions for now and contact support.", { count: new Intl.NumberFormat(getIntlLocale()).format(result.eventCount) });
          password.value = "";
          confirmation.value = "";
          if (startedAtPrivacyMaskEpoch !== this.privacyMaskEpoch) await this.controller.lock(false);
          void this.render();
        } catch (error) {
          new Notice(error instanceof Error ? error.message : t("Encryption migration failed"));
          submit.disabled = false;
          submit.textContent = t("Enable encryption and migrate");
        }
      });
      return;
    }

    card.createEl("h1", { text: t("Investment Tracker is locked") });
    card.createEl("p", { text: t("Account names, amounts, dates, and return data are not read until you unlock the ledger.") });
    let mode: "password" | "recovery" = "password";
    const secret = card.createEl("input", { cls: "investment-tracker-lock-input", type: "password", attr: { placeholder: t("Enter password"), autocomplete: "current-password" } });
    const unlock = card.createEl("button", { cls: "mod-cta", text: t("Unlock") });
    const alternate = card.createEl("button", { cls: "investment-tracker-link-button", text: t("Use recovery key") });
    const submit = async () => {
      if (!secret.value.trim()) return;
      unlock.disabled = true;
      try {
        await this.controller.unlock(secret.value, mode);
        secret.value = "";
        void this.render();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("Unlock failed"));
        secret.select();
        unlock.disabled = false;
      }
    };
    unlock.addEventListener("click", () => void submit());
    secret.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void submit();
    });
    alternate.addEventListener("click", () => {
      mode = mode === "password" ? "recovery" : "password";
      secret.value = "";
      secret.type = mode === "password" ? "password" : "text";
      secret.placeholder = mode === "password" ? t("Enter password") : t("Enter recovery key");
      alternate.textContent = mode === "password" ? t("Use recovery key") : t("Use password");
      secret.focus();
    });
    window.setTimeout(() => {
      if (this.leaf === this.app.workspace.activeLeaf && document.hasFocus()) secret.focus();
    }, 0);
  }

  private async renderDashboard(shell: HTMLElement, snapshot: LedgerSnapshot, _sequence: number): Promise<void> {
    shell.addClass("is-home");
    const activeAccounts = snapshot.accounts.filter((account) => !account.archived);
    const currencies = SUPPORTED_CURRENCIES.filter((currency) => activeAccounts.some((account) => account.currency === currency));
    if (!this.selectedAnnualCurrency || !currencies.includes(this.selectedAnnualCurrency)) {
      this.selectedAnnualCurrency = currencies.includes(this.controller.settings.baseCurrency)
        ? this.controller.settings.baseCurrency
        : currencies[0] ?? null;
    }
    const currency = this.selectedAnnualCurrency;
    const lastDates = lastValuationDates(snapshot.events);
    const scoped = activeAccounts.filter((account) => account.currency === currency);
    const latest = scoped.map((account) => lastDates.get(account.accountId)).filter((date): date is string => !!date).sort().at(-1) ?? null;
    this.renderHomeToolbar(shell, latest, scoped.length, currencies, currency);

    if (activeAccounts.length === 0 || !currency) {
      const empty = shell.createDiv({ cls: "investment-tracker-empty" });
      const icon = empty.createDiv();
      setIcon(icon, "landmark");
      empty.createEl("h2", { text: t("Create your first investment account") });
      empty.createEl("p", {
        text: t("After that, record only external cash flows and the current total value to calculate your actual annualized return."),
      });
      const button = empty.createEl("button", { cls: "mod-cta", text: t("New account") });
      button.addEventListener("click", () => this.openCreateAccount());
      if (snapshot.warnings.length > 0) this.renderWarnings(shell, snapshot.warnings);
      return;
    }

    const today = todayLocal();
    const currentYear = Number(today.slice(0, 4));
    const openingIssues = scoped.flatMap((account) => {
      const row = this.controller.accountAnnualReturns(account, snapshot.events)
        .find((candidate) => candidate.year === currentYear && candidate.needsOpeningValuation);
      return row ? [{ account, row }] : [];
    });
    this.renderOpeningReminder(shell, openingIssues);

    const visible = this.financialValuesVisible;
    const includeNasdaq = this.controller.settings.chartComparisonIds.includes("nasdaq100");
    const portfolioReport = calculateLinkedReport(snapshot.accounts, snapshot.events, currency, today);
    const accountReports = scoped.map((account) => calculateLinkedReport(snapshot.accounts, snapshot.events, currency, today, account));
    const range = marketRange([portfolioReport, ...accountReports]);
    const performance = this.controller.portfolioMonthlyPerformance(snapshot, currency);
    const cache = visible && range ? this.ensureHomeData(snapshot, currency, range, performance) : null;
    const markets: LinkedMarkets = cache?.markets ?? {};
    const marketState: HeroInput["marketState"] = !visible ? "hidden"
      : !range ? "unavailable"
      : !cache?.marketsDone ? "loading"
      : markets.sp500 || markets.nasdaq100 ? "ready" : "unavailable";

    const years = compareYears(portfolioReport, markets);
    const metrics = scoped.map((account) => this.controller.accountMetrics(account, snapshot.events));
    renderHero(shell, {
      year: currentYear,
      row: currentYearComparison(years, currentYear),
      currency,
      includeNasdaq,
      visible,
      marketState,
      totalValue: metrics.reduce((sum, item) => sum + item.currentValue, 0),
      cumulativeProfit: metrics.reduce((sum, item) => sum + item.cumulativeProfit, 0),
    });
    renderYearSection(shell, { rows: years, currentYear, includeNasdaq, visible, marketState });
    renderAccountList(shell, {
      items: scoped.map((account, index) => ({
        account,
        currentValue: metrics[index]!.currentValue,
        row: currentYearComparison(compareYears(accountReports[index]!, markets), currentYear),
        lastValuation: lastDates.get(account.accountId) ?? null,
      })),
      today,
      includeNasdaq,
      visible,
      onOpen: (account) => this.showAccount(account.accountId),
      onUpdate: (account) => this.openRecord(account.accountId),
      onCreate: () => this.openCreateAccount(),
    });
    this.renderLongTerm(shell, snapshot, currency, performance, cache, visible, includeNasdaq);
    const summaryWarnings = metrics.flatMap((item) => item.warnings);
    this.renderHomeNotes(shell, markets, cache?.benchmark ?? null, summaryWarnings);
    if (snapshot.warnings.length > 0) this.renderWarnings(shell, snapshot.warnings);
  }

  private ensureHomeData(
    snapshot: LedgerSnapshot,
    currency: Currency,
    range: { start: string; end: string },
    performance: MonthlyPerformanceResult,
  ): NonNullable<InvestmentTrackerView["homeCache"]> {
    const latestRecord = snapshot.events.reduce((latest, event) => (event.recordedAt > latest ? event.recordedAt : latest), "");
    const key = [currency, range.start, range.end, snapshot.events.length, latestRecord].join("|");
    if (this.homeCache?.key === key) return this.homeCache;
    const cache: NonNullable<InvestmentTrackerView["homeCache"]> = { key, markets: null, benchmark: null, marketsDone: false, benchmarkDone: false };
    this.homeCache = cache;
    const refresh = () => {
      if (this.homeCache === cache && this.financialValuesVisible && !this.selectedAccountId) this.renderPreservingScroll();
    };
    // Only index ids, currency and dates leave the device; amounts stay in the local simulation.
    void this.controller.loadLinkedMarkets(currency, range.start, range.end, true)
      .then((markets) => { cache.markets = markets; })
      .catch(() => { cache.markets = {}; })
      .finally(() => { cache.marketsDone = true; refresh(); });
    void this.controller.loadPortfolioPerformanceBenchmark(snapshot, currency, performance)
      .then((benchmark) => { cache.benchmark = benchmark; })
      .catch((error) => {
        console.warn("Investment Tracker long-term benchmark unavailable", error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => { cache.benchmarkDone = true; refresh(); });
    return cache;
  }

  private renderHomeToolbar(shell: HTMLElement, asOf: string | null, accountCount: number, currencies: Currency[], currency: Currency | null): void {
    const toolbar = shell.createDiv({ cls: "investment-tracker-home-toolbar" });
    const info = toolbar.createDiv({ cls: "investment-tracker-home-asof" });
    if (accountCount > 0) {
      info.setText([
        asOf ? t("As of {date}", { date: formatDate(asOf) }) : null,
        t("{count} accounts", { count: new Intl.NumberFormat(getIntlLocale()).format(accountCount) }),
        currencies.length > 1 ? null : currency,
      ].filter(Boolean).join(" · "));
    }
    if (currencies.length > 1 && currency) {
      this.renderSegmented(toolbar, t("Select portfolio return currency"), currencies.map((value) => ({ value, label: value })), currency, (value) => {
        this.selectedAnnualCurrency = value;
        this.renderPreservingScroll();
      });
    }
    this.renderPrivacyToggle(toolbar);
    this.renderLockButton(toolbar);
    addIconButton(toolbar, "settings", t("Open settings"), () => this.controller.openSettings());
    const record = toolbar.createEl("button", { cls: "mod-cta investment-tracker-primary-button" });
    setIcon(record.createSpan(), "plus");
    record.createSpan({ cls: "investment-tracker-button-label", text: t("Record") });
    record.addEventListener("click", () => (accountCount > 0 ? this.openRecord(null) : this.openCreateAccount()));
  }

  private renderSegmented<T extends string>(
    parent: HTMLElement,
    label: string,
    options: Array<{ value: T; label: string }>,
    current: T,
    onChange: (value: T) => void,
  ): void {
    const group = parent.createDiv({ cls: "investment-tracker-segmented", attr: { role: "group", "aria-label": label } });
    for (const option of options) {
      const active = option.value === current;
      const button = group.createEl("button", {
        cls: `investment-tracker-segment${active ? " is-active" : ""}`,
        text: option.label,
        attr: { "aria-pressed": active ? "true" : "false" },
      });
      button.addEventListener("click", () => {
        if (!active) onChange(option.value);
      });
    }
  }

  private renderLongTerm(
    shell: HTMLElement,
    snapshot: LedgerSnapshot,
    currency: Currency,
    performance: MonthlyPerformanceResult,
    cache: InvestmentTrackerView["homeCache"],
    visible: boolean,
    includeNasdaq: boolean,
  ): void {
    const section = shell.createDiv({ cls: "investment-tracker-section investment-tracker-longterm-section" });
    const header = section.createDiv({ cls: "investment-tracker-section-header" });
    const period = calculateInceptionReturn(snapshot.accounts, snapshot.events, currency);
    const heading = header.createDiv({ cls: "investment-tracker-section-title" });
    heading.createEl("h2", { text: t("Long-term") });
    if (period.startDate) heading.createSpan({ cls: "investment-tracker-account-meta", text: t("Since {date}", { date: formatDate(period.startDate) }) });
    const controls = header.createDiv({ cls: "investment-tracker-segmented-row" });
    this.renderSegmented(controls, t("Display"), [{ value: "returns", label: t("Returns") }, { value: "assets", label: t("Asset value") }], this.longTermMode, (value) => {
      this.longTermMode = value;
      this.renderPreservingScroll();
    });
    this.renderSegmented(controls, t("Date range"), [{ value: "1y", label: t("Past year") }, { value: "3y", label: t("Past 3 years") }, { value: "all", label: t("All") }], this.longTermRange, (value) => {
      this.longTermRange = value;
      this.renderPreservingScroll();
    });

    const benchmark = cache?.benchmark ?? null;
    const pending = visible && !!cache && !cache.benchmarkDone;
    const annualized = period.annualizationEligible;
    const stats = section.createDiv({ cls: "investment-tracker-longterm-stats" });
    const stat = (label: string, rate: number | null, cls: string, isIndex: boolean) => {
      const item = stats.createDiv({ cls: "investment-tracker-longterm-stat" });
      const name = item.createDiv({ cls: "investment-tracker-hero-label" });
      name.createSpan({ cls: `investment-tracker-swatch ${cls}` });
      name.createSpan({ text: label });
      item.createDiv({
        cls: "investment-tracker-longterm-value",
        text: !visible ? HIDDEN_FINANCIAL_VALUE : isIndex && rate === null && pending ? t("Loading…") : formatSignedRate(rate),
      });
    };
    stat(annualized ? t("My annualized return") : t("My period return"), displayedInceptionRate(period), "is-actual", false);
    stat(annualized ? t("S&P 500 annualized return") : t("S&P 500 period return"), benchmark ? displayedInceptionRate(period, benchmark.result) : null, "is-benchmark", true);
    if (includeNasdaq) {
      const nasdaq = benchmark?.comparisons.find((item) => item.benchmarkId === "nasdaq100")?.result;
      stat(annualized ? t("Nasdaq-100 annualized return") : t("Nasdaq-100 period return"), nasdaq ? displayedInceptionRate(period, nasdaq) : null, "is-comparison", true);
    }
    if (visible && benchmark && benchmark.result.status !== "ok") {
      section.createDiv({ cls: "investment-tracker-account-meta", text: benchmark.result.warnings.at(-1) ?? t("Benchmark unavailable") });
    }

    const chart = section.createDiv({ cls: "investment-tracker-performance-chart" });
    if (!visible) {
      chart.createDiv({ cls: "investment-tracker-empty-chart", text: t("Select the eye button to show monthly returns and asset trends") });
      return;
    }
    this.renderTrendChart(chart, benchmark?.performance ?? performance, benchmark?.comparisons ?? []);
  }

  private renderTrendChart(chart: HTMLElement, performance: MonthlyPerformanceResult, comparisons: PerformanceComparisonViewData[]): void {
    const count = this.longTermRange === "1y" ? 12 : this.longTermRange === "3y" ? 36 : performance.rows.length;
    const ranged = performance.rows.slice(-count);
    if (ranged.length === 0) {
      chart.createDiv({ cls: "investment-tracker-empty-chart", text: t("There is not enough annual data to chart this range") });
      return;
    }
    const granularity = ranged.length > 48 ? "quarter" : "month";
    const firstIndex = performance.rows.indexOf(ranged[0]!);
    const prior = firstIndex > 0 ? performance.rows[firstIndex - 1] : undefined;
    // Mark only cash flows large enough to explain a visible jump in the lines.
    const flowMarkers = ranged
      .filter((row) => row.netFlow !== 0 && row.closingValue !== null && Math.abs(row.netFlow) >= row.closingValue * 0.05)
      .map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.netFlow }));
    const baselineDate = ranged[0]?.startDate;

    if (this.longTermMode === "returns") {
      const normalize = (value: number, base: number) => (1 + value) / Math.max(1 + base, 1e-12) - 1;
      const line = (rows: MonthlyPerformanceRow[], base: number, pick: (row: MonthlyPerformanceRow) => number | null): DatedAmount[] => {
        const points = samplePerformanceRows(rows, granularity, (row) => pick(row) !== null);
        if (points.length === 0) return [];
        return [
          ...(baselineDate ? [{ date: baselineDate, amount: 0 }] : []),
          ...points.map((row) => ({ date: row.valuationDate ?? row.endDate, amount: normalize(pick(row)!, base) })),
        ];
      };
      const series: PerformanceChartSeries[] = [
        { label: t("My cumulative return"), values: line(ranged, prior?.cumulativeReturn ?? 0, (row) => row.cumulativeReturn), className: "is-actual" },
        { label: t("S&P 500 return for the same period"), values: line(ranged, prior?.benchmarkCumulativeReturn ?? 0, (row) => row.benchmarkCumulativeReturn), className: "is-benchmark" },
      ];
      for (const comparison of comparisons) {
        if (comparison.result.status !== "ok") continue;
        const rows = comparison.performance.rows.slice(firstIndex, firstIndex + ranged.length);
        const base = (firstIndex > 0 ? comparison.performance.rows[firstIndex - 1] : undefined)?.benchmarkCumulativeReturn ?? 0;
        series.push({ label: t("Nasdaq-100 return for the same period"), values: line(rows, base, (row) => row.benchmarkCumulativeReturn), className: "is-comparison" });
      }
      renderPerformanceChart(chart, series, { kind: "rate", currency: performance.currency, flowMarkers });
      return;
    }

    let cumulativeNetFlow = 0;
    const netByMonth = new Map<string, number>();
    for (const row of performance.rows) {
      cumulativeNetFlow += row.netFlow;
      netByMonth.set(row.month, cumulativeNetFlow);
    }
    const series: PerformanceChartSeries[] = [
      {
        label: t("My assets"),
        values: samplePerformanceRows(ranged, granularity, (row) => row.closingValue !== null)
          .map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.closingValue! })),
        className: "is-actual",
      },
      {
        label: t("Cumulative net contributions"),
        values: samplePerformanceRows(ranged, granularity).map((row) => ({ date: row.valuationDate ?? row.endDate, amount: netByMonth.get(row.month) ?? 0 })),
        className: "is-contributions",
      },
      {
        label: t("S&P 500 with matching cash flows"),
        values: samplePerformanceRows(ranged, granularity, (row) => row.benchmarkValue !== null)
          .map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.benchmarkValue! })),
        className: "is-benchmark",
      },
    ];
    for (const comparison of comparisons) {
      if (comparison.result.status !== "ok") continue;
      const rows = comparison.performance.rows.slice(firstIndex, firstIndex + ranged.length);
      series.push({
        label: t("Nasdaq-100 with matching cash flows"),
        values: samplePerformanceRows(rows, granularity, (row) => row.benchmarkValue !== null).map((row) => ({ date: row.valuationDate ?? row.endDate, amount: row.benchmarkValue! })),
        className: "is-comparison",
      });
    }
    renderPerformanceChart(chart, series, { kind: "money", currency: performance.currency, flowMarkers });
  }

  private renderHomeNotes(shell: HTMLElement, markets: LinkedMarkets, benchmark: PerformanceBenchmarkViewData | null, warnings: string[]): void {
    const notes = shell.createEl("details", { cls: "investment-tracker-home-notes" });
    notes.createEl("summary", { text: t("Calculation notes and data sources") });
    const lines = new Set([
      t("Yearly returns use one Modified Dietz calculation per year. Both indices are bought with your same starting value and cash flows on the same dates."),
      t("Long-term annualized returns use XIRR over every dated contribution and withdrawal (Actual/365)."),
      ...warnings,
      ...Object.values(markets).flatMap((market) => market?.warnings ?? []),
      ...(benchmark?.result.warnings ?? []),
      ...(benchmark?.comparisons.flatMap((item) => item.result.warnings) ?? []),
    ]);
    for (const line of lines) notes.createDiv({ text: line });
  }

  private async renderAccount(
    shell: HTMLElement,
    snapshot: LedgerSnapshot,
    account: AccountState,
    sequence: number,
  ): Promise<void> {
    const header = shell.createDiv({ cls: "investment-tracker-header" });
    const titleArea = header.createDiv();
    const back = titleArea.createEl("button", { cls: "investment-tracker-link-button", text: t("← All accounts") });
    back.addEventListener("click", () => {
      this.selectedAccountId = null;
      this.historyExpanded = false;
      this.resetPerformanceUi();
      void this.render();
    });
    titleArea.createEl("h1", { cls: "investment-tracker-title", text: account.name });
    titleArea.createDiv({ cls: "investment-tracker-account-meta", text: t("{currency} · Started {date}", { currency: account.currency, date: formatDate(account.openedOn) }) });
    const toolbar = header.createDiv({ cls: "investment-tracker-toolbar" });
    this.renderPrivacyToggle(toolbar);
    this.renderLockButton(toolbar);
    const updateButton = toolbar.createEl("button", {
      cls: "mod-cta investment-tracker-primary-button",
      text: t("Update returns"),
    });
    updateButton.addEventListener("click", () => this.openUpdateAccount(account));

    const metrics = this.controller.accountMetrics(account, snapshot.events);
    const accountPeriod = calculateInceptionReturn(snapshot.accounts, snapshot.events, account.currency, account);
    const accountRate = displayedInceptionRate(accountPeriod);
    const summaryCard = shell.createDiv({ cls: "investment-tracker-summary" });
    summaryCard.createDiv({ cls: "investment-tracker-summary-total-label", text: t("Current assets") });
    summaryCard.createDiv({
      cls: "investment-tracker-summary-total",
      text: this.financialText(() => formatMoney(metrics.currentValue, account.currency)),
    });
    const grid = summaryCard.createDiv({ cls: "investment-tracker-metrics-grid" });
    renderMetricCard(
      grid,
      t("Cumulative net contributions"),
      this.financialText(() => formatMoney(metrics.netContributions, account.currency)),
    );
    const profitTone: FinancialTone = metrics.cumulativeProfit > 0
      ? "positive"
      : metrics.cumulativeProfit < 0
        ? "negative"
        : "neutral";
    renderMetricCard(
      grid,
      t("Cumulative profit/loss"),
      this.financialText(() => formatMoney(metrics.cumulativeProfit, account.currency)),
      this.financialTone(profitTone),
    );
    const xirrTone: FinancialTone = accountRate === null
      ? "neutral"
      : accountRate >= 0
        ? "positive"
        : "negative";
    renderMetricCard(
      grid,
      accountPeriod.annualizationEligible ? t("My annualized return") : t("My period return"),
      this.financialText(() => formatRate(accountRate)),
      this.financialTone(xirrTone),
      accountRate === null ? t("Insufficient current data") : accountPeriod.annualizationEligible ? "XIRR" : t("Not annualized yet"),
    );
    const benchmarkMetric = renderMetricCard(
      grid,
      t("S&P 500 return for the same period"),
      this.financialValuesVisible ? t("Calculating…") : HIDDEN_FINANCIAL_VALUE,
      "neutral",
      this.financialValuesVisible ? t("Compared using matching cash flows") : t("Select the eye button to show the comparison"),
    );

    const accountAnnualRows = this.controller.accountAnnualReturns(account, snapshot.events);
    const currentAnnualIssue = accountAnnualRows.find(
      (row) => row.year === Number(todayLocal().slice(0, 4)) && row.needsOpeningValuation,
    );
    this.renderOpeningReminder(shell, currentAnnualIssue ? [{ account, row: currentAnnualIssue }] : []);
    this.renderAnnualReturns(
      shell,
      t("Account annual returns"),
      accountAnnualRows,
      undefined,
      (row) => this.openOpeningValuation(account, row),
    );

    const accountEvents = snapshot.events.filter(
      (event) => "accountId" in event && event.accountId === account.accountId,
    );
    const performance = this.controller.accountMonthlyPerformance(account, snapshot.events);
    const performanceSection = shell.createDiv({ cls: "investment-tracker-section investment-tracker-performance-section" });
    this.renderPerformanceCenter(
      performanceSection,
      performance,
      snapshot,
      account,
      this.financialValuesVisible ? t("Loading S&P 500 data for the same period…") : t("Benchmark and chart are hidden"),
      accountAnnualRows,
    );
    if (this.financialValuesVisible) {
      void this.controller
        .loadAccountPerformanceBenchmark(account, snapshot.events, metrics, performance)
        .then((loaded) => {
          if (
            sequence !== this.renderSequence ||
            !this.financialValuesVisible ||
            !benchmarkMetric.isConnected
          ) return;
          const valueEl = benchmarkMetric.querySelector(".investment-tracker-metric-value");
          const hintEl = benchmarkMetric.querySelector(".investment-tracker-metric-hint");
          const benchmarkRate = displayedInceptionRate(accountPeriod, loaded.result);
          if (valueEl) valueEl.textContent = this.financialText(() => formatRate(benchmarkRate));
          if (hintEl) {
            hintEl.textContent = loaded.result.status !== "ok"
              ? t("Benchmark unavailable; local returns are unaffected")
              : !accountPeriod.annualizationEligible ? t("Not annualized yet")
              : t("Excess {value}", { value: this.financialText(() => formatSignedRate(loaded.result.excessRate)) });
          }
          benchmarkMetric.removeClass("is-neutral", "is-positive", "is-negative");
          const excessRate = accountRate !== null && benchmarkRate !== null ? accountRate - benchmarkRate : null;
          const benchmarkTone: FinancialTone = excessRate === null
            ? "neutral"
            : excessRate >= 0
              ? "positive"
              : "negative";
          benchmarkMetric.addClass(`is-${this.financialTone(benchmarkTone)}`);
          this.renderPerformanceCenter(
            performanceSection,
            loaded.performance,
            snapshot,
            account,
            loaded.result.status === "ok" ? loaded.result.sourceLabel : t("Benchmark unavailable"),
            accountAnnualRows, loaded.benchmarkAnnualReturns, loaded.comparisons, loaded.result,
          );
          this.renderWarnings(performanceSection, [...loaded.result.warnings, ...loaded.comparisons.flatMap((item) => item.result.warnings)]);
        })
        .catch((error) => {
          if (
            sequence !== this.renderSequence ||
            !this.financialValuesVisible ||
            !benchmarkMetric.isConnected
          ) return;
          const valueEl = benchmarkMetric.querySelector(".investment-tracker-metric-value");
          const hintEl = benchmarkMetric.querySelector(".investment-tracker-metric-hint");
          if (valueEl) valueEl.textContent = "—";
          if (hintEl) hintEl.textContent = t("Benchmark unavailable; local returns are unaffected");
          this.renderPerformanceCenter(performanceSection, performance, snapshot, account, t("Benchmark unavailable"), accountAnnualRows);
          console.warn("Investment Tracker benchmark unavailable", error instanceof Error ? error.message : "unknown error");
        });
    }

    const visibleEvents = accountEvents
      .filter(isCorrectableEvent)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.recordedAt.localeCompare(a.recordedAt));
    const historySection = shell.createDiv({ cls: "investment-tracker-section investment-tracker-history-section" });
    const historyHeader = historySection.createDiv({ cls: "investment-tracker-section-header" });
    historyHeader.createEl("h2", { text: t("History") });
    const historyHeaderActions = historyHeader.createDiv({ cls: "investment-tracker-history-header-actions" });
    historyHeaderActions.createSpan({
      cls: "investment-tracker-account-meta",
      text: t("{count} valid records", { count: new Intl.NumberFormat(getIntlLocale()).format(accountEvents.length) }),
    });
    const disclosure = historyDisclosureState(this.historyExpanded);
    const historyToggle = historyHeaderActions.createEl("button", {
      cls: "investment-tracker-history-toggle",
      attr: { "aria-expanded": disclosure.expanded },
    });
    setIcon(historyToggle.createSpan(), disclosure.icon);
    historyToggle.createSpan({ text: disclosure.label });
    historyToggle.addEventListener("click", () => {
      this.historyExpanded = !this.historyExpanded;
      void this.render();
    });

    if (this.historyExpanded) {
      const history = historySection.createDiv({ cls: "investment-tracker-history" });
      for (const event of visibleEvents) {
        const row = history.createDiv({ cls: "investment-tracker-history-row" });
        const description = row.createDiv();
        const label = event.type === "valuation"
          ? t("Asset valuation")
          : event.direction === "contribution"
            ? t("Contribution")
            : t("Withdrawal");
        description.createDiv({ text: label });
        description.createDiv({
          cls: "investment-tracker-history-meta",
          text: `${formatDate(event.effectiveDate)}${this.financialValuesVisible && event.note ? ` · ${event.note}` : ""}`,
        });
        const value = event.type === "valuation" ? Number(event.totalValue) : Number(event.amount);
        row.createDiv({
          cls: "investment-tracker-history-value",
          text: this.financialText(() => formatMoney(value, event.currency)),
        });
        const actions = row.createDiv({ cls: "investment-tracker-history-actions" });
        const edit = actions.createEl("button", { cls: "investment-tracker-link-button", text: t("Correct") });
        edit.disabled = !this.financialValuesVisible;
        if (!this.financialValuesVisible) {
          edit.setAttribute("aria-label", t("Show financial values before correcting a record"));
          edit.setAttribute("title", t("Show financial values before correcting a record"));
        }
        edit.addEventListener("click", () => {
          if (!this.financialValuesVisible) {
            new Notice(t("Select the eye button to show financial values first"));
            return;
          }
          new CorrectEventModal(this.app, event, async (date, amount, note) => {
            await this.controller.correctEvent(event, date, amount, note);
            new Notice(t("Correction saved. The original record remains in the ledger"));
            await this.render();
          }).open();
        });
        const remove = actions.createEl("button", { cls: "investment-tracker-link-button", text: t("Reverse") });
        remove.addEventListener("click", () =>
          new ConfirmModal(
            this.app,
            t("Reverse this record?"),
            t("The system adds a reversal event without physically deleting the original record."),
            t("Confirm reversal"),
            async () => {
              await this.controller.voidEvent(event);
              new Notice(t("Record reversed"));
              await this.render();
            },
          ).open(),
        );
      }
      if (visibleEvents.length === 0) {
        history.createDiv({ cls: "investment-tracker-empty-chart", text: t("There are no valuation or cash-flow records yet") });
      }
    }

    const warnings = [...snapshot.warnings, ...metrics.warnings];
    if (warnings.length > 0) this.renderWarnings(shell, warnings);
  }

  private openCreateAccount(): void {
    new CreateAccountModal(this.app, this.controller.settings.baseCurrency, async (input) => {
      await this.controller.createAccount(input);
      new Notice(t("Investment account created"));
      await this.render();
    }).open();
  }

  private openUpdateAccount(account: AccountState, initial?: Partial<RecordUpdateInput>): void {
    this.openRecord(account.accountId, { lockAccount: true, ...(initial ? { initial } : {}) });
  }

  private recordOptions(snapshot: LedgerSnapshot): RecordAccountOption[] {
    return snapshot.accounts.filter((account) => !account.archived).map((account) => {
      const valuation = snapshot.events
        .filter((event): event is ValuationEvent => event.type === "valuation" && event.accountId === account.accountId)
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.recordedAt.localeCompare(a.recordedAt))[0];
      return {
        accountId: account.accountId,
        name: account.name,
        currency: account.currency,
        lastValuation: valuation ? { date: valuation.effectiveDate, value: Number(valuation.totalValue) } : null,
      };
    });
  }

  private openRecord(accountId: string | null, options: { lockAccount?: boolean; initial?: Partial<RecordUpdateInput> | undefined } = {}): void {
    const snapshot = this.lastSnapshot;
    if (!snapshot) return;
    const accounts = this.recordOptions(snapshot);
    if (accounts.length === 0) {
      this.openCreateAccount();
      return;
    }
    new RecordEntryModal(this.app, accounts, accountId, async (id, input) => {
      const account = snapshot.accounts.find((candidate) => candidate.accountId === id);
      if (!account) throw new Error(t("Unknown account"));
      await this.controller.recordUpdate(account, input);
      new Notice(t("Return record updated"));
      await this.render();
    }, { ...options, showAmounts: this.financialValuesVisible }).open();
  }

  private renderWarnings(parent: HTMLElement, warnings: string[]): void {
    const unique = [...new Set(warnings.filter(Boolean))];
    if (unique.length === 0) return;
    const box = parent.createDiv({ cls: "investment-tracker-warning-list" });
    box.createDiv({ text: t("Needs attention") });
    const list = box.createEl("ul");
    for (const warning of unique) list.createEl("li", { text: warning });
  }

  private renderFatalError(parent: HTMLElement, error: unknown): void {
    const empty = parent.createDiv({ cls: "investment-tracker-empty" });
    const icon = empty.createDiv();
    setIcon(icon, "triangle-alert");
    empty.createEl("h2", { text: t("The ledger cannot be read right now") });
    empty.createEl("p", {
      text: error instanceof Error ? error.message : t("An unknown error occurred. The original data was not overwritten."),
    });
    const retry = empty.createEl("button", { text: t("Read again") });
    retry.addEventListener("click", () => void this.render());
  }
}

import { ItemView, Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type {
  AnnualReturnResult,
  AccountMetrics,
  AccountState,
  BenchmarkResult,
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
import { PRIVACY_MASK_EVENT } from "../security/auto-lock";
import {
  ConfirmModal,
  CorrectEventModal,
  CreateAccountModal,
  RecordUpdateModal,
  isCorrectableEvent,
  type CreateAccountInput,
  type RecordUpdateInput,
} from "./modals";

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
}

export interface PerformanceBenchmarkViewData {
  performance: MonthlyPerformanceResult;
  result: BenchmarkResult;
}

export interface InvestmentTrackerController {
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
  private performanceGranularity: "month" | "quarter" | "year" = DEFAULT_PERFORMANCE_UI_STATE.granularity;
  private performanceRange: "1y" | "3y" | "all" = DEFAULT_PERFORMANCE_UI_STATE.range;
  private performanceRowsVisible = INITIAL_MONTHLY_ROWS;
  private expandedPerformanceMonth: string | null = null;
  private openingReminderDismissedForSession = false;
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

  private renderPerformanceCenter(
    section: HTMLElement,
    performance: MonthlyPerformanceResult,
    snapshot: LedgerSnapshot,
    account: AccountState | null,
    benchmarkLabel: string,
  ): void {
    section.empty();
    const header = section.createDiv({ cls: "investment-tracker-section-header investment-tracker-performance-header" });
    const heading = header.createDiv();
    heading.createEl("h2", { text: t("Assets and benchmark") });
    heading.createDiv({ cls: "investment-tracker-account-meta", text: benchmarkLabel });
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
    this.renderPerformanceOptions(
      controls,
      t("Chart interval"),
      [{ value: "month", label: t("Monthly") }, { value: "quarter", label: t("Quarterly") }, { value: "year", label: t("Yearly") }],
      this.performanceGranularity,
      (value) => {
        this.performanceGranularity = value;
        this.renderPreservingScroll();
      },
    );
    this.renderPerformanceOptions(
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
      if (this.performanceMode === "returns") {
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
        renderPerformanceChart(chart, [
          { label: t("My cumulative return"), values: actualValues, className: "is-actual" },
          { label: t("S&P 500 return for the same period"), values: benchmarkValues, className: "is-benchmark" },
        ], {
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
        renderPerformanceChart(chart, [
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
        ], {
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

  private async renderDashboard(shell: HTMLElement, snapshot: LedgerSnapshot, sequence: number): Promise<void> {
    const header = shell.createDiv({ cls: "investment-tracker-header" });
    const titleWrap = header.createDiv();
    titleWrap.createDiv({ cls: "investment-tracker-eyebrow", text: "Investment Tracker" });
    titleWrap.createEl("h1", { cls: "investment-tracker-title", text: t("Investment Tracker") });
    const toolbar = header.createDiv({ cls: "investment-tracker-toolbar" });
    this.renderPrivacyToggle(toolbar);
    this.renderLockButton(toolbar);
    const addButton = toolbar.createEl("button", { cls: "mod-cta investment-tracker-primary-button" });
    setIcon(addButton.createSpan(), "plus");
    addButton.createSpan({ cls: "investment-tracker-button-label", text: ` ${t("New account")}` });
    addButton.addEventListener("click", () => this.openCreateAccount());

    const activeAccounts = snapshot.accounts.filter((account) => !account.archived);
    if (activeAccounts.length === 0) {
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

    const reminderYear = Number(todayLocal().slice(0, 4));
    const openingIssues = activeAccounts.flatMap((account) => {
      const row = this.controller.accountAnnualReturns(account, snapshot.events)
        .find((candidate) => candidate.year === reminderYear && candidate.needsOpeningValuation);
      return row ? [{ account, row }] : [];
    });
    this.renderOpeningReminder(shell, openingIssues);

    const summary = this.controller.portfolioSummary(snapshot);
    const summaryCard = shell.createDiv({ cls: "investment-tracker-summary" });
    summaryCard.createDiv({ cls: "investment-tracker-summary-total-label", text: t("Current total assets") });
    summaryCard.createDiv({
      cls: "investment-tracker-summary-total",
      text: this.financialText(() => formatMoney(summary.currentValue, summary.currency)),
    });
    const grid = summaryCard.createDiv({ cls: "investment-tracker-metrics-grid" });
    renderMetricCard(
      grid,
      t("Cumulative net contributions"),
      this.financialText(() => formatMoney(summary.netContributions, summary.currency)),
    );
    const profitTone: FinancialTone = summary.cumulativeProfit > 0
      ? "positive"
      : summary.cumulativeProfit < 0
        ? "negative"
        : "neutral";
    renderMetricCard(
      grid,
      t("Cumulative profit/loss"),
      this.financialText(() => formatMoney(summary.cumulativeProfit, summary.currency)),
      this.financialTone(profitTone),
    );
    const xirrTone: FinancialTone = summary.xirr !== null && summary.xirr > 0
      ? "positive"
      : summary.xirr !== null && summary.xirr < 0
        ? "negative"
        : "neutral";
    renderMetricCard(
      grid,
      t("Portfolio annualized return"),
      this.financialText(() => formatRate(summary.xirr)),
      this.financialTone(xirrTone),
      summary.xirr === null ? t("Valid cash flows and valuations are required") : "XIRR",
    );
    renderMetricCard(grid, t("Data as of"), formatDate(summary.asOf));

    const annualCurrencies = SUPPORTED_CURRENCIES.filter((currency) =>
      activeAccounts.some((account) => account.currency === currency),
    );
    if (!this.selectedAnnualCurrency || !annualCurrencies.includes(this.selectedAnnualCurrency)) {
      this.selectedAnnualCurrency = annualCurrencies.includes(this.controller.settings.baseCurrency)
        ? this.controller.settings.baseCurrency
        : annualCurrencies[0] ?? null;
    }
    const annualRows = this.selectedAnnualCurrency
      ? this.controller.portfolioAnnualReturns(snapshot, this.selectedAnnualCurrency)
      : [];
    this.renderAnnualReturns(shell, t("Portfolio annual returns"), annualRows, [...annualCurrencies]);

    if (this.selectedAnnualCurrency) {
      const performance = this.controller.portfolioMonthlyPerformance(snapshot, this.selectedAnnualCurrency);
      const performanceSection = shell.createDiv({ cls: "investment-tracker-section investment-tracker-performance-section" });
      this.renderPerformanceCenter(
        performanceSection,
        performance,
        snapshot,
        null,
        this.financialValuesVisible ? t("Loading S&P 500 data for the same period…") : t("Benchmark and chart are hidden"),
      );
      if (this.financialValuesVisible) {
        void this.controller
          .loadPortfolioPerformanceBenchmark(snapshot, this.selectedAnnualCurrency, performance)
          .then((loaded) => {
            if (sequence !== this.renderSequence || !performanceSection.isConnected || !this.financialValuesVisible) return;
            this.renderPerformanceCenter(
              performanceSection,
              loaded.performance,
              snapshot,
              null,
              loaded.result.status === "ok" ? loaded.result.sourceLabel : t("Benchmark unavailable"),
            );
          })
          .catch((error) => {
            if (sequence !== this.renderSequence || !performanceSection.isConnected) return;
            console.warn("Investment Tracker portfolio monthly benchmark unavailable", error instanceof Error ? error.message : "unknown error");
            this.renderPerformanceCenter(performanceSection, performance, snapshot, null, t("Benchmark unavailable"));
          });
      }
    }

    const section = shell.createDiv({ cls: "investment-tracker-section" });
    const sectionHeader = section.createDiv({ cls: "investment-tracker-section-header" });
    sectionHeader.createEl("h2", { text: t("Investment accounts") });
    addIconButton(sectionHeader, "settings", t("Open settings"), () => this.controller.openSettings());
    const accountGrid = section.createDiv({ cls: "investment-tracker-accounts" });
    for (const account of activeAccounts) {
      const metrics = this.controller.accountMetrics(account, snapshot.events);
      const card = accountGrid.createDiv({
        cls: "investment-tracker-account-card",
        attr: { role: "button", tabindex: "0", "aria-label": t("View {account}", { account: account.name }) },
      });
      const accountHeader = card.createDiv({ cls: "investment-tracker-account-header" });
      accountHeader.createDiv({ cls: "investment-tracker-account-name", text: account.name });
      accountHeader.createDiv({ cls: "investment-tracker-account-meta", text: account.currency });
      card.createDiv({
        cls: "investment-tracker-account-value",
        text: this.financialText(() => formatMoney(metrics.currentValue, account.currency)),
      });
      const footer = card.createDiv({ cls: "investment-tracker-account-footer" });
      const accountRateTone = this.financialTone(
        metrics.xirr === null ? "neutral" : metrics.xirr >= 0 ? "positive" : "negative",
      );
      const rate = footer.createSpan({
        cls: accountRateTone === "positive"
          ? "investment-tracker-positive"
          : accountRateTone === "negative"
            ? "investment-tracker-negative"
            : "investment-tracker-account-meta",
        text: t("Annualized {value}", { value: this.financialText(() => formatRate(metrics.xirr)) }),
      });
      if (metrics.xirr === null) rate.removeClass("investment-tracker-negative");
      const update = footer.createEl("button", { cls: "investment-tracker-link-button", text: t("Update returns") });
      update.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openUpdateAccount(account);
      });
      const open = () => {
        this.selectedAccountId = account.accountId;
        this.historyExpanded = false;
        this.resetPerformanceUi();
        void this.render();
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    }

    const warnings = [...snapshot.warnings, ...summary.warnings];
    if (warnings.length > 0) this.renderWarnings(shell, warnings);
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
    const xirrTone: FinancialTone = metrics.xirr === null
      ? "neutral"
      : metrics.xirr >= 0
        ? "positive"
        : "negative";
    renderMetricCard(
      grid,
      t("My annualized return"),
      this.financialText(() => formatRate(metrics.xirr)),
      this.financialTone(xirrTone),
      metrics.xirrStatus === "ok" ? "XIRR" : t("Insufficient current data"),
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
          if (valueEl) valueEl.textContent = this.financialText(() => formatRate(loaded.result.xirr));
          if (hintEl) {
            hintEl.textContent = loaded.result.status === "ok"
              ? t("Excess {value}", { value: this.financialText(() => formatSignedRate(loaded.result.excessRate)) })
              : t("Benchmark unavailable; local returns are unaffected");
          }
          benchmarkMetric.removeClass("is-neutral", "is-positive", "is-negative");
          const benchmarkTone: FinancialTone = loaded.result.excessRate === null
            ? "neutral"
            : loaded.result.excessRate >= 0
              ? "positive"
              : "negative";
          benchmarkMetric.addClass(`is-${this.financialTone(benchmarkTone)}`);
          this.renderPerformanceCenter(
            performanceSection,
            loaded.performance,
            snapshot,
            account,
            loaded.result.status === "ok" ? loaded.result.sourceLabel : t("Benchmark unavailable"),
          );
          if (loaded.result.warnings.length > 0) this.renderWarnings(performanceSection, loaded.result.warnings);
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
          this.renderPerformanceCenter(performanceSection, performance, snapshot, account, t("Benchmark unavailable"));
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
    new RecordUpdateModal(this.app, account.name, account.currency, async (input) => {
      await this.controller.recordUpdate(account, input);
      new Notice(t("Return record updated"));
      await this.render();
    }, initial).open();
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

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
  formatSignedRate,
  renderPerformanceChart,
  type PerformanceChartSeries,
  todayLocal,
} from "./components";
import {
  HIDDEN_FINANCIAL_VALUE,
  privacyButtonState,
  protectFinancialText,
  protectFinancialTone,
  type FinancialTone,
} from "./privacy";
import { historyDisclosureState } from "./disclosure";
import { calculateLinkedReport } from "../domain/linked-return";
import type { LinkedMarkets } from "./linked-return";
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
  compareYears,
  currentYearComparison,
  indexUpdateAfter,
  lastValuationDates,
  marketRange,
  renderAccountList,
  renderHero,
  renderYearSection,
  type HeroInput,
} from "./home";

export const INVESTMENT_TRACKER_VIEW = "investment-tracker-view";

/** Index data for one page (home or one account), kept until the ledger or date range changes. */
interface MarketDataCache {
  key: string;
  markets: LinkedMarkets | null;
  benchmark: PerformanceBenchmarkViewData | null;
  marketsDone: boolean;
  benchmarkDone: boolean;
}

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
  private openingReminderDismissedForSession = false;
  private longTermMode: "returns" | "assets" = "returns";
  private longTermRange: "1y" | "3y" | "all" = "all";
  private lastSnapshot: LedgerSnapshot | null = null;
  private readonly marketCaches = new Map<string, MarketDataCache>();
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
    void this.render().then(() => { this.contentEl.scrollTop = 0; });
  }

  private showHome(): void {
    this.selectedAccountId = null;
    this.historyExpanded = false;
    void this.render().then(() => { this.contentEl.scrollTop = 0; });
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

  private renderPreservingScroll(): void {
    const scrollTop = this.contentEl.scrollTop;
    void this.render().then(() => {
      window.requestAnimationFrame(() => {
        this.contentEl.scrollTop = scrollTop;
      });
    });
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
    const cache = visible && range
      ? this.ensureMarketData("home", snapshot, currency, range, () => this.controller.loadPortfolioPerformanceBenchmark(snapshot, currency, performance), () => !this.selectedAccountId)
      : null;
    const markets: LinkedMarkets = cache?.markets ?? {};
    const marketState: HeroInput["marketState"] = !visible ? "hidden"
      : !range ? "unavailable"
      : !cache?.marketsDone ? "loading"
      : markets.sp500 || markets.nasdaq100 ? "ready" : "unavailable";

    const years = compareYears(portfolioReport, markets);
    const metrics = scoped.map((account) => this.controller.accountMetrics(account, snapshot.events));
    const thisYear = currentYearComparison(years, currentYear);
    renderHero(shell, {
      year: currentYear,
      row: thisYear,
      today,
      latestIndex: thisYear?.end ? indexUpdateAfter(markets, thisYear.end, currentYear, today) : null,
      onRecord: () => this.openRecord(null),
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

  /** Loads index data once per page (home or one account) and redraws that page when it arrives. */
  private ensureMarketData(
    scope: string,
    snapshot: LedgerSnapshot,
    currency: Currency,
    range: { start: string; end: string },
    loadBenchmark: () => Promise<PerformanceBenchmarkViewData>,
    isShowing: () => boolean,
  ): MarketDataCache {
    const latestRecord = snapshot.events.reduce((latest, event) => (event.recordedAt > latest ? event.recordedAt : latest), "");
    const today = todayLocal();
    const key = [currency, range.start, range.end, today, snapshot.events.length, latestRecord].join("|");
    const existing = this.marketCaches.get(scope);
    if (existing?.key === key) return existing;
    const cache: MarketDataCache = { key, markets: null, benchmark: null, marketsDone: false, benchmarkDone: false };
    this.marketCaches.set(scope, cache);
    const refresh = () => {
      if (this.marketCaches.get(scope) === cache && this.financialValuesVisible && isShowing()) this.renderPreservingScroll();
    };
    // Only index ids, currency and dates leave the device; amounts stay in the local simulation.
    // Load through today so the page can say how the indices moved after the last update.
    void this.controller.loadLinkedMarkets(currency, range.start, today > range.end ? today : range.end, true)
      .then((markets) => { cache.markets = markets; })
      .catch(() => { cache.markets = {}; })
      .finally(() => { cache.marketsDone = true; refresh(); });
    void loadBenchmark()
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
    cache: MarketDataCache | null,
    visible: boolean,
    includeNasdaq: boolean,
    account: AccountState | null = null,
  ): void {
    const section = shell.createDiv({ cls: "investment-tracker-section investment-tracker-longterm-section" });
    const header = section.createDiv({ cls: "investment-tracker-section-header" });
    const period = calculateInceptionReturn(snapshot.accounts, snapshot.events, currency, account);
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
    _sequence: number,
  ): Promise<void> {
    shell.addClass("is-home", "is-account");
    const today = todayLocal();
    const currentYear = Number(today.slice(0, 4));
    this.renderAccountHeader(shell, account, lastValuationDates(snapshot.events).get(account.accountId) ?? null);

    const openingIssue = this.controller.accountAnnualReturns(account, snapshot.events)
      .find((row) => row.year === currentYear && row.needsOpeningValuation);
    this.renderOpeningReminder(shell, openingIssue ? [{ account, row: openingIssue }] : []);

    // Same calculation as the home page, so this account's numbers match its row there.
    const visible = this.financialValuesVisible;
    const includeNasdaq = this.controller.settings.chartComparisonIds.includes("nasdaq100");
    const report = calculateLinkedReport(snapshot.accounts, snapshot.events, account.currency, today, account);
    const range = marketRange([report]);
    const metrics = this.controller.accountMetrics(account, snapshot.events);
    const performance = this.controller.accountMonthlyPerformance(account, snapshot.events);
    const cache = visible && range
      ? this.ensureMarketData(
        `account:${account.accountId}`, snapshot, account.currency, range,
        () => this.controller.loadAccountPerformanceBenchmark(account, snapshot.events, metrics, performance),
        () => this.selectedAccountId === account.accountId,
      )
      : null;
    const markets: LinkedMarkets = cache?.markets ?? {};
    const marketState: HeroInput["marketState"] = !visible ? "hidden"
      : !range ? "unavailable"
      : !cache?.marketsDone ? "loading"
      : markets.sp500 || markets.nasdaq100 ? "ready" : "unavailable";

    const years = compareYears(report, markets);
    const thisYear = currentYearComparison(years, currentYear);
    renderHero(shell, {
      scope: "account",
      year: currentYear,
      row: thisYear,
      today,
      latestIndex: thisYear?.end ? indexUpdateAfter(markets, thisYear.end, currentYear, today) : null,
      onRecord: () => this.openUpdateAccount(account),
      currency: account.currency,
      includeNasdaq,
      visible,
      marketState,
      totalValue: metrics.currentValue,
      cumulativeProfit: metrics.cumulativeProfit,
    });
    renderYearSection(shell, { rows: years, currentYear, includeNasdaq, visible, marketState });
    this.renderLongTerm(shell, snapshot, account.currency, performance, cache, visible, includeNasdaq, account);
    this.renderHistory(shell, snapshot, account);
    this.renderHomeNotes(shell, markets, cache?.benchmark ?? null, metrics.warnings);
    if (snapshot.warnings.length > 0) this.renderWarnings(shell, snapshot.warnings);
  }

  private renderAccountHeader(shell: HTMLElement, account: AccountState, lastValuation: string | null): void {
    const toolbar = shell.createDiv({ cls: "investment-tracker-home-toolbar" });
    const left = toolbar.createDiv({ cls: "investment-tracker-home-asof" });
    const back = left.createEl("button", { cls: "investment-tracker-back-button" });
    setIcon(back.createSpan(), "chevron-left");
    back.createSpan({ text: t("All accounts") });
    back.addEventListener("click", () => this.showHome());
    this.renderPrivacyToggle(toolbar);
    this.renderLockButton(toolbar);
    addIconButton(toolbar, "settings", t("Open settings"), () => this.controller.openSettings());
    const record = toolbar.createEl("button", { cls: "mod-cta investment-tracker-primary-button" });
    setIcon(record.createSpan(), "plus");
    record.createSpan({ cls: "investment-tracker-button-label", text: t("Record") });
    record.addEventListener("click", () => this.openUpdateAccount(account));

    const heading = shell.createDiv({ cls: "investment-tracker-account-heading" });
    heading.createEl("h1", { cls: "investment-tracker-account-title", text: account.name });
    heading.createDiv({
      cls: "investment-tracker-account-meta",
      text: [
        t("{currency} · Started {date}", { currency: account.currency, date: formatDate(account.openedOn) }),
        lastValuation ? t("Updated {date}", { date: formatDate(lastValuation) }) : null,
      ].filter(Boolean).join(" · "),
    });
  }

  private renderHistory(shell: HTMLElement, snapshot: LedgerSnapshot, account: AccountState): void {
    const accountEvents = snapshot.events.filter(
      (event) => "accountId" in event && event.accountId === account.accountId,
    );
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
      this.renderPreservingScroll();
    });
    if (!this.historyExpanded) return;

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

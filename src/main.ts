import { apiVersion, Notice, Platform, Plugin } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type {
  AnnualReturnResult,
  AccountMetrics,
  AccountState,
  BenchmarkResult,
  CashFlowEvent,
  Currency,
  EventVoidedEvent,
  LedgerEvent,
  LedgerSecurityState,
  LedgerSnapshot,
  MonthlyPerformanceResult,
  PluginSettings,
  ValuationEvent,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { parseSettings } from "./settings";
import { normalizeMoney, parseMoneyStrict } from "./domain/money";
import {
  calculateAccountAnnualReturns,
  calculateAccountMetrics,
  calculatePortfolioAnnualReturns,
  calculatePortfolioMetrics,
} from "./domain/calculations";
import {
  applyBenchmarkToMonthlyPerformance,
  calculateAccountMonthlyPerformance,
  calculatePortfolioMonthlyPerformance,
} from "./domain/monthly-performance";
import { LedgerEventStore } from "./storage/event-store";
import { calculateSameCashFlowBenchmark, type MarketSeries } from "./market/benchmark";
import { FredSp500Provider } from "./market/fred-provider";
import { MarketCacheStore, parseManualMarketCsv } from "./market/cache";
import {
  INVESTMENT_TRACKER_VIEW,
  InvestmentTrackerView,
  type BenchmarkViewData,
  type PerformanceBenchmarkViewData,
  type PortfolioSummary,
} from "./ui/view";
import { InvestmentTrackerSettingTab } from "./ui/settings";
import type { CreateAccountInput, RecordUpdateInput } from "./ui/modals";
import { todayLocal } from "./ui/components";
import { resolveLocale, setLanguageSetting, suggestedCurrency, t } from "./i18n";
import {
  autoLockDelayMs,
  hasAutomaticLockRule,
  hasLockEpochChanged,
  PRIVACY_MASK_EVENT,
  shouldLockOnPrivacyBoundary,
} from "./security/auto-lock";
import {
  BUG_REPORT_URL,
  FEATURE_REQUEST_URL,
  ISSUE_CHOOSER_URL,
  PRIVATE_SECURITY_REPORT_URL,
  buildSupportDiagnostics,
} from "./support";

function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function timestampWithOffset(base: number, offset: number): string {
  return new Date(base + offset).toISOString();
}

function unavailableBenchmark(message: string, sourceLabel = "S&P 500 Price Index · FRED"): BenchmarkViewData {
  const result: BenchmarkResult = {
    status: "unavailable",
    benchmarkId: "sp500",
    asOf: null,
    virtualValue: null,
    xirr: null,
    excessValue: null,
    excessRate: null,
    sourceLabel,
    warnings: [message],
  };
  return { result, series: [] };
}

function cacheCovers(series: MarketSeries, start: string, asOf: string): boolean {
  const points = [...series.points].sort((a, b) => a.date.localeCompare(b.date));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || last.date > asOf) return false;
  const startGap = (Date.parse(`${first.date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  const endGap = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 86_400_000;
  return startGap <= 7 && endGap >= 0 && endGap <= 7;
}

export default class InvestmentTrackerPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  private store!: LedgerEventStore;
  private readonly fredProvider = new FredSp500Provider();
  private autoLockTimer: number | null = null;
  private activeLeafWasInvestmentTracker = false;
  private lockEpoch = 0;
  private failedUnlockAttempts = 0;
  private unlockBlockedUntil = 0;

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData(), suggestedCurrency());
    setLanguageSetting(this.settings.language);
    this.store = new LedgerEventStore(this.app.vault, this.settings.dataPath);

    this.registerView(INVESTMENT_TRACKER_VIEW, (leaf: WorkspaceLeaf) => new InvestmentTrackerView(leaf, this));
    this.addRibbonIcon("chart-no-axes-combined", t("Open Investment Tracker"), () => void this.activateView());
    this.addCommand({
      id: "open-investment-tracker",
      name: t("Open Investment Tracker"),
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: "export-investment-ledger-json",
      name: t("Export complete investment ledger as JSON"),
      callback: () => void this.exportJson().then((path) => new Notice(t("Exported to {path}", { path }))),
    });
    this.addCommand({
      id: "lock-investment-tracker",
      name: t("Lock Investment Tracker now"),
      callback: () => void this.lock(),
    });
    this.addCommand({
      id: "open-help-and-feedback",
      name: t("Open help and feedback"),
      callback: () => this.openSupportUrl(ISSUE_CHOOSER_URL),
    });
    this.addSettingTab(new InvestmentTrackerSettingTab(this.app, this, this));
    this.activeLeafWasInvestmentTracker =
      this.app.workspace.activeLeaf?.view.getViewType() === INVESTMENT_TRACKER_VIEW;
    this.registerDomEvent(window, "blur", () => void this.handlePrivacyBoundary());
    this.registerDomEvent(window, "focus", () => {
      if (this.app.workspace.activeLeaf?.view.getViewType() === INVESTMENT_TRACKER_VIEW) this.touchActivity();
    });
    this.registerDomEvent(window, "pagehide", () => void this.handlePrivacyBoundary());
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.handlePrivacyBoundary();
    });
    const touchPluginModal = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".investment-tracker-modal")) this.touchActivity();
    };
    this.registerDomEvent(document, "pointerdown", touchPluginModal, { capture: true });
    this.registerDomEvent(document, "keydown", touchPluginModal, { capture: true });
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      const activeLeafIsInvestmentTracker = leaf?.view.getViewType() === INVESTMENT_TRACKER_VIEW;
      if (this.activeLeafWasInvestmentTracker && !activeLeafIsInvestmentTracker) {
        void this.handlePrivacyBoundary();
      } else if (!this.activeLeafWasInvestmentTracker && activeLeafIsInvestmentTracker) {
        this.touchActivity();
      }
      this.activeLeafWasInvestmentTracker = activeLeafIsInvestmentTracker;
    }));
  }

  onunload(): void {
    this.lockEpoch += 1;
    if (this.autoLockTimer !== null) window.clearTimeout(this.autoLockTimer);
    this.store?.lock();
    window.dispatchEvent(new Event(PRIVACY_MASK_EVENT));
    window.dispatchEvent(new Event("investment-tracker-lock"));
    this.app.workspace.detachLeavesOfType(INVESTMENT_TRACKER_VIEW);
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(INVESTMENT_TRACKER_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) {
      await leaf.setViewState({ type: INVESTMENT_TRACKER_VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    this.touchActivity();
  }

  async securityState(): Promise<LedgerSecurityState> {
    return this.store.getSecurityState();
  }

  async unlock(secret: string, mode: "password" | "recovery"): Promise<void> {
    const wait = this.unlockBlockedUntil - Date.now();
    if (wait > 0) {
      throw new Error(t("Too many attempts. Try again in {seconds} seconds", { seconds: Math.ceil(wait / 1000) }));
    }
    const startedAtEpoch = this.lockEpoch;
    try {
      await this.store.unlock(secret, mode);
    } catch (error) {
      if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
        await this.lock();
        throw new Error(t("Investment ledger is locked"));
      }
      this.failedUnlockAttempts += 1;
      if (this.failedUnlockAttempts >= 5) {
        this.unlockBlockedUntil = Date.now() + 30_000;
        this.failedUnlockAttempts = 0;
      }
      throw error;
    }
    if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
      await this.lock();
      throw new Error(t("Investment ledger is locked"));
    }
    this.failedUnlockAttempts = 0;
    this.unlockBlockedUntil = 0;
    this.touchActivity();
  }

  async lock(refresh = true): Promise<void> {
    this.lockEpoch += 1;
    this.store.lock();
    window.dispatchEvent(new Event("investment-tracker-lock"));
    if (this.autoLockTimer !== null) window.clearTimeout(this.autoLockTimer);
    this.autoLockTimer = null;
    if (refresh) await this.refreshViews();
  }

  private async handlePrivacyBoundary(): Promise<void> {
    if (shouldLockOnPrivacyBoundary(this.settings.lockOnLeave)) await this.lock();
    else window.dispatchEvent(new Event(PRIVACY_MASK_EVENT));
  }

  async enableEncryption(password: string): Promise<{ recoveryKey: string; eventCount: number; plaintextRemoved: boolean }> {
    if (password.normalize("NFKC").length < 10) throw new Error(t("Password must be at least 10 characters"));
    const startedAtEpoch = this.lockEpoch;
    let result: { recoveryKey: string; eventCount: number; plaintextRemoved: boolean };
    try {
      result = await this.store.enableEncryption(password);
    } catch (error) {
      if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
        await this.lock();
        throw new Error(t("Investment ledger is locked"));
      }
      throw error;
    }
    if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
      await this.lock();
      return result;
    }
    this.touchActivity();
    return result;
  }

  async reauthenticate(password: string): Promise<void> {
    const startedAtEpoch = this.lockEpoch;
    try {
      await this.store.verifyPassword(password);
    } catch (error) {
      if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
        await this.lock();
        throw new Error(t("Investment ledger is locked"));
      }
      throw error;
    }
    if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
      await this.lock();
      throw new Error(t("Investment ledger is locked"));
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.normalize("NFKC").length < 10) throw new Error(t("New password must be at least 10 characters"));
    const startedAtEpoch = this.lockEpoch;
    try {
      await this.store.changePassword(currentPassword, newPassword);
    } catch (error) {
      if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
        await this.lock();
        throw new Error(t("Investment ledger is locked"));
      }
      throw error;
    }
    if (hasLockEpochChanged(startedAtEpoch, this.lockEpoch)) {
      await this.lock();
      return;
    }
    this.touchActivity();
  }

  touchActivity(): void {
    if (this.autoLockTimer !== null) window.clearTimeout(this.autoLockTimer);
    this.autoLockTimer = null;
    const delay = autoLockDelayMs(this.settings.autoLockMinutes);
    if (delay === null) return;
    this.autoLockTimer = window.setTimeout(() => void this.lock(), delay);
  }

  async loadSnapshot(): Promise<LedgerSnapshot> {
    return this.store.loadSnapshot();
  }

  accountMetrics(account: AccountState, events: LedgerEvent[]): AccountMetrics {
    return calculateAccountMetrics(account, events);
  }

  accountAnnualReturns(account: AccountState, events: LedgerEvent[]): AnnualReturnResult[] {
    return calculateAccountAnnualReturns(account, events, todayLocal());
  }

  portfolioSummary(snapshot: LedgerSnapshot): PortfolioSummary {
    return calculatePortfolioMetrics(snapshot.accounts, snapshot.events, this.settings.baseCurrency);
  }

  portfolioAnnualReturns(snapshot: LedgerSnapshot, currency: Currency): AnnualReturnResult[] {
    return calculatePortfolioAnnualReturns(snapshot.accounts, snapshot.events, currency, todayLocal());
  }

  accountMonthlyPerformance(account: AccountState, events: LedgerEvent[]): MonthlyPerformanceResult {
    return calculateAccountMonthlyPerformance(account, events, todayLocal());
  }

  portfolioMonthlyPerformance(snapshot: LedgerSnapshot, currency: Currency): MonthlyPerformanceResult {
    return calculatePortfolioMonthlyPerformance(snapshot.accounts, snapshot.events, currency, todayLocal());
  }

  async createAccount(input: CreateAccountInput): Promise<void> {
    const accountId = newId();
    const base = Date.now();
    const amount = normalizeMoney(input.initialValue, this.settings.baseCurrency);
    const common = { schemaVersion: 1 as const, effectiveDate: input.startDate };
    const events: LedgerEvent[] = [
      {
        ...common,
        type: "account-created",
        eventId: newId(),
        recordedAt: timestampWithOffset(base, 0),
        accountId,
        name: input.name,
        currency: this.settings.baseCurrency,
        benchmarkId: this.settings.benchmarkId,
      },
      {
        ...common,
        type: "cash-flow",
        eventId: newId(),
        recordedAt: timestampWithOffset(base, 1),
        accountId,
        direction: "contribution",
        amount,
        currency: this.settings.baseCurrency,
        note: t("Initial contribution"),
      },
      {
        ...common,
        type: "valuation",
        eventId: newId(),
        recordedAt: timestampWithOffset(base, 2),
        accountId,
        totalValue: amount,
        currency: this.settings.baseCurrency,
        note: t("Initial asset value"),
      },
    ];
    await this.store.appendEvents(events);
    await this.refreshViews();
  }

  async recordUpdate(account: AccountState, input: RecordUpdateInput): Promise<void> {
    const base = Date.now();
    const events: LedgerEvent[] = [];
    if (input.flowType !== "none") {
      const flow: CashFlowEvent = {
        schemaVersion: 1,
        type: "cash-flow",
        eventId: newId(),
        recordedAt: timestampWithOffset(base, 0),
        effectiveDate: input.effectiveDate,
        accountId: account.accountId,
        direction: input.flowType,
        amount: normalizeMoney(input.flowAmount, account.currency),
        currency: account.currency,
        ...(input.note ? { note: input.note } : {}),
      };
      events.push(flow);
    }
    const valuation: ValuationEvent = {
      schemaVersion: 1,
      type: "valuation",
      eventId: newId(),
      recordedAt: timestampWithOffset(base, 1),
      effectiveDate: input.effectiveDate,
      accountId: account.accountId,
      totalValue: normalizeMoney(input.totalValue, account.currency),
      currency: account.currency,
      ...(input.note ? { note: input.note } : {}),
    };
    events.push(valuation);
    await this.store.appendEvents(events);
    await this.refreshViews();
  }

  async correctEvent(event: LedgerEvent, date: string, amount: string, note: string): Promise<void> {
    const base = {
      schemaVersion: 1 as const,
      eventId: newId(),
      recordedAt: new Date().toISOString(),
      effectiveDate: date,
      supersedesEventId: event.eventId,
    };
    let correction: LedgerEvent;
    if (event.type === "cash-flow") {
      correction = {
        ...base,
        type: "cash-flow",
        accountId: event.accountId,
        direction: event.direction,
        amount: normalizeMoney(amount, event.currency),
        currency: event.currency,
        ...(note ? { note } : {}),
      };
    } else if (event.type === "valuation") {
      correction = {
        ...base,
        type: "valuation",
        accountId: event.accountId,
        totalValue: normalizeMoney(amount, event.currency),
        currency: event.currency,
        ...(note ? { note } : {}),
      };
    } else {
      throw new Error(t("This record type cannot be corrected in the current version"));
    }
    await this.store.appendEvent(correction);
    await this.refreshViews();
  }

  async voidEvent(event: LedgerEvent): Promise<void> {
    const voidEvent: EventVoidedEvent = {
      schemaVersion: 1,
      type: "event-voided",
      eventId: newId(),
      recordedAt: new Date().toISOString(),
      effectiveDate: todayLocal(),
      targetEventId: event.eventId,
      reason: t("Voided by the user in Investment Tracker"),
    };
    await this.store.appendEvent(voidEvent);
    await this.refreshViews();
  }

  private async loadMarketSeries(
    currency: Currency,
    start: string,
    asOf: string,
  ): Promise<{ market: MarketSeries | null; warning: string | null }> {
    const cache = new MarketCacheStore(this.app.vault, this.store.getMarketCachePath(currency));
    let market: MarketSeries | null = null;
    let fetchWarning: string | null = null;
    let cached: MarketSeries | null = null;
    try {
      cached = await cache.load(currency);
    } catch (error) {
      fetchWarning = error instanceof Error
        ? t("Unable to read market cache: {message}", { message: error.message })
        : t("Unable to read market cache");
    }
    if (this.settings.marketMode === "automatic") {
      if (
        cached?.origin === "automatic" &&
        cached.fetchedAt.slice(0, 10) === todayLocal() &&
        cacheCovers(cached, start, asOf)
      ) {
        market = cached;
      } else {
        try {
          market = await this.fredProvider.fetch(currency, start, asOf);
          fetchWarning = null;
        } catch (error) {
          fetchWarning = error instanceof Error
            ? t("Automatic market data failed: {message}", { message: error.message })
            : t("Automatic market data failed");
        }
      }
      if (market) {
        try {
          await cache.save(market);
        } catch (error) {
          const message = error instanceof Error ? error.message : t("Unknown error");
          market = {
            ...market,
            warnings: [...market.warnings, t("Latest market data was calculated, but the cache could not be saved: {message}", { message })],
          };
        }
      }
    }
    if (!market) market = cached;
    if (market && fetchWarning) {
      market = { ...market, warnings: [...market.warnings, t("{warning}; showing cached data", { warning: fetchWarning })] };
    }
    return { market, warning: fetchWarning };
  }

  async loadBenchmark(account: AccountState, events: LedgerEvent[], metrics: AccountMetrics): Promise<BenchmarkViewData> {
    if (account.benchmarkId === "none") return unavailableBenchmark(t("This account has no comparison benchmark"), t("No benchmark selected"));
    if (!metrics.asOf) return unavailableBenchmark(t("At least one asset valuation is required"));
    const flows = events
      .filter(
        (event): event is CashFlowEvent =>
          event.type === "cash-flow" && event.accountId === account.accountId && event.effectiveDate <= metrics.asOf!,
      )
      .map((event) => ({
        date: event.effectiveDate,
        direction: event.direction,
        amount: parseMoneyStrict(event.amount),
      }));
    const start = [...flows].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    if (!start) return unavailableBenchmark(t("No cash-flow records are available for the benchmark simulation"));

    const loaded = await this.loadMarketSeries(account.currency, start, metrics.asOf);
    const market = loaded.market;
    if (!market) {
      return unavailableBenchmark(loaded.warning ?? t("No local benchmark data is available; you can import a CSV in Settings"));
    }
    return calculateSameCashFlowBenchmark(
      flows,
      metrics.asOf,
      metrics.currentValue,
      metrics.xirr,
      account.currency,
      market,
    );
  }

  async loadAccountPerformanceBenchmark(
    account: AccountState,
    events: LedgerEvent[],
    metrics: AccountMetrics,
    performance: MonthlyPerformanceResult,
  ): Promise<PerformanceBenchmarkViewData> {
    const benchmark = await this.loadBenchmark(account, events, metrics);
    if (benchmark.result.status !== "ok") return { performance, result: benchmark.result };
    const flows = events
      .filter(
        (event): event is CashFlowEvent =>
          event.type === "cash-flow" && event.accountId === account.accountId,
      )
      .map((event) => ({
        date: event.effectiveDate,
        direction: event.direction,
        amount: parseMoneyStrict(event.amount),
      }));
    return {
      performance: applyBenchmarkToMonthlyPerformance(performance, benchmark.series, flows),
      result: benchmark.result,
    };
  }

  async loadPortfolioPerformanceBenchmark(
    snapshot: LedgerSnapshot,
    currency: Currency,
    performance: MonthlyPerformanceResult,
  ): Promise<PerformanceBenchmarkViewData> {
    const last = [...performance.rows].reverse().find((row) => row.closingValue !== null && row.valuationDate);
    if (!last?.valuationDate || last.closingValue === null) {
      const unavailable = unavailableBenchmark(t("At least one portfolio month-end valuation is required"));
      return { performance, result: unavailable.result };
    }
    const accountIds = new Set(
      snapshot.accounts
        .filter((account) => !account.archived && account.currency === currency)
        .map((account) => account.accountId),
    );
    const flows = snapshot.events
      .filter(
        (event): event is CashFlowEvent =>
          event.type === "cash-flow" &&
          accountIds.has(event.accountId) &&
          event.currency === currency &&
          event.effectiveDate <= last.valuationDate!,
      )
      .map((event) => ({
        date: event.effectiveDate,
        direction: event.direction,
        amount: parseMoneyStrict(event.amount),
      }));
    const start = [...flows].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    if (!start) {
      const unavailable = unavailableBenchmark(t("No cash-flow records are available for the portfolio benchmark simulation"));
      return { performance, result: unavailable.result };
    }
    const loaded = await this.loadMarketSeries(currency, start, last.valuationDate);
    if (!loaded.market) {
      const unavailable = unavailableBenchmark(loaded.warning ?? t("No local benchmark data is available; you can import a CSV in Settings"));
      return { performance, result: unavailable.result };
    }
    const portfolio = calculatePortfolioMetrics(snapshot.accounts, snapshot.events, currency);
    const benchmark = calculateSameCashFlowBenchmark(
      flows,
      last.valuationDate,
      last.closingValue,
      portfolio.xirr,
      currency,
      loaded.market,
    );
    return {
      performance: benchmark.result.status === "ok"
        ? applyBenchmarkToMonthlyPerformance(performance, benchmark.series, flows)
        : performance,
      result: benchmark.result,
    };
  }

  async saveSettings(): Promise<void> {
    if (!hasAutomaticLockRule(this.settings.lockOnLeave, this.settings.autoLockMinutes)) {
      this.settings.lockOnLeave = true;
    }
    setLanguageSetting(this.settings.language);
    await this.saveData(this.settings);
    this.touchActivity();
  }

  async hasAccounts(): Promise<boolean> {
    return (await this.store.loadSnapshot()).accounts.length > 0;
  }

  async exportJson(): Promise<string> {
    return this.store.exportJson(this.settings.baseCurrency);
  }

  async exportCsv(): Promise<string> {
    return this.store.exportCsv();
  }

  async importJson(payload: string): Promise<number> {
    return this.store.importJson(payload, this.settings.baseCurrency);
  }

  async importMarketCsv(payload: string): Promise<number> {
    const market = parseManualMarketCsv(payload, this.settings.baseCurrency);
    const cache = new MarketCacheStore(this.app.vault, this.store.getMarketCachePath(this.settings.baseCurrency));
    await this.store.initialize();
    await cache.save(market);
    return market.points.length;
  }

  async refreshViews(): Promise<void> {
    const views = this.app.workspace.getLeavesOfType(INVESTMENT_TRACKER_VIEW);
    await Promise.all(
      views.map(async (leaf) => {
        if (leaf.view instanceof InvestmentTrackerView) await leaf.view.refresh();
      }),
    );
  }

  openSettings(): void {
    const appWithSettings = this.app as typeof this.app & {
      setting: { open(): void; openTabById(id: string): void };
    };
    appWithSettings.setting.open();
    appWithSettings.setting.openTabById(this.manifest.id);
  }

  openSupportUrl(url: string): void {
    const allowedUrls = new Set([
      ISSUE_CHOOSER_URL,
      BUG_REPORT_URL,
      FEATURE_REQUEST_URL,
      PRIVATE_SECURITY_REPORT_URL,
    ]);
    if (!allowedUrls.has(url)) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async copySupportDiagnostics(): Promise<void> {
    const platform = Platform.isIosApp
      ? "Mobile / iOS"
      : Platform.isAndroidApp
        ? "Mobile / Android"
        : Platform.isWin
          ? "Desktop / Windows"
          : Platform.isLinux
            ? "Desktop / Linux"
            : Platform.isMacOS
              ? "Desktop / macOS"
              : Platform.isMobile
                ? "Mobile"
                : "Desktop";
    const diagnostics = buildSupportDiagnostics({
      pluginVersion: this.manifest.version,
      obsidianVersion: apiVersion,
      platform,
      locale: resolveLocale(),
    });
    try {
      await navigator.clipboard.writeText(diagnostics);
      new Notice(t("Diagnostic information copied"));
    } catch {
      new Notice(t("Could not copy diagnostic information"));
    }
  }
}

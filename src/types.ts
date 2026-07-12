export const SUPPORTED_CURRENCIES = ["USD", "GBP", "SGD", "CNY", "TWD", "JPY", "KRW", "EUR", "BRL"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const SUPPORTED_LOCALES = ["en", "zh", "zh-TW", "ja", "ko", "es", "de", "fr", "pt-BR"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LanguageSetting = "auto" | SupportedLocale;

export type BenchmarkId = "sp500" | "none";
export type AutoLockMinutes = 0 | 1 | 5 | 15 | 30;
export type LedgerSecurityState = "setup-required" | "locked" | "unlocked";

export interface PluginSettings {
  dataPath: string;
  baseCurrency: Currency;
  language: LanguageSetting;
  benchmarkId: BenchmarkId;
  marketMode: "automatic" | "manual";
  lockOnLeave: boolean;
  autoLockMinutes: AutoLockMinutes;
  schemaVersion: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  dataPath: "Investment Tracker Data",
  baseCurrency: "USD",
  language: "auto",
  benchmarkId: "sp500",
  marketMode: "automatic",
  lockOnLeave: true,
  autoLockMinutes: 5,
  schemaVersion: 4,
};

interface LedgerEventBase {
  schemaVersion: 1;
  eventId: string;
  recordedAt: string;
  effectiveDate: string;
  supersedesEventId?: string;
}

export interface AccountCreatedEvent extends LedgerEventBase {
  type: "account-created";
  accountId: string;
  name: string;
  currency: Currency;
  benchmarkId: BenchmarkId;
}

export interface AccountUpdatedEvent extends LedgerEventBase {
  type: "account-updated";
  accountId: string;
  name?: string;
  benchmarkId?: BenchmarkId;
  archived?: boolean;
}

export interface CashFlowEvent extends LedgerEventBase {
  type: "cash-flow";
  accountId: string;
  direction: "contribution" | "withdrawal";
  amount: string;
  currency: Currency;
  note?: string;
}

export interface ValuationEvent extends LedgerEventBase {
  type: "valuation";
  accountId: string;
  totalValue: string;
  currency: Currency;
  note?: string;
}

export interface EventVoidedEvent extends LedgerEventBase {
  type: "event-voided";
  targetEventId: string;
  reason?: string;
}

export type LedgerEvent =
  | AccountCreatedEvent
  | AccountUpdatedEvent
  | CashFlowEvent
  | ValuationEvent
  | EventVoidedEvent;

export interface AccountState {
  accountId: string;
  name: string;
  currency: Currency;
  benchmarkId: BenchmarkId;
  openedOn: string;
  archived: boolean;
}

export interface LedgerSnapshot {
  accounts: AccountState[];
  events: LedgerEvent[];
  warnings: string[];
}

export interface DatedAmount {
  date: string;
  amount: number;
}

export interface AccountMetrics {
  account: AccountState;
  asOf: string | null;
  currentValue: number;
  netContributions: number;
  cumulativeProfit: number;
  xirr: number | null;
  xirrStatus: "ok" | "insufficient-data" | "no-root" | "multiple-roots";
  warnings: string[];
}

export type AnnualReturnPeriod = "full-year" | "partial-year" | "ytd";
export type AnnualReturnQuality = "complete" | "estimated" | "partial";

export interface AnnualReturnResult {
  year: number;
  rate: number | null;
  startDate: string | null;
  endDate: string | null;
  period: AnnualReturnPeriod;
  quality: AnnualReturnQuality;
  needsOpeningValuation: boolean;
  suggestedOpeningDate?: string;
  status: "ok" | "insufficient-data" | "no-root" | "multiple-roots";
  details: string[];
}

export type MonthlyPerformanceStatus = "complete" | "partial" | "mtd" | "missing";

export interface MonthlyPerformanceRow {
  month: string;
  startDate: string;
  endDate: string;
  valuationDate: string | null;
  openingValue: number | null;
  closingValue: number | null;
  contributions: number;
  withdrawals: number;
  netFlow: number;
  returnRate: number | null;
  cumulativeReturn: number | null;
  benchmarkValue: number | null;
  benchmarkReturn: number | null;
  benchmarkCumulativeReturn: number | null;
  excessReturn: number | null;
  status: MonthlyPerformanceStatus;
  details: string[];
}

export interface MonthlyPerformanceResult {
  currency: Currency;
  rows: MonthlyPerformanceRow[];
  warnings: string[];
}

export interface MarketPoint {
  date: string;
  close: number;
}

export interface BenchmarkResult {
  status: "ok" | "unavailable";
  benchmarkId: BenchmarkId;
  asOf: string | null;
  virtualValue: number | null;
  xirr: number | null;
  excessValue: number | null;
  excessRate: number | null;
  sourceLabel: string;
  warnings: string[];
}

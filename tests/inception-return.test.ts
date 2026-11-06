import assert from "node:assert/strict";
import test from "node:test";
import type { AccountState, CashFlowEvent, LedgerEvent, ValuationEvent } from "../src/types";
import { canShowAnnualized, calculateInceptionReturn, displayedInceptionRate, inceptionPeriodReturn } from "../src/domain/inception-return";
import { calculateSameCashFlowBenchmark, type MarketSeries } from "../src/market/benchmark";
import { renderInceptionReturn } from "../src/ui/inception-return";
import { setLanguageSetting } from "../src/i18n";

const account: AccountState = { accountId: "synthetic", name: "Synthetic", currency: "USD", benchmarkId: "sp500", openedOn: "2023-08-01", archived: false };
const base = (date: string) => ({ schemaVersion: 1 as const, eventId: date, recordedAt: `${date}T00:00:00Z`, effectiveDate: date, accountId: account.accountId, currency: account.currency });
const contribution = (date: string, amount: string): CashFlowEvent => ({ ...base(date), type: "cash-flow", direction: "contribution", amount });
const valuation = (date: string, totalValue: string): ValuationEvent => ({ ...base(date), type: "valuation", totalValue });
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("annualization display requires strictly more than six calendar months", () => {
  assert.equal(canShowAnnualized("2025-01-01", "2025-06-30"), false);
  assert.equal(canShowAnnualized("2025-01-01", "2025-07-01"), false);
  assert.equal(canShowAnnualized("2025-01-01", "2025-07-02"), true);
  assert.equal(canShowAnnualized("2025-08-31", "2026-02-28"), false);
  assert.equal(canShowAnnualized("2025-08-31", "2026-03-01"), true);
  assert.equal(canShowAnnualized("2023-08-31", "2024-02-29"), false);
  assert.equal(canShowAnnualized("2023-08-31", "2024-03-01"), true);
  assert.equal(canShowAnnualized("2025-02-30", "2026-01-01"), false);
  assert.equal(canShowAnnualized(null, "2026-01-01"), false);
  assert.equal(canShowAnnualized("2026-01-01", "2025-01-01"), false);
});

test("inception uses actual contribution and valuation dates, including partial initial year and YTD", () => {
  const period = calculateInceptionReturn([account], [contribution("2023-08-01", "100"), valuation("2026-08-01", "133.1")], "USD", account);
  assert.equal(period.startDate, "2023-08-01");
  assert.equal(period.endDate, "2026-08-01");
  assert.equal(period.days, 1096);
  assert.equal(period.annualizationEligible, true);
  close(displayedInceptionRate(period), Math.pow(1.331, 365 / 1096) - 1);
});

test("eight-month history annualizes all days even without any complete calendar year", () => {
  const period = calculateInceptionReturn([account], [contribution("2025-08-01", "100"), valuation("2026-04-01", "108")], "USD", account);
  assert.equal(period.annualizationEligible, true);
  assert.equal(period.days, 243);
  close(displayedInceptionRate(period), Math.pow(1.08, 365 / 243) - 1);
  for (const benchmarkId of ["sp500", "nasdaq100"] as const) {
    const market: MarketSeries = { benchmarkId, currency: "USD", points: [{ date: "2025-08-01", close: 100 }, { date: "2026-04-01", close: 108 }], sourceLabel: "Synthetic", fetchedAt: "2026-04-01", warnings: [], origin: "manual" };
    const result = calculateSameCashFlowBenchmark(period.flows, period.endDate!, 108, period.xirr, "USD", market).result;
    close(displayedInceptionRate(period, result), period.xirr!);
  }
});

test("short periods display Modified Dietz, not inflated annualized XIRR", () => {
  const period = calculateInceptionReturn([account], [contribution("2025-01-01", "100"), valuation("2025-04-01", "105")], "USD", account);
  assert.equal(period.annualizationEligible, false);
  assert.ok(period.xirr !== null && period.xirr > 0.2);
  close(displayedInceptionRate(period), 0.05);
});

test("six-month gate starts at the first actual investment, not account creation or current date", () => {
  const period = calculateInceptionReturn([account], [contribution("2026-06-01", "100"), valuation("2026-08-01", "105")], "USD", account);
  assert.equal(period.startDate, "2026-06-01");
  assert.equal(period.annualizationEligible, false);
});

test("Modified Dietz accounts for dated contributions and withdrawals and permits total loss", () => {
  const flows = [{ date: "2025-01-01", direction: "contribution" as const, amount: 100 }, { date: "2025-01-06", direction: "contribution" as const, amount: 50 }];
  close(inceptionPeriodReturn(flows, "2025-01-11", 165), 0.12);
  close(inceptionPeriodReturn([{ ...flows[0]! }, { ...flows[1]!, direction: "withdrawal", amount: 20 }], "2025-01-11", 90), 10 / 90);
  close(inceptionPeriodReturn([flows[0]!], "2025-01-11", 0), -1);
  assert.equal(inceptionPeriodReturn(flows, "2025-01-01", 150), null);
  assert.equal(inceptionPeriodReturn([{ ...flows[0]!, amount: -100 }], "2025-01-11", 110), null);
});

test("own account and both indices use identical amounts, dates and XIRR methodology", () => {
  const period = calculateInceptionReturn([account], [contribution("2025-01-01", "100"), contribution("2025-07-01", "50"), valuation("2026-01-01", "165")], "USD", account);
  const market: MarketSeries = { benchmarkId: "sp500", currency: "USD", points: [{ date: "2025-01-01", close: 100 }, { date: "2025-07-01", close: 100 }, { date: "2026-01-01", close: 110 }], sourceLabel: "Synthetic", fetchedAt: "2026-01-01", warnings: [], origin: "manual" };
  for (const benchmarkId of ["sp500", "nasdaq100"] as const) {
    const result = calculateSameCashFlowBenchmark(period.flows, period.endDate!, 165, period.xirr, "USD", { ...market, benchmarkId }).result;
    close(result.virtualValue, 165);
    close(displayedInceptionRate(period, result), period.xirr!);
    close(result.excessRate, 0);
  }
});

test("both short-period benchmarks are also withheld from annualization", () => {
  const period = calculateInceptionReturn([account], [contribution("2025-01-01", "100"), valuation("2025-04-01", "105")], "USD", account);
  const market: MarketSeries = { benchmarkId: "sp500", currency: "USD", points: [{ date: "2025-01-01", close: 100 }, { date: "2025-04-01", close: 105 }], sourceLabel: "Synthetic", fetchedAt: "2025-04-01", warnings: [], origin: "manual" };
  for (const benchmarkId of ["sp500", "nasdaq100"] as const) {
    const result = calculateSameCashFlowBenchmark(period.flows, period.endDate!, 105, period.xirr, "USD", { ...market, benchmarkId }).result;
    assert.ok(result.xirr! > 0.2);
    close(displayedInceptionRate(period, result), 0.05);
  }
});

test("future cash flows and other currencies are never included in the selected period", () => {
  const events: LedgerEvent[] = [contribution("2025-01-01", "100"), valuation("2025-04-01", "105"), contribution("2025-05-01", "1000"), { ...contribution("2024-01-01", "1000"), currency: "SGD" }];
  const period = calculateInceptionReturn([account], events, "USD", account);
  assert.equal(period.flows.length, 1);
  assert.equal(period.startDate, "2025-01-01");
  assert.equal(period.endDate, "2025-04-01");
  close(displayedInceptionRate(period), 0.05);
});

test("portfolio compares only active same-currency accounts with aligned valuations", () => {
  const second = { ...account, accountId: "second" };
  const events: LedgerEvent[] = [contribution("2025-01-01", "100"), valuation("2026-01-01", "110"), { ...contribution("2025-01-01", "100"), accountId: "second" }, { ...valuation("2026-01-01", "110"), accountId: "second" }];
  const period = calculateInceptionReturn([account, second, { ...account, accountId: "archived", archived: true }, { ...account, accountId: "sgd", currency: "SGD" }], events, "USD");
  assert.equal(period.flows.length, 2);
  close(displayedInceptionRate(period), 0.1);
  const misaligned = calculateInceptionReturn([account, second], events.map((event) => event.type === "valuation" && event.accountId === "second" ? { ...event, effectiveDate: "2025-12-31" } : event), "USD");
  assert.equal(misaligned.endDate, null);
  assert.equal(displayedInceptionRate(misaligned), null);
  assert.equal(misaligned.flows.length, 0);
});

test("missing contributions, missing valuations, and non-unique annualized rates stay unavailable", () => {
  assert.equal(displayedInceptionRate(calculateInceptionReturn([account], [valuation("2026-01-01", "110")], "USD", account)), null);
  assert.equal(displayedInceptionRate(calculateInceptionReturn([account], [contribution("2025-01-01", "100")], "USD", account)), null);
  const period = calculateInceptionReturn([account], [contribution("2023-01-01", "100"), { ...contribution("2024-01-01", "230"), direction: "withdrawal" }, contribution("2025-01-01", "132"), valuation("2025-01-01", "0")], "USD", account);
  assert.equal(period.annualizationEligible, true);
  assert.equal(period.xirr, null);
  assert.equal(displayedInceptionRate(period), null);
});

class SyntheticElement {
  children: SyntheticElement[] = [];
  text = "";
  cls = "";
  createDiv(options: { text?: string; cls?: string } = {}): SyntheticElement {
    const child = new SyntheticElement();
    child.text = options.text ?? "";
    child.cls = options.cls ?? "";
    this.children.push(child);
    return child;
  }
  createEl(_tag: string, options: { text?: string; cls?: string }): SyntheticElement { return this.createDiv(options); }
  all(): SyntheticElement[] { return [this, ...this.children.flatMap((child) => child.all())]; }
}

test("short-period UI shows all three period cards and no annualized numerical value", () => {
  setLanguageSetting("en");
  const period = calculateInceptionReturn([account], [contribution("2025-01-01", "100"), valuation("2025-04-01", "105")], "USD", account);
  const root = new SyntheticElement();
  renderInceptionReturn(root as unknown as HTMLElement, period, undefined, undefined, true);
  const labels = root.all().filter((item) => item.cls === "investment-tracker-metric-label").map((item) => item.text);
  assert.deepEqual(labels, ["My period return", "S&P 500 period return", "Nasdaq-100 period return"]);
  assert.equal(root.all().filter((item) => item.text === "Not annualized yet").length, 1);
  assert.ok(root.all().some((item) => item.text === "+5.00%"));
  assert.ok(root.all().some((item) => item.text.includes("90 days")));
});

test("annualized UI preserves unavailable benchmarks, opt-out and short-history warning", () => {
  const period = calculateInceptionReturn([account], [contribution("2025-01-01", "100"), valuation("2025-07-02", "105")], "USD", account);
  const benchmark = calculateSameCashFlowBenchmark(period.flows, period.endDate!, 105, period.xirr, "USD", {
    benchmarkId: "sp500", currency: "USD", points: [], sourceLabel: "Synthetic", fetchedAt: "2025-07-02", warnings: [], origin: "manual",
  }).result;
  const root = new SyntheticElement();
  renderInceptionReturn(root as unknown as HTMLElement, period, benchmark, undefined, false);
  assert.equal(root.all().filter((item) => item.cls === "investment-tracker-metric-label").length, 2);
  assert.ok(root.all().some((item) => item.text === "Benchmark unavailable"));
  assert.ok(root.all().some((item) => item.text.startsWith("Less than one year of history")));
  assert.ok(!root.all().some((item) => item.text.startsWith("Excess vs")));
});

test("benchmark UI discloses the last actual trading close when valuation is on a weekend", () => {
  const period = calculateInceptionReturn([account], [contribution("2025-01-01", "100"), valuation("2026-01-03", "110")], "USD", account);
  const benchmark = calculateSameCashFlowBenchmark(period.flows, period.endDate!, 110, period.xirr, "USD", {
    benchmarkId: "sp500", currency: "USD", points: [{ date: "2025-01-01", close: 100 }, { date: "2026-01-02", close: 110 }], sourceLabel: "Synthetic", fetchedAt: "2026-01-03", warnings: [], origin: "manual",
  }).result;
  const root = new SyntheticElement();
  renderInceptionReturn(root as unknown as HTMLElement, period, benchmark);
  assert.ok(root.all().some((item) => item.cls === "investment-tracker-metric-hint" && item.text.startsWith("XIRR · Data as of")));
});

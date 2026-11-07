import assert from "node:assert/strict";
import test from "node:test";
import { InvestmentTrackerView } from "../src/ui/view";
import { DEFAULT_SETTINGS } from "../src/types";
import { setLanguageSetting } from "../src/i18n";
import { renderLinkedReturn } from "../src/ui/linked-return";
import { calculateLinkedReport } from "../src/domain/linked-return";
import { formatSignedRate } from "../src/ui/components";

// Exercise the production view and async privacy guards without a real vault.
class Element {
  children: Element[] = [];
  text = "";
  cls = "";
  isConnected = true;
  attrs: Record<string, string> = {};
  handlers: Record<string, () => void> = {};
  style: Record<string, string> = {};
  classList = { add: (...names: string[]) => this.addClass(...names), remove: (..._names: string[]) => {}, toggle: (_name: string, _force: boolean) => {} };
  set textContent(value: string) { this.text = value; }
  appendChild(node: Element) { this.children.push(node); return node; }
  getAttribute(name: string) { return this.attrs[name]; }
  createEl(_tag: string, options: any = {}) { const node = new Element(); node.text = options.text ?? ""; node.cls = options.cls ?? ""; node.attrs = options.attr ?? {}; this.children.push(node); return node; }
  createDiv(options: any = {}) { return this.createEl("div", options); }
  createSpan(options: any = {}) { return this.createEl("span", options); }
  addEventListener(name: string, callback: () => void) { this.handlers[name] = callback; }
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  addClass(...names: string[]) { this.cls += " " + names.join(" "); }
  empty() { for (const node of this.all().slice(1)) node.isConnected = false; this.children = []; }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
  querySelector(_selector: string) { return this.all().find(node => node.attrs["data-year-filter"]); }
  focus() {}
}
test("yearly chart and table render the same three return series and respect Nasdaq opt-out", () => {
  setLanguageSetting("en");
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElementNS: () => new Element() } });
  try {
    const account = { accountId: "synthetic", name: "Synthetic", currency: "USD" as const, benchmarkId: "sp500" as const, openedOn: "2024-01-01", archived: false };
    const dates = ["2024-01-01", "2024-12-31", "2025-12-31"];
    const events = dates.map((date, i) => ({ schemaVersion: 1 as const, type: "valuation" as const, eventId: date, recordedAt: date, effectiveDate: date, accountId: account.accountId, currency: account.currency, totalValue: ["100", "120", "108"][i]! }));
    const report = calculateLinkedReport([account], events, "USD", "2026-10-05");
    const market = { benchmarkId: "sp500" as const, currency: "USD" as const, points: dates.map((date, i) => ({ date, close: [100, 110, 121][i]! })), sourceLabel: "Synthetic", fetchedAt: "2026-10-05", warnings: [], origin: "manual" as const };
    const root = new Element();
    renderLinkedReturn(root as unknown as HTMLElement, report, { sp500: market, nasdaq100: { ...market, benchmarkId: "nasdaq100" } }, true, true);
    assert.equal(root.all().filter(n => n.cls === "investment-tracker-chart-legend-button").length, 3);
    assert.equal(root.all().filter(n => n.attrs.class?.includes("investment-tracker-chart-bar")).length, 6);
    assert.ok(root.all().some(n => n.text === "+20.00%"));
    assert.ok(root.all().some(n => n.text === "−10.00%"));
    assert.ok(root.all().some(n => n.text === "+10.00%"));
    assert.ok(root.all().some(n => n.attrs.style === "overflow-x: auto"));
    assert.ok(!root.all().some(n => n.text === "2025 YTD"));
    const noNasdaq = new Element();
    renderLinkedReturn(noNasdaq as unknown as HTMLElement, report, { sp500: market }, false);
    assert.ok(!noNasdaq.all().some(n => n.text.includes("Nasdaq")));
    assert.ok(root.all().some(n => n.text === "Annual money-weighted return"));
    assert.ok(!root.all().some(n => n.cls === "investment-tracker-metric-value"));
    const flowEvents = [
      { ...events[0]!, effectiveDate: "2025-01-01", totalValue: "100" },
      { ...events[0]!, effectiveDate: "2025-07-01", totalValue: "220" },
      { ...events[0]!, effectiveDate: "2025-12-31", totalValue: "198" },
      { ...events[0]!, type: "cash-flow" as const, effectiveDate: "2025-07-01", direction: "contribution" as const, amount: "100" },
    ];
    const mixed = calculateLinkedReport([account], flowEvents, "USD", "2026-10-06");
    const annual = new Element(), linked = new Element();
    renderLinkedReturn(annual as unknown as HTMLElement, mixed, {}, false, true);
    renderLinkedReturn(linked as unknown as HTMLElement, mixed, {}, false, false);
    assert.ok(annual.all().some(n => n.text === formatSignedRate(mixed.years[0]!.moneyWeightedRate!)));
    assert.ok(!annual.all().some(n => n.text === "+8.00%"));
    assert.ok(linked.all().some(n => n.text === "+8.00%"));
    assert.ok(linked.all().some(n => n.text === "Linked period return"));
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

function marketLoaderView() {
  const pending: Array<{ markets: (value: any) => void; benchmark: (value: any) => void }> = [];
  const controller: any = {
    settings: DEFAULT_SETTINGS,
    loadLinkedMarkets: () => new Promise((resolve) => { pending.push({ markets: resolve, benchmark: () => {} }); }),
  };
  const view: any = new InvestmentTrackerView({} as any, controller);
  let redraws = 0;
  view.renderPreservingScroll = () => { redraws++; };
  view.financialValuesVisible = true;
  view.selectedAccountId = "synthetic";
  const snapshot = { accounts: [], events: [], warnings: [] };
  let finishBenchmark: (value: any) => void = () => {};
  const load = () => view.ensureMarketData("account:synthetic", snapshot, "USD", { start: "2025-12-31", end: "2026-10-31" },
    () => new Promise((resolve) => { finishBenchmark = resolve; }), () => view.selectedAccountId === "synthetic");
  return { view, load, pending, finishBenchmark: (value: any) => finishBenchmark(value), redraws: () => redraws };
}

test("index data arriving after values are hidden or the page changes does not redraw figures", async () => {
  for (const change of ["mask", "leave"] as const) {
    const { view, load, pending, finishBenchmark, redraws } = marketLoaderView();
    const cache = load();
    if (change === "mask") view.financialValuesVisible = false;
    else view.selectedAccountId = null;
    pending[0]!.markets({});
    finishBenchmark({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(redraws(), 0);
    assert.equal(cache.marketsDone, true);
  }
});

test("index data is loaded once per page and redraws that page when it arrives", async () => {
  const { load, pending, finishBenchmark, redraws } = marketLoaderView();
  const first = load();
  assert.equal(load(), first);
  assert.equal(pending.length, 1);
  pending[0]!.markets({});
  finishBenchmark({});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(redraws(), 2);
  assert.equal(first.benchmarkDone, true);
});

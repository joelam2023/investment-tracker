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
function setup(missing = false) {
  setLanguageSetting("en");
  const account = { accountId: "synthetic", name: "Synthetic", currency: "USD", benchmarkId: "sp500", openedOn: "2023-08-01", archived: false };
  const event = (date: string, amount: string, type: string) => ({ schemaVersion: 1, eventId: date, recordedAt: date, effectiveDate: date, accountId: account.accountId, currency: "USD", type, ...(type === "valuation" ? { totalValue: amount } : { amount, direction: "contribution" }) });
  const events = [event("2023-08-01", "100", "cash-flow"), ...(!missing ? [event("2024-01-01", "150", "valuation")] : []), event("2024-12-31", "160", "valuation"), event("2025-12-31", "180", "valuation"), event("2026-05-31", "190", "valuation")];
  let loads = 0;
  const pending: ((value: any) => void)[] = [];
  const controller: any = { settings: DEFAULT_SETTINGS, loadLinkedMarkets: () => { loads++; return new Promise(r => { pending.push(r); }); } };
  const view: any = new InvestmentTrackerView({} as any, controller);
  view.financialValuesVisible = true;
  const root = new Element();
  const render = () => view.renderPerformanceCenter(root, { currency: "USD", rows: [], warnings: [] }, { accounts: [account], events, warnings: [] }, account, "Synthetic", [], [], []);
  render();
  const toggle = () => root.all().find(node => node.attrs["data-year-filter"])!.handlers.click!();
  return { root, view, render, toggle, loads: () => loads, finish: () => pending[0]?.({}) };
}

test("year filter toggles linked returns and accepts a January 1 boundary", async () => {
  const { root, toggle, loads, finish } = setup();
  assert.ok(root.all().some(n => n.text === "Linked annualized return"));
  assert.equal(loads(), 1);
  assert.equal(root.querySelector("")!.attrs["aria-pressed"], "false");
  toggle();
  assert.equal(loads(), 2);
  assert.equal(root.querySelector("")!.attrs["aria-pressed"], "true");
  assert.ok(root.querySelector("")!.cls.includes("investment-tracker-performance-option"));
  assert.ok(root.all().some(n => n.text === "Excluded years: 2023, 2026"));
  assert.ok(root.all().some(n => n.text === "My annualized return"));
  finish(); await Promise.resolve();
  toggle();
  assert.equal(root.querySelector("")!.attrs["aria-pressed"], "false");
  assert.ok(root.all().some(n => n.text === "Linked annualized return"));
});

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

test("estimated boundaries show source dates and retain valid returns and comparisons", () => {
  const { root, toggle, loads } = setup(true);
  toggle();
  assert.equal(loads(), 2);
  assert.ok(root.all().some(n => n.text.includes("Estimated boundary 2023-12-31: carried from 2023-08-01")));
  assert.ok(root.all().some(n => n.text === "+12.50%"));
  assert.ok(!root.all().some(n => n.text.startsWith("Some selected periods are unavailable")));
});

test("late benchmark responses cannot reveal figures after masking or replace a different report", async () => {
  for (const hide of [true, false]) {
    const { root, view, render, toggle, finish } = setup();
    toggle();
    if (hide) { view.financialValuesVisible = false; render(); } else toggle();
    const before = root.all().map(n => n.text).join("\n");
    finish(); await Promise.resolve();
    assert.equal(root.all().map(n => n.text).join("\n"), before);
    if (hide) assert.equal(root.all().filter(n => n.cls === "investment-tracker-metric-value").length, 0);
  }
});

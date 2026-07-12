import { TFile, normalizePath } from "obsidian";
import type { Vault } from "obsidian";
import type { Currency, MarketPoint } from "../types";
import { SUPPORTED_CURRENCIES } from "../types";
import type { MarketSeries } from "./benchmark";
import { fredMarketMetadata } from "./fred-provider";
import { t } from "../i18n";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrictDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validateMarketSeries(value: unknown): MarketSeries {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error(t("Invalid market cache version"));
  if (typeof value.currency !== "string" || !(SUPPORTED_CURRENCIES as readonly string[]).includes(value.currency)) {
    throw new Error(t("Invalid market currency"));
  }
  if (!Array.isArray(value.points)) throw new Error(t("Invalid market data format"));
  const points: MarketPoint[] = value.points.map((point) => {
    if (
      !isRecord(point) ||
      typeof point.date !== "string" ||
      !isStrictDate(point.date) ||
      typeof point.close !== "number" ||
      !Number.isFinite(point.close) ||
      point.close <= 0
    ) {
      throw new Error(t("Invalid market data point"));
    }
    return { date: point.date, close: point.close };
  });
  if (typeof value.sourceLabel !== "string" || typeof value.fetchedAt !== "string") {
    throw new Error(t("Invalid market data source"));
  }
  if (!Array.isArray(value.warnings) || !value.warnings.every((warning) => typeof warning === "string")) {
    throw new Error(t("Invalid market warning format"));
  }
  if (value.origin !== "automatic" && value.origin !== "manual") throw new Error(t("Invalid market source type"));
  return {
    currency: value.currency as Currency,
    points: points.sort((a, b) => a.date.localeCompare(b.date)),
    sourceLabel: value.sourceLabel,
    fetchedAt: value.fetchedAt,
    warnings: value.warnings,
    origin: value.origin,
  };
}

function localizedMetadata(series: MarketSeries): MarketSeries {
  if (series.origin === "automatic") return { ...series, ...fredMarketMetadata(series.currency) };
  return {
    ...series,
    sourceLabel: t("Manually imported S&P 500 benchmark · {currency}", { currency: series.currency }),
    warnings: [t("You are responsible for verifying whether manually imported data uses a price-return or total-return basis")],
  };
}

export function parseManualMarketCsv(text: string, currency: Currency): MarketSeries {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(t("CSV must contain a header and at least one data row"));
  const header = lines[0]?.split(",").map((value) => value.trim().toLowerCase()) ?? [];
  const dateIndex = header.findIndex((value) => value === "date" || value === "observation_date");
  const closeIndex = header.findIndex((value) => value === "close" || value === "value" || value === "sp500");
  if (dateIndex < 0 || closeIndex < 0) throw new Error(t("CSV header must contain date and close columns"));
  const points: MarketPoint[] = [];
  for (const line of lines.slice(1)) {
    const columns = line.split(",").map((value) => value.trim());
    const date = columns[dateIndex];
    const rawClose = columns[closeIndex];
    if (!date || !rawClose || !isStrictDate(date)) throw new Error(t("Invalid CSV row: {row}", { row: line }));
    const close = Number(rawClose);
    if (!Number.isFinite(close) || close <= 0) throw new Error(t("Invalid close value: {value}", { value: rawClose }));
    points.push({ date, close });
  }
  const deduplicated = new Map(points.map((point) => [point.date, point]));
  return {
    currency,
    points: [...deduplicated.values()].sort((a, b) => a.date.localeCompare(b.date)),
    sourceLabel: t("Manually imported S&P 500 benchmark · {currency}", { currency }),
    fetchedAt: new Date().toISOString(),
    warnings: [t("You are responsible for verifying whether manually imported data uses a price-return or total-return basis")],
    origin: "manual",
  };
}

export function mergeCompatibleMarketSeries(prior: MarketSeries | null, next: MarketSeries): MarketSeries {
  if (
    !prior ||
    prior.currency !== next.currency ||
    prior.origin !== next.origin
  ) {
    return next;
  }
  const merged = new Map([...prior.points, ...next.points].map((point) => [point.date, point]));
  return {
    ...next,
    points: [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)),
    warnings: [...new Set([...prior.warnings, ...next.warnings])],
  };
}

export class MarketCacheStore {
  constructor(
    private readonly vault: Vault,
    private readonly path: string,
  ) {}

  async load(expectedCurrency?: Currency): Promise<MarketSeries | null> {
    const file = this.vault.getAbstractFileByPath(normalizePath(this.path));
    if (!(file instanceof TFile)) return null;
    const series = validateMarketSeries(JSON.parse(await this.vault.cachedRead(file)) as unknown);
    if (expectedCurrency && series.currency !== expectedCurrency) {
      throw new Error(t("Market cache currency {currency} does not match expected currency {expectedCurrency}", {
        currency: series.currency,
        expectedCurrency,
      }));
    }
    return localizedMetadata(series);
  }

  async save(series: MarketSeries): Promise<void> {
    let validated = validateMarketSeries({ schemaVersion: 1, ...series });
    const path = normalizePath(this.path);
    const prior = await this.load(series.currency);
    validated = mergeCompatibleMarketSeries(prior, validated);
    const content = JSON.stringify({ schemaVersion: 1, ...validated }, null, 2);
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.vault.process(existing, () => content);
      return;
    }
    if (existing) throw new Error(t("Market cache path is occupied by a folder: {path}", { path }));
    try {
      await this.vault.create(path, content);
    } catch (error) {
      const raced = this.vault.getAbstractFileByPath(path);
      if (!(raced instanceof TFile)) throw error;
      await this.vault.process(raced, () => content);
    }
  }
}

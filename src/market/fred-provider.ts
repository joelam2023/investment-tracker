import { requestUrl } from "obsidian";
import { t } from "../i18n";
import type { Currency, MarketPoint } from "../types";
import type { MarketSeries } from "./benchmark";

export type FredQuoteDirection = "identity" | "multiply" | "divide";

export type FredCurrencyConfig =
  | Readonly<{ seriesId: null; quoteDirection: "identity" }>
  | Readonly<{ seriesId: string; quoteDirection: Exclude<FredQuoteDirection, "identity"> }>;

export const FRED_CURRENCY_CONFIG = {
  USD: { seriesId: null, quoteDirection: "identity" },
  GBP: { seriesId: "DEXUSUK", quoteDirection: "divide" },
  SGD: { seriesId: "DEXSIUS", quoteDirection: "multiply" },
  CNY: { seriesId: "DEXCHUS", quoteDirection: "multiply" },
  TWD: { seriesId: "DEXTAUS", quoteDirection: "multiply" },
  JPY: { seriesId: "DEXJPUS", quoteDirection: "multiply" },
  KRW: { seriesId: "DEXKOUS", quoteDirection: "multiply" },
  EUR: { seriesId: "DEXUSEU", quoteDirection: "divide" },
  BRL: { seriesId: "DEXBZUS", quoteDirection: "multiply" },
} as const satisfies Record<Currency, FredCurrencyConfig>;

export const MAX_FX_AGE_DAYS = 7;
const DAY_MS = 86_400_000;

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isoDateTimestamp(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  return timestamp;
}

export function convertUsdPriceToCurrency(
  usdPrice: number,
  fxRate: number | null | undefined,
  quoteDirection: FredQuoteDirection,
): number | null {
  if (!isPositiveFinite(usdPrice)) return null;
  if (quoteDirection === "identity") return usdPrice;
  if (!isPositiveFinite(fxRate)) return null;
  const converted = quoteDirection === "multiply" ? usdPrice * fxRate : usdPrice / fxRate;
  return isPositiveFinite(converted) ? converted : null;
}

export function findExchangeRateAtOrBefore(
  points: readonly MarketPoint[],
  date: string,
  maxAgeDays = MAX_FX_AGE_DAYS,
): MarketPoint | undefined {
  const targetTimestamp = isoDateTimestamp(date);
  if (targetTimestamp === null || !Number.isInteger(maxAgeDays) || maxAgeDays < 0) return undefined;

  let match: MarketPoint | undefined;
  let matchTimestamp = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const pointTimestamp = isoDateTimestamp(point.date);
    if (pointTimestamp === null || !isPositiveFinite(point.close) || pointTimestamp > targetTimestamp) continue;
    const ageDays = (targetTimestamp - pointTimestamp) / DAY_MS;
    if (ageDays > maxAgeDays || pointTimestamp <= matchTimestamp) continue;
    match = point;
    matchTimestamp = pointTimestamp;
  }
  return match;
}

export function parseFredCsv(text: string): MarketPoint[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(t("FRED returned empty data."));
  const points: MarketPoint[] = [];
  for (const line of lines.slice(1)) {
    const [date, rawValue] = line.split(",");
    const timestamp = date ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== date ||
      !rawValue ||
      rawValue === "."
    ) continue;
    const close = Number(rawValue);
    if (Number.isFinite(close) && close > 0) points.push({ date, close });
  }
  if (points.length === 0) throw new Error(t("FRED returned no usable data."));
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export function fredMarketMetadata(currency: Currency): Pick<MarketSeries, "sourceLabel" | "warnings"> {
  const config = FRED_CURRENCY_CONFIG[currency];
  const warnings = [
    t(
      "The FRED SP500 series is a price index that excludes dividends, and its daily history usually covers only the most recent 10 years. Import your own CSV data for a total-return benchmark.",
    ),
  ];
  let conversionLabel = "USD";
  if (config.quoteDirection !== "identity") {
    conversionLabel = t("USD → {currency}", { currency });
    const quote = config.quoteDirection === "multiply"
      ? t("{currency} per USD", { currency })
      : t("USD per {currency}", { currency });
    warnings.push(
      t(
        "Exchange rates use FRED {seriesId} ({quote}, Federal Reserve H.10 New York noon buying rate); timing may differ from the S&P 500 close.",
        { seriesId: config.seriesId, quote },
      ),
    );
  }
  return {
    sourceLabel: t("S&P 500 Price Index · FRED · {conversionLabel}", { conversionLabel }),
    warnings,
  };
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

async function fetchFred(seriesId: string, start: string, end: string): Promise<MarketPoint[]> {
  const params = new URLSearchParams({ id: seriesId, cosd: start, coed: end });
  const response = await requestUrl({
    url: `https://fred.stlouisfed.org/graph/fredgraph.csv?${params.toString()}`,
    method: "GET",
    headers: { Accept: "text/csv" },
    throw: false,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(t("FRED request failed (HTTP {status}).", { status: response.status }));
  }
  return parseFredCsv(response.text);
}

export class FredSp500Provider {
  async fetch(currency: Currency, start: string, end: string): Promise<MarketSeries> {
    const paddedStart = addDays(start, -10);
    const sp500 = await fetchFred("SP500", paddedStart, end);
    const config = FRED_CURRENCY_CONFIG[currency];
    let points: MarketPoint[];
    const metadata = fredMarketMetadata(currency);
    if (config.quoteDirection === "identity") {
      points = sp500.filter((point) => point.date >= start);
    } else {
      const fx = await fetchFred(config.seriesId, paddedStart, end);
      points = sp500
        .map((point) => {
          const fxPoint = findExchangeRateAtOrBefore(fx, point.date);
          if (!fxPoint) return null;
          const close = convertUsdPriceToCurrency(point.close, fxPoint.close, config.quoteDirection);
          return close === null ? null : { date: point.date, close };
        })
        .filter((point): point is MarketPoint => point !== null && point.date >= start);
    }
    if (points.length === 0) {
      throw new Error(t("No S&P 500 or historical exchange-rate data covers the requested dates."));
    }
    return {
      currency,
      points,
      sourceLabel: metadata.sourceLabel,
      fetchedAt: new Date().toISOString(),
      warnings: metadata.warnings,
      origin: "automatic",
    };
  }
}

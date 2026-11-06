import type { AnnualReturnResult, BenchmarkAnnualReturn } from "../types";

export type CompoundRange = "1y" | "3y" | "all";
export interface CompoundResult {
  rate: number | null;
  years: number[];
  invalidYears: number[];
  estimated: boolean;
}

function strictDate(date: string): boolean {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === date;
}

/** Select a continuous calendar-year span independently of data availability. */
export function compoundYears(openedOn: string | null, today: string, range: CompoundRange): number[] {
  if (!openedOn || !strictDate(openedOn) || !strictDate(today) || openedOn > today) return [];
  const openingYear = Number(openedOn.slice(0, 4));
  const first = openedOn === `${openingYear}-01-01` ? openingYear : openingYear + 1;
  const last = Number(today.slice(0, 4)) - 1;
  const start = Math.max(first, range === "1y" ? last : range === "3y" ? last - 2 : first);
  return Array.from({ length: Math.max(0, last - start + 1) }, (_, index) => start + index);
}

/** Geometric average of annual holding-period returns, NOT annual XIRRs or TWR. */
export function geometricAnnualRate(rates: readonly number[]): number | null {
  if (!rates.length || rates.some((rate) => !Number.isFinite(rate) || rate < -1)) return null;
  if (rates.some((rate) => rate === -1)) return -1;
  const result = Math.expm1(rates.reduce((sum, rate) => sum + Math.log1p(rate), 0) / rates.length);
  return Number.isFinite(result) ? result : null;
}

export function calculateAnnualCompound(rows: readonly AnnualReturnResult[], years: number[]): CompoundResult {
  const selected = years.map((year) => rows.filter((row) => row.year === year));
  const invalidYears = years.filter((year, index) => {
    const matches = selected[index]!;
    const row = matches[0];
    return matches.length !== 1 || !row || row.period !== "full-year" || row.quality === "partial" ||
      row.status !== "ok" || row.rate === null || !Number.isFinite(row.rate) || row.rate < -1 ||
      row.startDate !== `${year}-01-01` || !row.endDate || !strictDate(row.endDate) ||
      row.endDate < `${year}-12-01` || row.endDate > `${year}-12-31`;
  });
  const ordered = years.length > 0 && years.every((year, index) => Number.isInteger(year) && (index === 0 || year === years[index - 1]! + 1));
  return {
    years: [...years], invalidYears: ordered ? invalidYears : [...years],
    rate: ordered && !invalidYears.length ? geometricAnnualRate(selected.map((matches) => matches[0]!.rate!)) : null,
    estimated: selected.some((matches) => matches[0]?.quality === "estimated"),
  };
}

/** Use exactly the portfolio's span and period boundaries; never drop missing years. */
export function calculateBenchmarkCompound(
  rows: readonly BenchmarkAnnualReturn[], actualRows: readonly AnnualReturnResult[], years: number[],
): CompoundResult {
  const actual = calculateAnnualCompound(actualRows, years);
  const selected = years.map((year) => rows.filter((row) => row.year === year));
  const invalidYears = years.filter((year, index) => {
    const matches = selected[index]!, row = matches[0], actualRow = actualRows.find((item) => item.year === year);
    return matches.length !== 1 || !row || row.rate === null || !Number.isFinite(row.rate) || row.rate < -1 ||
      row.startDate !== actualRow?.startDate || row.endDate !== actualRow?.endDate;
  });
  return {
    years: [...years], invalidYears: [...new Set([...actual.invalidYears, ...invalidYears])], estimated: actual.estimated,
    rate: actual.rate !== null && !invalidYears.length ? geometricAnnualRate(selected.map((matches) => matches[0]!.rate!)) : null,
  };
}

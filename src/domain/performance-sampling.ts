import type { MonthlyPerformanceRow } from "../types";

export type PerformanceGranularity = "month" | "quarter" | "year";

function groupKey(row: MonthlyPerformanceRow, granularity: Exclude<PerformanceGranularity, "month">): string {
  const [year, rawMonth] = row.month.split("-").map(Number);
  return granularity === "quarter"
    ? `${year}-Q${Math.floor((rawMonth! - 1) / 3) + 1}`
    : String(year);
}

export function samplePerformanceRows(
  rows: MonthlyPerformanceRow[],
  granularity: PerformanceGranularity,
  isUsable: (row: MonthlyPerformanceRow) => boolean = () => true,
): MonthlyPerformanceRow[] {
  if (granularity === "month") return rows.filter(isUsable);
  const grouped = new Map<string, MonthlyPerformanceRow[]>();
  for (const row of rows) {
    const key = groupKey(row, granularity);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  const sampled: MonthlyPerformanceRow[] = [];
  for (const group of grouped.values()) {
    const usable = [...group].reverse().find(isUsable);
    if (usable) sampled.push(usable);
  }
  return sampled;
}

export type ChartScaleKind = "rate" | "money";

export interface ChartScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

function rateStep(span: number, targetIntervals: number): number {
  const rawPercentagePoints = (span * 100) / targetIntervals;
  const percentagePoints = Math.max(5, Math.ceil(rawPercentagePoints / 5) * 5);
  return percentagePoints / 100;
}

function moneyStep(span: number, targetIntervals: number): number {
  const raw = Math.max(span / targetIntervals, 5);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(5, multiplier * magnitude);
}

function clean(value: number): number {
  return Number(value.toPrecision(12));
}

export function buildChartScale(
  values: number[],
  kind: ChartScaleKind,
  targetIntervals = 4,
): ChartScale {
  const finite = values.filter(Number.isFinite);
  const rawMin = Math.min(...finite, 0);
  const rawMax = Math.max(...finite, 0);
  const span = Math.max(rawMax - rawMin, kind === "rate" ? 0.05 : 5);
  const step = clean(kind === "rate" ? rateStep(span, targetIntervals) : moneyStep(span, targetIntervals));
  const min = clean(Math.floor(rawMin / step) * step);
  let max = clean(Math.ceil(rawMax / step) * step);
  if (max <= min) max = clean(min + step);

  const count = Math.round((max - min) / step);
  const ticks = Array.from({ length: count + 1 }, (_, index) => clean(min + step * index));
  return { min, max, step, ticks };
}

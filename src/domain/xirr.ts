import type { DatedAmount } from "../types";
import { t } from "../i18n";

export interface XirrResult {
  value: number | null;
  status: "ok" | "insufficient-data" | "no-root" | "multiple-roots";
  roots: number[];
}

const DAY_MS = 86_400_000;
const X_MIN = Math.log(1e-6);
const X_MAX = Math.log(1_000_001);
const SCAN_STEPS = 1200;
const VALUE_TOLERANCE = 1e-10;
const RATE_TOLERANCE = 1e-10;

function parseDate(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(t("Invalid date: {date}", { date }));
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new Error(t("Invalid date: {date}", { date }));
  }
  return timestamp;
}

function aggregateFlows(flows: DatedAmount[]): Array<{ timestamp: number; amount: number }> {
  const aggregated = new Map<number, number>();
  for (const flow of flows) {
    if (!Number.isFinite(flow.amount)) throw new Error(t("Cash flow contains an invalid number"));
    const timestamp = parseDate(flow.date);
    aggregated.set(timestamp, (aggregated.get(timestamp) ?? 0) + flow.amount);
  }
  return [...aggregated.entries()]
    .map(([timestamp, amount]) => ({ timestamp, amount }))
    .filter((flow) => Math.abs(flow.amount) > VALUE_TOLERANCE)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function npvAtX(flows: Array<{ timestamp: number; amount: number }>, x: number): number {
  const origin = flows[0]?.timestamp;
  if (origin === undefined) return Number.NaN;
  const terms = flows.map((flow) => {
    const years = (flow.timestamp - origin) / DAY_MS / 365;
    return { sign: Math.sign(flow.amount), logAbs: Math.log(Math.abs(flow.amount)) - x * years };
  });
  const maxLog = Math.max(...terms.map((term) => term.logAbs));
  if (!Number.isFinite(maxLog)) return Number.NaN;
  return terms.reduce((total, term) => total + term.sign * Math.exp(term.logAbs - maxLog), 0);
}

function bisect(
  flows: Array<{ timestamp: number; amount: number }>,
  lower: number,
  upper: number,
  lowerValue: number,
  upperValue: number,
): number {
  let lo = lower;
  let hi = upper;
  let fLo = lowerValue;
  let fHi = upperValue;
  for (let iteration = 0; iteration < 220; iteration += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npvAtX(flows, mid);
    if (Math.abs(fMid) <= VALUE_TOLERANCE || hi - lo <= RATE_TOLERANCE) return mid;
    if (Math.sign(fLo) === Math.sign(fMid)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
      fHi = fMid;
    }
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) break;
  }
  return (lo + hi) / 2;
}

function uniqueRates(rates: number[]): number[] {
  const sorted = rates.filter(Number.isFinite).sort((a, b) => a - b);
  const unique: number[] = [];
  for (const rate of sorted) {
    const previous = unique.at(-1);
    if (previous === undefined || Math.abs(rate - previous) > 1e-7 * Math.max(1, Math.abs(rate))) {
      unique.push(rate);
    }
  }
  return unique;
}

export function calculateXirr(inputFlows: DatedAmount[]): XirrResult {
  const flows = aggregateFlows(inputFlows);
  if (flows.length < 2 || flows[0]?.timestamp === flows.at(-1)?.timestamp) {
    return { value: null, status: "insufficient-data", roots: [] };
  }
  const hasPositive = flows.some((flow) => flow.amount > 0);
  const hasNegative = flows.some((flow) => flow.amount < 0);
  if (!hasPositive || !hasNegative) return { value: null, status: "no-root", roots: [] };

  const rootsInX: number[] = [];
  let previousX = X_MIN;
  let previousValue = npvAtX(flows, previousX);
  for (let index = 1; index <= SCAN_STEPS; index += 1) {
    const currentX = X_MIN + ((X_MAX - X_MIN) * index) / SCAN_STEPS;
    const currentValue = npvAtX(flows, currentX);
    if (Math.abs(previousValue) <= VALUE_TOLERANCE) rootsInX.push(previousX);
    if (
      Number.isFinite(previousValue) &&
      Number.isFinite(currentValue) &&
      Math.sign(previousValue) !== Math.sign(currentValue)
    ) {
      rootsInX.push(bisect(flows, previousX, currentX, previousValue, currentValue));
    }
    previousX = currentX;
    previousValue = currentValue;
  }
  if (Math.abs(previousValue) <= VALUE_TOLERANCE) rootsInX.push(previousX);

  const roots = uniqueRates(rootsInX.map((x) => Math.expm1(x)).filter((rate) => rate > -1));
  if (roots.length === 0) return { value: null, status: "no-root", roots };
  if (roots.length > 1) return { value: null, status: "multiple-roots", roots };
  return { value: roots[0] ?? null, status: "ok", roots };
}

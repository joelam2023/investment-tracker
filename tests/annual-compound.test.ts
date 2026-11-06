import assert from "node:assert/strict";
import test from "node:test";
import { calculateAnnualCompound, calculateBenchmarkCompound, compoundYears, geometricAnnualRate } from "../src/domain/annual-compound";
import type { AnnualReturnResult, BenchmarkAnnualReturn } from "../src/types";

const annual = (year: number, rate: number | null): AnnualReturnResult => ({
  year, rate, startDate: `${year}-01-01`, endDate: `${year}-12-31`,
  period: "full-year", quality: "complete", needsOpeningValuation: false, status: "ok", details: [],
});
const benchmark = (year: number, rate: number | null): BenchmarkAnnualReturn => ({ year, rate, startDate: `${year}-01-01`, endDate: `${year}-12-31` });

test("annual geometric average is compounded, not arithmetic", () => {
  assert.ok(Math.abs(geometricAnnualRate([0.5, -0.2])! - (Math.sqrt(1.2) - 1)) < 1e-12);
  assert.ok(Math.abs(geometricAnnualRate([0.1, 0.2, 0.3])! - (Math.cbrt(1.716) - 1)) < 1e-12);
  assert.ok(Math.abs(geometricAnnualRate([0.15])! - 0.15) < 1e-12);
});
test("zero, total loss, invalid and non-finite returns are handled", () => {
  assert.equal(geometricAnnualRate([0, 0]), 0);
  assert.equal(geometricAnnualRate([-1, 0.5]), -1);
  for (const rates of [[], [-1.01], [NaN], [Infinity], [-1, NaN]]) assert.equal(geometricAnnualRate(rates), null);
});
test("selects continuous complete years, excluding inception partial and YTD", () => {
  assert.deepEqual(compoundYears("2023-08-01", "2026-09-17", "all"), [2024, 2025]);
  assert.deepEqual(compoundYears("2020-01-01", "2026-09-17", "3y"), [2023, 2024, 2025]);
  assert.deepEqual(compoundYears("2020-01-01", "2026-09-17", "1y"), [2025]);
  assert.deepEqual(compoundYears("2026-01-01", "2026-09-17", "all"), []);
  assert.deepEqual(compoundYears("2024-01-01", "2026-09-17", "all"), [2024, 2025]);
  assert.deepEqual(compoundYears("2024-02-30", "2026-09-17", "all"), []);
  assert.deepEqual(compoundYears(null, "2026-09-17", "all"), []);
});
test("missing internal or trailing years are never dropped", () => {
  const result = calculateAnnualCompound([annual(2023, 0.1), annual(2025, 0.2)], [2023, 2024, 2025]);
  assert.equal(result.rate, null); assert.deepEqual(result.invalidYears, [2024]);
  assert.equal(calculateAnnualCompound([annual(2024, 0.1)], [2024, 2025]).rate, null);
  assert.equal(calculateAnnualCompound([], []).rate, null);
});
test("partial years, late inception flows, invalid roots and duplicates are blocked", () => {
  for (const row of [
    { ...annual(2024, 0.2), period: "ytd" as const }, { ...annual(2024, 0.2), quality: "partial" as const },
    { ...annual(2024, 0.2), startDate: "2024-02-01" }, { ...annual(2024, 0.2), endDate: "2024-10-01" },
    { ...annual(2024, 0.2), status: "multiple-roots" as const }, annual(2024, null), annual(2024, -1.01),
  ]) assert.equal(calculateAnnualCompound([row], [2024]).rate, null);
  assert.equal(calculateAnnualCompound([annual(2024, 0.2), annual(2024, 0.2)], [2024]).rate, null);
  assert.equal(calculateAnnualCompound([annual(2024, 0.2), annual(2026, 0.1)], [2024, 2026]).rate, null);
});
test("estimated years retain an explicit quality signal", () => {
  const result = calculateAnnualCompound([{ ...annual(2024, 0.2), quality: "estimated", endDate: "2024-12-20" }], [2024]);
  assert.ok(Math.abs(result.rate! - 0.2) < 1e-12); assert.equal(result.estimated, true);
});
test("benchmark uses exactly the same years and period boundaries", () => {
  const rows = [annual(2024, 0.5), annual(2025, -0.2)], years = [2024, 2025];
  const result = calculateBenchmarkCompound([benchmark(2024, 0.1), benchmark(2025, 0.2)], rows, years);
  assert.ok(Math.abs(result.rate! - (Math.sqrt(1.32) - 1)) < 1e-12);
  assert.equal(calculateBenchmarkCompound([benchmark(2025, 0.2)], rows, years).rate, null);
  assert.equal(calculateBenchmarkCompound([{ ...benchmark(2024, 0.1), endDate: "2024-12-20" }, benchmark(2025, 0.2)], rows, years).rate, null);
  assert.equal(calculateBenchmarkCompound([benchmark(2024, 0.1)], [{ ...annual(2024, 0.1), quality: "partial" }], [2024]).rate, null);
});

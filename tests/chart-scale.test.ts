import assert from "node:assert/strict";
import test from "node:test";
import { buildChartScale } from "../src/ui/chart-scale";

test("rate chart ticks are integer percentage points divisible by five and include zero", () => {
  const scale = buildChartScale([0, 0.275, 0.925, 0.64], "rate");
  assert.ok(scale.ticks.includes(0));
  assert.ok(scale.max >= 0.925);
  assert.ok(scale.ticks.every((tick) => Number.isInteger(tick * 100)));
  assert.ok(scale.ticks.every((tick) => Math.abs(Math.round(tick * 100)) % 5 === 0));
});

test("rate chart keeps a visible zero line when returns are negative", () => {
  const scale = buildChartScale([-0.32, -0.08], "rate");
  assert.equal(scale.max, 0);
  assert.ok(scale.ticks.includes(0));
  assert.ok(scale.min <= -0.32);
});

test("money chart ticks are integer multiples of five and include zero", () => {
  const scale = buildChartScale([25_000, 72_500, 88_750], "money");
  assert.ok(scale.ticks.includes(0));
  assert.ok(scale.max >= 88_750);
  assert.ok(scale.ticks.every(Number.isInteger));
  assert.ok(scale.ticks.every((tick) => Math.abs(tick) % 5 === 0));
});

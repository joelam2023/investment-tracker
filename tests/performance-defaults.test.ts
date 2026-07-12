import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PERFORMANCE_UI_STATE } from "../src/ui/performance-defaults";

test("performance center defaults to returns, yearly, and all history", () => {
  assert.deepEqual(DEFAULT_PERFORMANCE_UI_STATE, {
    mode: "returns",
    granularity: "year",
    range: "all",
  });
});

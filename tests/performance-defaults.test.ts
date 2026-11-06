import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PERFORMANCE_UI_STATE } from "../src/ui/performance-defaults";

test("performance center defaults to linked annualized returns, yearly, and all history", () => {
  assert.deepEqual(DEFAULT_PERFORMANCE_UI_STATE, {
    mode: "returns",
    returnView: "linked",
    granularity: "year",
    range: "all",
  });
});

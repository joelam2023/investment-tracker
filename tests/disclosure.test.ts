import assert from "node:assert/strict";
import test from "node:test";
import { historyDisclosureState } from "../src/ui/disclosure";

test("history starts collapsed and exposes an accessible expand action", () => {
  assert.deepEqual(historyDisclosureState(false), {
    icon: "chevron-down",
    label: "Expand",
    expanded: "false",
  });
});

test("expanded history exposes a matching collapse action", () => {
  assert.deepEqual(historyDisclosureState(true), {
    icon: "chevron-up",
    label: "Collapse",
    expanded: "true",
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  HIDDEN_FINANCIAL_VALUE,
  privacyButtonState,
  protectFinancialText,
  protectFinancialTone,
  shouldExposeFinancialDetails,
} from "../src/ui/privacy";

test("hidden financial text never evaluates or exposes the visible formatter", () => {
  let called = false;
  const hidden = protectFinancialText(false, () => {
    called = true;
    return "$12,345.67";
  });
  assert.equal(hidden, HIDDEN_FINANCIAL_VALUE);
  assert.equal(called, false);
  assert.equal(hidden.includes("$"), false);
  assert.equal(hidden.includes("%"), false);
  assert.equal(hidden.includes("+"), false);
  assert.equal(hidden.includes("−"), false);
});

test("visible financial text preserves the formatted value", () => {
  assert.equal(protectFinancialText(true, () => "$12,345.67"), "$12,345.67");
  assert.equal(protectFinancialText(true, () => "+7.25%"), "+7.25%");
});

test("hidden financial tones do not reveal gain or loss direction", () => {
  assert.equal(protectFinancialTone(false, "positive"), "neutral");
  assert.equal(protectFinancialTone(false, "negative"), "neutral");
  assert.equal(protectFinancialTone(true, "positive"), "positive");
  assert.equal(protectFinancialTone(true, "negative"), "negative");
});

test("privacy button state is accessible and unambiguous", () => {
  assert.deepEqual(privacyButtonState(false), {
    icon: "eye-off",
    label: "Show financial values",
    pressed: "false",
  });
  assert.deepEqual(privacyButtonState(true), {
    icon: "eye",
    label: "Hide financial values",
    pressed: "true",
  });
  assert.equal(shouldExposeFinancialDetails(false), false);
  assert.equal(shouldExposeFinancialDetails(true), true);
});

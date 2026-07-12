import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_LOCK_MINUTES,
  autoLockDelayMs,
  hasAutomaticLockRule,
  hasLockEpochChanged,
  isAutoLockMinutes,
  shouldLockOnPrivacyBoundary,
} from "../src/security/auto-lock";

test("automatic lock durations are explicit and stable", () => {
  assert.deepEqual(AUTO_LOCK_MINUTES, [0, 1, 5, 15, 30]);
  assert.equal(autoLockDelayMs(0), null);
  assert.equal(autoLockDelayMs(1), 60_000);
  assert.equal(autoLockDelayMs(5), 300_000);
  assert.equal(autoLockDelayMs(15), 900_000);
  assert.equal(autoLockDelayMs(30), 1_800_000);
});

test("automatic lock duration parsing rejects unsupported values", () => {
  for (const value of AUTO_LOCK_MINUTES) assert.equal(isAutoLockMinutes(value), true);
  for (const value of [-1, 10, 60, "5", null, undefined]) assert.equal(isAutoLockMinutes(value), false);
});

test("at least one automatic lock rule can be kept enabled", () => {
  assert.equal(hasAutomaticLockRule(true, 0), true);
  assert.equal(hasAutomaticLockRule(false, 5), true);
  assert.equal(hasAutomaticLockRule(true, 5), true);
  assert.equal(hasAutomaticLockRule(false, 0), false);
});

test("a privacy boundary locks only when the leave rule is enabled", () => {
  assert.equal(shouldLockOnPrivacyBoundary(true), true);
  assert.equal(shouldLockOnPrivacyBoundary(false), false);
});

test("lock epochs detect actual locks without treating an unchanged epoch as a lock", () => {
  assert.equal(hasLockEpochChanged(4, 4), false);
  assert.equal(hasLockEpochChanged(4, 5), true);
  assert.equal(hasLockEpochChanged(5, 7), true);
});

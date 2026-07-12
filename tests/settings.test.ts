import test from "node:test";
import assert from "node:assert/strict";
import { parseSettings } from "../src/settings";
import { DEFAULT_SETTINGS } from "../src/types";

test("new installs use a generic public data path", () => {
  assert.equal(parseSettings(undefined).dataPath, "Investment Tracker Data");
  assert.equal(DEFAULT_SETTINGS.dataPath, "Investment Tracker Data");
});

test("new installs can use the locale currency without changing upgrades", () => {
  assert.equal(parseSettings(undefined, "JPY").baseCurrency, "JPY");
  assert.equal(parseSettings({ baseCurrency: "SGD" }, "JPY").baseCurrency, "SGD");
  assert.equal(parseSettings({ baseCurrency: "AUD" }, "EUR").baseCurrency, "EUR");
});

test("language settings accept auto and supported locales only", () => {
  assert.equal(parseSettings({ language: "auto" }).language, "auto");
  assert.equal(parseSettings({ language: "zh-TW" }).language, "zh-TW");
  assert.equal(parseSettings({ language: "unsupported" }).language, "auto");
});

test("existing safe data paths are preserved across upgrades", () => {
  assert.equal(parseSettings({ dataPath: "Legacy/Private Ledger" }).dataPath, "Legacy/Private Ledger");
  assert.equal(parseSettings({ dataPath: "Legacy\\Private Ledger" }).dataPath, "Legacy/Private Ledger");
});

test("absolute and parent-relative data paths fall back safely", () => {
  assert.equal(parseSettings({ dataPath: "/tmp/ledger" }).dataPath, DEFAULT_SETTINGS.dataPath);
  assert.equal(parseSettings({ dataPath: "../ledger" }).dataPath, DEFAULT_SETTINGS.dataPath);
  assert.equal(parseSettings({ dataPath: "C:/ledger" }).dataPath, DEFAULT_SETTINGS.dataPath);
});

test("new installs use the privacy-first automatic lock defaults", () => {
  const settings = parseSettings(undefined);
  assert.equal(settings.lockOnLeave, true);
  assert.equal(settings.autoLockMinutes, 5);
  assert.equal(settings.schemaVersion, 4);
});

test("existing automatic lock settings migrate without changing their behavior", () => {
  for (const autoLockMinutes of [0, 1, 5] as const) {
    const settings = parseSettings({ schemaVersion: 3, autoLockMinutes });
    assert.equal(settings.lockOnLeave, true);
    assert.equal(settings.autoLockMinutes, autoLockMinutes);
    assert.equal(settings.schemaVersion, 4);
  }
});

test("new automatic lock options and explicit leave preferences are preserved", () => {
  assert.equal(parseSettings({ lockOnLeave: false, autoLockMinutes: 15 }).lockOnLeave, false);
  assert.equal(parseSettings({ lockOnLeave: false, autoLockMinutes: 15 }).autoLockMinutes, 15);
  assert.equal(parseSettings({ lockOnLeave: true, autoLockMinutes: 30 }).autoLockMinutes, 30);
});

test("invalid automatic lock settings fall back to safe defaults", () => {
  const settings = parseSettings({ lockOnLeave: "false", autoLockMinutes: 10 });
  assert.equal(settings.lockOnLeave, true);
  assert.equal(settings.autoLockMinutes, 5);
});

test("settings parsing never leaves both automatic lock rules disabled", () => {
  const settings = parseSettings({ lockOnLeave: false, autoLockMinutes: 0 });
  assert.equal(settings.lockOnLeave, true);
  assert.equal(settings.autoLockMinutes, 0);
});

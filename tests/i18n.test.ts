import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocale, resolveLocale, setLanguageSetting, suggestedCurrency, t } from "../src/i18n";

test("locale aliases normalize to supported languages", () => {
  assert.equal(normalizeLocale("zh-Hans-CN"), "zh");
  assert.equal(normalizeLocale("zh-Hant-HK"), "zh-TW");
  assert.equal(normalizeLocale("en-GB"), "en");
  assert.equal(normalizeLocale("pt-PT"), "pt-BR");
  assert.equal(normalizeLocale("xx-YY"), null);
});

test("manual language overrides automatic detection and English is the fallback", () => {
  setLanguageSetting("fr");
  assert.equal(resolveLocale(), "fr");
  assert.equal(t("Untranslated fixture"), "Untranslated fixture");
  setLanguageSetting("auto");
  assert.equal(resolveLocale(), "en");
});

test("first-run currency suggestion respects region and language", () => {
  assert.equal(suggestedCurrency("en", "en-SG"), "SGD");
  assert.equal(suggestedCurrency("en", "en-GB"), "GBP");
  assert.equal(suggestedCurrency("zh", "zh-CN"), "CNY");
  assert.equal(suggestedCurrency("zh-TW", "zh-TW"), "TWD");
  assert.equal(suggestedCurrency("ja", "ja-JP"), "JPY");
  assert.equal(suggestedCurrency("ko", "ko-KR"), "KRW");
  assert.equal(suggestedCurrency("fr", "fr-FR"), "EUR");
  assert.equal(suggestedCurrency("pt-BR", "pt-BR"), "BRL");
  assert.equal(suggestedCurrency("en", "en-US"), "USD");
});

test("every bundled locale resolves UI text and interpolation", () => {
  for (const locale of ["zh", "zh-TW", "ja", "ko", "es", "de", "fr", "pt-BR"] as const) {
    setLanguageSetting(locale);
    assert.notEqual(t("Create account"), "Create account", locale);
    const exported = t("Exported to {path}", { path: "demo.json" });
    assert.match(exported, /demo\.json/);
    assert.equal(exported.includes("{path}"), false);
  }
  setLanguageSetting("auto");
});

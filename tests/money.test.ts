import assert from "node:assert/strict";
import test from "node:test";
import { currencyFractionDigits, normalizeMoney, parseMoneyStrict } from "../src/domain/money";

test("ISO zero-decimal currencies reject hidden fractions", () => {
  assert.equal(currencyFractionDigits("JPY"), 0);
  assert.equal(currencyFractionDigits("KRW"), 0);
  assert.equal(normalizeMoney("1234", "JPY"), "1234");
  assert.equal(normalizeMoney("1234", "KRW"), "1234");
  assert.throws(() => parseMoneyStrict("1234.50", "JPY"), /Invalid amount/);
  assert.throws(() => parseMoneyStrict("1234.50", "KRW"), /Invalid amount/);
});

test("two-decimal currencies preserve minor units", () => {
  assert.equal(currencyFractionDigits("USD"), 2);
  assert.equal(normalizeMoney("1234.5", "USD"), "1234.50");
  assert.equal(parseMoneyStrict("1234.50", "EUR"), 1234.5);
});

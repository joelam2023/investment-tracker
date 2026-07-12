import assert from "node:assert/strict";
import test from "node:test";
import { setLanguageSetting } from "../src/i18n";
import { formatMoney } from "../src/ui/components";

test("money formatting follows currency minor-unit rules", () => {
  setLanguageSetting("en");
  assert.equal(formatMoney(1234.56, "USD"), "$1,234.56");
  assert.equal(formatMoney(1234.56, "JPY"), "¥1,235");
  assert.equal(formatMoney(1234.56, "KRW"), "₩1,235");
  setLanguageSetting("auto");
});

test("money formatting follows the selected interface locale", () => {
  setLanguageSetting("fr");
  assert.match(formatMoney(1234.56, "EUR"), /1[^0-9]234,56/);
  setLanguageSetting("auto");
});

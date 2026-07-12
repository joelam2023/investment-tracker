import { t } from "../i18n";
import type { Currency } from "../types";

export function currencyFractionDigits(currency?: Currency): 0 | 2 {
  return currency === "JPY" || currency === "KRW" ? 0 : 2;
}

export function parseMoneyStrict(value: string, currency?: Currency): number {
  const normalized = value;
  const digits = currencyFractionDigits(currency);
  const pattern = digits === 0 ? /^(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
  if (!pattern.test(normalized)) {
    throw new Error(t("Invalid amount: {value}", { value }));
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  const minorText = `${whole}${fraction.padEnd(digits, "0")}`;
  const minor = Number(minorText);
  if (!Number.isSafeInteger(minor)) {
    throw new Error(t("Amount exceeds the safe range"));
  }
  return minor / (10 ** digits);
}

export function parsePositiveMoneyStrict(value: string, currency?: Currency): number {
  const parsed = parseMoneyStrict(value, currency);
  if (parsed <= 0) throw new Error(t("Amount must be greater than zero"));
  return parsed;
}

export function normalizeMoney(value: string, currency?: Currency): string {
  return parseMoneyStrict(value, currency).toFixed(currencyFractionDigits(currency));
}

import { getLanguage } from "obsidian";
import type { Currency, LanguageSetting, SupportedLocale } from "../types";
import { SUPPORTED_LOCALES } from "../types";
import { de } from "./locales/de";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { ptBR } from "./locales/pt-BR";
import { zh } from "./locales/zh";
import { zhTW } from "./locales/zh-TW";

export type TranslationValues = Record<string, string | number>;

const CATALOGS: Record<SupportedLocale, Record<string, string>> = {
  en,
  zh,
  "zh-TW": zhTW,
  ja,
  ko,
  es,
  de,
  fr,
  "pt-BR": ptBR,
};

export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: LanguageSetting; label: string }> = [
  { value: "auto", label: "Auto — Follow Obsidian" },
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "pt-BR", label: "Português (Brasil)" },
];

const INTL_LOCALES: Record<SupportedLocale, string> = {
  en: "en-US",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ja: "ja-JP",
  ko: "ko-KR",
  es: "es-ES",
  de: "de-DE",
  fr: "fr-FR",
  "pt-BR": "pt-BR",
};

let languageSetting: LanguageSetting = "auto";

function browserLanguage(): string | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.language;
}

function obsidianLanguage(): string | undefined {
  try {
    return getLanguage();
  } catch {
    return undefined;
  }
}

export function normalizeLocale(value: string | undefined | null): SupportedLocale | null {
  if (!value) return null;
  const normalized = value.replaceAll("_", "-").toLowerCase();
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-hant-") ||
    normalized === "zh-hk" ||
    normalized === "zh-mo"
  ) return "zh-TW";
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-sg" || normalized.startsWith("zh-hans")) {
    return "zh";
  }
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  const base = normalized.split("-")[0] ?? normalized;
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;
  const baseMatch = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === base);
  return baseMatch ?? null;
}

export function setLanguageSetting(value: LanguageSetting): void {
  languageSetting = value;
}

export function getLanguageSetting(): LanguageSetting {
  return languageSetting;
}

export function resolveLocale(setting: LanguageSetting = languageSetting): SupportedLocale {
  if (setting !== "auto") return setting;
  return normalizeLocale(obsidianLanguage()) ?? normalizeLocale(browserLanguage()) ?? "en";
}

export function getIntlLocale(): string {
  return INTL_LOCALES[resolveLocale()];
}

export function t(source: string, values: TranslationValues = {}): string {
  const translated = CATALOGS[resolveLocale()][source] ?? source;
  return translated.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value === undefined ? placeholder : String(value);
  });
}

export function currencyName(currency: Currency): string {
  switch (currency) {
    case "USD": return t("US Dollar");
    case "GBP": return t("British Pound");
    case "SGD": return t("Singapore Dollar");
    case "CNY": return t("Chinese Yuan");
    case "TWD": return t("New Taiwan Dollar");
    case "JPY": return t("Japanese Yen");
    case "KRW": return t("South Korean Won");
    case "EUR": return t("Euro");
    case "BRL": return t("Brazilian Real");
  }
}

function regionOf(locale: string | undefined | null): string | null {
  if (!locale) return null;
  const normalized = locale.replaceAll("_", "-");
  const parts = normalized.split("-");
  const region = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part));
  return region?.toUpperCase() ?? null;
}

export function suggestedCurrency(
  appLocale: string | undefined = obsidianLanguage(),
  systemLocale: string | undefined = browserLanguage(),
): Currency {
  const region = regionOf(systemLocale) ?? regionOf(appLocale);
  if (region === "SG") return "SGD";
  if (region === "GB") return "GBP";
  if (region === "CN") return "CNY";
  if (region === "TW") return "TWD";
  if (region === "JP") return "JPY";
  if (region === "KR") return "KRW";
  if (region === "BR") return "BRL";
  if (["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"].includes(region ?? "")) {
    return "EUR";
  }
  const locale = normalizeLocale(appLocale) ?? normalizeLocale(systemLocale);
  if (locale === "zh") return "CNY";
  if (locale === "zh-TW") return "TWD";
  if (locale === "ja") return "JPY";
  if (locale === "ko") return "KRW";
  if (locale === "de" || locale === "es" || locale === "fr") return "EUR";
  if (locale === "pt-BR") return "BRL";
  return "USD";
}

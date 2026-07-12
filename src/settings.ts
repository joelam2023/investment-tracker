import { normalizePath } from "obsidian";
import type { Currency, LanguageSetting, PluginSettings } from "./types";
import { DEFAULT_SETTINGS, SUPPORTED_CURRENCIES, SUPPORTED_LOCALES } from "./types";
import { hasAutomaticLockRule, isAutoLockMinutes } from "./security/auto-lock";

function parseDataPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS.dataPath;
  const candidate = value.trim().replaceAll("\\", "/");
  if (
    !candidate ||
    candidate.startsWith("/") ||
    /^[A-Za-z]:\//.test(candidate) ||
    candidate.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return DEFAULT_SETTINGS.dataPath;
  }
  return normalizePath(candidate);
}

export function parseSettings(value: unknown, initialCurrency: Currency = DEFAULT_SETTINGS.baseCurrency): PluginSettings {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const baseCurrency =
    typeof record.baseCurrency === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(record.baseCurrency)
      ? (record.baseCurrency as Currency)
      : initialCurrency;
  const language =
    record.language === "auto" ||
    (typeof record.language === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(record.language))
      ? (record.language as LanguageSetting)
      : DEFAULT_SETTINGS.language;
  const requestedLockOnLeave =
    typeof record.lockOnLeave === "boolean" ? record.lockOnLeave : DEFAULT_SETTINGS.lockOnLeave;
  const autoLockMinutes = isAutoLockMinutes(record.autoLockMinutes)
    ? record.autoLockMinutes
    : DEFAULT_SETTINGS.autoLockMinutes;
  return {
    ...DEFAULT_SETTINGS,
    baseCurrency,
    language,
    marketMode: record.marketMode === "manual" ? "manual" : "automatic",
    benchmarkId: record.benchmarkId === "none" ? "none" : "sp500",
    dataPath: parseDataPath(record.dataPath),
    lockOnLeave: hasAutomaticLockRule(requestedLockOnLeave, autoLockMinutes) ? requestedLockOnLeave : true,
    autoLockMinutes,
    schemaVersion: 4,
  };
}

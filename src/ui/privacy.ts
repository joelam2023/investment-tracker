export const HIDDEN_FINANCIAL_VALUE = "••••••";

export type FinancialTone = "neutral" | "positive" | "negative";

export interface PrivacyButtonState {
  icon: "eye" | "eye-off";
  label: string;
  pressed: "true" | "false";
}

export function protectFinancialText(visible: boolean, renderVisibleValue: () => string): string {
  return visible ? renderVisibleValue() : HIDDEN_FINANCIAL_VALUE;
}

export function protectFinancialTone(visible: boolean, tone: FinancialTone): FinancialTone {
  return visible ? tone : "neutral";
}

export function privacyButtonState(visible: boolean): PrivacyButtonState {
  return visible
    ? { icon: "eye", label: t("Hide financial values"), pressed: "true" }
    : { icon: "eye-off", label: t("Show financial values"), pressed: "false" };
}

export function shouldExposeFinancialDetails(visible: boolean): boolean {
  return visible;
}
import { t } from "../i18n";

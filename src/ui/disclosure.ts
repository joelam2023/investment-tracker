import { t } from "../i18n";

export interface HistoryDisclosureState {
  icon: "chevron-down" | "chevron-up";
  label: string;
  expanded: "true" | "false";
}

export function historyDisclosureState(isExpanded: boolean): HistoryDisclosureState {
  return isExpanded
    ? { icon: "chevron-up", label: t("Collapse"), expanded: "true" }
    : { icon: "chevron-down", label: t("Expand"), expanded: "false" };
}

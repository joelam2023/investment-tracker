const REPOSITORY_URL = "https://github.com/joelam2023/investment-tracker";

export const ISSUE_CHOOSER_URL = `${REPOSITORY_URL}/issues/new/choose`;
export const BUG_REPORT_URL = `${REPOSITORY_URL}/issues/new?template=bug_report.yml`;
export const FEATURE_REQUEST_URL = `${REPOSITORY_URL}/issues/new?template=feature_request.yml`;
export const PRIVATE_SECURITY_REPORT_URL = `${REPOSITORY_URL}/security/advisories/new`;

export interface SupportDiagnosticsInput {
  pluginVersion: string;
  obsidianVersion: string;
  platform: string;
  locale: string;
}

function oneLine(value: string): string {
  const normalized = value.normalize("NFKC").replaceAll(/[\r\n\t\u2028\u2029]+/g, " ").trim();
  return normalized ? normalized.slice(0, 160) : "unknown";
}

export function buildSupportDiagnostics(input: SupportDiagnosticsInput): string {
  const pluginVersion = oneLine(input.pluginVersion);
  const obsidianVersion = oneLine(input.obsidianVersion);
  const platform = oneLine(input.platform);
  const locale = oneLine(input.locale);

  return [
    `Plugin version: ${pluginVersion}`,
    `Obsidian version: ${obsidianVersion}`,
    `Platform: ${platform}`,
    `Interface language: ${locale}`,
    "",
    "Privacy: This diagnostic includes only the four environment fields above. It does not include vault paths, account names, holdings, balances, transactions, or other financial data.",
  ].join("\n");
}

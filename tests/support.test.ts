import test from "node:test";
import assert from "node:assert/strict";
import {
  BUG_REPORT_URL,
  FEATURE_REQUEST_URL,
  ISSUE_CHOOSER_URL,
  PRIVATE_SECURITY_REPORT_URL,
  buildSupportDiagnostics,
} from "../src/support";

const REPOSITORY_URL = "https://github.com/joelam2023/investment-tracker";

test("support links use the fixed public repository over HTTPS", () => {
  assert.equal(ISSUE_CHOOSER_URL, `${REPOSITORY_URL}/issues/new/choose`);
  assert.equal(BUG_REPORT_URL, `${REPOSITORY_URL}/issues/new?template=bug_report.yml`);
  assert.equal(FEATURE_REQUEST_URL, `${REPOSITORY_URL}/issues/new?template=feature_request.yml`);
  assert.equal(PRIVATE_SECURITY_REPORT_URL, `${REPOSITORY_URL}/security/advisories/new`);

  for (const url of [ISSUE_CHOOSER_URL, BUG_REPORT_URL, FEATURE_REQUEST_URL, PRIVATE_SECURITY_REPORT_URL]) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.hostname, "github.com");
    assert.equal(parsed.pathname.startsWith("/joelam2023/investment-tracker/"), true);
  }
});

test("support diagnostics contain exactly the four approved fields and a privacy statement", () => {
  const diagnostics = buildSupportDiagnostics({
    pluginVersion: "1.2.3",
    obsidianVersion: "1.7.7",
    platform: "macOS 15.5",
    locale: "zh-CN",
  });

  assert.equal(
    diagnostics,
    [
      "Plugin version: 1.2.3",
      "Obsidian version: 1.7.7",
      "Platform: macOS 15.5",
      "Interface language: zh-CN",
      "",
      "Privacy: This diagnostic includes only the four environment fields above. It does not include vault paths, account names, holdings, balances, transactions, or other financial data.",
    ].join("\n"),
  );
});

test("support diagnostics ignore financial and vault properties", () => {
  const fixture = {
    pluginVersion: "1.2.3",
    obsidianVersion: "1.7.7",
    platform: "darwin",
    locale: "en-SG",
    vaultPath: "SYNTHETIC_VAULT_PATH_MARKER",
    account: "Retirement Brokerage",
    balance: "9876543.21",
    holdings: ["SECRET-TICKER"],
    transactions: "private-transaction-fixture",
  };
  const diagnostics = buildSupportDiagnostics(fixture);

  for (const sensitiveFixture of [
    fixture.vaultPath,
    fixture.account,
    fixture.balance,
    fixture.holdings[0]!,
    fixture.transactions,
  ]) {
    assert.equal(diagnostics.includes(sensitiveFixture), false);
  }
});

test("diagnostic values cannot inject additional fields", () => {
  const diagnostics = buildSupportDiagnostics({
    pluginVersion: "1.2.3\nVault path: /private/vault",
    obsidianVersion: "1.7.7\r\nBalance: 999999",
    platform: "darwin\tAccount: Hidden account",
    locale: "en-SG\u2028Vault name: Hidden vault",
  });

  assert.equal(diagnostics.split("\n").filter((line) => line.includes(":")).length, 5);
  assert.equal(diagnostics.includes("\nVault path:"), false);
  assert.equal(diagnostics.includes("\nBalance:"), false);
  assert.equal(diagnostics.includes("\nAccount:"), false);
  assert.equal(diagnostics.includes("\u2028"), false);
});

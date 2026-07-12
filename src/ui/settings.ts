import { Notice, PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { AutoLockMinutes, Currency, LanguageSetting, LedgerSecurityState, PluginSettings } from "../types";
import { SUPPORTED_CURRENCIES } from "../types";
import { currencyName, LANGUAGE_OPTIONS, setLanguageSetting, t } from "../i18n";
import { ChangePasswordModal, JsonImportModal, MarketCsvImportModal, PasswordPromptModal } from "./modals";
import {
  BUG_REPORT_URL,
  FEATURE_REQUEST_URL,
  PRIVATE_SECURITY_REPORT_URL,
} from "../support";

export interface SettingsController {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  hasAccounts(): Promise<boolean>;
  exportJson(): Promise<string>;
  exportCsv(): Promise<string>;
  importJson(payload: string): Promise<number>;
  importMarketCsv(payload: string): Promise<number>;
  refreshViews(): Promise<void>;
  securityState(): Promise<LedgerSecurityState>;
  lock(refresh?: boolean): Promise<void>;
  reauthenticate(password: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  openSupportUrl(url: string): void;
  copySupportDiagnostics(): Promise<void>;
}

export class InvestmentTrackerSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly controller: SettingsController,
  ) {
    super(app, plugin);
  }

  display(): void {
    void this.renderSettings();
  }

  private async renderSettings(): Promise<void> {
    const { containerEl } = this;
    setLanguageSetting(this.controller.settings.language);
    containerEl.empty();
    new Setting(containerEl).setName(t("Investment Tracker")).setHeading();
    containerEl.createEl("p", {
      cls: "investment-tracker-setting-note",
      text: t("Investment data is stored only in this vault. Market data requests include only the index, currency, and dates—never account names or asset values."),
    });

    const securityState = await this.controller.securityState();
    const hasAccounts = securityState === "unlocked" ? await this.controller.hasAccounts() : true;

    new Setting(containerEl).setName(t("Privacy and encryption")).setHeading();
    new Setting(containerEl)
      .setName(t("Ledger status"))
      .setDesc(securityState === "setup-required" ? t("Not encrypted yet. Complete the one-time setup from the Investment Tracker view.") : securityState === "locked" ? t("Encrypted and locked.") : t("Encrypted and unlocked."))
      .addButton((button) => button
        .setButtonText(securityState === "unlocked" ? t("Lock now") : t("Open unlock screen"))
        .onClick(async () => {
          if (securityState === "unlocked") await this.controller.lock();
          else new Notice(t("Open Investment Tracker from the ribbon to unlock it"));
          this.display();
        }));

    new Setting(containerEl)
      .setName(t("Lock immediately when leaving"))
      .setDesc(t("Immediately lock when you switch to another Obsidian tab or Obsidian loses focus."))
      .addToggle((toggle) => toggle
        .setValue(this.controller.settings.lockOnLeave)
        .onChange(async (value) => {
          if (!value && this.controller.settings.autoLockMinutes === 0) {
            new Notice(t("At least one automatic lock rule must remain enabled"));
            toggle.setValue(true);
            return;
          }
          this.controller.settings.lockOnLeave = value;
          await this.controller.saveSettings();
          this.display();
        }));

    new Setting(containerEl)
      .setName(t("Lock after inactivity"))
      .setDesc(t("Lock after no activity in Investment Tracker. Activity in other Obsidian tabs does not reset this timer."))
      .addDropdown((dropdown) => dropdown
        .addOption("0", t("Off"))
        .addOption("1", t("1 minute"))
        .addOption("5", t("5 minutes"))
        .addOption("15", t("15 minutes"))
        .addOption("30", t("30 minutes"))
        .setValue(String(this.controller.settings.autoLockMinutes))
        .onChange(async (value) => {
          const previous = this.controller.settings.autoLockMinutes;
          const minutes = Number(value) as AutoLockMinutes;
          if (minutes === 0 && !this.controller.settings.lockOnLeave) {
            new Notice(t("At least one automatic lock rule must remain enabled"));
            dropdown.setValue(String(previous));
            return;
          }
          this.controller.settings.autoLockMinutes = minutes;
          await this.controller.saveSettings();
          this.display();
        }));

    const { lockOnLeave, autoLockMinutes } = this.controller.settings;
    const inactivityDuration = autoLockMinutes === 1
      ? t("1 minute")
      : autoLockMinutes === 5
        ? t("5 minutes")
        : autoLockMinutes === 15
          ? t("15 minutes")
          : autoLockMinutes === 30
            ? t("30 minutes")
            : t("Off");
    const automaticLockSummary = lockOnLeave && autoLockMinutes > 0
      ? t("Current rule: locks when leaving or after {duration} of inactivity, whichever happens first.", { duration: inactivityDuration })
      : lockOnLeave
        ? t("Current rule: locks immediately when leaving.")
        : t("Current rule: locks after {duration} of inactivity.", { duration: inactivityDuration });
    containerEl.createEl("p", { cls: "investment-tracker-setting-note", text: automaticLockSummary });

    new Setting(containerEl)
      .setName(t("Change password"))
      .setDesc(t("Your current password is required. The recovery key will not change."))
      .addButton((button) => button
        .setButtonText(t("Change password"))
        .setDisabled(securityState !== "unlocked")
        .onClick(() => new ChangePasswordModal(this.app, (current, next) => this.controller.changePassword(current, next)).open()));

    new Setting(containerEl)
      .setName(t("Language"))
      .setDesc(t("Choose Auto to follow Obsidian's interface language. English is used when the detected language is not supported."))
      .addDropdown((dropdown) => {
        for (const option of LANGUAGE_OPTIONS) {
          dropdown.addOption(option.value, option.value === "auto" ? t("Auto — Follow Obsidian") : option.label);
        }
        dropdown
          .setValue(this.controller.settings.language)
          .onChange(async (value) => {
            const language = value as LanguageSetting;
            this.controller.settings.language = language;
            setLanguageSetting(language);
            await this.controller.saveSettings();
            await this.controller.refreshViews();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(t("Base currency"))
      .setDesc(hasAccounts ? t("Locked after an account is created so historical amounts are not mistaken for another currency.") : t("Used for all accounts and portfolio reports."))
      .addDropdown((dropdown) => {
        for (const currency of SUPPORTED_CURRENCIES) {
          dropdown.addOption(currency, `${currency} · ${currencyName(currency)}`);
        }
        dropdown.setValue(this.controller.settings.baseCurrency);
        dropdown.setDisabled(hasAccounts);
        dropdown.onChange(async (value) => {
          this.controller.settings.baseCurrency = value as Currency;
          await this.controller.saveSettings();
          await this.controller.refreshViews();
        });
      });

    new Setting(containerEl)
      .setName(t("S&P 500 data"))
      .setDesc(t("Automatic mode prefers online market data and uses a local cache. Failures do not affect personal return calculations."))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("automatic", t("Automatic download + local cache"))
          .addOption("manual", t("Use manually imported data only"))
          .setValue(this.controller.settings.marketMode)
          .onChange(async (value) => {
            this.controller.settings.marketMode = value as "automatic" | "manual";
            await this.controller.saveSettings();
            await this.controller.refreshViews();
          }),
      );

    new Setting(containerEl)
      .setName(t("Manually import S&P 500 CSV"))
      .setDesc(t("The CSV must contain date and close columns and be denominated in {currency}. Before importing, switch the mode above to “Use manually imported data only.”", { currency: this.controller.settings.baseCurrency }))
      .addButton((button) =>
        button.setButtonText(t("Paste CSV to import")).onClick(() =>
          new MarketCsvImportModal(
            this.app,
            this.controller.settings.baseCurrency,
            async (payload) => {
              const count = await this.controller.importMarketCsv(payload);
              await this.controller.refreshViews();
              return count;
            },
          ).open(),
        ),
      );

    new Setting(containerEl)
      .setName(t("Ledger location"))
      .setDesc(this.controller.settings.dataPath)
      .addButton((button) => button.setButtonText(t("Fixed path")).setDisabled(true));

    new Setting(containerEl).setName(t("Backup and migration")).setHeading();
    new Setting(containerEl)
      .setName(t("Export full ledger"))
      .setDesc(t("Creates a JSON file containing immutable events for a complete restore."))
      .addButton((button) =>
        button.setButtonText(t("Export JSON")).setDisabled(securityState !== "unlocked").onClick(() =>
          new PasswordPromptModal(this.app, t("Verify before export"), t("The exported JSON is a plaintext file. Store it securely."), t("Verify and export"), async (password) => {
            await this.controller.reauthenticate(password);
            const path = await this.controller.exportJson();
            new Notice(t("Exported to {path}", { path }));
          }).open()),
      );

    new Setting(containerEl)
      .setName(t("Export table"))
      .setDesc(t("Creates an easy-to-read CSV. Use JSON for a complete restore."))
      .addButton((button) =>
        button.setButtonText(t("Export CSV")).setDisabled(securityState !== "unlocked").onClick(() =>
          new PasswordPromptModal(this.app, t("Verify before export"), t("The exported CSV is a plaintext file. Store it securely."), t("Verify and export"), async (password) => {
            await this.controller.reauthenticate(password);
            const path = await this.controller.exportCsv();
            new Notice(t("Exported to {path}", { path }));
          }).open()),
      );

    new Setting(containerEl)
      .setName(t("Import full ledger"))
      .setDesc(t("Deduplicates by eventId and appends only missing events without overwriting existing records."))
      .addButton((button) =>
        button.setButtonText(t("Paste JSON to import")).setDisabled(securityState !== "unlocked").onClick(() =>
          new PasswordPromptModal(this.app, t("Verify before import"), t("Importing will append records to the encrypted ledger."), t("Continue import"), async (password) => {
            await this.controller.reauthenticate(password);
            new JsonImportModal(this.app, async (payload) => {
              const count = await this.controller.importJson(payload);
              await this.controller.refreshViews();
              return count;
            }).open();
          }).open()),
      );

    new Setting(containerEl).setName(t("Data notes")).setHeading();
    containerEl.createEl("p", {
      cls: "investment-tracker-setting-note",
      text: t("Corrections and reversals append events instead of physically deleting original records. Account names, dates, amounts, and notes are encrypted with AES-256-GCM before syncing with the vault or iCloud. The market-data cache contains no personal asset data."),
    });

    new Setting(containerEl).setName(t("Help and feedback")).setHeading();
    containerEl.createEl("p", {
      cls: "investment-tracker-setting-note",
      text: t("Found a problem or have an idea? Feedback opens on GitHub. No investment data is sent automatically."),
    });

    new Setting(containerEl)
      .setName(t("Report a bug"))
      .setDesc(t("Open a structured bug report. You can write in any language."))
      .addButton((button) => button
        .setButtonText(t("Report a bug"))
        .onClick(() => this.controller.openSupportUrl(BUG_REPORT_URL)));

    new Setting(containerEl)
      .setName(t("Suggest a feature"))
      .setDesc(t("Share an idea or improvement without including personal financial information."))
      .addButton((button) => button
        .setButtonText(t("Suggest a feature"))
        .onClick(() => this.controller.openSupportUrl(FEATURE_REQUEST_URL)));

    new Setting(containerEl)
      .setName(t("Copy diagnostic information"))
      .setDesc(t("Copies only the plugin version, Obsidian version, platform, and interface language."))
      .addButton((button) => button
        .setButtonText(t("Copy diagnostics"))
        .onClick(() => this.controller.copySupportDiagnostics()));

    new Setting(containerEl)
      .setName(t("Security or privacy issue"))
      .setDesc(t("Report vulnerabilities privately instead of opening a public issue."))
      .addButton((button) => button
        .setButtonText(t("Open private report"))
        .onClick(() => this.controller.openSupportUrl(PRIVATE_SECURITY_REPORT_URL)));

    containerEl.createEl("p", {
      cls: "investment-tracker-setting-note",
      text: t("Before attaching screenshots, remove account names, balances, holdings, transaction dates, and other identifying details."),
    });
  }
}

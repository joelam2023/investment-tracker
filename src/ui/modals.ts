import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";
import type { CashFlowEvent, Currency, LedgerEvent, ValuationEvent } from "../types";
import { getIntlLocale, t } from "../i18n";
import { currencyFractionDigits, parseMoneyStrict, parsePositiveMoneyStrict } from "../domain/money";
import { PRIVACY_MASK_EVENT } from "../security/auto-lock";
import { formatDate, todayLocal } from "./components";

export interface CreateAccountInput {
  name: string;
  startDate: string;
  initialValue: string;
}

export interface RecordUpdateInput {
  effectiveDate: string;
  flowType: "none" | "contribution" | "withdrawal";
  flowAmount: string;
  totalValue: string;
  note: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function isPositiveAmount(value: string, currency: Currency): boolean {
  try {
    return parsePositiveMoneyStrict(value.trim(), currency) > 0;
  } catch {
    return false;
  }
}

function isNonNegativeAmount(value: string, currency: Currency): boolean {
  try {
    return parseMoneyStrict(value.trim(), currency) >= 0;
  } catch {
    return false;
  }
}

function configureMoneyInput(input: HTMLInputElement, currency: Currency, positive: boolean): void {
  const fractionDigits = currencyFractionDigits(currency);
  input.type = "number";
  input.inputMode = fractionDigits === 0 ? "numeric" : "decimal";
  input.min = positive ? (fractionDigits === 0 ? "1" : "0.01") : "0";
  input.step = fractionDigits === 0 ? "1" : "0.01";
}

class PrivacyModal extends Modal {
  private readonly closeForPrivacy = () => this.close();

  open(): void {
    window.addEventListener("investment-tracker-lock", this.closeForPrivacy);
    window.addEventListener(PRIVACY_MASK_EVENT, this.closeForPrivacy);
    super.open();
  }

  close(): void {
    window.removeEventListener("investment-tracker-lock", this.closeForPrivacy);
    window.removeEventListener(PRIVACY_MASK_EVENT, this.closeForPrivacy);
    super.close();
  }
}

export class CreateAccountModal extends PrivacyModal {
  private name = "";
  private startDate = todayLocal();
  private initialValue = "";

  constructor(
    app: App,
    private readonly currency: Currency,
    private readonly onSubmit: (input: CreateAccountInput) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("investment-tracker-modal");
    contentEl.createEl("h2", { text: t("Create investment account") });
    contentEl.createEl("p", {
      cls: "investment-tracker-modal-intro",
      text: t("The initial asset value will be recorded as both the first contribution and the first valuation in {currency}.", { currency: this.currency }),
    });

    new Setting(contentEl)
      .setName(t("Account name"))
      .setDesc(t("For example: Long-term investments or Education fund"))
      .addText((text) => text.setPlaceholder(t("Long-term investments")).onChange((value) => (this.name = value)));

    new Setting(contentEl)
      .setName(t("Start date"))
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.startDate).onChange((value) => (this.startDate = value));
      });

    new Setting(contentEl)
      .setName(t("Initial asset value ({currency})", { currency: this.currency }))
      .addText((text) => {
        configureMoneyInput(text.inputEl, this.currency, true);
        text.setPlaceholder(currencyFractionDigits(this.currency) === 0 ? "100000" : "100000.00").onChange((value) => (this.initialValue = value));
      });

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText(t("Create account"))
        .setCta()
        .onClick(async () => {
          if (!this.name.trim()) {
            new Notice(t("Enter an account name"));
            return;
          }
          if (!isIsoDate(this.startDate)) {
            new Notice(t("Enter a valid date"));
            return;
          }
          if (!isPositiveAmount(this.initialValue, this.currency)) {
            new Notice(t("Enter a valid positive amount in {currency}", { currency: this.currency }));
            return;
          }
          button.setDisabled(true).setButtonText(t("Creating…"));
          try {
            await this.onSubmit({
              name: this.name.trim(),
              startDate: this.startDate,
              initialValue: this.initialValue.trim(),
            });
            this.close();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : t("Could not create the account"));
            button.setDisabled(false).setButtonText(t("Create account"));
          }
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class RecordUpdateModal extends PrivacyModal {
  private effectiveDate = todayLocal();
  private flowType: RecordUpdateInput["flowType"] = "none";
  private flowAmount = "";
  private totalValue = "";
  private note = "";
  private amountSetting: Setting | null = null;

  constructor(
    app: App,
    private readonly accountName: string,
    private readonly currency: Currency,
    private readonly onSubmit: (input: RecordUpdateInput) => Promise<void>,
    initial?: Partial<RecordUpdateInput>,
  ) {
    super(app);
    this.effectiveDate = initial?.effectiveDate ?? this.effectiveDate;
    this.flowType = initial?.flowType ?? this.flowType;
    this.flowAmount = initial?.flowAmount ?? this.flowAmount;
    this.totalValue = initial?.totalValue ?? this.totalValue;
    this.note = initial?.note ?? this.note;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("investment-tracker-modal");
    contentEl.createEl("h2", { text: t("Update returns · {account}", { account: this.accountName }) });
    contentEl.createEl("p", {
      cls: "investment-tracker-modal-intro",
      text: t("Stock trades, rebalancing, and dividends retained in the account are not external cash flows."),
    });

    new Setting(contentEl).setName(t("Record date")).addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.effectiveDate).onChange((value) => (this.effectiveDate = value));
    });

    new Setting(contentEl)
      .setName(t("External cash-flow change"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("none", t("None"))
          .addOption("contribution", t("Contribution"))
          .addOption("withdrawal", t("Withdrawal"))
          .setValue(this.flowType)
          .onChange((value) => {
            this.flowType = value as RecordUpdateInput["flowType"];
            this.updateAmountVisibility();
          }),
      );

    this.amountSetting = new Setting(contentEl).setName(t("Cash-flow amount ({currency})", { currency: this.currency })).addText((text) => {
      configureMoneyInput(text.inputEl, this.currency, true);
      text.setValue(this.flowAmount).onChange((value) => (this.flowAmount = value));
    });
    this.updateAmountVisibility();

    new Setting(contentEl).setName(t("Current total account value ({currency})", { currency: this.currency })).addText((text) => {
      configureMoneyInput(text.inputEl, this.currency, false);
      text.setPlaceholder(currencyFractionDigits(this.currency) === 0 ? "0" : "0.00").setValue(this.totalValue).onChange((value) => (this.totalValue = value));
    });

    new Setting(contentEl).setName(t("Note (optional)")).addTextArea((text) =>
      text.setPlaceholder(t("For example: Monthly update")).setValue(this.note).onChange((value) => (this.note = value)),
    );

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText(t("Save update"))
        .setCta()
        .onClick(async () => {
          if (!isIsoDate(this.effectiveDate)) {
            new Notice(t("Enter a valid date"));
            return;
          }
          if (this.flowType !== "none" && !isPositiveAmount(this.flowAmount, this.currency)) {
            new Notice(t("Enter a valid positive amount in {currency}", { currency: this.currency }));
            return;
          }
          if (!isNonNegativeAmount(this.totalValue, this.currency)) {
            new Notice(t("Enter a valid non-negative amount in {currency}", { currency: this.currency }));
            return;
          }
          button.setDisabled(true).setButtonText(t("Saving…"));
          try {
            await this.onSubmit({
              effectiveDate: this.effectiveDate,
              flowType: this.flowType,
              flowAmount: this.flowAmount.trim(),
              totalValue: this.totalValue.trim(),
              note: this.note.trim(),
            });
            this.close();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : t("Could not save the update"));
            button.setDisabled(false).setButtonText(t("Save update"));
          }
        }),
    );
  }

  private updateAmountVisibility(): void {
    if (!this.amountSetting) return;
    this.amountSetting.settingEl.toggle(this.flowType !== "none");
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class CorrectEventModal extends PrivacyModal {
  private date: string;
  private amount: string;
  private note: string;

  constructor(
    app: App,
    private readonly event: CashFlowEvent | ValuationEvent,
    private readonly onSubmit: (date: string, amount: string, note: string) => Promise<void>,
  ) {
    super(app);
    this.date = event.effectiveDate;
    this.amount = event.type === "cash-flow" ? event.amount : event.totalValue;
    this.note = event.note ?? "";
  }

  onOpen(): void {
    const isValuation = this.event.type === "valuation";
    this.contentEl.addClass("investment-tracker-modal");
    this.contentEl.createEl("h2", { text: isValuation ? t("Correct asset valuation") : t("Correct cash-flow record") });
    this.contentEl.createEl("p", {
      cls: "investment-tracker-modal-intro",
      text: t("Original record: {date}. A correction adds a replacement record while keeping the original for audit purposes.", { date: formatDate(this.event.effectiveDate) }),
    });
    new Setting(this.contentEl).setName(t("Date")).addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.date).onChange((value) => (this.date = value));
    });
    new Setting(this.contentEl).setName(isValuation ? t("Total account value") : t("Cash-flow amount")).addText((text) => {
      configureMoneyInput(text.inputEl, this.event.currency, !isValuation);
      text.setValue(this.amount).onChange((value) => (this.amount = value));
    });
    new Setting(this.contentEl).setName(t("Note")).addTextArea((text) =>
      text.setValue(this.note).onChange((value) => (this.note = value)),
    );
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText(t("Save correction"))
        .setCta()
        .onClick(async () => {
          const validAmount = isValuation
            ? isNonNegativeAmount(this.amount, this.event.currency)
            : isPositiveAmount(this.amount, this.event.currency);
          if (!isIsoDate(this.date) || !validAmount) {
            new Notice(t("Check the date and amount"));
            return;
          }
          button.setDisabled(true);
          try {
            await this.onSubmit(this.date, this.amount.trim(), this.note.trim());
            this.close();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : t("Could not save the correction"));
            button.setDisabled(false);
          }
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ConfirmModal extends PrivacyModal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("investment-tracker-modal");
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });
    const actions = this.contentEl.createDiv({ cls: "investment-tracker-modal-actions" });
    const cancel = actions.createEl("button", { text: t("Cancel") });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-warning", text: this.confirmLabel });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        await this.onConfirm();
        this.close();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("The operation failed"));
        confirm.disabled = false;
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class JsonImportModal extends PrivacyModal {
  private payload = "";

  constructor(app: App, private readonly onImport: (payload: string) => Promise<number>) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("investment-tracker-modal", "investment-tracker-import-modal");
    this.contentEl.createEl("h2", { text: t("Import ledger JSON") });
    this.contentEl.createEl("p", {
      cls: "investment-tracker-modal-intro",
      text: t("Paste a complete JSON export from Investment Tracker. Existing eventIds are skipped automatically and existing records are not overwritten."),
    });
    const textarea = this.contentEl.createEl("textarea", {
      cls: "investment-tracker-import-textarea",
      attr: { placeholder: '{\n  "events": [...]\n}' },
    });
    textarea.addEventListener("input", () => (this.payload = textarea.value));
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText(t("Validate and import"))
        .setCta()
        .onClick(async () => {
          if (!this.payload.trim()) {
            new Notice(t("Paste JSON content"));
            return;
          }
          button.setDisabled(true).setButtonText(t("Importing…"));
          try {
            const count = await this.onImport(this.payload);
            new Notice(t("Imported {count} new records", { count: new Intl.NumberFormat(getIntlLocale()).format(count) }));
            this.close();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : t("Import failed"));
            button.setDisabled(false).setButtonText(t("Validate and import"));
          }
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class MarketCsvImportModal extends PrivacyModal {
  private payload = "";

  constructor(
    app: App,
    private readonly currency: Currency,
    private readonly onImport: (payload: string) => Promise<number>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("investment-tracker-modal", "investment-tracker-import-modal");
    this.contentEl.createEl("h2", { text: t("Import S&P 500 benchmark CSV") });
    this.contentEl.createEl("p", {
      cls: "investment-tracker-modal-intro",
      text: t("The CSV must contain date and close columns, and close must already be denominated in {currency}. Your data determines whether it represents a price index or total return index.", { currency: this.currency }),
    });
    const textarea = this.contentEl.createEl("textarea", {
      cls: "investment-tracker-import-textarea",
      attr: { placeholder: "date,close\n2025-01-02,100.00\n2025-01-03,101.25" },
    });
    textarea.addEventListener("input", () => (this.payload = textarea.value));
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText(t("Validate and save"))
        .setCta()
        .onClick(async () => {
          if (!this.payload.trim()) {
            new Notice(t("Paste CSV content"));
            return;
          }
          button.setDisabled(true).setButtonText(t("Importing…"));
          try {
            const count = await this.onImport(this.payload);
            new Notice(t("Saved {count} benchmark data points", { count: new Intl.NumberFormat(getIntlLocale()).format(count) }));
            this.close();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : t("Import failed"));
            button.setDisabled(false).setButtonText(t("Validate and save"));
          }
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class PasswordPromptModal extends PrivacyModal {
  private password = "";

  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly onSubmit: (password: string) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("investment-tracker-modal");
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { cls: "investment-tracker-modal-intro", text: this.message });
    let input: HTMLInputElement;
    new Setting(this.contentEl).setName(t("Ledger password")).addText((text) => {
      input = text.inputEl;
      input.type = "password";
      input.autocomplete = "current-password";
      text.onChange((value) => (this.password = value));
    });
    const actions = this.contentEl.createDiv({ cls: "investment-tracker-modal-actions" });
    const cancel = actions.createEl("button", { text: t("Cancel") });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-cta", text: this.confirmLabel });
    const submit = async () => {
      if (!this.password) return;
      confirm.disabled = true;
      try {
        await this.onSubmit(this.password);
        this.password = "";
        this.close();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("Verification failed"));
        confirm.disabled = false;
        input.select();
      }
    };
    confirm.addEventListener("click", () => void submit());
    input!.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void submit();
    });
    window.setTimeout(() => input!.focus(), 0);
  }

  onClose(): void {
    this.password = "";
    this.contentEl.empty();
  }
}

export class ChangePasswordModal extends PrivacyModal {
  private current = "";
  private next = "";
  private confirmation = "";

  constructor(app: App, private readonly onSubmit: (current: string, next: string) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("investment-tracker-modal");
    this.contentEl.createEl("h2", { text: t("Change ledger password") });
    this.contentEl.createEl("p", { cls: "investment-tracker-modal-intro", text: t("Changing the password does not re-encrypt every event, and the recovery key remains valid.") });
    const addPassword = (name: string, autocomplete: "current-password" | "new-password", onChange: (value: string) => void) => {
      new Setting(this.contentEl).setName(name).addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = autocomplete;
        text.onChange(onChange);
      });
    };
    addPassword(t("Current password"), "current-password", (value) => (this.current = value));
    addPassword(t("New password (at least 10 characters)"), "new-password", (value) => (this.next = value));
    addPassword(t("Enter new password again"), "new-password", (value) => (this.confirmation = value));
    const actions = this.contentEl.createDiv({ cls: "investment-tracker-modal-actions" });
    actions.createEl("button", { text: t("Cancel") }).addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-cta", text: t("Change password") });
    confirm.addEventListener("click", async () => {
      if (this.next !== this.confirmation) {
        new Notice(t("The new passwords do not match"));
        return;
      }
      confirm.disabled = true;
      try {
        await this.onSubmit(this.current, this.next);
        new Notice(t("Ledger password changed"));
        this.close();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : t("Could not change the password"));
        confirm.disabled = false;
      }
    });
  }

  onClose(): void {
    this.current = "";
    this.next = "";
    this.confirmation = "";
    this.contentEl.empty();
  }
}

export function isCorrectableEvent(event: LedgerEvent): event is CashFlowEvent | ValuationEvent {
  return event.type === "cash-flow" || event.type === "valuation";
}

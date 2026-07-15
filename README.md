# Investment Tracker — Private Portfolio Tracking for Obsidian

English | [简体中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-CN.md) | [繁體中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-TW.md) | [日本語](https://github.com/joelam2023/investment-tracker/blob/main/README.ja.md) | [한국어](https://github.com/joelam2023/investment-tracker/blob/main/README.ko.md) | [Español](https://github.com/joelam2023/investment-tracker/blob/main/README.es.md) | [Deutsch](https://github.com/joelam2023/investment-tracker/blob/main/README.de.md) | [Français](https://github.com/joelam2023/investment-tracker/blob/main/README.fr.md) | [Português (Brasil)](https://github.com/joelam2023/investment-tracker/blob/main/README.pt-BR.md)

**Your portfolio. Your vault. Encrypted.**

Investment Tracker is a private, local-first portfolio tracker for Obsidian. Track cash flows, valuations, returns, and benchmark performance while encrypted investment records stay in your Vault—without an account, telemetry, or a developer-operated backend.

It works at the account level, so you can calculate investment performance without maintaining position-level trade history.

## Key facts

| Topic | How Investment Tracker works |
| --- | --- |
| Investment records | Encrypted and stored inside the user's Obsidian Vault |
| Developer-operated backend | None |
| Account or sign-in | Not required |
| Telemetry and analytics | None |
| Encryption | AES-256-GCM, with the ledger key protected by PBKDF2-SHA256 and a separate recovery key |
| Optional network access | Automatic benchmark mode requests public benchmark and FX data from FRED |
| Vault sync | A user-selected service such as Obsidian Sync or iCloud may sync the encrypted ledger |
| Exports | User-created JSON and CSV exports are plaintext |

## Features

- Multiple investment accounts in USD, GBP, SGD, CNY, TWD, JPY, KRW, EUR, or BRL.
- Immutable event-based bookkeeping for contributions, withdrawals, and valuations.
- XIRR, cumulative profit, yearly returns, and monthly Modified Dietz returns.
- Same-cash-flow comparison with the S&P 500 Price Index.
- Currency-aware FRED benchmark conversion with explicit quote-direction checks.
- Password lock, separate recovery key, hidden financial values, and configurable automatic locking.
- Encrypted JSON events stored inside the user's Vault.
- Explicit local JSON and CSV export; the settings flow requires password re-authentication.
- Automatic interface language selection with a manual override and English fallback.
- English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, German, French, and Brazilian Portuguese.

## Best for

- Privacy-conscious investors who want their portfolio records inside their own Obsidian Vault.
- People who record account-level contributions, withdrawals, and valuations manually.
- Investors who want XIRR, monthly and yearly performance, and an S&P 500 comparison.
- Users who prefer a local-first workflow without creating another financial account.

## Not designed for

- Brokerage account synchronization.
- Live holdings, price feeds, tax-lot accounting, or automated trading.
- Replacing a broker statement, tax record, or professional financial advice.
- Protecting an unlocked Vault from a compromised device or another malicious plugin.

## Installation and updates

Install **Investment Tracker** from **Obsidian → Settings → Community plugins → Browse**. Search for “Investment Tracker,” select the plugin, and choose **Install**, then **Enable**.

Updates are delivered through Obsidian's Community plugins update mechanism.

For manual installation or testing, place `main.js`, `manifest.json`, and `styles.css` in:

```text
<Vault>/.obsidian/plugins/investment-tracker/
```

## Basic usage

1. Open Investment Tracker from the ribbon.
2. Set a password and save the generated recovery key outside the Vault.
3. Create an account and record its initial valuation.
4. Record external contributions, withdrawals, and updated total account valuations.
5. Use the eye button to reveal or hide financial values.
6. Review monthly and yearly returns and compare them with the selected benchmark.
7. Choose the automatic-lock rules under **Settings → Investment Tracker → Privacy and encryption**.

Changing the interface language never changes an existing account's currency. On a new installation, the plugin only uses locale information to suggest an initial currency; users can change it before creating an account.

## Privacy and security

Investment Tracker has no developer-operated cloud, account system, telemetry, analytics, advertising, or automatic upload mechanism. Account names, dates, amounts, notes, and event data are encrypted and stored in the user's Obsidian Vault. New installations use the `Investment Tracker Data` folder; existing safe data paths are preserved during upgrades.

Event data is encrypted with AES-256-GCM. The ledger key is wrapped using a password-derived PBKDF2-SHA256 key and a separate recovery key. The password and unwrapped ledger key are not written to plugin settings.

Automatic locking has two independent rules: lock immediately when leaving Investment Tracker or when Obsidian loses focus, and lock after 1, 5, 15, or 30 minutes without activity in Investment Tracker. At least one rule remains enabled. If immediate leave locking is disabled, leaving still hides financial values, collapses expanded history, and closes sensitive dialogs. The inactivity rule or a manual lock determines when the ledger key is cleared from memory.

A newly generated recovery key is hidden after leaving and is shown again only after the ledger is unlocked. Keep the recovery key outside the Vault and use a strong, unique password.

Encryption protects stored ledger files from casual disclosure. It cannot protect data while the plugin is unlocked, from a compromised device, from screenshots or clipboard exposure, or from another malicious plugin with access to the same Vault.

### Sync and exports

Investment Tracker does not operate a sync service. If the user enables Obsidian Sync, iCloud, or another Vault synchronization service, that user-selected service may synchronize the encrypted ledger files between devices.

JSON and CSV exports are plaintext files created only when the user explicitly exports them. Treat exported files as sensitive financial records and store or delete them appropriately.

Read the full [Privacy Policy](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md) and [Security Policy](https://github.com/joelam2023/investment-tracker/blob/main/SECURITY.md).

## Network disclosure

Core record keeping and return calculations do not require a developer-operated service. Automatic benchmark mode sends HTTPS GET requests to the Federal Reserve Economic Data service at `fred.stlouisfed.org` for S&P 500 and currency-conversion data.

Those requests contain only public series identifiers, the selected currencies needed to choose an FX series, and date ranges. They do not include account names, balances, cash-flow amounts, valuations, notes, passwords, recovery keys, or ledger contents.

Users can select manual benchmark mode to avoid automatic FRED requests. Automatic benchmark updates require an internet connection. The S&P 500 series used by the plugin is a price index and does not include dividends.

## Frequently asked questions

### Does Investment Tracker upload my portfolio data?

No portfolio ledger is sent to a developer-operated backend. The plugin has no developer account system, telemetry, analytics, or automatic portfolio upload. Automatic benchmark mode makes the limited FRED requests described under [Network disclosure](#network-disclosure).

### Where is my investment data stored?

The encrypted ledger is stored inside the user's Obsidian Vault. New installations use `Investment Tracker Data`. If the Vault is synchronized through a service selected by the user, that service may also store or transfer the encrypted ledger.

### Is my investment data encrypted?

Stored event data is encrypted with AES-256-GCM. A password-derived PBKDF2-SHA256 key and a separate recovery key protect the ledger key. Data is visible while the plugin is unlocked, and user-created JSON or CSV exports are not encrypted.

### Can I use Investment Tracker offline?

Local records and return calculations can be used without a developer-operated service. Automatic FRED benchmark and currency updates require internet access; manual benchmark mode avoids those requests.

### Does it connect to my brokerage account?

No. Investment Tracker does not connect to brokerage accounts. Users manually record external contributions, withdrawals, and total account valuations.

### Does it track individual holdings or trades?

No position-level trade history is required. The plugin is designed for account-level cash flows and valuations rather than live holdings or tax-lot accounting.

### What information is sent to FRED?

Only public series identifiers, selected currencies needed for FX-series selection, and date ranges are included in automatic benchmark requests. Portfolio records and credentials are not included.

### What happens if I lose my password?

Use the separately stored recovery key to regain access according to the plugin's recovery flow. Losing both the password and recovery key may make the encrypted ledger inaccessible.

### Are JSON and CSV exports encrypted?

No. JSON and CSV exports are plaintext and should be handled as sensitive financial records.

## Help and feedback

Open **Settings → Investment Tracker → Help and feedback** to report a bug, suggest a feature, or copy non-sensitive diagnostic information. Reports may be written in any language.

Feedback links open GitHub only after the user clicks a button. The plugin never automatically creates a report or sends ledger data, account names, balances, transactions, passwords, recovery keys, Vault names, Vault paths, or diagnostic information to the developer. Review copied diagnostics and redact screenshots before submitting them.

Report security or privacy vulnerabilities through [GitHub private vulnerability reporting](https://github.com/joelam2023/investment-tracker/security/advisories/new), not a public issue.

## Development

```bash
npm ci
npm run check
npm run build:release
npm run privacy:check
```

Translations use English source strings as the fallback. Pull requests that change user-facing text must update every locale and keep interpolation placeholders unchanged.

Release tags must exactly match the semantic version in `manifest.json`, without a `v` prefix. The release workflow creates a draft GitHub Release containing only `main.js`, `manifest.json`, and `styles.css` for manual review before publication.

Maintainer instructions are in the full [Release Guide](https://github.com/joelam2023/investment-tracker/blob/main/RELEASING.md).

## Financial disclaimer

This plugin is a record-keeping and calculation tool, not financial, tax, legal, or investment advice. Verify important calculations independently before making decisions.

## License

[MIT License](https://github.com/joelam2023/investment-tracker/blob/main/LICENSE)

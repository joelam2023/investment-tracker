# Investment Tracker

Investment Tracker is a local-first Obsidian plugin for recording external investment cash flows and portfolio valuations. It calculates account and portfolio returns without requiring position-level trade history.

The interface follows Obsidian's language automatically, with a manual override and English fallback. English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, German, French, and Brazilian Portuguese are included.

## Features

- Investment accounts denominated in USD, GBP, SGD, CNY, TWD, JPY, KRW, EUR, or BRL.
- Immutable event-based bookkeeping for contributions, withdrawals, and valuations.
- XIRR, cumulative profit, yearly returns, and monthly Modified Dietz returns.
- Same-cash-flow comparison with the S&P 500 Price Index.
- Currency-aware FRED benchmark conversion with explicit quote-direction checks.
- Password lock, recovery key, hidden financial values, and configurable automatic locking.
- Encrypted JSON events stored inside the user's Vault.
- Explicit JSON and CSV export with password re-authentication.

## Privacy and security

- No account is required.
- No telemetry, analytics, advertising, or usage tracking is included.
- Account names, dates, amounts, notes, and event data remain in the user's Vault.
- Event data is encrypted with AES-256-GCM. The ledger key is wrapped using a password-derived PBKDF2-SHA256 key and a separate recovery key.
- The password and unwrapped ledger key are not written to plugin settings.
- Automatic locking has two independent rules: lock immediately when leaving Investment Tracker or when Obsidian loses focus, and lock after 1, 5, 15, or 30 minutes without activity in Investment Tracker. At least one rule remains enabled.
- If immediate leave locking is disabled, leaving still hides financial values, collapses expanded history, and closes sensitive dialogs. The inactivity rule or a manual lock still determines when the ledger key is cleared from memory.
- A newly generated recovery key is hidden after leaving and is shown again only after the ledger is unlocked.
- New installations store their ledger under `Investment Tracker Data`. Existing safe data paths are preserved when upgrading.
- JSON and CSV exports are plaintext. Treat exported files as sensitive financial records.

Encryption protects stored ledger files from casual disclosure. It cannot protect data while the plugin is unlocked, from a compromised device, or from another malicious plugin running with access to the same Vault. Use a strong unique password and keep the recovery key outside the Vault.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for details.

## Network disclosure

Automatic benchmark mode sends HTTPS GET requests to the Federal Reserve Economic Data service at `fred.stlouisfed.org`. Requests contain only public series identifiers and date ranges needed for S&P 500 and currency conversion data. Account names, balances, cash-flow amounts, notes, and ledger contents are not included.

Users can select manual benchmark mode to avoid these requests. The S&P 500 series used by the plugin is a price index and does not include dividends.

## Basic usage

1. Open Investment Tracker from the ribbon.
2. Set a password and save the generated recovery key outside the Vault.
3. Create an account and record its initial valuation.
4. Record only external contributions, withdrawals, and updated total account valuations.
5. Use the eye button to reveal or hide financial values.
6. Choose the automatic-lock rules under **Settings → Investment Tracker → Privacy and encryption**.

Changing the interface language never changes an existing account's currency. On a new installation, the plugin only uses locale information to suggest an initial currency; users can change it before creating an account.

## Installation and updates

After acceptance into the Obsidian Community directory, install and update the plugin from **Settings → Community plugins**.

For manual testing, place `main.js`, `manifest.json`, and `styles.css` in:

```text
<Vault>/.obsidian/plugins/investment-tracker/
```

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

Maintainer instructions are in [RELEASING.md](RELEASING.md).

## Financial disclaimer

This plugin is a record-keeping and calculation tool, not financial, tax, legal, or investment advice. Verify important calculations independently before making decisions.

## License

[MIT](LICENSE)

# Privacy

## Data stored in the Vault

Investment Tracker stores plugin settings through Obsidian's plugin data API and stores ledger data in a dedicated Vault folder. The ledger may contain account names, event dates, currencies, amounts, valuations, and notes.

Event payloads are encrypted with AES-256-GCM. The random ledger key is wrapped by both:

- a PBKDF2-SHA256 key derived from the user's password; and
- a separate recovery key generated during setup.

Passwords and plaintext recovery keys are not persisted by the plugin. Losing both the password and recovery key makes the encrypted ledger unrecoverable.

## Network use

In automatic benchmark mode, the plugin requests public S&P 500 and foreign-exchange series from the Federal Reserve Economic Data service. Request parameters contain series identifiers and date ranges. They do not contain portfolio names, account identifiers, balances, amounts, notes, or encrypted events.

Language detection reads Obsidian's configured interface language locally. The locale is not transmitted to the plugin developer or any analytics service.

As with any network request, the remote service and network intermediaries may observe normal connection metadata such as the user's IP address. Manual benchmark mode disables these automatic requests.

## No telemetry

The plugin contains no telemetry, advertising, analytics SDK, account system, or developer-operated backend service.

## Feedback and diagnostics

The Help and feedback section contains links to the project's GitHub issue forms. GitHub opens only after the user clicks a feedback button. The plugin never automatically creates a report or sends financial data, ledger contents, credentials, Vault information, or diagnostic information to the developer.

The optional **Copy diagnostic information** action writes a small, non-financial summary to the clipboard for the user to review and paste manually. It is limited to the plugin version, Obsidian version, platform, and interface language. It excludes Vault names and paths, account names, currencies, balances, cash flows, valuations, transactions, notes, ledger files, encryption material, passwords, recovery keys, and foreign-exchange cache contents.

Opening GitHub is an external network action governed by GitHub's own privacy terms. Users should remove financial and identifying information from screenshots or text before submitting feedback.

## Automatic locking and privacy masking

Automatic locking has two independently configurable rules: immediate locking when the user leaves Investment Tracker or Obsidian loses focus, and locking after 1, 5, 15, or 30 minutes without activity in Investment Tracker. At least one rule remains enabled.

If immediate leave locking is disabled, leaving Investment Tracker still hides financial values, collapses expanded history, and closes sensitive dialogs. This masking reduces accidental on-screen disclosure, but it does not clear the unlocked ledger key from memory. The inactivity rule, manual lock, plugin unload, or Obsidian shutdown determines when the ledger is locked.

A newly generated recovery key is treated more strictly: if the user leaves before acknowledging that it was saved, the ledger is locked and the recovery key is shown again only after password or recovery-key unlock.

## Plaintext exports

JSON and CSV exports are intentionally plaintext so users can inspect and migrate their data. Export requires password re-authentication. Exported files must be protected by the user and should not be attached to public issues.

## Threat model

Encryption protects ledger files at rest. It does not protect against:

- a compromised operating system or Obsidian installation;
- malicious plugins with Vault or runtime access;
- disclosure while the ledger is unlocked;
- screenshots, clipboard history, or plaintext exports; or
- weak or reused passwords.

## Public issue safety

Do not post real ledger files, recovery keys, passwords, account names, balances, transaction dates, or unredacted screenshots in public GitHub issues.

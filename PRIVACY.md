# Privacy

Investment Tracker is a local-first Obsidian plugin. It has no developer-operated backend, account system, telemetry, advertising, or analytics SDK. Portfolio records are not sent to the developer.

This does not mean that every file always remains on one physical device. A Vault synchronization service selected by the user may copy Vault files, and the optional integrations described below make limited network requests.

## What is stored and where

### Plugin settings

Settings are stored through Obsidian's plugin data API, normally in the Vault's Obsidian configuration directory. These settings are not encrypted by Investment Tracker. They include the data-folder path, base currency, language, benchmark and market-data mode, automatic-lock choices, and settings schema version. They do not include account names, balances, cash flows, valuations, notes, passwords, recovery keys, or the unwrapped ledger key.

### Investment ledger

The ledger is stored in a user-configurable folder inside the Vault. New installations use `Investment Tracker Data` by default. The folder contains:

- `ledger-meta.json`, with the encryption format and key-wrapping metadata;
- `events/`, with one encrypted JSON envelope per ledger event;
- `backups/`, used for pending writes and write recovery (pending event payloads are encrypted after ledger encryption is enabled);
- `market-cache/`, with unencrypted benchmark and exchange-rate data; and
- `exports/`, with any plaintext JSON or CSV exports created by the user.

Encrypted event files contain account names, event dates, currencies, amounts, valuations, and notes only inside their ciphertext. `ledger-meta.json` contains public cryptographic parameters, salts, initialization vectors, wrapped key material, and a key-verification ciphertext. It does not contain a plaintext password, plaintext recovery key, or plaintext ledger key.

Encryption does not conceal every filesystem detail. Folder names, randomized event filenames, the approximate number and size of files, and filesystem timestamps remain visible to software or services that can inspect the Vault. Market-cache contents are also unencrypted; they may reveal the selected currency, public or manually imported benchmark points, covered dates, source, and fetch time.

### Migration from an older plaintext ledger

An older ledger remains plaintext until its encryption migration completes. During migration, the plugin encrypts and verifies every event, temporarily renames the original event folder to `events-plaintext-migration-backup`, and then permanently deletes that backup after the encrypted ledger is in place. If automatic deletion fails, the plugin displays a warning and tells the user to stop adding records and contact support.

## Encryption design

Investment Tracker creates a random 256-bit ledger key and encrypts event payloads with AES-256-GCM. Each encrypted value uses a fresh 96-bit initialization vector and authenticated additional data specific to its purpose.

The ledger key is wrapped independently by:

- an AES-256-GCM key derived from the user's password with PBKDF2-HMAC-SHA-256, a random 128-bit salt, and **310,000 iterations**; and
- an AES-256-GCM key made from a separate random 256-bit recovery key generated during setup.

The password and plaintext recovery key are not persisted by the plugin. The recovery key is displayed during setup so the user can store it separately. Losing both the password and recovery key can make the encrypted ledger unrecoverable; the developer has no key escrow and cannot reset either credential.

While the ledger is unlocked, the unwrapped ledger key exists in Obsidian's process memory. Locking drops the plugin's reference to that key, but JavaScript and the operating system do not provide a guarantee that process memory is immediately overwritten.

## Automatic locking and privacy masking

Automatic locking has two independently configurable rules:

- immediate locking when the user switches away from Investment Tracker or Obsidian loses focus; and
- locking after 1, 5, 15, or 30 minutes without activity in Investment Tracker.

At least one rule remains enabled. New installations enable both immediate leave locking and a five-minute inactivity lock.

If immediate leave locking is disabled, leaving Investment Tracker still hides financial values, collapses expanded history, and closes sensitive dialogs. This reduces accidental on-screen disclosure, but it does not clear the unlocked ledger key from memory. The inactivity rule, manual lock, plugin unload, or Obsidian shutdown determines when the ledger is locked.

A newly generated recovery key is treated more strictly: if the user leaves before acknowledging that it was saved, the ledger is locked and the recovery key is shown again only after password or recovery-key unlock.

## Network use

### Automatic benchmark mode

Automatic benchmark mode sends HTTPS GET requests to `fred.stlouisfed.org` for the public S&P 500 price index and, when needed, a public foreign-exchange series. The request query contains a public series identifier and start and end dates. The selected currency determines which public exchange-rate series is requested.

These requests do not contain account names or identifiers, balances, cash-flow amounts, valuations, notes, passwords, recovery keys, ledger files, encrypted events, or Vault names and paths. FRED and network intermediaries may still observe ordinary connection metadata such as the user's IP address, request time, requested series, date range, and standard HTTP/TLS metadata. Selecting manual benchmark mode disables automatic FRED requests.

### Help and feedback

The Help and feedback section links to GitHub issue forms and private vulnerability reporting. GitHub opens only after the user clicks a feedback button. The plugin does not automatically create or submit a report.

Opening GitHub is governed by GitHub's privacy terms, and GitHub and network intermediaries may observe normal connection metadata. Users should remove financial and identifying information from text and screenshots before submitting feedback.

### Language selection

Automatic language selection reads Obsidian's configured interface language locally. The locale is not transmitted to the developer or an analytics service.

## No telemetry or developer cloud

The plugin contains no telemetry, advertising, analytics SDK, developer account system, or developer-operated backend. The developer cannot use the plugin to remotely browse a user's Vault or retrieve portfolio records.

This statement does not cover Obsidian itself, other installed plugins, the operating system, GitHub, FRED, or a Vault synchronization provider selected by the user.

## Vault synchronization

Investment Tracker does not operate a synchronization service. If the user enables Obsidian Sync, iCloud, Git, or another Vault synchronization or backup service, that service may store or transfer files covered by its own terms and security model.

Encrypted ledger events remain encrypted when copied as files. Unencrypted plugin settings, market-cache files, filesystem metadata, and plaintext exports may also be synchronized depending on the service and its configuration.

## Plaintext imports and exports

JSON and CSV exports are intentionally plaintext so users can inspect and migrate their data. The export controls in Settings require password re-authentication, and the files are written under the ledger's `exports/` folder. They may include account names, identifiers, dates, amounts, currencies, and notes. Protect or delete them as sensitive financial records and do not attach them to public issues.

Imported JSON ledger exports and manually imported market CSV files are read only after the user explicitly supplies them. A ledger import is encrypted when appended to an encrypted ledger. The original import file remains under the control of the user and is not deleted by the plugin.

## Clipboard use

The plugin writes to the clipboard only after an explicit user action:

- **Copy recovery key** copies the plaintext recovery key. Clipboard managers or other software may retain it; save it in a password manager and clear clipboard history where appropriate.
- **Copy diagnostic information** copies only the plugin version, Obsidian version, platform, and interface language for the user to review and paste manually.

The diagnostic text excludes Vault names and paths, account names, currencies, balances, cash flows, valuations, transactions, notes, ledger files, market-cache contents, encryption material, passwords, and recovery keys.

## Threat model and limitations

Encryption is intended to protect ledger contents at rest from someone who obtains only the stored Vault files but not the password or recovery key. It does not provide absolute security and does not protect against:

- a compromised operating system, Obsidian installation, or user account;
- another malicious plugin or process with Vault, clipboard, screen, keyboard, or runtime-memory access;
- disclosure while the ledger is unlocked or values are visible;
- weak or reused passwords and offline password guessing against copied encrypted files;
- screenshots, screen sharing, clipboard history, plaintext imports or exports, or an exposed recovery key;
- observation of unencrypted filesystem, settings, cache, synchronization, or network metadata; or
- file deletion, rollback, corruption, device loss, or sync conflicts.

Use a strong unique password, store the recovery key separately, review installed Obsidian plugins, enable operating-system disk encryption, and maintain independent backups of the Vault.

## Public issue safety

Do not post real ledger files, exports, recovery keys, passwords, account names, balances, transaction dates, Vault paths, or unredacted screenshots in public GitHub issues. Use synthetic data whenever possible and report security or privacy vulnerabilities through [GitHub private vulnerability reporting](https://github.com/joelam2023/investment-tracker/security/advisories/new).

# Security policy

## Supported versions

Security fixes are provided for the latest version published through Obsidian's Community plugins directory. Older releases, development builds, forks, and manually modified bundles are not supported.

Update through **Obsidian → Settings → Community plugins → Check for updates** before reporting a problem. Include the exact plugin and Obsidian versions in a report.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/joelam2023/investment-tracker/security/advisories/new) for any issue that could expose financial data, bypass password protection or automatic locking, weaken encryption, cause an unintended network disclosure, overwrite or escape the configured data path, or compromise ledger integrity.

Do not open a public issue, discussion, or pull request for an unpatched vulnerability. A useful private report contains:

- the affected Investment Tracker and Obsidian versions and platform;
- a concise description of the impact and attack conditions;
- reproducible steps using a new test Vault and synthetic data;
- the expected and observed behavior; and
- any proposed mitigation, if known.

Do not include a real password, recovery key, ledger file, plaintext export, account name, balance, transaction date, Vault name or path, or unredacted screenshot. Create a minimal synthetic reproduction instead. If a file is necessary to demonstrate the issue, generate it in a disposable test Vault with invented data.

The plugin opens the private-report page only after the user clicks the relevant link. It does not automatically send diagnostics, credentials, Vault information, or ledger data.

## Disclosure process

Please keep the report private while the maintainer investigates and prepares a fix. GitHub's private advisory thread should be used for follow-up details and coordination. No fixed response or remediation time is promised, but reports that plausibly affect confidentiality, integrity, credential handling, or unintended network access will be prioritized.

After a fix is available, users should update through Obsidian's Community plugins interface. Public disclosure should avoid real user data and should be coordinated through the private advisory where practical.

## Security model

Ledger event payloads are encrypted at rest with AES-256-GCM. A random ledger key is wrapped independently by a password-derived key using PBKDF2-HMAC-SHA-256 with 310,000 iterations and by a separate random recovery key. Passwords and plaintext recovery keys are not persisted by the plugin, and the developer cannot recover a ledger if both credentials are lost.

This design does not protect an unlocked ledger from a compromised device, another malicious plugin, runtime-memory access, screenshots, clipboard capture, or a weak password. It also does not prevent file deletion, rollback, corruption, or sync conflicts. Plaintext JSON and CSV exports remain the user's responsibility.

For storage, synchronization, network, clipboard, metadata, and threat-model details, read the [Privacy Policy](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md).

## User security guidance

- Use a strong, unique Investment Tracker password that is not reused for Obsidian, email, or brokerage accounts.
- Store the recovery key outside the Vault in a trusted password manager or secure offline location.
- Keep Obsidian, Investment Tracker, the operating system, and trusted synchronization software updated.
- Install only plugins you trust; another plugin running in the same Obsidian process may be able to access the Vault or unlocked runtime data.
- Keep automatic locking enabled and manually lock the plugin before screen sharing or leaving the device.
- Treat copied recovery keys, screenshots, imported files, and JSON or CSV exports as sensitive.
- Use operating-system account protection and disk encryption, and keep independent backups to protect against loss or corruption.

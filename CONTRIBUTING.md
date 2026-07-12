# Contributing

## Before opening an issue or pull request

- Use the Bug report or Feature request form. Reports may be written in any language.
- Reproduce problems using synthetic accounts and amounts.
- Do not attach real ledger files, exports, recovery keys, passwords, or unredacted screenshots.
- Review copied diagnostic information before submitting it. Never request or add automatic diagnostic, telemetry, ledger, or Vault uploads.
- Report vulnerabilities involving privacy, passwords, encryption, or financial-data exposure through GitHub private vulnerability reporting instead of a public issue.
- Run `npm run release:check` before submitting code.
- Keep every user-facing source string in English and route it through `t()`. Update all locale catalogs, preserve interpolation placeholders exactly, and run `npm run i18n:check`.
- Keep network behavior explicit and do not add telemetry or analytics.
- Do not add runtime dependencies without a clear security and maintenance justification.

## Release assets

Only `main.js`, `manifest.json`, and `styles.css` belong in a GitHub Release. User data and generated exports must never be committed or uploaded.

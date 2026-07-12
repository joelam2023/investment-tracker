# Releasing

GitHub Actions creates a draft release. A human must inspect and publish it.

## One-time setup

1. Configure a public GitHub identity and a GitHub-provided no-reply email for this repository.
2. Create a public repository and add it as `origin`.
3. Enable private vulnerability reporting in the repository Security settings.
4. Never copy files from a live Vault or installed plugin directory into this repository.

## Publish a version

1. Start from a clean `main` branch.
2. Run:

   ```bash
   npm ci
   npm run release:check
   ```

3. Bump the semantic version. The tracked `.npmrc` removes npm's default `v` tag prefix:

   ```bash
   npm version patch
   # or: npm version minor
   # or: npm version major
   ```

4. Inspect the version commit and confirm that `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` agree.
5. Push `main`, then push the exact version tag separately.
6. Wait for the **Draft release** workflow to finish.
7. Inspect the draft. It must contain exactly:

   - `main.js`
   - `manifest.json`
   - `styles.css`

8. Confirm that the tag and `manifest.json` version match, then publish the draft manually.

Do not replace an existing release asset or move an existing version tag. Publish a new patch version instead.

## Privacy check before every release

- No `data.json`, `ledger-meta.json`, events, exports, cache, backups, spreadsheets, screenshots, or credentials.
- No real account names, balances, transaction dates, recovery keys, or Vault paths in source, tests, documentation, issues, or release notes.
- Screenshots must come from a synthetic demo Vault and must not show unrelated sidebars or file names.
- Commit metadata must use the intended public author name and a no-reply email.

# Changelog

All notable changes to Investment Tracker are documented here.

## 1.0.3

- Added complete public documentation for all nine supported interface languages: English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, German, French, and Brazilian Portuguese.
- Added nine-language navigation to every localized README.
- Made no changes to plugin behavior, ledger storage, encryption, calculations, network requests, or data formats. This release contains no personal or portfolio data.

## 1.0.2

- Reframed the public description around private, local-first portfolio tracking with encrypted records stored in the user's Obsidian Vault.
- Added a privacy facts table, clearer installation guidance, intended-use boundaries, and direct-answer privacy FAQs to the English README.
- Added a Simplified Chinese README covering installation, features, privacy, network use, synchronization, exports, and threat boundaries.
- Expanded the privacy and security documentation with precise encryption parameters, FRED request scope, user-selected Vault synchronization, clipboard and plaintext-export risks, visible filesystem metadata, and the supported threat model.
- Updated repository metadata and corrected documentation links for the Obsidian Community directory renderer.
- Made no changes to ledger data, storage formats, investment calculations, or migration behavior. This release contains no personal or portfolio data.

## 1.0.1

- Preserved the Investment Tracker leaf location when the plugin unloads.
- Replaced static inline chart visibility styles with CSS state classes for Obsidian marketplace compatibility.

## 1.0.0

- Prepared the first public release.
- Added encrypted event storage, password and recovery-key unlock, and automatic locking with independent leave and inactivity rules.
- Added account and portfolio XIRR, yearly returns, monthly Modified Dietz returns, and S&P 500 comparison.
- Added privacy masking, immutable corrections, plaintext export warnings, and release privacy checks. Leaving Investment Tracker still hides sensitive values and closes sensitive dialogs when immediate leave locking is disabled.
- Added automatic language detection with English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, German, French, and Brazilian Portuguese.
- Added USD, GBP, SGD, CNY, TWD, JPY, KRW, EUR, and BRL account currencies with quote-direction-safe FRED conversion.
- Added privacy-safe GitHub bug, feature, and private security feedback links with user-reviewed diagnostic copying.

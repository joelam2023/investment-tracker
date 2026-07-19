# Investment Tracker — 適用於 Obsidian 的私密投資組合追蹤工具

[English](https://github.com/joelam2023/investment-tracker/blob/main/README.md) | [简体中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-CN.md) | 繁體中文 | [日本語](https://github.com/joelam2023/investment-tracker/blob/main/README.ja.md) | [한국어](https://github.com/joelam2023/investment-tracker/blob/main/README.ko.md) | [Español](https://github.com/joelam2023/investment-tracker/blob/main/README.es.md) | [Deutsch](https://github.com/joelam2023/investment-tracker/blob/main/README.de.md) | [Français](https://github.com/joelam2023/investment-tracker/blob/main/README.fr.md) | [Português (Brasil)](https://github.com/joelam2023/investment-tracker/blob/main/README.pt-BR.md)

**你的投資組合。你的 Vault。加密保護。**

Investment Tracker 是一款適用於 Obsidian、重視隱私且採用本機優先設計的投資組合追蹤工具。你可以追蹤資金流、資產估值、報酬率與基準表現，同時將加密的投資紀錄保留在自己的 Vault 中，無須建立帳號，也沒有遙測或由開發者營運的後端。

它以帳戶為單位運作，因此不必維護逐筆持倉交易紀錄，也能計算投資績效。

## 重要資訊

| 項目 | Investment Tracker 的運作方式 |
| --- | --- |
| 投資紀錄 | 加密後儲存在使用者自己的 Obsidian Vault 中 |
| 由開發者營運的後端 | 無 |
| 帳號或登入 | 不需要 |
| 遙測與分析 | 無 |
| 加密 | AES-256-GCM；帳本金鑰由 PBKDF2-SHA256 與獨立復原金鑰保護 |
| 選用的網路存取 | 自動基準模式會向 FRED 請求公開的基準與匯率資料 |
| Vault 同步 | 使用者選擇的服務（例如 Obsidian Sync 或 iCloud）可能會同步加密帳本 |
| 匯出 | 使用者建立的 JSON 與 CSV 匯出檔案為明文 |

## 功能

- 支援 USD、GBP、SGD、CNY、TWD、JPY、KRW、EUR 或 BRL 的多個投資帳戶。
- 建立帳戶時可個別選擇幣別，之後可編輯名稱或比較基準，並可封存或還原帳戶而不刪除加密歷史。
- 以不可變事件記帳，記錄投入資金、轉出與資產估值。
- 計算 XIRR、累計損益、年度報酬率與月度 Modified Dietz 報酬率。
- 以相同資金流與 S&P 500 Price Index 進行比較。
- 能辨識貨幣的 FRED 基準換算，並明確檢查匯率報價方向。
- 提供密碼鎖、獨立復原金鑰、隱藏財務數值，以及可設定的自動鎖定功能。
- 加密的 JSON 事件儲存在使用者自己的 Vault 中。
- 明確由使用者操作的本機 JSON 與 CSV 匯出；設定中的流程需要再次驗證密碼。
- 自動選擇介面語言，也可手動覆寫，並以英文作為備援語言。
- 支援英文、簡體中文、繁體中文、日文、韓文、西班牙文、德文、法文與巴西葡萄牙文。

## 適合的使用者

- 希望投資組合紀錄保留在自己 Obsidian Vault 中、重視隱私的投資人。
- 手動記錄帳戶層級投入資金、轉出與資產估值的人。
- 想查看 XIRR、月度與年度績效，以及 S&P 500 比較結果的投資人。
- 不想再建立一個財務帳號，偏好本機優先工作流程的使用者。

## 不適用於

- 券商帳戶同步。
- 即時持倉、即時報價、稅務批次會計或自動交易。
- 取代券商對帳單、稅務紀錄或專業財務建議。
- 在裝置已遭入侵或其他惡意外掛存在時，保護已解鎖的 Vault。

## 安裝與更新

請前往 **Obsidian → 設定 → 第三方外掛 → 瀏覽** 安裝 **Investment Tracker**。搜尋「Investment Tracker」，選擇此外掛，依序點選 **安裝** 和 **啟用**。

更新會透過 Obsidian 的第三方外掛更新機制提供。

如需手動安裝或測試，請將 `main.js`、`manifest.json` 與 `styles.css` 放入：

```text
<Vault>/.obsidian/plugins/investment-tracker/
```

## 基本用法

1. 從功能區開啟 Investment Tracker。
2. 設定密碼，並將產生的復原金鑰儲存在 Vault 之外。
3. 建立帳戶並記錄其初始資產估值。
4. 記錄外部投入資金、轉出，以及更新後的帳戶總資產估值。
5. 使用眼睛按鈕顯示或隱藏財務數值。
6. 查看月度與年度報酬率，並與所選基準比較。
7. 在 **設定 → Investment Tracker → 隱私與加密** 中選擇自動鎖定規則。

變更介面語言不會改變現有帳戶的貨幣。新安裝時，外掛只會根據地區語言資訊建議初始貨幣；使用者可在建立帳戶前變更。

## 隱私與安全性

Investment Tracker 沒有由開發者營運的雲端服務、帳號系統、遙測、分析、廣告或自動上傳機制。帳戶名稱、日期、金額、備註與事件資料都會加密並儲存在使用者自己的 Obsidian Vault 中。新安裝會使用 `Investment Tracker Data` 資料夾；升級時會保留既有且安全的資料路徑。

事件資料使用 AES-256-GCM 加密。帳本金鑰由透過密碼衍生的 PBKDF2-SHA256 金鑰與獨立復原金鑰封裝。密碼與解封後的帳本金鑰不會寫入外掛設定。

自動鎖定有兩項獨立規則：離開 Investment Tracker 或 Obsidian 失去焦點時立即鎖定，以及在 Investment Tracker 內閒置 1、5、15 或 30 分鐘後鎖定。至少會保持啟用一項規則。若停用離開時立即鎖定，離開後仍會隱藏財務數值、收合已展開的歷史紀錄並關閉敏感對話框。帳本金鑰會在閒置規則觸發或手動鎖定時從記憶體中清除。

新產生的復原金鑰會在離開後隱藏，只有再次解鎖帳本後才會顯示。請將復原金鑰保存在 Vault 之外，並使用強度高且唯一的密碼。

加密可以防止儲存中的帳本檔案遭到一般性暴露，但無法在外掛已解鎖時保護資料，也無法防範已遭入侵的裝置、螢幕截圖、剪貼簿暴露，或可存取同一 Vault 的其他惡意外掛。

### 同步與匯出

Investment Tracker 不提供同步服務。如果使用者啟用 Obsidian Sync、iCloud 或其他 Vault 同步服務，該服務可能會在裝置之間同步加密的帳本檔案。

JSON 與 CSV 匯出檔案是明文，只有在使用者明確執行匯出時才會建立。請將匯出檔案視為敏感財務紀錄，並妥善儲存或刪除。

請閱讀完整的[隱私權政策](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md)與[安全性政策](https://github.com/joelam2023/investment-tracker/blob/main/SECURITY.md)。

## 網路存取說明

核心記帳與報酬率計算不需要由開發者營運的服務。自動基準模式會向 Federal Reserve Economic Data 服務的 `fred.stlouisfed.org` 傳送 HTTPS GET 請求，以取得 S&P 500 與貨幣換算資料。

這些請求只包含公開序列識別碼、選擇匯率序列所需的貨幣，以及日期範圍。請求不包含帳戶名稱、餘額、資金流金額、資產估值、備註、密碼、復原金鑰或帳本內容。

使用者可以選擇手動基準模式，以避免自動向 FRED 發出請求。自動更新基準需要網路連線。外掛使用的 S&P 500 序列是價格指數，不包含股息。

## 常見問題

### Investment Tracker 會上傳我的投資組合資料嗎？

投資組合帳本不會傳送到由開發者營運的後端。此外掛沒有開發者帳號系統、遙測、分析或自動上傳投資組合的功能。自動基準模式只會發出[網路存取說明](#網路存取說明)中描述的有限 FRED 請求。

### 我的投資資料儲存在哪裡？

加密帳本儲存在使用者自己的 Obsidian Vault 中。新安裝會使用 `Investment Tracker Data`。如果使用者透過自己選擇的服務同步 Vault，該服務也可能儲存或傳輸加密帳本。

### 我的投資資料有加密嗎？

儲存的事件資料使用 AES-256-GCM 加密。透過密碼衍生的 PBKDF2-SHA256 金鑰與獨立復原金鑰會保護帳本金鑰。外掛解鎖時資料可被讀取，使用者建立的 JSON 或 CSV 匯出檔案則不會加密。

### 可以離線使用 Investment Tracker 嗎？

本機紀錄與報酬率計算不需要由開發者營運的服務。自動更新 FRED 基準與匯率需要網路連線；手動基準模式可以避免這些請求。

### 它會連接我的券商帳戶嗎？

不會。Investment Tracker 不會連接券商帳戶。使用者需要手動記錄外部投入資金、轉出與帳戶總資產估值。

### 它會追蹤個別持倉或交易嗎？

不需要逐筆持倉交易紀錄。此外掛是為帳戶層級資金流與資產估值而設計，不提供即時持倉或稅務批次會計。

### 哪些資訊會傳送到 FRED？

自動基準請求只包含公開序列識別碼、選擇匯率序列所需的貨幣，以及日期範圍，不會包含投資組合紀錄或憑證。

### 如果忘記密碼會怎樣？

請依照外掛的復原流程，使用另外儲存的復原金鑰重新取得存取權。如果密碼與復原金鑰都遺失，加密帳本可能再也無法存取。

### JSON 與 CSV 匯出檔案有加密嗎？

沒有。JSON 與 CSV 匯出檔案為明文，應視為敏感財務紀錄妥善處理。

## 協助與意見回饋

請開啟 **設定 → Investment Tracker → 協助與意見回饋**，以回報錯誤、提出功能建議，或複製不含敏感資料的診斷資訊。你可以使用任何語言撰寫回報。

只有在使用者點擊按鈕後，意見回饋連結才會開啟 GitHub。此外掛絕不會自動建立回報，也不會向開發者傳送帳本資料、帳戶名稱、餘額、交易、密碼、復原金鑰、Vault 名稱、Vault 路徑或診斷資訊。提交前請檢查複製的診斷資訊，並將螢幕截圖中的敏感內容遮蔽。

請透過 [GitHub 私密漏洞回報](https://github.com/joelam2023/investment-tracker/security/advisories/new)回報安全性或隱私漏洞，請勿建立公開 Issue。

## 開發

```bash
npm ci
npm run check
npm run build:release
npm run privacy:check
```

翻譯以英文來源字串作為備援。修改使用者介面文字的 Pull Request 必須更新所有語系，並維持插值預留位置不變。

發布標籤必須與 `manifest.json` 中的語意化版本完全一致，不加 `v` 前綴。發布工作流程會建立 GitHub Release 草稿，其中只包含 `main.js`、`manifest.json` 與 `styles.css`，供維護者手動檢查後再發布。

維護者相關說明請參閱完整的[發布指南](https://github.com/joelam2023/investment-tracker/blob/main/RELEASING.md)。

## 財務免責聲明

此外掛是記錄與計算工具，不構成財務、稅務、法律或投資建議。在做出決策前，請自行獨立驗證重要計算結果。

## 授權條款

[MIT License](https://github.com/joelam2023/investment-tracker/blob/main/LICENSE)

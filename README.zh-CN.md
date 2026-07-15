# Investment Tracker：Obsidian 本地优先的加密投资管理插件

[English](https://github.com/joelam2023/investment-tracker/blob/main/README.md) | 简体中文 | [繁體中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-TW.md) | [日本語](https://github.com/joelam2023/investment-tracker/blob/main/README.ja.md) | [한국어](https://github.com/joelam2023/investment-tracker/blob/main/README.ko.md) | [Español](https://github.com/joelam2023/investment-tracker/blob/main/README.es.md) | [Deutsch](https://github.com/joelam2023/investment-tracker/blob/main/README.de.md) | [Français](https://github.com/joelam2023/investment-tracker/blob/main/README.fr.md) | [Português (Brasil)](https://github.com/joelam2023/investment-tracker/blob/main/README.pt-BR.md)

**你的投资数据，保存在你自己的 Obsidian Vault。**

Investment Tracker 是一款面向 Obsidian 的本地优先投资管理与收益率追踪插件。它通过记录账户的外部投入、转出和资产估值，计算单个账户与整体投资组合的收益，并与同期标普 500 表现对比；无需记录每一笔股票交易。

插件不要求注册账号，不包含遥测、广告或使用情况分析，也没有由开发者运营的后端。投资账户名称、日期、金额、估值、备注和事件记录均保存在用户自己的 Vault 中，并以加密形式存储。

## 隐私概览

| 项目 | 实际行为 |
| --- | --- |
| 投资记录存储位置 | 用户自己的 Obsidian Vault |
| 账本加密 | AES-256-GCM |
| 密码派生 | PBKDF2-SHA256 |
| 开发者后端 | 无 |
| 插件账号 | 不需要 |
| 遥测、分析与广告 | 无 |
| 自动网络请求 | 仅在自动基准模式下向 FRED 请求公开的标普 500 和汇率数据 |
| Vault 同步 | 完全由用户选择的 Obsidian Sync、iCloud 或其他同步方案控制 |
| JSON/CSV 导出 | 明文文件，需要用户妥善保管 |

> “本地优先”表示插件不会把投资记录上传到开发者运营的云端。如果用户为 Vault 启用了 Obsidian Sync、iCloud、Git 或其他同步服务，加密账本可能会由该服务同步；这属于用户自己的 Vault 配置，而不是 Investment Tracker 的上传功能。

## 主要功能

- 记录外部投入、转出和账户总资产估值。
- 计算 XIRR、累计盈亏、年度收益率和月度 Modified Dietz 收益率。
- 分别查看单个账户和整体投资组合表现。
- 使用相同现金流与标普 500 Price Index 进行同期收益对比。
- 根据账户币种处理 FRED 历史汇率，并检查报价方向。
- 支持 USD、GBP、SGD、CNY、TWD、JPY、KRW、EUR 和 BRL。
- 支持英文、简体中文、繁体中文、日文、韩文、西班牙文、德文、法文和巴西葡萄牙文；可跟随 Obsidian 界面语言或手动选择。
- 密码锁、独立恢复密钥、收益数字隐藏和可配置的自动锁定。
- 加密事件账本与不可变更的事件式记账；修正通过新增更正记录完成。
- 手动导入或导出 JSON、CSV 数据；设置页中的导入与导出流程需要密码再次验证。
- 自动延续上一年年末最新估值，减少因缺少年初估值造成的年度收益偏差。

## 适合谁

Investment Tracker 适合：

- 希望投资数据留在自己 Obsidian Vault 中的用户；
- 重视隐私、加密和数据可控性的长期投资者；
- 想跟踪账户级投入、估值和收益，但不想维护逐笔持仓交易的人；
- 需要查看月度、年度、年化收益和标普 500 对比的人；
- 愿意手动更新账户总资产估值的人。

## 不适合谁

它目前不适合：

- 需要自动连接券商、银行或交易所的人；
- 需要实时行情、逐笔持仓、成本价或税务批次管理的人；
- 需要自动交易、投顾建议或税务申报功能的人；
- 希望开发者代为恢复密码或投资数据的人。

Investment Tracker 是记录和计算工具，不提供财务、税务、法律或投资建议。做出重要决定前，请独立核验计算结果。

## 安装与更新

### 从 Obsidian 社区插件市场安装

1. 打开 Obsidian 的 **设置 → 第三方插件**。
2. 关闭“安全模式”（如界面要求）。
3. 选择“浏览”，搜索 `Investment Tracker`。
4. 安装并启用插件。

后续版本可直接通过 Obsidian 的第三方插件更新机制安装。

### 手动安装

从 [GitHub Releases](https://github.com/joelam2023/investment-tracker/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`，放入：

```text
<Vault>/.obsidian/plugins/investment-tracker/
```

然后重启 Obsidian，并在第三方插件列表中启用 Investment Tracker。

## 基本用法

1. 从 Obsidian 左侧功能区打开 Investment Tracker。
2. 设置密码，并把生成的恢复密钥保存在 Vault 之外的安全位置。
3. 新建投资账户，选择账户币种并录入初始资产估值。
4. 仅记录进入账户的外部投入、离开账户的转出，以及更新后的账户总资产估值。
5. 股票买卖、再平衡和仍留在账户内的分红不属于外部现金流。
6. 使用“小眼睛”显示或隐藏金额和收益数字。
7. 在 **设置 → Investment Tracker → 隐私与加密** 中选择离开时锁定和无操作定时锁定规则。
8. 在设置中选择自动 FRED 基准或手动导入的基准数据。

修改界面语言不会改变已有账户的币种。新安装时，插件只会根据本地语言环境建议初始币种，用户可在创建账户前修改。

## 网络请求与基准数据

自动基准模式会向 Federal Reserve Economic Data（FRED）的 `fred.stlouisfed.org` 发送 HTTPS GET 请求，用于获取公开的标普 500 Price Index 和所需历史汇率。请求参数仅包含公开序列编号和日期范围，不包含：

- 账户名称或账户标识；
- 余额、投入、转出或估值金额；
- 备注或加密账本内容；
- 密码或恢复密钥。

与任何网络访问一样，FRED 和网络中间服务可能看到常规连接信息，例如 IP 地址。希望避免自动请求的用户可以切换为手动基准模式，并导入自己的 CSV 数据。

插件默认使用的 FRED `SP500` 系列是**价格指数**，不包含股息；其结果不能视为标普 500 总回报指数。手动导入基准数据时，请自行确认数据是价格收益还是总收益口径。

## 加密与威胁边界

账本事件使用 AES-256-GCM 加密。随机账本密钥分别由以下方式封装：

- 用户密码通过 PBKDF2-SHA256 派生出的密钥；
- 初次设置时单独生成的恢复密钥。

插件不会持久化密码或明文恢复密钥。如果密码和恢复密钥同时丢失，开发者也无法恢复加密账本。

加密主要保护静态存储中的账本文件，不能防止以下情况：

- 设备、操作系统或 Obsidian 已被入侵；
- 其他恶意插件拥有 Vault 或运行时访问权限；
- 插件已解锁时，数据被截屏或读取；
- 剪贴板历史、弱密码或重复使用密码导致泄露；
- 用户主动生成的明文 JSON/CSV 导出文件泄露。

请使用强且唯一的密码，并将恢复密钥保存在 Vault 之外。

## 隐私 FAQ

### Investment Tracker 会上传我的投资数据吗？

不会上传到开发者运营的服务器。插件没有开发者后端、账号系统、遥测或分析服务。自动基准模式只向 FRED 请求公开的市场与汇率数据，不会在请求中加入投资记录。

### 我的投资数据存在哪里？

新安装会把加密账本存放在当前 Vault 的 `Investment Tracker Data` 目录中。升级时会保留已有且安全的数据路径。插件设置通过 Obsidian 的插件数据机制保存在本地 Vault 配置中。

### 数据真的经过加密吗？

投资事件以 AES-256-GCM 加密。账本密钥由密码派生密钥和独立恢复密钥分别保护。详细说明见[隐私政策](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md)。

### 插件能完全离线使用吗？

核心记录、加密和收益计算在本地完成。自动获取标普 500 与历史汇率需要访问 FRED；切换到手动基准模式后可以避免这些自动请求。

### 开发者能帮我找回密码或数据吗？

不能。开发者没有你的密码、恢复密钥或账本密钥。如果密码和恢复密钥同时丢失，加密数据将无法恢复。

### 使用 Obsidian Sync 或 iCloud 后，数据还算本地吗？

Investment Tracker 仍不会把账本传给开发者，但你选择的同步服务可能同步 Vault 中的加密文件。请根据自己的隐私要求评估并配置同步服务。

### JSON 和 CSV 导出文件会加密吗？

不会。设置页中的导出操作需要密码再次验证，但生成的 JSON 和 CSV 是明文，便于检查和迁移。请把导出文件当作敏感财务资料保存，不要上传到公开 Issue。

### 插件会自动连接我的券商账户吗？

不会。插件不连接券商、银行或交易所，也不会自动获取真实持仓和交易记录。用户需要手动记录外部现金流和账户总资产估值。

### 反馈问题时会自动发送诊断或资产数据吗？

不会。只有用户点击反馈按钮后才会打开 GitHub；插件不会自动创建报告或发送 Vault 数据。可选的“复制诊断信息”只包含插件版本、Obsidian 版本、平台和界面语言，并由用户检查后手动粘贴。

提交反馈前，请删除截图或文字中的账户名称、金额、持仓、交易日期和其他身份信息。

## 帮助、安全与开源

- [提交错误或功能建议](https://github.com/joelam2023/investment-tracker/issues/new/choose)
- [私密报告安全或隐私漏洞](https://github.com/joelam2023/investment-tracker/security/advisories/new)
- [完整隐私政策](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md)
- [安全政策](https://github.com/joelam2023/investment-tracker/blob/main/SECURITY.md)
- [版本记录](https://github.com/joelam2023/investment-tracker/blob/main/CHANGELOG.md)
- [MIT 许可证](https://github.com/joelam2023/investment-tracker/blob/main/LICENSE)

遇到问题时可以使用任何语言反馈。请勿在公开 Issue 中提交真实账本、密码、恢复密钥、账户名称、余额、交易日期或未脱敏截图。

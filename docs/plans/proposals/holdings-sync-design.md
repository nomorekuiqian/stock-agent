# 持仓同步（券商只读 + 手动导入）Proposal

> Status: Proposal（Backlog / 未进入 active 开发）
> Related: features/portfolio/.context.md, docs/plans/for-you/p0-foundation.md（U0-A 数据地基）
> Vision: 产品策略 > "专属" 核心价值（真实持仓是一切个性化的输入）
> 并行关系: 与 `proposals/event-radar-source-enrichment.md` **完全独立**，无先后、无依赖。本文内部 Track M / Track C 之间亦相互独立。

---

## 用户痛点

> "能否自动将用户的持仓数据从券商（如 Robinhood）同步到 The Market Brew 中？只需要只读模式。核心目标是让用户尽可能无痛/无感地将真实持仓同步上来。此外，用户手动输入持仓的功能也要做，万一用户不愿意链接账户。"

## 目标

**一句话**：把"用户的真实持仓"以最低摩擦灌进 `user_portfolios`，让所有 `/for-you` 专属下游（Action Bar、体检、事件雷达、月度复盘）都吃到真实数据，而不是手敲的近似值。

成功判据：

- 真实持仓的录入摩擦从"逐行手敲 ≤30 行"降到"一次授权"或"一次粘贴/上传"。
- 不接受链接券商的用户，仍有一等公民级别的手动/导入路径（非降级体验）。
- 只读、不碰交易/划转、绝不存券商凭证。

## 现状

`features/portfolio/` 已是 `/for-you` 的数据地基（见其 `.context.md`）：

- 表 `user_portfolios`（`(user_id, symbol)` UNIQUE，列含 `weight_pct / shares / cost_basis / entry_price / thesis / target / stop_loss / conviction`）；schema 单一来源 `backend/migrations/u0a_portfolio_schema.sql`。
- 端点 `GET/PUT(bulk)/PATCH/DELETE /api/portfolio`，全部 `verify_user_token`；`portfolio/db.py` 提供 `bulk_replace_portfolio / patch_holding`；Edge Function `portfolio.js` 只做 CRUD。
- 新鲜度戳 `user_profiles.portfolio_confirmed_at`（R-2 staleness signal）。

**缺什么**：

- 唯一录入方式是前端逐行手敲（onboarding/录入页 → `PUT /api/portfolio/bulk`）。
- 没有任何外部导入（粘贴、CSV、截图）。
- 没有任何券商连接（无 SnapTrade/Plaid）。

**硬约束**（来自 `features/portfolio/.context.md`，必须遵守）：

- **禁止下游 feature 自己 ALTER `user_portfolios`**。任何列变更先改 `u0a_portfolio_schema.sql`（保持幂等）→ 再改 `portfolio.js` + `portfolio/db.py` → 最后更新 `.context.md`。
- 不直连 Insforge PostgREST 绕过 Edge Function。
- `get_logger(__name__)` / 禁 `print` / `%s` lazy；不 import DEAD 区。

## 方案总览：两条互不依赖的并行轨

```
                         ┌──────────────────────────────────────────┐
   Track M（手动 / 导入） │ 现有手敲  +  粘贴→LLM  +  CSV 上传  +(截图)│
   零供应商 / 零合规开销   └───────────────┬──────────────────────────┘
                                          │  NormalizedHolding[]
                                          ▼
                            reconcile_and_upsert(user_id, source)
                          （按 source 替换 + 按 symbol 合并保留 P1 字段）
                                          ▲
   Track C（连接券商）    ┌───────────────┴──────────────────────────┐
   SnapTrade 只读 OAuth   │ register → Connection Portal → 定时只读同步 │
                         └──────────────────────────────────────────┘
                                          │
                                          ▼
                          现有 portfolio.bulk_replace / patch（user_portfolios）
```

**两轨独立交付**：Track M 不依赖 Track C，可单独上线并完整解决"不愿连账户"用户；Track C 是"无感"上限，但有供应商/合规前置，单独排期。两轨都只是 `user_portfolios` 的新写入来源，下游零改动。

---

## 技术方案

### 新模块边界

新建 `backend/app/features/holdings_sync/`（标准结构 `router/service/db/models` + `.context.md`）。职责是**采集 + 归一化外部持仓**，与 `features/portfolio`（持仓的 canonical CRUD）解耦——采集 ≠ 增删改。`holdings_sync` 通过现有 `portfolio.db` 写回，不自己碰 `user_portfolios` 的 schema 业务。

统一接口：

```
class HoldingsSource(Protocol):
    async def fetch(self, ctx) -> list[NormalizedHolding]   # symbol, qty, cost_basis?, source, external_account_id?

# 适配器：SnapTradeSource / PasteSource(LLM) / CsvSource(+ 未来 ScreenshotSource)
# 统一收口：reconcile_and_upsert(user_id, source, rows)
```

### 数据模型变更（经 portfolio geba，不 rogue ALTER）

1. **`user_portfolios` 加列**（改 `u0a_portfolio_schema.sql`，幂等 `ADD COLUMN IF NOT EXISTS`）：
   - `source TEXT DEFAULT 'manual'`（`manual|snaptrade|paste|csv|screenshot`）
   - `source_synced_at TIMESTAMPTZ`
   - `external_account_id TEXT`（券商账户标识，可空）

   配套改 `portfolio.js` + `portfolio/db.py`，更新 `features/portfolio/.context.md`（按其守则第 4 条）。

2. **新表 `user_broker_connections`**（独立新 migration，不属 portfolio geba）：
   `user_id, provider('snaptrade'), snaptrade_user_id, snaptrade_user_secret, authorization_id, broker_slug, status, last_sync_at, last_error, created_at`。
   **只存 SnapTrade 的 user_secret + authorization_id，永不存券商账号/密码。** 新 Edge Function `holdings-sync.js`（套 `portfolio.js` 模板）做该表 CRUD。

### Reconcile 规则（关键，防止覆盖用户心智资产）

`reconcile_and_upsert` 必须：

- **按来源替换**：一次 SnapTrade 同步只替换 `source='snaptrade'` 的行，不动用户手敲行。
- **按 symbol 合并保留 P1 字段**：`thesis / target / stop_loss / conviction` 是用户手写的投资逻辑（U1-C 写入），同步刷新持仓数量时**必须 merge 保留**，绝不被券商数据清零。
- 写 `source` + `source_synced_at`；同步成功后 `PATCH /api/portfolio/touch` 刷新 `portfolio_confirmed_at`。

### Track M — 手动 / 导入（一等公民）

| 子路径 | 摩擦 | 实现 | 精度 |
|---|---|---|---|
| 现有手敲 | 中 | 已存在，保留并打磨（默认入口之一，非降级） | 高 |
| **粘贴持仓 → LLM** | 极低 | 自由文本 → Gemini flash-lite + `output_schema`（复用全项目 ADK 模式）→ 确认/编辑 UI（ticker 用现有 `useStockSearch` 消歧）→ reconcile | 中高（需确认步） |
| **CSV 上传** | 中 | 券商 parser 注册表（先 Robinhood/Fidelity/Schwab/E*TRADE 的导出格式）+ 通用列映射兜底 → 同一确认 UI | 高 |
| 截图 → vision-LLM | 极低 | 延伸增量项（手机端 1 拍），同走确认 UI | 中 |

Track M 全部是纯第一方：无第三方、无 DPA、无供应商审批、无法人前置。**这正是它必须是一等公民的原因**——它是零合规开销、当天可交付价值的路径。

### Track C — 连接券商（SnapTrade）

研究结论（见文末引用）：**SnapTrade 是触达 Robinhood 只读持仓的唯一可行路径**（走 Robinhood 自己的 OAuth 同意页，ToS 可辩护，非爬虫），投资专精、自助、SOC 2，免费档可覆盖开发 + 封测，验证后再切 Daily Data **$1/连接用户/月** 只读档。

流程：

1. `register_snaptrade_user(user_id)` → 存 `snaptrade_user_secret` 到 `user_broker_connections`。
2. 生成 Connection Portal URL → 前端跳转 → 用户在券商自有页面授权（只读）。
3. 回跳 → list accounts → list holdings → 归一化 → `reconcile_and_upsert(source='snaptrade')`。
4. 定时只读再同步：新 cron 端点（`verify_cron_secret`），日频。
5. **Token 过期（约数周）**：从 SnapTrade 错误码探测 → 复用 `portfolio_confirmed_at` staleness 模式弹"重新连接券商"横幅（与现有 R-2 一致，零新机制）。

覆盖：Robinhood/Fidelity/Schwab/E*TRADE/Webull 均支持；moomoo/Futu 支持；**Tiger 未确认**（需直接向 SnapTrade 核实，先按不支持处理 → 落 Track M 兜底）；IBKR 走 Flex Query（设置较繁，二期再做）。

### 前端

`/profile`（或持仓录入页）新增"同步持仓"：`连接券商 / 粘贴持仓 / 上传 CSV` 三入口并列；SnapTrade → Portal 跳转；过期弹重连横幅；复用现有 TanStack `usePortfolio` 系列 hook，同步成功 invalidate。文案明确"只读 · 不能交易或划转 · 可随时断开"。

---

## 合规 / 流程 / 审批（与技术分开讨论）

**前提**：本产品当前为个人开发者，无公司 / 法人实体。研究后的结论分两层——

### 技术层：无影响

手动/导入（Track M）纯第一方，零第三方。SnapTrade [明确支持个人开发者](https://snaptrade.com/pricing)（"each natural person *or* legal entity"，自然人是一等公民），免费档即刻可建，完成 app/compliance profile 后以个人/个体户身份即可上生产；[Plaid 亦允许以本人姓名作为个体户](https://plaid.com/docs/launch-checklist/)。**无法人 ≠ 不能做 Track C。**

### 合规/流程层：风险落到个人

- SnapTrade 的 [Developer Terms](https://snaptrade.com/developer-terms-of-use) / DPA 由**你个人**签署，合同 + GLBA 义务无公司责任隔离。
- GLBA "金融机构" 义务（FTC Safeguards Rule、隐私告知）**附着于"行为"而非"实体类型"**：个体聚合持仓数据同样适用。可由个人满足（隐私政策页、合理安全、绝不存券商凭证），但不会因没有 LLC 而豁免。
- 部分高级券商 OAuth（如 Fidelity）/ 完整生产需完善 compliance profile。
- 仅"只读展示/存储持仓"本身**不构成**受监管的 BD/RIA 活动（不托管资产、不下单、不提供投资建议）。
- 各州综合隐私法的 GLBA 豁免在收窄（2025 起多州新法纳入金融机构），不要假设全免。

### 流程建议（不阻塞构建）

- 构建 + 封测：SnapTrade 免费档，个人身份，**立即可做**。
- Track C **GA 前**：注册单成员 LLC（隔离个人责任）+ 上线隐私政策页 + 只读同意勾选 + 一键断开端点 + 完成 SnapTrade compliance profile + 签 DPA。
- Track M **无任何上述前置**——这是它先行、独立交付的根本理由。

---

## 备选方案

| 方案 | 结论 |
|---|---|
| Plaid Investments 作主路径 | **否**：Robinhood 持仓不可靠（Robinhood↔Plaid 仅做银行入金），审核更重。仅作未来传统券商冗余。 |
| 仅手动/导入（无 SnapTrade） | 即 Track M 单独上线——**采纳为可独立交付的基线**，但不作为"无感"上限的唯一答案。 |
| robin-stocks 等非官方库 | **否**：违反 Robinhood ToS，需自存凭证 + 2FA（安全/法律风险），端点易碎。排除。 |
| Yodlee/Akoya/Finicity/Flanks | **否**：企业级定价/销售流程，非 MVP。 |

## 推荐

1. **Track M 先独立成型并上线**（粘贴→LLM + CSV + 打磨手敲），零合规开销、当天见价值，彻底解决"不愿连账户"用户。
2. **Track C 作为并行独立轨**：SnapTrade 免费档建 + 封测 → 形成 LLC + 合规件齐 → 切 $1/用户/月 GA。
3. 截图→vision-LLM、Plaid 冗余为后续增量。

对标佐证：Sharesight / Simply Wall St / Seeking Alpha / Snowball / Delta 均收敛到 **SnapTrade + 手动/CSV 兜底** 的同款组合。

## 执行策略（仅本文内部排期；与事件雷达工作无依赖）

- **M1**：`holdings_sync` 模块骨架 + `NormalizedHolding` + `reconcile_and_upsert`（含 P1 字段 merge 保护）+ `user_portfolios` 加 `source` 列（经 portfolio geba）。
- **M2**：粘贴→LLM + 确认 UI；CSV parser 注册表（4 大券商）+ 通用兜底。→ Track M 可发布。
- **M3**：`user_broker_connections` 表 + `holdings-sync.js`；SnapTrade register + Connection Portal + 回调 + 首次同步（免费档）。
- **M4**：日频只读再同步 cron + token 过期重连横幅（复用 R-2）+ 断开端点 + 隐私/同意 UI。
- **M5**：合规件（LLC、隐私政策、DPA、compliance profile）→ Track C GA 切付费档。
- **M6（增量）**：截图→vision-LLM；Plaid 传统券商冗余；IBKR Flex Query。

全程 feature flag 灰度（复用现有 admin console + playbook）。

## 风险 / 待定问题

1. SnapTrade token 数周过期 → 重连摩擦：靠 staleness 横幅 + 文案预期管理；监控重连成功率。
2. Tiger Brokers 覆盖未确认 → 需向 SnapTrade 核实；未覆盖券商一律落 Track M。
3. 粘贴/截图 LLM 抽取错误 → 强制"确认/编辑"步 + ticker 消歧，不静默写入。
4. CSV 各券商格式漂移 → parser 注册表 + 通用列映射兜底 + 失败回退到粘贴路径。
5. 个人无法人下的责任暴露 → Track C GA 前形成 LLC（流程项，不阻塞构建）。
6. 成本：免费档→$1/连接用户/月，需在 GA 前确认单位经济模型（多少连接用户可承受）。

## 成本估算

| 项 | 量 | 成本 |
|---|---|---|
| SnapTrade（封测） | 免费档（1 连接用户 / 5 连接） | $0 |
| SnapTrade（GA Daily Data 只读） | $1 / 连接用户 / 月 | 随采用线性 |
| LLM 粘贴/截图抽取 | 偶发，单次 ~$0.001–0.005 | 极低 |
| 新 Insforge 表/列 | 极小 | 极低 |

## NOT in scope

- 任何写操作（下单/划转）——永久排除，本特性只读。
- 历史成交流水/税表（1099-B）解析——后续单独评估。
- 加密钱包/交易所聚合（Vezgo 类）——非当前用户群。
- 多账户合并视图的高级分析——属下游 `/for-you`，不在采集层。

## 引用（研究依据）

- SnapTrade：[brokerage integrations](https://snaptrade.com/brokerage-integrations)、[Robinhood 只读 OAuth](https://snaptrade.com/brokerage-integrations/robinhood-api)、[pricing](https://snaptrade.com/pricing)、[security/SOC2](https://snaptrade.com/security)、[Developer Terms](https://snaptrade.com/developer-terms-of-use)、[docs](https://docs.snaptrade.com/)
- Plaid：[Investments](https://plaid.com/products/investments/)、[launch checklist](https://plaid.com/docs/launch-checklist/)、[Robinhood↔Plaid 为入金](https://www.openbankingtracker.com/plaid/robinhood)
- Robinhood：[仅 crypto API](https://robinhood.com/us/en/support/articles/crypto-api/)、[third-party connections 政策](https://robinhood.com/us/en/support/articles/third-party-connections/)
- 合规：[GLBA 隐私告知义务](https://www.innreg.com/blog/glba-privacy-notice)、[SEC Reg S-P QA](https://www.sec.gov/divisions/investment/guidance/regs2qa.htm)、[各州 GLBA 豁免收窄(2025)](https://www.orrick.com/en/Insights/2025/07/Where-is-the-GLBA-Entity-Level-Exemption-Two-More-State-Privacy-Laws)
- 对标：[Sharesight×SnapTrade](https://www.sharesight.com/us/partners/robinhood/)、[Seeking Alpha 链接券商](https://help.seekingalpha.com/premium/how-safe-is-my-portfolio-on-seeking-alpha-after-linking-it-to-my-broker)、[Simply Wall St](https://support.simplywall.st/hc/en-us/articles/11111546059919-Linking-Your-Broker-to-Simply-Wall-St)

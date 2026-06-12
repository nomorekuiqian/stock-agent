# KOL Research Room Product Strategy

> Status: Planning
> Related: `frontend/src/app/kol/.context.md`, `backend/app/features/kol_research/.context.md`, `docs/constraints/subscription-model.md`
> Vision: 用 Qinbafrank 做获客入口，售卖一个包含资料包和 Max 投研能力的完整 Creator Max 套餐。

## Strategic Question

TheMarketBrew 应该如何售卖第一个博主研究室产品：Qinbafrank 资料包应该免费开放什么、付费解锁什么、落地页放在哪里、用户如何购买和使用，以及它应该作为孤立资料包出售，还是和 Max 能力合成一个更完整的 Tier？

## Recommendation

前台应该售卖 **Qinbafrank Creator Max**：`Qinbafrank Research Pack + TheMarketBrew Max`。

底层仍然保留独立资料包 entitlement：`kol_pack_qinbafrank`。

理由：

1. 只卖孤立资料包会显得薄，用户可能读完资料库就流失；Max 的 AI 投研、个股研究和市场数据可以承接用户后续问题。
2. 用户从 X 过来时，购买动机是“我要 Qinbafrank 的历史观点和框架”；落地页应该主打 Qinbafrank，但 checkout 交付完整工作流。
3. 资料包底层独立，未来多博主、赠送、退款、All Access 都好处理。
4. 前台售卖组合 Tier，能提高客单价，也能避免产品看起来像单纯“卖博主 IP”。

产品包装：

- 对外英文名：`Qinbafrank Creator Max`
- 对外中文名：`Qinbafrank 投研资料包 + Max`
- 页面内解释：`包含 Qinbafrank Research Pack、AI 投研助手、个股深度研究和 TheMarketBrew Max 权益。`

## Positioning

不要卖成：

> Qinbafrank 本人帮你看股票。

也不要卖成：

> 一个普通 AI 股票助手。

应该卖成：

> 不用翻几千条推文，在 TheMarketBrew 里直接查 Qinbafrank 的旧观点、读整理好的主题资料和个股档案，并用 AI 把新闻、财报、个股和问题放进这套公开框架里拆解。

核心边界：

- 这是 TheMarketBrew 基于公开内容整理的资料包。
- AI Agent 的回答是系统基于公开内容、原文证据和方法论做的整理与推断。
- Agent 不代表 Qinbafrank 本人观点，也不是 Qinbafrank 本人逐条回复。
- 内容仅供学习和研究，不构成投资建议。

## Current Product Assets

现有产品已经足够支撑“资料包”包装，而不只是 Agent：

- `/kol/qinbafrank`：公开概览页，展示 5 个板块入口、个股档案数量、入库推文数量和追问入口。
- `/kol/qinbafrank/sectors`：5 个板块观点，覆盖 AI 产业、加密 RWA、美股调整规律与行情判断、宏观与地缘、过往推荐公司。
- `/kol/qinbafrank/highlights`：7 个主题、25 个子话题、精选原文阅读器。
- `/kol/qinbafrank/stocks`：个股档案，包含提及时间线、核心 thesis、原文证据和价格验证。
- `/kol/qinbafrank/latest`：过往精华 + 全量原文库。
- `/research?agent=kol&persona=qinbafrank`：Qinbafrank Agent，能调用方法论 skill、历史推文 RAG、个股/宏观/行业 brief、技术分析和日报。
- 方法论资产：`backend/app/features/twitter/methodologies/qinbafrank/`，包含 core、macro、7 个 sector、22+ ticker playbooks 和 Evidence Map。

## Product Package

### What Users Buy

用户买的不是“聊天次数”，也不只是一个资料包，而是一套能持续使用的投研工作流：

1. **Qinbafrank 观点库**
   - 查 Qinbafrank 过去讲过什么。
   - 支持 ticker、主题、产业链和宏观问题。

2. **精选主题**
   - AI 大趋势、资本开支、过往推荐公司、美股调整规律、行情判断、宏观与地缘、加密/RWA。
   - 把碎片推文整理成可读的研究目录。

3. **个股档案**
   - PLTR、HOOD、MU、AVGO、NVDA 等标的的历史观点、证据、变化和打脸条件。
   - 用户可以快速判断某只股票在这套框架里为什么重要。

4. **原文证据**
   - 有原文命中时展示原文、时间和上下文。
   - 没有原文命中时，明确标注为方法论推断。

5. **Qinbafrank Agent**
   - 用户可以问新闻、财报、个股、watchlist 或框架问题。
   - Agent 只能说“基于公开内容整理/推断”，不能冒充本人观点。

6. **TheMarketBrew Max 能力**
   - AI 投研助手高频使用。
   - 个股深度研究。
   - 推特 KOL 日报。
   - 组合/持仓相关高级能力按现有 Max 边界提供。

### Core Value Props

- 查旧观点：不用在 X 上翻历史内容。
- 套框架：把问题拆成产业位置、变量、证据、反例、打脸条件。
- 看个股：从过往 thesis 到当前变化，一次看清。
- 做复盘：判断一条新闻是否真的改变公司故事。
- 降低信息噪音：用户获得的是一套观察框架，而不是更多碎片信息。

## Free vs Paid

### Free

目标：证明资料包真实存在，让 Twitter 流量愿意付费。

免费开放：

- `/qinbafrank` 售卖落地页。
- `/kol/qinbafrank` 公开概览页。
- 5 个板块的标题、简介和样例卡片。
- 7 个主题的目录级索引。
- 3-5 条精选原文样例。
- 3 个样例个股档案摘要。
- 3 个可以直接问 Agent 的样例问题。

免费用户可以看清楚“里面有什么”，但不能完整消费资料库。

### Paid: Qinbafrank Creator Max

付费解锁：

- 完整精选资料库：7 个主题、25 个子话题、精选原文。
- 完整板块观点：5 个板块 + AI 子板块深度页。
- 完整个股档案：所有 ticker、时间线、原文证据和价格验证。
- 完整全量内容库：历史推文流、筛选、检索。
- Qinbafrank Agent：围绕资料包和公开框架追问。
- 后续补充的 Qinbafrank 资料更新。
- TheMarketBrew Max：无限/高频 AI 投研、个股深度研究、推特 KOL 日报等现有 Max 能力。

### Free Login Trial

可以保留一个轻量试用，但它不是 waitlist，也不是 Beta：

- 登录后可免费问 1 个 Qinbafrank Agent 问题，或看一个完整样例主题。
- 试用结束后直接引导购买 Qinbafrank Creator Max。

### Pro, Max and Creator Max

Pro 不承接资料包。Pro 继续是邮件订阅和持仓日报。

不要把 Qinbafrank 做成一个孤立低价包。更好的结构是：

- Qinbafrank Creator Max：Qinbafrank Pack + Max，作为当前主售卖 SKU。
- Standard Max：未来可保留为不含创作者资料包的普通平台 Max，或逐步升级成 Platform Max。
- Creator All Access：未来多个博主资料包成熟后，再作为更高阶套餐。
- 单独资料包：可以作为后台 entitlement 和促销工具存在，但不作为主卖点。

## Pricing

建议直接售卖，不再使用 Beta/waitlist。售卖对象不是孤立资料包，而是 `Qinbafrank Creator Max`。

### Launch Price

推荐首发价：

- 月付：`$14.99/月`
- 年付：`$99/年`

可选正式价：

- 月付：`$19.99/月`
- 年付：`$149/年`

理由：

- Creator 内容类产品通常落在 $5-15/月。
- 严肃投研工具通常从 $39/月起。
- 单独 creator pack 通常只能支撑 $5-15/月，但 Creator Max 包含资料包 + 平台投研工具，首发 $14.99/月更合理。
- 年付 $99 比 $14.99 月付有明显折扣，适合用来筛选高意愿用户。

### Why Bundle at the Front, Separate at the Entitlement Layer

未来每个博主都应该有独立资料包，但前台售卖不必是孤立单包。

建议：

- 底层：每个博主一个独立 entitlement，例如 `kol_pack_qinbafrank`。
- 前台：用创作者 Pack 作为获客钩子，售卖包含 Max 的完整 Tier。
- 未来：多个创作者成熟后，再推出 Creator All Access。

这样既能看清每个博主的转化归因，也不会把用户限制在一个“读完就走”的资料包里。

建议商业结构：

| 产品 | 价格建议 | 适合用户 |
|---|---:|---|
| Qinbafrank Creator Max | $14.99/月 或 $99/年 | Qinbafrank 粉丝，且需要完整投研工具 |
| Standard Max | $9.99-14.99/月 | 不关心创作者资料包，只要平台 AI 投研 |
| Creator All Access（未来） | $24.99-39.99/月 | 想看多个博主资料包的用户 |
| Platform All Access（未来） | $39.99+/月 | 资料包 + 全平台 AI 投研 + 更高配额/团队能力 |

## Landing Page

### Route

不要再用 `/frank-agent` 作为主入口。

正式短链：

- `themarketbrew.com/qinbafrank`
- App route：`/qinbafrank`

产品内资料包：

- `/kol/qinbafrank`

`/frank-agent` 可以保留为旧链接 redirect 到 `/qinbafrank`，但不要再作为对外 URL。

### Page Goal

目标不是收 waitlist，而是直接成交：

- 让用户在 10 秒内知道这是 Qinbafrank 的投研资料包。
- 让用户看到里面有真实内容，而不是空泛 Agent。
- 让用户相信这是公开内容整理，不冒充本人。
- 让用户直接购买。

### Landing IA

保持短页，四段足够：

1. **Hero**
   - H1：`Qinbafrank 投研资料包 + Max`
   - 副标题：`观点库、精选主题、个股档案、AI 追问和 TheMarketBrew Max 投研工具。用一套工作流查旧观点、套框架、做复盘。`
   - 主 CTA：`立即解锁`
   - 次 CTA：`先看免费样例`
   - 辅助说明：`基于公开内容整理。Agent 不代表本人观点。非投资建议。`

2. **Inside the Pack**
   - 观点库
   - 精选主题
   - 个股档案
   - 原文证据
   - AI 追问

3. **Example Use Cases**
   - `Qinbafrank 以前怎么看 PLTR？`
   - `这条新闻会改变公司故事吗？`
   - `NVDA 财报应该先看哪几个变量？`
   - `这次下跌是杀估值、杀业绩，还是杀逻辑？`
   - `我的 watchlist 里哪些值得先复盘？`

4. **Offer**
   - `Qinbafrank Creator Max`
   - `$14.99/月` 或 `$99/年`
   - 包含资料库、主题、个股档案、原文证据、AI 追问和 Max 投研能力
   - CTA：`立即解锁 Qinbafrank Creator Max`
   - 免责声明：`TheMarketBrew 基于公开内容整理；Qinbafrank 本人不会逐条回复；Agent 回答不代表本人观点；内容仅供学习和研究。`

## Purchase and Use Experience

### Purchase Flow

1. 用户从 X 或短链进入 `/qinbafrank`。
2. 点击 `立即解锁`。
3. 未登录用户先注册/登录，登录后回到 checkout。
4. Stripe Checkout 购买 `Qinbafrank Creator Max`。
5. 成功页等待 entitlement 落库后跳转 `/kol/qinbafrank?welcome=1`。
6. 首次使用页只给三个动作：
   - `读一个精选主题`
   - `查一个个股档案`
   - `问 Agent 一个真实问题`

### Required Entitlement

建议新增显式权限，并与 Max 权限组合发放：

- `kol_pack_qinbafrank`
- `stock_research`
- `ai_research_engine`
- `portfolio_management`
- `twitter_digest`
- Pro 继承权益按现有 Max 规则发放

未来每个博主一个权限：

- `kol_pack_qinbafrank`
- `kol_pack_creator_x`
- `kol_pack_creator_y`

未来 All Access 可以拥有多个 `kol_pack_*` 权限，或新增 `kol_pack_all_access`。

### Checkout Requirements

当前后端 checkout 只接受 `pro|max`。要售卖 Creator Max，需要新增：

- Stripe Product：`Qinbafrank Creator Max`
- Stripe Price：monthly 和 annual
- Backend checkout tier/product type：支持 `creator_max_qinbafrank`
- Success URL：`/pricing/success?checkout=success&product=creator_max_qinbafrank&next=/kol/qinbafrank`
- Entitlement sync：写入 `kol_pack_qinbafrank` + `MAX_FEATURES`
- PaywallGuard：支持 `requiredFeature="kol_pack_qinbafrank"`

## Paywall Placement

不要拦概览页。付费墙放在深度消费点：

- `/kol/qinbafrank`：公开。
- `/kol/qinbafrank/highlights`：目录和一个完整样例免费，完整内容付费。
- `/kol/qinbafrank/sectors`：5 个板块摘要免费，深度分析付费。
- `/kol/qinbafrank/stocks`：3 个样例 ticker 免费，完整档案付费。
- `/kol/qinbafrank/latest`：少量样例免费，完整全量库付费。
- `/research?agent=kol&persona=qinbafrank`：1 次试问免费，继续使用需购买。

## Out of Scope for This Version

暂时不做跨产品联动方案。

本版本先不规划：

- 首页大模块联动。
- Pricing 页复杂套餐矩阵。
- Stock page 自动推荐 Qinbafrank 档案。
- Twitter Digest 卡片跳转。
- Watchlist / For You 个性化联动。

原因：当前优先级是把 Creator Max 卖清楚、收款跑通、付费墙跑通、首次使用跑通。联动会增加实现面和叙事复杂度，可以等付费转化数据出来后再做。

## Compliance and Trust Boundaries

页面和产品内必须持续表达：

- 基于 Qinbafrank 公开内容整理。
- Qinbafrank 本人不会逐条人工回复。
- Agent 回答不代表 Qinbafrank 本人观点。
- 有原文命中时说“原文支持”；没有命中时说“按公开框架推断”。
- 内容仅供学习和研究，不构成投资建议。
- 不承诺收益、胜率、买卖点或荐股。
- 不把“博主观点”包装成平台正式投顾意见。

建议固定免责声明：

> TheMarketBrew 基于 Qinbafrank 的公开内容和投研框架整理本资料包。AI Agent 的回答由系统基于公开资料和市场数据生成，不代表 Qinbafrank 本人观点，也不构成投资建议。

## Analytics

Landing:

- `qinbafrank_pack_landing_view`
- `qinbafrank_pack_sample_click`
- `qinbafrank_pack_checkout_click`

Checkout:

- `checkout_open` with `product=creator_max_qinbafrank`
- `checkout_complete` with `product=creator_max_qinbafrank`
- `checkout_abandoned` with `product=creator_max_qinbafrank`

Activation:

- `kol_pack_activated`
- `first_highlight_read`
- `first_ticker_opened`
- `first_original_evidence_click`
- `first_kol_agent_question`

Revenue:

- landing visitor to checkout click
- checkout click to paid
- paid to first activation
- refund/cancel reason tagged `creator_max_qinbafrank`

## Implementation Roadmap

### Phase 0: Sellable Pack

1. [ ] Create `/qinbafrank` route and redirect `/frank-agent` to it.
2. [ ] Rewrite landing page from waitlist/Beta to direct paid offer.
3. [ ] Add Stripe product and prices for Qinbafrank Creator Max.
4. [ ] Add entitlement `kol_pack_qinbafrank` while preserving existing Max entitlements.
5. [ ] Add checkout support for `creator_max_qinbafrank`.
6. [ ] Gate deep research-room pages with `kol_pack_qinbafrank`; Max tools continue to use existing Max entitlements.
7. [ ] Keep `/kol/qinbafrank` overview public.
8. [ ] Add first-use state after purchase.
9. [ ] Add compliance copy wherever Agent is mentioned.

### Phase 1: Improve Paid Usage

1. [ ] Improve sample previews on paid pages.
2. [ ] Add annual plan upsell.
3. [ ] Add saved reading progress.
4. [ ] Add cancellation survey with `creator_max_qinbafrank` reason tags.

### Phase 2: Multi-Creator Model

1. [ ] Standardize each creator as an independent pack entitlement.
2. [ ] Add Creator Max template for landing, entitlement, paywall and checkout.
3. [ ] Add Creator All Access only after at least 2-3 paid creator Max offers exist.

## Success Criteria

Paid launch:

- Landing checkout click rate > 5%.
- Checkout completion rate > 35%.
- Paid users activation rate > 60%.
- Refund rate < 8% in first 14 days.

Activation means at least one of:

- read a full highlight
- open a full ticker dossier
- ask a Qinbafrank Agent question

## Decisions From Feedback

- 不做 waitlist。
- 删除 Beta 叙事，直接开卖。
- 短链使用 `/qinbafrank`，不再使用 `/frank-agent` 作为主入口。
- 本轮不做跨产品联动方案。
- Agent 必须明确不代表 Qinbafrank 本人观点。
- 多博主模型按“每个博主一个独立资料包 entitlement”设计；前台主售卖是“资料包 + Max”的 Creator Max，而不是孤立资料包。

## Market References

- [Substack support: platform and Stripe fees](https://support.substack.com/hc/en-us/articles/360037607131-How-much-does-Substack-cost)
- [Stratechery Plus pricing](https://stratechery.com/stratechery-plus/)
- [Koyfin pricing](https://www.koyfin.com/pricing/)
- [Fiscal.ai pricing](https://fiscal.ai/pricing/)
- [Quartr mobile app](https://quartr.com/products/mobile-app)
- [Quartr API coverage](https://quartr.com/products/quartr-api)
- [AlphaSense pricing](https://www.alpha-sense.com/pricing/)
- [AlphaSense market intelligence platform](https://www.alpha-sense.com/)

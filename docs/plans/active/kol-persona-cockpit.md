# KOL Persona 投研驾驶舱 Engineering Plan

> Status: Planning
> Updated: 2026-05-24
> Related:
> - `frontend/src/app/kol/.context.md`（被重构的页面）
> - `backend/app/features/twitter/methodologies/qinbafrank/`（方法论真相源）
> - `backend/app/edge_functions/kol-tweets.js`（推文数据）
> - `backend/app/features/twitter_digest/enrichment.py`（`kol_tweets.symbols` 真实 schema）
> - `backend/app/shared/fmp/`（价格 + 基本面）
> - `docs/plans/active/kol-persona-research-agent.md`（④ 对话 agent 后端）
> - `docs/plans/active/twitter-kol-opinion-platform.md`（Phase 4「Stock-Level KOL View」是相邻概念：多 KOL 看一只股；本 plan 是单博主驾驶舱）
> Vision: 把一个博主公开推文蒸馏出的「方法论 + 板块视角 + 个股历史观点 + 可对话的思维接口」做成散户能浏览、能下钻、能追问的投研入口。

## 目标

把现有静态展示页 `/kol/qinbafrank` 重构为**四层结构**，让粉丝散户从「他提过什么」进入「他是怎么想的」：

1. **方法论内核**（宏观上他怎么想）
2. **板块卡片**（他怎么看 AI/加密/宏观 + 看什么数据 + 历史观点）
3. **个股历史观点**（Serenity Oracle 式：价格×提及时间线 + 逐字原文 + 多空标注）
4. **对话 Agent 大 CTA**（导航到 `/research` 预加载博主视角）

核心原则：**所有内容都基于真实数据**（蒸馏方法论文档 + 真实推文 + FMP 价格），不编造博主原话、不硬编码动态价格字段（遵守 `frontend/src/app/kol/.context.md` 既有约束）。

## 决策记录（2026-05-24）

1. **板块细分** — 不用笼统的「AI」。AI 按 Frank 自己的产业链分层（lens §1 L0-L5）拆成 5 张子卡：算力底座 / HBM·存储 / 数据中心·Newcloud / 电力·物理基建 / 应用·Agent。加密、宏观先各 1 张卡，内部结构按需再拆。
2. **个股时间线多空上色** — MVP **不做**。决定**不回填 enrichment**（成本虽低但非必需），默认推文无 `symbols`，ticker 从**原文正则抽取**，提及点**单色不上色**。stance 上色留作后续增强（届时只对详情页展示的少数推文按需 enrich，不全量回填）。
3. **不抽象多 persona** — 首版前端**写死 qinbafrank**，路由 `/kol/qinbafrank` 固定。后端端点保留 `{username}` 形参便于将来扩展，但前端不做多 persona 路由抽象。

## 现状

### 页面现状（静态）

`frontend/src/app/kol/qinbafrank/_components/QinbaFrankPage.tsx`（~810 行）当前把所有内容硬编码为前端常量：`LENSES` / `THEMES` / `SIGNALS` / `EVIDENCE` / `STARTERS`。证据流只显示 `tweet_id`（无原文），信号台账是方法论级静态展示，主题雷达不更新。内嵌一个 inline chat（`api.kolResearch.chatStream`，persona `qinbafrank`），浏览无需登录、对话需登录 + `kol_research_agent` flag。

### 已有真实数据（可用，无需编造）

**A. 方法论蒸馏文档** — `backend/app/features/twitter/methodologies/qinbafrank/`：
- `overview.md`：一句话画像 + 5 条核心原则 + 能力圈 + 明确不做 + 标志性表达
- `principles-falsifiability.md`：可证伪原则（他最强指纹）+ 标准句式 + 经典案例（带 tweet_id）
- `lens-ai-infrastructure.md` / `lens-crypto.md` / `lens-macro.md` / `lens-stock-analysis.md`：每个板块的 `关注圈 → 分析路径(Steps) → 信号偏好(看什么硬指标) → 判断闸/可证伪锚 → 风控纪律 → 语言指纹 → 代表案例(带 tweet_id)`
- `_orchestrator.md`：lens 路由层
- `*.yaml`：结构化证据，留作 audit
- 各板块真实推文量：AI 算力 **165** / 加密 **431** / 宏观 **621** / 个股 **296** / 方法论 53 / 交易 23

**B. 真实推文** — `kol_tweets` 表（每小时 cron 采集，edge function `kol-tweets.js`）：
```
id, author_username, text, tweet_type, created_at, url,
like_count, retweet_count, reply_count, view_count, category, symbols
```
`symbols` JSONB 的**真实 schema**（来自 `enrichment.py` / `enrichment_prompts.py`，注意：与旧 plan `twitter-kol-opinion-platform.md` 里描述的 v3 schema 已漂移，以代码为准）：
```json
{
  "quality": "keep" | "drop",
  "ticker_stances": [{"ticker": "NVDA", "stance": "bull" | "bear" | "neutral"}],
  "sectors": ["AI 算力", "加密", "宏观"],
  "enriched_at": "...",
  "enriched_model": "..."
}
```
→ 每条推文都带：提到哪些 ticker + 博主对每个 ticker 的多空倾向 + 中文板块标签 + keep/drop 质量门。

**C. edge function 现有读取 action**（GET 公开，无需认证）：
- `list`（按 `username` + `category` + 分页，按 `created_at` DESC）
- `list_batch`（按 `usernames` + `since`/`until` 时间窗）
- `get`（按 tweet `id` 取单条）
- `stats`（按 `username` 取总数 / 分类 / 日期范围）
- **缺口**：没有按 `symbols` 内 ticker / sector 过滤的 action。

**D. 价格 + 基本面** — `backend/app/shared/fmp/`：FMP 历史日线 + profile/quote（市值 / PE TTM / forward PE / 52 周区间 / 板块）。

**E. 对话 agent** — 见 `docs/plans/active/kol-persona-research-agent.md`：`/research` 双栏台已支持博主视角（`personaUsername` 状态、`🎙️ @qinbafrank 视角` chip、KOL chunks 面板），默认 persona `qinbafrank`。`/kol-chat` 已退役，对话统一收口到 `/research`。

## 设计

### 整体结构

```
┌─ ① 方法论内核（置顶常驻）+ ④ 对话大 CTA ──────────┐
│   一句话画像 · 5 条核心原则 · 可证伪指纹 · 明确不做  │
│   [🎙️ 用 Frank 的视角向他提问 →]                  │
├─ ② 板块卡片（点进看详情，AI 细分到产业链分层）──────┤
│   AI 算力链：[算力底座][HBM·存储][数据中心·云][电力·物理基建][应用·Agent] │
│   [加密·稳定币] [宏观]                              │
│   详情：他怎么看 / 分析路径 / 看什么数据 / 代表观点  │
├─ ③ 个股历史观点（Serenity 式）──────────────────┤
│   左：ticker 列表（频次排序）                       │
│   右：价格×提及时间线 + 基本面 + 多空概览 + 逐字摘录 │
│   每个 ticker → [问问他怎么看 NVDA →]（带上下文跳 /research）│
└────────────────────────────────────────────────┘
```

### ① 方法论内核（静态，源自蒸馏文档）

| 模块 | 内容 | 来源 |
|---|---|---|
| 一句话画像 | 中文圈系统的美股/AI算力/加密产业派分析师 | `overview.md` |
| 5 条核心原则 | 产业故事>技术面 / 强信念必带可证伪锚 / 风险等级化 / 政治经济学世界 / 拿不住=不该重仓 | `overview.md` |
| 招牌指纹 | "若 X 则证伪 Y"（高亮单列） | `principles-falsifiability.md` |
| 明确不做 | 日内 / meme / 精确点位 / 喊崩盘 | `overview.md` |

标注「已蒸馏方法论，非本人发言」。

### ② 板块卡片（静态方法论 + 真实推文证据）

板块**细分到产业链分层**，不用一个笼统的「AI」（决策见上）。卡片正面：板块名 + 一句话立场 + 关键标的 chips + 真实推文数 + 招牌句。详情页 4 块：他怎么看（lens §1）/ 分析路径（§2）/ **会看哪些数据**（§3 硬指标）/ 代表观点（真实 tweet_id 取原文）。

**AI 算力链 — 拆成 5 张子卡，来自 `lens-ai-infrastructure.md` §1 的 L0-L5 分层：**

| 子卡 | 关键标的 | 他怎么看 / 看什么数据 / 代表推文 |
|---|---|---|
| 算力底座 | NVDA / TSM / ASML | 产业链中间收租 + 赢家通吃；token 消耗增速 / RPO；Burry 反驳 `1985745626265776331`、GTC 万亿愿景 `2033686742742798680` |
| HBM·存储 | MU / 海力士 | 卡脖子环节；HBM 三家产能分配(SK57/三星22/美光21)；SK海力士三死三生 `2032437176580059372`；证伪「三家集体扩产能→周期股逻辑回归」 |
| 数据中心·Newcloud | CRWV / NBIS / ORCL / Mag4 | 重资产 capex 周期；营收/Capex 比值、折旧 cliff；capex 战争 `2023597321368547520`；证伪「Mag4 半数 miss」 |
| 电力·物理基建 | 变压器/冷却/核电 | 「用电力视角看算力」；卡脖子传导到电力(Blackwell 时租 2.75→4.08)；算力短缺 `2043910896351883636`、Colossus `2012789705964990803` |
| 应用·Agent / 物理 AI | OpenAI/Anthropic/xAI/Robotaxi | L4-L5；诚实承认「短期看不出最终赢家」、不押注应用层 |

**加密·稳定币**（`lens-crypto.md`，1 张卡，内部结构：稳定币基建 / 合规交易所 / AI×Crypto 支付）：CRCL/COIN/HOOD；看 USDC 发行量增速 / ETF 净流入 / 立法节奏；代表 `1997648243862454767`(Circle 龙二)。

**宏观**（`lens-macro.md`，1 张卡，内部结构：流动性体制 / 政治经济学 / 地缘 / 调整级别）：无个股；看银行准备金 / SOFR-EFFR / TGA / CPI；代表 `2017154945674596430`(沃什剧本)、`1985686986703978755`(钱荒类比)。

板块详情底部 → 该板块标的 → 跳第 ③ 层。

> 后续若加密/宏观也需细分（加密拆稳定币/交易所/RWA，宏观拆流动性/政策/地缘），lens 文件内部结构已支持，按需再拆。

### ③ 个股历史观点（Serenity Oracle 式 + 多空增强）

**左侧 ticker 列表**：按提及频次排序，每行 `$TICKER · N 次提及 · 最新日期 · 当前价`。搜索 + 筛选（全部/看多/看空）。顶部高频标的：META / NVDA / MSTR / PLTR / COIN / MU / CRCL / RKLB / AMD / GOOGL / MSFT…

**右侧详情**：

| 模块 | 内容 | 来源 |
|---|---|---|
| 价格×提及时间线 | 价格曲线 + 每条推文一个点；**点大小=点赞数，点颜色=多空（看多绿/看空红/中性灰）** | 价格 FMP 日线 + 提及点 `kol_tweets`(created_at/like_count/stance) |
| 基本面行 | 市值 / PE TTM / 远期 PE / 52 周区间 / 板块 | FMP profile+quote |
| 多空概览 | "N 次提及 · 看多 X / 中性 Y / 看空 Z" | `symbols.ticker_stances` 聚合 |
| 逐字摘录（折叠） | **最早怎么看** / **核心论点** / **提到的数字** / **最新表态**，逐字 + 链接 + 日期 + ♥数 + 多空标签 | `kol_tweets` text/url/created_at/like_count |

**ticker 提及从原文抽取**（cashtag + 大写代码 + 中文名→ticker 字典），不依赖 enrichment；多空上色为可选增强（见「依赖」）。摘录分类（机械，无需 AI）：最早/最新=按时间；数字=正则含 `%`/`$`/数字；核心论点=高赞 + 原创(非 reply) + 长文 作代理（不依赖 enrichment 的 keep 信号）。

### ④ 对话 Agent CTA（动态层）

**主 CTA**（置顶，大按钮）→ `/research?agent=kol&persona=qinbafrank`，进去直接是预加载好的博主视角双栏台。

**上下文化入口**（撒到各层）：
- 板块详情 → `/research?agent=kol&persona=qinbafrank&q=AI基建现在怎么看`
- 个股详情 → `/research?agent=kol&persona=qinbafrank&symbol=NVDA`

**三种状态**：已登录+有 flag → 直接进；未登录 → `/login?redirect=...`；已登录无 flag → 置灰 + 申请开通，其余两层照常浏览。

现有 inline chat 降级为轻量预览（starter 问题 + 大 CTA），多轮对话统一去 `/research`，不维护两套对话 UI。

### API 变更（后端公开只读，对齐 `GET /api/twitter-digest/latest` 的 open 模式）

新增到 `backend/app/features/kol_research/router.py`（或新建 `kol_persona_page` 子模块），**不加 flag gating**（页面浏览公开）：

| 端点 | 返回 | 数据源 |
|---|---|---|
| `GET /api/kol_research/personas/{username}/profile` | 方法论内核（画像/原则/指纹/不做）+ 板块卡片正面（立场/标的/推文数/招牌句） | 蒸馏文档常量（后端读 md frontmatter 或 hardcode）+ `stats` |
| `GET /api/kol_research/personas/{username}/sectors/{sector}` | 板块详情（怎么看/路径/看什么数据/代表 tweet_ids → 取原文）；`sector` 为细分 key：`ai-compute-base`/`ai-hbm`/`ai-datacenter`/`ai-power`/`ai-application`/`crypto`/`macro` | lens 文件 + `kol_tweets get` |
| `GET /api/kol_research/personas/{username}/tickers` | ticker 列表 + 提及数 + 首/末日期 + 多空分布 + 当前价 | `kol_tweets` 聚合 + FMP quote |
| `GET /api/kol_research/personas/{username}/tickers/{ticker}` | 该 ticker 全部相关推文（逐字+stance）+ 价格日线 + 基本面 | `kol_tweets` + FMP |

### 数据库 / Edge Function 变更

`kol_tweets.symbols` 已有所需结构，**无需 schema 迁移**。按 ticker/sector 过滤两种实现，**优先方案 A**：

- **方案 A（推荐，无 edge 改动）**：后端一次性 `list`（或 `list_batch`）拉全量 qinbafrank 推文（~2460 条，量小），在后端内存/缓存里按 `symbols.ticker_stances[].ticker` 和 `symbols.sectors` 聚合建索引，每小时随采集刷新。
- **方案 B（如量增长再做）**：给 `kol-tweets.js` 加 `list_by_ticker` / `list_by_sector` action，用 PostgREST JSONB containment 过滤。

### 前端变更

- 重构 `QinbaFrankPage.tsx` 为四层；新增 `_components/`：`MethodologyCore` / `SectorCard` + `SectorDetail` / `TickerList` + `TickerDetail` / `MentionTimelineChart` / `AskFrankButton`
- `MentionTimelineChart`：价格线 + 提及散点（复用前端现有图表库；点 size=like_count，color=stance）
- `api.ts`：新增 `api.kolResearch.profile/sectors/tickers/tickerDetail`
- **`/research/page.tsx` 小改**：`useSearchParams` 增加 `agent` / `persona`（可选 `q`）处理——挂载时若 `agent=kol`，初始化 `agentKind='kol_research'` + `personaUsername=persona`，直接进博主视角而非 WelcomeScreen

### 透明度规则（全部保留）

- 摘录一律逐字 + 原文链接，标日期 / 赞数
- 多空标签是 **AI 自动标注，以原文为准**（不替他下结论）
- 方法论内容标 **已蒸馏，非本人发言**
- 全页 **非投资建议** banner

## 实施步骤

按**垂直切片**推进：先把「1 个板块 + 1 个 ticker」端到端打通验证，再铺开。每步可独立验证。

### Step 0 · 后端数据层（聚合 + 缓存）
1. [ ] 后端聚合服务：拉全量 qinbafrank `kol_tweets`，按 ticker / sector 建索引（方案 A），随每小时采集刷新
2. [ ] FMP 封装：历史日线 + profile/quote（复用 `shared/fmp`）
3. [ ] 单测：聚合正确性、stance 分布、空数据处理

### Step 1 · 后端只读端点
4. [ ] `GET /profile`（方法论内核 + 板块正面，读 md + stats）
5. [ ] `GET /tickers` + `GET /tickers/{ticker}`（聚合 + FMP）
6. [ ] `GET /sectors/{sector}`（lens 内容 + 代表 tweet 原文）
7. [ ] 端点公开（无 flag），单测 + 真实数据 smoke

### Step 2 · 前端垂直切片（算力底座子卡 + NVDA）
8. [ ] `api.ts` 新增方法 + 类型
9. [ ] `MethodologyCore` + `AskFrankButton`（主 CTA）
10. [ ] 1 张板块子卡（AI 算力链 / 算力底座）+ 详情
11. [ ] `TickerDetail` + `MentionTimelineChart`（NVDA 端到端：价格+提及点+多空+摘录）
12. [ ] 浏览器实测：价格曲线渲染、提及点对齐、原文链接可点、多空上色正确

### Step 3 · 铺开 + 对话打通
13. [ ] 板块铺满（AI 算力链其余 4 子卡 + 加密 + 宏观）
14. [ ] `TickerList` 全量 + 搜索 + 筛选
15. [ ] `/research/page.tsx` 加 `agent`/`persona`/`q` 参数处理
16. [ ] 上下文化 CTA（板块/个股 → /research 带上下文）
17. [ ] inline chat 降级为预览

### Step 4 · 收尾
18. [ ] 三种状态（未登录/无 flag/有 flag）走查
19. [ ] 透明度 banner + 标注齐全
20. [ ] 更新 `frontend/src/app/kol/.context.md`
21. [ ] E2E（浏览公开、对话 gating、深链 /research）

## 依赖

- ④ 依赖 `kol-persona-research-agent.md` 的博主投研 agent 已可用（`/research` persona 路径）
- 价格依赖 FMP_API_KEY（已有）
- **③ 不依赖 enrichment 回填**（2026-05-24 修正）。`symbols` enrichment 是给每日 digest 用的、forward-only 只跑近 24h，全历史大部分未填，**不为本页回填**。③ 走 **中文名字典抽取**：抽样 30 条证实 qinbafrank **不用 `$cashtag`**(0/30)、按**中文名**写公司(美光/诺基亚/英伟达)，裸大写词多为噪音(DSP/RAN/SEC)。所以靠一张 `{ticker: [中文名, 英文别名]}` 字典(~20-40 个核心标的，与板块卡片硬编标的**同源**)匹配 `kol_tweets.text`：中文别名 substring + 英文别名词边界。确定性、零 LLM、覆盖全历史；代价=只覆盖字典内标的(MVP 可接受，Serenity 也仅 141)。多空 stance 为可选后续增强，MVP 提及点单色不上色。FMP 价格在 `backend/app/shared/fmp_service.py`。

## 待定问题

（板块细分 / 多空上色 / 不抽象多 persona 已在「决策记录」定案。）

### ✅ 已核实

1. **qinbafrank 怎么引用 ticker**（2026-05-24 抽样 30 条）—— **完全不用 `$cashtag`**(0/30)，按**中文名**写公司(美光/诺基亚/英伟达)，裸大写词多为噪音(DSP/RAN/SEC/AI)。结论：③ ticker 抽取**必须靠中文名→ticker 字典**，纯 cashtag/正则无效。MVP 维护 `{ticker: [中文名, 英文别名]}` 字典(~20-40 个核心标的，与板块卡片硬编标的同源)。详见「依赖」。

### 🔧 设计期必须定（影响实现）

2. **AI 子卡 → 标的映射是人工策展** —— enrichment 的 `sectors` 只有 "AI 算力" 这种粗标签，没有 "算力底座/HBM" 细分。所以"哪个 ticker 属于哪张子卡"必须从 lens 文件**人工硬编码一张 ticker→子层映射**，不能从数据自动得。确认接受。
3. **哪些标的能配价** —— lens 覆盖 A股(688041)、港股(0981)、未上市(OpenAI/xAI)、crypto(SOL)。FMP 对非美股/未上市/部分 crypto 无价。首版**只对美股配价、其余只显示提及时间线不配价**？（Serenity 也是 138/141 有降级）
4. **/research 深链参数契约** —— `/research` 现有 `symbol` 参数驱动的是 screener 选股上下文，**不是 KOL 对话**，复用会冲突。新加 `q`（预填问题）是**填进输入框等用户发送**还是**自动发送**？用什么 param 不撞现有行为？
5. **板块详情文案** —— lens 是长中文 md，详情需精炼摘录而非整篇 dump。**人工裁剪**（干净，是写作活）还是**程序切 section**（快但乱）？
6. **重建方式** —— 现有 `/kol/qinbafrank` 是否已对用户可见 / 在 flag 后？**就地重写**还是 **flag/分支后建好再切**？

### 🟡 次要（可施工中定）

7. **个股摘录「核心论点」筛选** —— 纯 `quality="keep"` + 高赞够不够，还是需要轻 AI 排序？倾向先机械规则。
8. **聚合刷新时机** —— 随采集 cron 刷，还是端点带 TTL 缓存懒加载？倾向后者。
9. **"看什么数据" 静态 vs 实时** —— 他看的 RPO/HBM产能/SOFR-EFFR 这些 FMP 没有。首版做**静态方法论清单**，还是给利率/价格类接实时值？倾向静态。
10. **提及时间线口径** —— 算不算 reply/quote？一条推文提多个 ticker → 在多只股图上各出一个点；"提及数"按 tweet 还是 tweet×ticker？
11. **stance+价格叠加的"像喊单"风险** —— 多空点叠价格曲线比纯文字更像荐股，措辞要刻意弱化（per-tweet 情绪 ≠ 推荐），非投资建议 banner 之外可能要额外说明。
12. **与 `twitter-kol-opinion-platform.md` Phase 4 的边界** —— 那是「多 KOL 看一只股」，本 plan 是「单博主驾驶舱」，个股时间线组件未来可复用，别重复造。

## 风险

| 风险 | 应对 |
|------|------|
| enrichment 多空标注不准，误导散户 | 标「AI 自动标注，以原文为准」；抽查准确率，不准则不上色 |
| 编造博主原话 | 摘录全部逐字 + 链接；方法论标「已蒸馏，非本人发言」；命中原推才说「原文支持」 |
| 前端硬编码动态字段（违反 .context.md） | 价格/提及/基本面全走后端端点，前端不存动态值 |
| FMP 配额 / ticker 无价格数据 | 缓存 + 优雅降级（无价格则只显示提及时间线） |
| 全量聚合 2460 条性能 | 量小可内存聚合 + TTL 缓存；增长后转方案 B（edge JSONB 过滤） |
| `/research` 深链改动影响中性 research 流 | 只在 `agent=kol` 时改分支，默认行为不变；加测试 |

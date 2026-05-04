# 市场 Tab 改造计划 — 散户视角的股价解释器

> Status: Planning
> Updated: 2026-04-25
> Related: `frontend/src/app/stock/[symbol]/_components/MarketTab.tsx`, `frontend/src/components/market/`, `backend/app/features/stock/`
> Vision: 当用户发现股票涨跌时，来这个页面就能理解原因

## 核心场景

**"我的股票今天涨/跌了 X%，为什么？"**

这是散户最高频的需求。信息应该按**解释力**组织，而不是按数据来源分类。

## 用户访谈洞察

散户真正关心的：
1. 社交媒体上的相关新闻和讨论
2. YouTube 博主对这些新闻的评价
3. 资金面或更深层次的洞察（内部人交易、机构动向等）

散户不太关心的：
- 分析师评级（滞后、对散户操作无直接指导）
- 市场排名徽章（信息密度低）
- 同行对比表（需求弱）

## 现状盘点

| 现有组件 | 代码量 | 判决 | 理由 |
|----------|--------|------|------|
| AIMarketAnalysisCard | 135 行 | **改造** | 核心定位对，但内容需从"多维度罗列"变为"因果叙事" |
| NewsAndReleasesCard | 149 行 | **保留+增强** | 融入社交媒体，变成统一时间线 |
| MarketHeaderStrip | 72 行 | **精简保留** | 财报倒计时有用，徽章去掉 |
| MarketKpiRow | 93 行 | **重新设计** | KPI 应反映新板块核心指标 |
| AnalystRatingsCard | 465 行 | **移除** | 用户反馈无帮助，也是最大的组件 |
| MarketHeatCard | 88 行 | **移除** | 信息价值低 |
| PeersComparisonCard | 57 行 | **移除** | 融入宏观关联 |

## 新设计

### 布局

左栏固定（观点总结）+ 右栏滚动（KPI + 原始内容）。整体框架不变，内容优先级调整为 Twitter KOL 观点监控。

```
+-- HeaderStrip (财报倒计时 + 催化剂提醒) ---------------------+
|                                                                |
|  +-- 左栏 (sticky) ----+  +-- 右栏 (scroll) ---------------+ |
|  |                      |  |                                 | |
|  |  KOL 观点总结          |  |  新 KPI 行                      | |
|  |  (每个大 V 怎么看)     |  |  (现价/新闻/相对板块/...)       | |
|  |                      |  |                                 | |
|  |  "@KOL1 认为毛利率    |  |  Twitter 推文时间线              | |
|  |   压力仍未缓解..."    |  |  每条推文 + 原始链接             | |
|  |                      |  |                                 | |
|  |                      |  |  [active sub-tab content]       | |
|  |                      |  |                                 | |
|  +----------------------+  +---------------------------------+ |
+----------------------------------------------------------------+
```

### 第一优先级：Twitter KOL 数据管道

先做可信金融博主的推文采集管道。只有数据稳定入库后，再做“我认可的大 V 如何看待这只股票”的查询和展示。

**数据源**：
- 配置好的 Twitter KOL 账号列表
- TwitterAPI.io user timeline（已有 `backend/app/features/twitter/` 基础）
- Twitter Article 补全文本（复用已有 fetch-articles 能力）
- `kol_tweets` 数据库存储

**本阶段不做**：
- 不做股票 ticker 匹配
- 不做 LLM 总结
- 不做前端 Market Tab 展示
- 不在用户请求时调用 TwitterAPI.io

**验收**：
- 每小时 cron 可以批量抓取配置 KOL 的最新推文。
- 每次使用 2-3 小时安全窗口，upsert 去重，避免漏抓。
- 每个 KOL 采集失败不会影响其他 KOL。
- 每次运行有可查询的 run 记录。

### 后续：视频解读

YouTube 财经博主视频聚合。

**数据源**：
- YouTube Data API v3（搜索 "{symbol} stock" 近 7 天）

**展示**：
- 视频卡片：缩略图 + 标题 + 频道名 + 发布时间 + 观看量
- AI 摘要：每个视频的核心观点提取（1-2 句话）
- 博主立场标签：看涨/看跌/中性

### 后续：资金面（Smart Money）

散户缺乏的"深层洞察"。

**数据源**：
- 内部人交易（已有 FMP insider-trading）
- 机构持仓变动（FMP institutional-holders）
- 异常期权活动（需评估数据源）

**展示**：
- 信号化呈现，不是原始数据表
  - 例："近 7 天内部人净买入 $5.2M，为近一年最大单周买入"
  - 例："BlackRock 上季度增持 2.3%"
- 内部人交易时间线（简化的条形图）
- 资金流入/流出趋势

### AI 解读改造

现有 AIMarketAnalysisCard 的 6 段维度罗列 -> 一段因果叙事。

**核心变化**：
- 直接回答"今天为什么涨/跌"
- 串联：公司新闻事件 + 宏观环境 + 资金面信号
- 补充宏观关联：利率环境、板块轮动对个股的影响
- 语言更口语化，像一个分析师朋友在跟你聊天

**示例**：
> NVDA 今日下跌 3.2%，主要受两个因素驱动：(1) 商务部宣布对华 AI 芯片出口新限制，直接影响收入预期；(2) 半导体板块整体回调 -1.8%，资金从科技股流出转向防御性板块。值得注意的是，配置的 Twitter KOL 中，半导体产业链账号普遍担心短期订单节奏，但长期基本面账号仍认为数据中心需求没有被破坏。

### KPI 行重新设计

| 指标 | 说明 |
|------|------|
| 采集状态 | 最近一次 Twitter KOL 数据管道是否正常 |
| 已采 KOL | 当前启用并成功入库的 KOL 数 |
| 最新推文 | 最近一次入库时间 |
| 宏观关联 | 相对板块表现 |

## 后端新增端点

| 端点 | 数据源 | 缓存 | 说明 |
|------|--------|------|------|
| `POST /twitter/fetch-configured-kols` | TwitterAPI.io | 持久化 | 批量采集配置大 V 推文，cron 调用 |
| `GET /twitter/kol-accounts` | 配置/DB | 5min | 返回启用的 KOL 目录 |
| `GET /twitter/fetch-runs` | DB | 1min | 查看采集运行记录 |
| `GET /stocks/{symbol}/twitter-kol-opinions` | kol_tweets + stock mention index + LLM | TBD | Deferred：LLM 总结 + 推文证据 |
| `GET /stocks/{symbol}/youtube-videos` | YouTube Data API v3 | 1h | 相关视频搜索 + AI 摘要 |
| `GET /stocks/{symbol}/smart-money` | FMP (部分已有) | 30min | 内部人 + 机构 + 期权信号 |
| `POST /stocks/{symbol}/market-analysis` | 已有，改造 prompt | 8h | AI 因果叙事 |

已有端点保留：
- `GET /stocks/{symbol}/news-feed` — 继续使用
- `GET /stocks/{symbol}/press-releases` — 继续使用
- `GET /stocks/{symbol}/market-overview` — 精简，去掉 analyst 相关字段

可废弃端点：
- `GET /stocks/{symbol}/analyst-activity` — 移除分析师 Tab 后不再需要

## 执行计划

### Phase 1 — Twitter KOL 数据管道（最高优先级）

先保证可信博主推文能稳定、低成本、可观测地进入数据库。

**后端**：
1. 配置 KOL 白名单。
2. 实现 `/twitter/fetch-configured-kols`，批量复用现有 `fetch_and_store_tweets()`。
3. 每小时 cron 调用，每个 KOL 默认拉最新 1 页，使用 2-3 小时安全窗口过滤。
4. 建立或扩展采集运行记录，保存每个 KOL 的 fetched/stored/skipped/error。

**前端**：
1. 本阶段不做股票页 UI。
2. 如需要，只做内部调试视图查看 KOL 列表和最近采集状态。

**里程碑**：数据库中持续累积配置 KOL 的最新 tweets，后续股票观点查询只读数据库，不直接调用 TwitterAPI.io。

### Phase 2 — 股票相关性索引

**后端**：
1. 实现 tweet -> stock 的候选召回层：cashtag regex、company aliases、上下文 ticker 匹配。
2. 建立 `tweet_stock_mentions` 或等价缓存。
3. 对 `META`、`NOW`、`ON`、`ARE`、`IT`、`AI` 等易误匹配 ticker 启用严格规则。
4. 本阶段只判断“是否值得作为候选推文”，不判断推文观点类型。

### Phase 3 — KOL LLM 总结与 Market Tab 展示

**后端**：
1. 实现 `/stocks/{symbol}/twitter-kol-opinions`。
2. 从 `tweet_stock_mentions` 读取候选推文，按作者和时间组织后交给 LLM。
3. LLM 输出自然语言总结，不强制 bullish/bearish、观点类型、时间周期等结构化字段。
4. API 返回 `summary_markdown`、`cited_tweet_ids` 和原始 tweets，用于证据核验。

**前端**：
1. 新建 `TwitterKolOpinionsPanel`。
2. 左栏展示 LLM 总结，右栏展示原始 tweet 证据。

### 后续 — AI 解读改造

**后端**：
1. 重写 `market_overview_agent` 的 prompt，聚焦因果叙事
2. 加入社交媒体数据作为新数据源
3. 输出从 6 段结构化 -> 1 段连贯叙事 + 宏观关联

**前端**：
1. 改造 `AIMarketAnalysisCard` 的展示方式
2. 简化为一段文字 + 关键标签

### 后续 — 资金面 Tab

**后端**：
1. 整合已有 insider 数据
2. 新增机构持仓变动数据
3. 评估异常期权活动数据源
4. 实现 `/stocks/{symbol}/smart-money` 端点

**前端**：
1. 新建 `SmartMoneyCard` 组件
2. 信号化展示（非原始数据表）
3. 资金流向趋势图

### 后续 — 视频解读 Tab

**后端**：
1. 接入 YouTube Data API v3
2. 实现 `/stocks/{symbol}/youtube-videos` 端点
3. AI 摘要生成（每个视频的核心观点）

**前端**：
1. 新建 `YouTubeVideosCard` 组件
2. 视频卡片列表 + AI 摘要 + 立场标签

### 后续 — 清理

1. 移除 `AnalystRatingsCard`（465 行）
2. 移除 `MarketHeatCard`（88 行）
3. 移除 `PeersComparisonCard`（57 行）
4. 精简 `MarketHeaderStrip`，去掉市场徽章
5. 废弃 `/stocks/{symbol}/analyst-activity` 端点
6. 更新 `.context.md` 文件

## 设计原则

| 原则 | 说明 |
|------|------|
| 因果优先 | 每个板块都在回答"为什么"，而不是展示数据 |
| 信号 > 数据 | 把原始数据提炼成可行动的信号 |
| 时效性 | 内容以"今天/本周"为锚点，不是静态信息 |
| 聚合价值 | 把散户需要跑 5 个网站才能看到的信息集中在一处 |

## 风险与待决

| 风险 | 应对 |
|------|------|
| TwitterAPI.io 成本 | Phase 1 只采集配置 KOL，每小时默认每人 1 页；不做全网搜索 |
| cron 漏跑 | 每次使用 2-3 小时安全窗口，upsert 去重 |
| 单个 KOL 失败 | 单账号独立 try/catch，并写入 run 记录 |
| YouTube API 配额（10,000 units/day） | 搜索请求 100 units，一天约 100 只股票上限 |
| AI 总结过度概括 | 总结必须返回 cited_tweet_ids，右栏可核验原文 |
| AI 摘要成本（视频数量多） | 批量处理 + 缓存，只摘要热门视频 |
| 移除分析师数据后部分用户不满 | 可保留为折叠区域或独立页面 |

## 相关文件

**前端（需改动）**
- `frontend/src/app/stock/[symbol]/_components/MarketTab.tsx` — 重构子 Tab 结构
- `frontend/src/components/market/` — 新增 Twitter KOL 总结和推文时间线组件
- `frontend/src/hooks/queries/use-stock-data.ts` — 新增 hooks

**前端（需移除）**
- `frontend/src/components/market/AnalystRatingsCard.tsx` (465 行)
- `frontend/src/components/market/MarketHeatCard.tsx` (88 行)
- `frontend/src/components/market/PeersComparisonCard.tsx` (57 行)

**后端（需改动）**
- `backend/app/features/twitter/` — 增加 KOL 配置、批量采集、采集运行记录

**后端（需新增）**
- Deferred: `backend/app/features/twitter/stock_matcher.py` — 股票相关性索引
- Deferred: `backend/app/features/stock/agent/twitter_kol_summary.py` — KOL 推文 LLM 总结 Agent
- YouTube 服务（Data API v3 集成）

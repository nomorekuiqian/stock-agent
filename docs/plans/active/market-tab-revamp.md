# 市场 Tab 改造计划 — 散户视角的股价解释器

> Status: Planning
> Updated: 2026-04-21
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

左栏固定（AI 解读）+ 右栏滚动（KPI + 子 Tab）。整体框架不变，内容全换。

```
+-- HeaderStrip (财报倒计时 + 催化剂提醒) ---------------------+
|                                                                |
|  +-- 左栏 (sticky) ----+  +-- 右栏 (scroll) ---------------+ |
|  |                      |  |                                 | |
|  |  今日股价解读         |  |  新 KPI 行                      | |
|  |  (AI 因果叙事)       |  |  (社交热度/资金信号/情绪/...)   | |
|  |                      |  |                                 | |
|  |  "NVDA 今日下跌      |  |  +-- 子 Tab ----------------+  | |
|  |   3.2%, 主要受       |  |  | 舆情动态 | 视频解读 | 资金面 | | |
|  |   两个因素驱动..."   |  |  +-------------------------+  | |
|  |                      |  |                                 | |
|  |                      |  |  [active sub-tab content]       | |
|  |                      |  |                                 | |
|  +----------------------+  +---------------------------------+ |
+----------------------------------------------------------------+
```

### 子 Tab 1：舆情动态（最高优先级）

社交媒体 + 新闻的统一时间线。

**数据源**：
- 主流财经媒体新闻（已有 FMP news-feed）
- Reddit 热帖（r/wallstreetbets, r/stocks, r/investing）
- X/Twitter 相关讨论
- 公司官方公告（已有 FMP press-releases）

**展示**：
- 统一时间线，按时间倒序混合呈现，来源用标签区分
- 情绪指标面板：看涨/看跌/中性分布（饼图或条形图）
- 24h 讨论量趋势（折线图）
- 每条内容标注情绪标签

### 子 Tab 2：视频解读

YouTube 财经博主视频聚合。

**数据源**：
- YouTube Data API v3（搜索 "{symbol} stock" 近 7 天）

**展示**：
- 视频卡片：缩略图 + 标题 + 频道名 + 发布时间 + 观看量
- AI 摘要：每个视频的核心观点提取（1-2 句话）
- 博主立场标签：看涨/看跌/中性

### 子 Tab 3：资金面（Smart Money）

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
> NVDA 今日下跌 3.2%，主要受两个因素驱动：(1) 商务部宣布对华 AI 芯片出口新限制，直接影响收入预期；(2) 半导体板块整体回调 -1.8%，资金从科技股流出转向防御性板块。Reddit 上 r/wallstreetbets 讨论量激增 340%，情绪偏空。不过值得注意的是，CEO Jensen Huang 上周刚增持了 $12M 股票。

### KPI 行重新设计

| 指标 | 说明 |
|------|------|
| 社交热度 | 24h 讨论量 + 较前日变化 |
| 舆情情绪 | 看涨/看跌比例 |
| 资金信号 | 内部人近 30 天净买/卖 |
| 宏观关联 | 相对板块表现 |

## 后端新增端点

| 端点 | 数据源 | 缓存 | 说明 |
|------|--------|------|------|
| `GET /stocks/{symbol}/social-sentiment` | Reddit API + X API | 15min | 社交媒体聚合 + 情绪分析 |
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

### Phase 1 — 舆情动态 Tab（最高优先级）

社交媒体监控是用户最想要的功能。

**后端**：
1. 调研 Reddit API / X API 的接入方式和限制
2. 实现 `/stocks/{symbol}/social-sentiment` 端点
3. 情绪分析：可用 LLM 或简单的关键词/表情分析

**前端**：
1. 新建 `SocialSentimentCard` 组件
2. 统一时间线（新闻 + 社交帖子混合）
3. 情绪指标面板
4. 24h 讨论量趋势图

**里程碑**：用户打开市场 Tab 能看到 Reddit/X 上关于该股票的最新讨论

### Phase 2 — AI 解读改造

**后端**：
1. 重写 `market_overview_agent` 的 prompt，聚焦因果叙事
2. 加入社交媒体数据作为新数据源
3. 输出从 6 段结构化 -> 1 段连贯叙事 + 宏观关联

**前端**：
1. 改造 `AIMarketAnalysisCard` 的展示方式
2. 简化为一段文字 + 关键标签

### Phase 3 — 资金面 Tab

**后端**：
1. 整合已有 insider 数据
2. 新增机构持仓变动数据
3. 评估异常期权活动数据源
4. 实现 `/stocks/{symbol}/smart-money` 端点

**前端**：
1. 新建 `SmartMoneyCard` 组件
2. 信号化展示（非原始数据表）
3. 资金流向趋势图

### Phase 4 — 视频解读 Tab

**后端**：
1. 接入 YouTube Data API v3
2. 实现 `/stocks/{symbol}/youtube-videos` 端点
3. AI 摘要生成（每个视频的核心观点）

**前端**：
1. 新建 `YouTubeVideosCard` 组件
2. 视频卡片列表 + AI 摘要 + 立场标签

### Phase 5 — 清理

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
| Reddit API 限制（免费 tier 100 req/min） | 后端缓存 + 按需请求，不实时轮询 |
| X/Twitter API 成本高（Basic $100/mo） | 先评估 ROI，可先只做 Reddit |
| YouTube API 配额（10,000 units/day） | 搜索请求 100 units，一天约 100 只股票上限 |
| 社交媒体数据质量参差不齐 | LLM 过滤 + 情绪分析做质量门控 |
| AI 摘要成本（视频数量多） | 批量处理 + 缓存，只摘要热门视频 |
| 移除分析师数据后部分用户不满 | 可保留为折叠区域或独立页面 |

## 相关文件

**前端（需改动）**
- `frontend/src/app/stock/[symbol]/_components/MarketTab.tsx` — 重构子 Tab 结构
- `frontend/src/components/market/` — 新增/改造/移除组件
- `frontend/src/hooks/queries/use-stock-data.ts` — 新增 hooks

**前端（需移除）**
- `frontend/src/components/market/AnalystRatingsCard.tsx` (465 行)
- `frontend/src/components/market/MarketHeatCard.tsx` (88 行)
- `frontend/src/components/market/PeersComparisonCard.tsx` (57 行)

**后端（需改动）**
- `backend/app/features/stock/router.py` — 新增端点
- `backend/app/features/stock/agent/market_overview.py` — 改造 prompt
- `backend/app/features/stock/service.py` — 新增社交媒体/YouTube 服务

**后端（需新增）**
- 社交媒体服务（Reddit/X API 集成）
- YouTube 服务（Data API v3 集成）

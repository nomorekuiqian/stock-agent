# 市场面(Market Tab)重构 Engineering Plan

> Status: Planning
> Related: `backend/app/features/stock/.context.md`, `backend/app/shared/data_tools/.context.md`, `backend/app/shared/fmp_service.py`, `frontend/src/app/stock/[symbol]/_components/MarketTab.tsx`
> Vision: 个股市场面 — 从"AI 新闻文字墙"升级为"FMP 数据驱动的舆情终端"

## 目标

让用户在市场面一眼看到**最近的新闻、分析师动态、市场热度、同行对比、公司公告**,而不是看 LLM 总结的一大段文字。本期**只用 FMP 已付费能拿到的数据**,社交媒体讨论(Twitter/Reddit/StockTwits 聚合)放到 Phase 3 单独立项。

## 现状(审计结论)

### UI — AI 分析喧宾夺主,原始数据稀薄

`frontend/src/app/stock/[symbol]/_components/MarketTab.tsx:242-335`:

| 区域 | 占比 | 内容 | 问题 |
|---|---|---|---|
| 左栏 | ~33% | NewsAnalysisPanel / MacroAnalysisPanel (LLM 生成的 4 段文字) | 文字墙,需要逐字读;付费墙门控,免费用户看不到 |
| 右栏顶 | — | InsiderTradingSection | OK,但位置不显眼,且无时间序列视图 |
| 右栏中 | — | PriceTargetBar | **硬编码 `consensus={null}`**,组件形同虚设 |
| 右栏底 | — | NewsFeed (15 条 FMP 新闻) | 纯文字列表,无摘要预览、无标签、无情绪标记 |

"市场面"名义上是 market,实际等于 "AI News" + "Insider"。**分析师评级动态、公司公告、市场热度对比、同行对照**全部缺失,而这些数据 FMP **已经全部提供且我们已付费**。

### 后端 — 单一源,单一维度

- 新闻只用了 `/stable/news/stock`,没用 `press-releases`
- 分析师数据只用了 `price_target_consensus`,没用 `grades` / `grades-summary` / `grade-latest-news` / `historical-grades` / `price-target-latest-news`
- 市场热度对比类端点(gainers/losers/most-active/sector-performance)一个都没接
- 同行新闻 agent 层拿了但 UI 不展示

### 缓存

- 新闻 15min / 内部人 30min / AI 分析 8h — 整体 OK,但分析师评级动态应该更实时(5-10min)

## FMP 端点盘点(本期使用范围)

### 已接入 · 但未充分利用

| 端点 | 现状 | 改进空间 |
|---|---|---|
| `get_price_target_consensus` | 已 fetch,UI 没接 | Phase 1 接入 PriceTargetBar |
| `get_price_target_summary` | 已 fetch,UI 没接 | Phase 1 展示"最近 1M/3M/12M 目标价变化" |
| `get_stock_peers` | agent 层用了 | Phase 2 UI 展示 top 3 peer 对比表 |
| `get_earnings_calendar` | 只在 agent 用 | Phase 2 UI 直接展示"下次财报倒计时卡" |

### 未接入 · 分析师维度 (Phase 1 核心)

| 端点 | 用途 | 返回 |
|---|---|---|
| `/stable/grades` | 当前评级列表 | 按分析师 previousGrade / newGrade / action |
| `/stable/grades-summary` | 评级汇总 | strongBuy / buy / hold / sell / strongSell 数量 |
| `/stable/historical-grades` | 历史评级 | 过去一年评级变化时间线 |
| `/stable/grade-latest-news` | 最新评级变动新闻 | 近期升/降级 + 新闻链接 |
| `/stable/price-target-latest-news` | 目标价调整新闻 | 近期目标价变动 + 新闻链接 |

### 未接入 · 新闻增强 (Phase 2)

| 端点 | 用途 |
|---|---|
| `/stable/news/press-releases` | 公司官方公告(比聚合新闻更一手,合规类信号源头) |
| `/stable/news/press-releases-latest` | 最新公司公告流 |

### 未接入 · 市场热度对比 (Phase 2)

| 端点 | 用途 |
|---|---|
| `/stable/biggest-gainers` | 当日最大涨幅股(判定本股是否上榜) |
| `/stable/biggest-losers` | 当日最大跌幅股 |
| `/stable/most-active` | 当日成交量 Top |
| `/stable/sector-performance-snapshot` | 板块表现 |
| `/stable/industry-performance-snapshot` | 行业表现 |

### 非本期范围

- `/stable/historical-social-sentiment` 等社交情绪端点 → Phase 3 单独立项
- 中文舆情源(雪球/东财) → 非本期,非 FMP 覆盖

## 设计

### 核心理念:清晰分组的数据终端

整体布局原则:**每个功能模块 = 一张独立的带标题的 Card**,同类信息聚合在一张卡内(分析师的东西放一起、新闻的东西放一起、内部人的东西放一起),卡与卡之间边界明确。AI 分析不消失,但降级为顶部"AI 深度解读"按钮的 Sheet,不再是默认主展示。

### 最终终态布局 (Phase 2 完成后)

```
┌─ Market Tab ─────────────────────────────────────────────────────────┐
│ [Header Strip]                                                         │
│  📅 下次财报 T-12d · EPS $2.15    🤖 AI 综合解读 (Pro) →              │
├──────────────────────────────────────────────────────────────────────┤
│ [KPI 5 卡]                                                             │
│  24h 新闻 │ 7d 评级变动 │ 目标价共识 │ 30d 内部人净流 │ 1M vs 板块     │
├──────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────┐  ┌─────────────────────────────┐    │
│ │ 📊 分析师评级               │  │ 🔥 市场热度                  │    │
│ │ ─────────────────────────── │  │ ─────────────────────────── │    │
│ │ 目标价条 (低 中 高 · 当前)   │  │ · 今日成交 Top #3            │    │
│ │ 评级总览 5 段条              │  │ · 今日涨幅 Top #12 (条件显示) │    │
│ │ [Tab: 评级变动 | 目标价调整] │  │ 板块相对表现                  │    │
│ │  最近 10 条 + 新闻链接       │  │  本股 1M: +5.2% · 板块: +7.5% │    │
│ │ 12M 评级历史堆叠曲线         │  │  vs SPY: -0.8pp               │    │
│ └─────────────────────────────┘  └─────────────────────────────┘    │
│                                                                        │
│ ┌─────────────────────────────┐  ┌─────────────────────────────┐    │
│ │ 📰 新闻与公告                │  │ 💼 内部人交易                │    │
│ │ ─────────────────────────── │  │ ─────────────────────────── │    │
│ │ [Tab: 全部新闻 | 官方公告]   │  │ 30d 净流向日度条形图          │    │
│ │  · 2h · Bloomberg · 标题     │  │ 近 30d 汇总                  │    │
│ │  · 5h · Apple · 标题 [公告]  │  │  买入: $1.2M · 卖出: $3.7M   │    │
│ │  ... (最多 20 条)            │  │ 最近 5 笔交易明细             │    │
│ │  [展开全部]                  │  │  [展开全部 18 笔]            │    │
│ └─────────────────────────────┘  └─────────────────────────────┘    │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ 🎯 同行对比                                                     │  │
│ │ ────────────────────────────────────────────────────────────── │  │
│ │ Symbol   Name           7d%    30d%   目标上行   评级共识       │  │
│ │ MSFT     Microsoft      +2.1   +5.4   +12.0%    Buy           │  │
│ │ GOOGL    Alphabet       -0.8   +3.2   +8.5%     Hold          │  │
│ │ META     Meta Platforms +4.2   +7.1   +15.2%    Buy           │  │
│ └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**分组原则**(回答"清楚分组"需求):

| 卡片 | 内含 | 为什么放一起 |
|---|---|---|
| 📊 分析师评级 | 目标价 + 评级总览 + 变动流 + 历史曲线 | 全部是"分析师视角下的股票" |
| 📰 新闻与公告 | 全网新闻 + 官方公告 (Tab 切换) | 都是公开发布的文字信息 |
| 💼 内部人交易 | 净流向图 + 明细表 | 都是内部人行为数据 |
| 🎯 同行对比 | top 3 peer 表格 | 横向对标视角 |
| 🔥 市场热度 | 榜单徽章 + 板块对比 | "市场怎么看这只票"的市场结构信号 |

每张卡都用 shadcn `<Card><CardHeader><CardTitle>📊 分析师评级</CardTitle>` 包装,视觉上边界清晰。

---

## Phase 1 — 分析师维度全量接入 (S, ~2.5 天)

**目标**: 把分析师相关的 5 个 FMP 端点全部接入,修复 PriceTargetBar,新增 4 个前端组件。本 Phase 不动 MarketTab 整体布局,只在右栏加内容。

### 后端改动

#### 1. `backend/app/shared/fmp_service.py` 新增方法

```python
def get_stock_grades(self, symbol: str, limit: int = 30) -> dict
  # GET /stable/grades?symbol={symbol}
  # 返回: [{date, gradingCompany, previousGrade, newGrade, action}]

def get_stock_grades_summary(self, symbol: str) -> dict
  # GET /stable/grades-summary?symbol={symbol}
  # 返回: {strongBuy, buy, hold, sell, strongSell, consensus}

def get_historical_grades(self, symbol: str, limit: int = 200) -> dict
  # GET /stable/historical-grades?symbol={symbol}
  # 返回: 按日聚合的 [{date, analystRatingsStrongBuy, ...}]

def get_grade_latest_news(self, symbol: str, limit: int = 20) -> dict
  # GET /stable/grade-latest-news?symbol={symbol}
  # 返回: 近期升降级 + 新闻 URL

def get_price_target_latest_news(self, symbol: str, limit: int = 20) -> dict
  # GET /stable/price-target-latest-news?symbol={symbol}
  # 返回: 近期目标价调整 + 新闻 URL
```

字段 normalization 复用现有 pattern(参考 `get_insider_trading_search`)。

#### 2. `backend/app/features/stock/router.py` 新增聚合端点

```python
GET /stocks/{symbol}/analyst-activity
→ {
    success: true,
    symbol: "AAPL",
    summary: {                      # grades-summary 结果
      strong_buy: 15, buy: 20, hold: 8, sell: 1, strong_sell: 0,
      consensus: "Buy"
    },
    price_target: {                 # 已有 price-target-consensus + summary
      low: 150, average: 195, high: 250, 
      count_1m: 8, count_3m: 22,
      current_price: 180
    },
    grade_changes: [                # grade-latest-news (10 条)
      {date, firm, previous_grade, new_grade, action, news_url}
    ],
    target_changes: [               # price-target-latest-news (10 条)
      {date, firm, previous_target, new_target, change_pct, news_url}
    ],
    historical_timeline: [          # historical-grades (近 12 个月)
      {date, strong_buy, buy, hold, sell, strong_sell}
    ]
  }
```

缓存 TTL: 1h(评级变化不会特别频繁)。

#### 3. `use-stock-data.ts` 新增 hook

```typescript
useAnalystActivity(symbol: string)
  → GET /stocks/{symbol}/analyst-activity
  staleTime: 30min, gcTime: 1h
```

### 前端改动

#### 1. 修复 PriceTargetBar (`MarketTab.tsx:314`)

从 `useAnalystActivity(symbol).data.price_target` 读 consensus,不再 `null`。

#### 2. 新增 `AnalystRatingsCard` 组件(一张聚合大卡)

位置:右栏顶。所有分析师相关组件统一包在一个 `<Card>` 里,内部纵向分 4 块:

```
┌─ 📊 分析师评级 ────────────────────────────┐
│ 目标价条 (低 $150 · 中 $195 · 高 $250)      │
│ 当前 $180 (条上三角标记)                    │
│ "共识: Buy · 覆盖 22 位分析师 · 近 3 月"     │
│ ─────────────────────────────────────── │
│ 评级总览 5 段堆叠条                          │
│ ████████████░░  15 · 20 · 8 · 1 · 0       │
│ ─────────────────────────────────────── │
│ [评级变动 (10)] [目标价调整 (8)]             │
│  04-10  Morgan Stanley  Hold → Overweight  │
│  04-08  JPMorgan        Neutral → OW       │
│  ... [查看更多]                             │
│ ─────────────────────────────────────── │
│ 12M 评级历史堆叠曲线                         │
│  (lightweight-charts area)                  │
└─────────────────────────────────────────┘
```

子组件全部内联在这个 Card 里(不再是散着的 `GradesSummaryBar` + `AnalystActivityFeed` + `GradesHistoryChart`),外层只有一个标题。

### Phase 1 最终效果

**用户打开 `stock/AAPL?tab=market` 能看到**:

原左栏 AI 分析面板、底部 NewsFeed 保留不动。右栏原 InsiderTradingSection 保留。**右栏顶新增一张"📊 分析师评级"大卡**,内含:

1. 目标价条(修好,不再是空占位)— 低 $150 / 中 $195 / 高 $250,当前 $180 标记,副文字"共识 Buy · 22 位分析师"
2. 评级总览 5 段条 — `████████████░░  15·20·8·1·0`,左上角大字"Buy"
3. 评级变动 Tab(评级 | 目标价),最近 10 条,每条可点击外链
   - 例:`04-10  Morgan Stanley  Hold → Overweight  [新闻↗]`
4. 12 个月评级历史堆叠曲线(看共识是否在改善)

**验收标准**:
- [ ] AAPL / MSFT / NVDA 三只票打开市场面,上述 4 块都有数据
- [ ] 免费用户(无 AI 权限)也能看到这些新数据,不被付费墙挡住
- [ ] 每条评级变动可点击跳转外部新闻源
- [ ] 评级历史曲线至少 6 个月数据点
- [ ] 后端单次 `/analyst-activity` 响应 < 800ms(并行调用 5 个 FMP 端点)
- [ ] 冷门票(如小盘股)空态友好:"暂无分析师覆盖"

---

## Phase 2 — 完整分组重构 + 新闻增强 + 市场热度 + 同行对比 + AI 综合解读 (M, ~5 天)

**目标**: 接入剩余 FMP 端点,按"清晰分组大卡"重构整个 MarketTab,并把 AI 分析升级为**单一入口的综合解读**。

### 后端改动

#### 1. `fmp_service.py` 新增方法

```python
def get_press_releases(self, symbol: str, limit: int = 30) -> dict
  # GET /stable/news/press-releases?symbol={symbol}

def get_biggest_gainers(self) -> list         # /stable/biggest-gainers
def get_biggest_losers(self) -> list          # /stable/biggest-losers  
def get_most_active(self) -> list             # /stable/most-active
def get_sector_performance_snapshot(self) -> list    # /stable/sector-performance-snapshot
def get_industry_performance_snapshot(self) -> list  # /stable/industry-performance-snapshot
```

#### 2. 新增市场面主聚合端点 `/market-overview`

```python
GET /stocks/{symbol}/market-overview
→ {
    header: {
      next_earnings: { date, days_until, eps_estimate },
      market_badges: {
        gainers_rank: 7 | null,
        losers_rank: null,
        most_active_rank: 3 | null
      }
    },
    kpis: {
      news_24h: 18,
      grade_changes_7d: 4,
      target_consensus: 195,
      insider_net_30d: -2_500_000,
      sector_relative_perf_1m: -2.3
    },
    market_heat: {
      rankings: { gainers_rank, losers_rank, most_active_rank },
      sector_perf: { stock_1m, sector_1m, spy_1m, sector_name }
    },
    peers_comparison: [
      { symbol, name, perf_7d, perf_30d, target_upside_pct, consensus }
    ]
  }
```

#### 3. 新增 `/press-releases` 端点

```python
GET /stocks/{symbol}/press-releases?limit=30
→ { success, releases: [{date, title, url, content_preview}] }
```

#### 4. **新增 AI 综合解读 agent** `backend/app/features/stock/agent/market_overview.py`

新建一个 `market_overview_agent`,替代当前的 `news.py` + `macro.py` 在 UI 层的入口。后端两个旧 agent 保留不动(可后期合并)。

**新端点** `POST /stocks/{symbol}/market-analysis`(替代 `/news` + `/macro` 两个调用):

内部吃以下 **12 类数据源**(一次调用全部喂进 prompt):

| # | 数据 | 来源 |
|---|---|---|
| 1 | 近 7 天新闻 (15-30 条标题+来源) | `news-feed` |
| 2 | 近 30 天官方公告 (5-10 条) | `press-releases` |
| 3 | 分析师评级总览 (consensus + 5 档分布) | `grades-summary` |
| 4 | 最近 10 条评级变动 (firm, from, to, action, date) | `grade-latest-news` |
| 5 | 最近 10 条目标价调整 (firm, from_target, to_target, change_pct) | `price-target-latest-news` |
| 6 | 近 12 个月评级趋势 (月度聚合方向) | `historical-grades` |
| 7 | 内部人近 30 天净流向 + 最近 5 笔大额 | `insider-trading` |
| 8 | 同行 top 3 的 7d/30d 表现 + 评级共识 | `market-overview.peers` |
| 9 | 本股是否在今日涨幅/跌幅/活跃榜 + 排名 | `market-overview.market_heat` |
| 10 | 板块与行业相对表现 (1M) | `sector-performance-snapshot` |
| 11 | 下次财报日期 + EPS 预期 | `earnings-calendar` |
| 12 | 宏观背景快照 (VIX, 通胀, 利率) | `macro_risk_dashboard` |

**输出结构** (6 段):

```python
class MarketOverviewOutput(BaseModel):
    title: str                    # 15-40 字,总结当下市场叙事
    narrative: str                # 核心叙事 (当下这只票市场在讨论什么,主要矛盾是什么)
    analyst_signals: str          # 分析师信号 (评级方向、目标价方向、共识转好/转弱)
    capital_and_insider: str      # 资金/内部信号 (机构动向、内部人、同行相对热度)
    catalysts_and_events: str     # 事件驱动 (近期催化剂、公告重点、财报倒计时)
    signal_coherence: str         # 信号一致性 (多维度共振 or 分歧 → 风险提示)
```

**关键设计**:
- Prompt 强制"结论先行",每段 300-500 字
- 要求跨维度关联(例:"分析师共识转 Buy + 内部人持续净卖出,信号存在分歧")
- Model: `gemini-3.1-flash-lite-preview`,缓存 8h
- 成本估计: input ~8-12K token,output ~1500 token,单次 < $0.01

### 前端改动

#### 1. MarketTab.tsx 整体重构

**删除**:左栏 33% 的 `SubTabSwitcher` + `NewsAnalysisPanel` + `MacroAnalysisPanel` 默认展示。

**改为**:纵向布局 = Header Strip → KPI 行 → 2 列 Card 网格 → 同行对比全宽。

#### 2. 新增组件(每个对应一张分组大卡)

| 组件 | 文件 | 数据源 |
|---|---|---|
| `MarketHeaderStrip` | `components/market/MarketHeaderStrip.tsx` | market-overview.header |
| `MarketKpiRow` | `components/market/MarketKpiRow.tsx` | market-overview.kpis |
| `AnalystRatingsCard` ⭐ | `components/market/AnalystRatingsCard.tsx` | analyst-activity (Phase 1 已建) |
| `MarketHeatCard` | `components/market/MarketHeatCard.tsx` | market-overview.market_heat |
| `NewsAndReleasesCard` | `components/market/NewsAndReleasesCard.tsx` | news-feed + press-releases |
| `InsiderTradingCard` (增强) | 改造现有 `InsiderTradingSection` | insider-trading |
| `PeersComparisonCard` | `components/market/PeersComparisonCard.tsx` | market-overview.peers |
| `AIMarketAnalysisSheet` | `components/market/AIMarketAnalysisSheet.tsx` | market-analysis |

#### 3. AI 解读 Sheet

- 入口:Header Strip 右侧 "🤖 AI 综合解读 (Pro)" 按钮
- 付费墙:未订阅显示 upsell,订阅用户直接打开
- 内容:展示 `market-analysis` 返回的 6 段结构化内容,每段用大标题分隔
- 顶部有"重新生成"按钮(force=true)

### Phase 2 最终效果

**用户打开 `stock/AAPL?tab=market` 能看到**(最终完整形态):

#### 顶部 Strip
```
┌──────────────────────────────────────────────────────────────┐
│ 📅 下次财报 · T-12d · EPS 预期 $2.15    🤖 AI 综合解读 (Pro) →│
└──────────────────────────────────────────────────────────────┘
```

#### KPI 5 卡行
```
┌──────────┬───────────┬──────────┬────────────┬─────────────┐
│ 24h 新闻  │ 7d 评级变动│ 目标价共识 │ 30d 内部人净流 │ 1M vs 板块  │
│ 18 (↑5)  │ 4 (3 升级) │ $195 +8.3%│ -$2.5M 净卖  │ -2.3pp      │
└──────────┴───────────┴──────────┴────────────┴─────────────┘
```

#### 主内容 2 列 Card 网格

- **左列**:📊 分析师评级卡(Phase 1 已建,不动)+ 📰 新闻与公告卡(新)
- **右列**:🔥 市场热度卡(新)+ 💼 内部人交易卡(增强)

每张 Card 有独立标题 + 边框,一眼分辨。

#### 底部 全宽 Card
- 🎯 同行对比表(top 3 peer)

#### AI 综合解读 (点按钮打开的 Sheet)

```
AI 综合解读 · AAPL                                        [关闭 ×]
─────────────────────────────────────────────────────────
📌 Apple 评级共识转向 Buy,但内部人持续净卖出

核心叙事
  过去 7 天围绕 Vision Pro 2 发布与 Q2 财报前瞻,新闻情绪偏
  正面。市场主要矛盾在于 iPhone 16 中国销量预期与 AI 功能
  落地节奏...

分析师信号  
  近 4 周有 3 家大行上调评级 (Morgan Stanley/JPM/GS),目标价
  共识从 $180 → $195 (+8.3% vs 现价),评级分布从 Hold 40%
  降至 18%,共识明显转好...

资金与内部信号
  内部人近 30 天净卖出 $2.5M,与评级转好形成分歧。同行中
  MSFT/GOOGL 均录得正收益,AAPL 相对落后 2pp...

事件驱动
  T-12d 财报是最大短期催化剂,EPS 预期 $2.15。官方公告中
  Vision Pro 新版本上市为近期唯一实质性新闻...

信号一致性
  分析师信号(转好) vs 内部人(净卖)出现分歧,且股价相对
  板块走弱 — 建议等待财报验证基本面后再判断趋势方向...
─────────────────────────────────────────────────────────
[重新生成]  ·  最后更新 2 小时前
```

**验收标准**:
- [ ] AAPL / MSFT / NVDA / 小盘股(TSM/CRWD)打开市场面,Header Strip 和 KPI 行都有数据
- [ ] 7 张 Card 布局视觉清晰,每张有独立标题+边框,用户不需费力就能分辨"哪块是干嘛的"
- [ ] 市场徽章条件渲染正确(不在 Top 榜单时不显示该徽章,不要显示 null)
- [ ] 新闻与公告 Tab 切换正常
- [ ] 同行对比表 top 3 peer 都有实时数据
- [ ] AI 综合解读 Sheet 打开后显示 6 段结构化内容,内容跨维度关联(提到分析师 + 内部人 + 同行 + 催化剂)
- [ ] 免费用户看到所有原始数据,AI Sheet 保留付费墙
- [ ] MarketTab 首屏加载 < 2s(不含 AI Sheet)

---

## Phase 3 — 社交媒体舆情(单独立项,非本期承诺)

后续接入 `/stable/historical-social-sentiment` 等社交情绪端点。届时:
- KPI 行加 "24h 讨论量" 和 "情绪分"两个卡
- 主列新增 "💬 社交讨论" Card(Twitter/StockTwits/Reddit 聚合)
- 分析师卡下方新增 "讨论量 + 股价" 双轴曲线
- AI 综合解读 prompt 加入社交维度作为第 13 类数据源

**先不承诺**,等 Phase 1+2 上线后单独决策。

---

## 数据模型

### 可选:新增 Insforge 表缓存分析师数据

```
stock_analyst_grades  
  - symbol, date, firm, previous_grade, new_grade, action, 
    previous_target, new_target, news_url, raw_json
  - PK: (symbol, date, firm)
```

本期不强制,先直接走 FMP 透传 + 内存缓存,如果发现调用量顶到 FMP quota 再加这张表。

## 风险与依赖

| 风险 | 应对 |
|---|---|
| 部分 FMP stable 端点可能需要 Premium/Ultimate 套餐 | **先行验证**:开工前用 curl 打一发 `/stable/grades-summary`, `/stable/grade-latest-news`, `/stable/press-releases`, `/stable/biggest-gainers` 确认 200 OK |
| 评级数据冷门票稀疏 | 组件必须支持空态("暂无分析师覆盖"/"近 12 月无评级变动") |
| 重排 UI 影响现有用户习惯 | Phase 2 加 feature flag,灰度观察 |
| AI 分析折叠后 Pro 订阅转化率下降 | Header Strip 保留显著 "AI 综合解读 (Pro)" 按钮 + KPI 行下方加小字引导 |
| AI 综合解读 prompt 数据过多,token 超限 | 数据源做摘要化(新闻只喂标题+来源+日期,不喂全文);用 Gemini Flash Lite 支持大 context |
| 旧 news/macro agent 的已生成缓存如何处理 | 新 market_overview 用新 cache key,旧缓存自然过期即可 |

## 工程顺序

| 阶段 | 工期 | 交付 |
|---|---|---|
| **先行验证** | 0.5 天 | 确认 FMP 套餐支持全部目标端点 |
| **Phase 1** | 2.5 天 | 分析师维度完整上线(AnalystRatingsCard 单卡) |
| **Phase 2** | 5 天 | MarketTab 整体重构 + 其他所有 Card + AI 综合解读 |
| Phase 3 | 待评估 | 社交媒体舆情(单独立项) |

## 非目标

- 不重构"概览 / 财报 / 技术面"三个 Tab
- 不引入 LightweightCharts 之外的图表库
- 不在本期合并/废弃 `news.py` + `macro.py` 后端 agent(保留代码,UI 入口替换为新的 market_overview)
- 不接入任何非 FMP 数据源

## 相关文件

**后端**
- `backend/app/shared/fmp_service.py` — 新增 11 个方法(5 分析师 + 1 公告 + 5 市场/板块)
- `backend/app/features/stock/router.py` — 新增 4 个端点(`/analyst-activity`, `/market-overview`, `/press-releases`, `/market-analysis`)
- `backend/app/features/stock/agent/market_overview.py` — 新建综合解读 agent
- `backend/app/features/stock/.context.md` — 更新路由清单

**前端**
- `frontend/src/app/stock/[symbol]/_components/MarketTab.tsx` — Phase 2 大幅重构
- `frontend/src/components/market/` — 新目录
  - `MarketHeaderStrip.tsx`
  - `MarketKpiRow.tsx`
  - `AnalystRatingsCard.tsx` ⭐ (Phase 1 建)
  - `MarketHeatCard.tsx`
  - `NewsAndReleasesCard.tsx`
  - `InsiderTradingCard.tsx` (从 NewsEnhancements.tsx 迁出并增强)
  - `PeersComparisonCard.tsx`
  - `AIMarketAnalysisSheet.tsx`
- `frontend/src/hooks/queries/use-stock-data.ts` — 新增 `useAnalystActivity`, `useMarketOverview`, `usePressReleases`, `useMarketAnalysis`
- `frontend/src/hooks/queries/query-keys.ts` — 对应 query key

# Catalyst Events Radar Engineering Plan

> Status: Planning
> Related: features/brew/.context.md, plans/portfolio-watchlist-split.md
> Spike: backend/scripts/probe_forward_events.py (实测验证已通过)

## 目标

为用户的持仓 / watchlist 自动维护一份"未来 30-90 天的催化事件雷达"，覆盖五类用户最关心的前瞻事件：

1. 自身公司财报、投资者日、产品发布
2. 宏观事件（已有，需关联到具体持仓）
3. 同行业 / 竞争对手财报
4. 上下游 value chain 公司事件（V2，先打地基）
5. 公司专属催化（火箭发射、临床试验 readout、FDA PDUFA、庭审、CEO 交接等）

V1 重点是 ①②③⑤；④ 留到 V2 再加供应链数据源。最终把这份雷达接入 /for-you 页面成为独立 tab，并把高优先级事件回流到 daily brew 的 events 字段（替换当前 brew agent 的临时拼接逻辑）。

## 现状

### 已有能力（可直接复用）

- `shared/data_tools/earnings.py` — `get_earnings_calendar(days=N)` 返回 FMP 财报日历，含 EPS / 营收预期
- `shared/data_tools/calendar.py` — `get_economic_calendar(days=N)` 过滤 US High Impact 宏观事件
- `shared/data_tools/news.py` — `get_combined_market_news()` 聚合 ticker / general / latest 三源 FMP 新闻并去重
- `shared/data_tools/peers.py` — `get_peer_companies(symbol, industry)` 拿同行 N 家
- `shared/fmp_service.py` — `get_stock_news / get_general_news / get_latest_news / get_earnings_call_transcript`
- `features/brew/agent.py` — 已有"events 字段"输出，目前在 prompt 里现场拼日历 + LLM 推理（无持久化）
- ADK LlmAgent 基础设施（gemini-3-flash-preview）

### 完全缺失

- 结构化的"催化事件"存储层 —— 每次 brew 都要重算
- 从新闻 / transcript 中抽取前瞻陈述的流水线
- 事件去重 / 合并 / 升级机制（同一事件被多篇文章报道）
- 用户 portfolio ⨯ 事件库的反查 API
- 垂直行业事件源（火箭发射日历、PDUFA 日历）

### Spike 实测数据（2026-04-25 跑的）

`backend/scripts/probe_forward_events.py` 抓 8 只股票近 14 天 FMP 新闻 → LLM 抽取：

| 股票 | 文章 | 抽出事件 | 代表性事件 |
|---|---:|---:|---|
| ASTS | 25 | 1 | New Glenn 2026 全年 8-12 次发射计划 |
| TSLA | 25 | 2 | Musk v. Altman 庭审 2026-04-27 |
| MRNA | 14 | 7 | 三场医疗会议 (5/12, 5/19, 5/28) + AACR 数据展示 |
| AAPL | 25 | 9 | Mag 7 财报集群 + Tim Cook 9 月卸任 |
| RKLB | 25 | 1 | Neutron 火箭部署 (无具体日期) |
| NVDA / COIN / PLTR | 75 | 0 | 纯叙事 / 评论文，无前瞻 |

**关键观察**：

- LLM 抽取出的 13 个高置信事件（>=0.9 + 具体日期）几乎全是真实可交易催化
- **多 symbol fan-out**：一篇 "Mag 7 Earnings Take the Spotlight" 文章 fan-out 出 5 只股票的财报日期 → 应按全市场新闻流抽取，而非按 symbol 抽
- **行业分布不均**：生物医药 + 大票事件密度最高；纯叙事股几乎没有。事件雷达对叙事股价值有限，需诚实告知用户
- 启发式正则过滤会漏 —— 生产里直接全量喂 LLM
- Tim Cook 卸任这种事件传统财报 / 经济日历完全抓不到，**只有从新闻流抽取才能拿到**

## 设计

### 系统架构

```
[结构化日历源]                [非结构化抽取源]                [垂直行业源 V2]
FMP earnings ──┐              FMP news (daily) ─┐            BiopharmCatalyst
FMP economic ──┤              FMP transcripts ──┤            NextSpaceflight
FMP IPO/split ─┤              KOL tweets (V2) ──┤            CourtListener
               │                                │            ClinicalTrials.gov
               ▼                                ▼                    ▼
        ┌──────────────────────────────────────────────────────────────┐
        │           catalyst_events_ingest (cron, 多 fetcher)            │
        │   每个 fetcher 独立写入；统一 schema；按 (symbol, type, date)    │
        │                       做软去重 + confidence 合并                 │
        └──────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                       Insforge: catalyst_events 表
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
        GET /api/event-radar    brew agent            前端事件雷达 tab
        (按用户 portfolio        (V2 注入 events       (按日期 / 类型筛)
         ∪ watchlist 反查)         字段，去除现场拼接)
```

### 1. 数据模型

#### 新增 `catalyst_events` 表（Insforge）

```sql
CREATE TABLE catalyst_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol          TEXT NOT NULL,
  event_type      TEXT NOT NULL,          -- earnings | product_launch |
                                          -- rocket_launch | clinical_readout |
                                          -- fda_pdufa | investor_day |
                                          -- conference | regulatory |
                                          -- ma | leadership_change | other
  scheduled_date  DATE,                   -- 可空: "无日期但已宣布"事件
  date_precision  TEXT NOT NULL,          -- exact | month | quarter | year | unknown
  description     TEXT NOT NULL,          -- <=120 字符英文
  description_zh  TEXT,                   -- 中文描述（LLM 填）
  confidence      NUMERIC(3,2) NOT NULL,  -- 0.00-1.00
  source_type     TEXT NOT NULL,          -- fmp_news | fmp_transcript |
                                          -- fmp_earnings_calendar |
                                          -- fmp_econ_calendar |
                                          -- biopharm | spacelaunch | manual
  source_url      TEXT,
  source_published_at TIMESTAMPTZ,
  raw_excerpt     TEXT,                   -- 抽取依据原文片段
  related_symbols TEXT[],                 -- fan-out 时同时影响的其他票
  status          TEXT NOT NULL DEFAULT 'scheduled',
                                          -- scheduled | confirmed | passed | cancelled | superseded
  superseded_by   UUID,                   -- 被另一条事件取代时指向新事件
  ingested_at     TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_catalyst_events_symbol_date ON catalyst_events(symbol, scheduled_date);
CREATE INDEX idx_catalyst_events_status_date ON catalyst_events(status, scheduled_date)
  WHERE status IN ('scheduled', 'confirmed');
CREATE UNIQUE INDEX idx_catalyst_events_dedup ON catalyst_events(
  symbol, event_type, COALESCE(scheduled_date::TEXT, '_no_date'),
  COALESCE(LEFT(description, 80), '')
);
```

**字段决策说明**：

- `date_precision` — 解决"无日期已宣布"问题。月级 / 季级 / 年级 / unknown 也写入，前端按精度展示
- `confidence` — LLM 给出的可信度。前端可设阈值（如 >=0.7）默认显示
- `related_symbols` — Mag 7 财报集群这种 fan-out 场景，主条目挂 AAPL，related 写 [MSFT, GOOGL, AMZN, META]
- `superseded_by` — 处理"原计划 5/12 投资者日，后改 5/15"这种更新
- 软去重靠 unique index；硬合并由 ingest 层做（见下）

### 2. 抓取流水线

#### Source A: 结构化日历（直接镜像 FMP，每 6 小时跑一次）

- `fetch_fmp_earnings()` — 拉 90 天财报日历 → 转 `event_type=earnings`，`confidence=1.00`
- `fetch_fmp_econ()` — 拉 30 天经济日历的 US High Impact → 写入 `symbol=__MACRO__` 的特殊行，由前端按用户持仓查询时联动
- `fetch_fmp_corporate_actions()` — IPO / split / dividend → V2

简单、零 LLM 成本，每次全量替换未发生的同类事件。

#### Source B: 新闻流抽取（每天凌晨 1 次，Pacific 03:00）

```python
async def ingest_news_events(days: int = 2):
    # 1. 全市场新闻（不按 symbol）—— 关键：捕获 fan-out 文章
    news = get_combined_market_news(days=days)

    # 2. 直接全量喂 LLM，不做启发式过滤
    #    spike 验证启发式过滤 recall 不够（漏 MRNA 多场会议）
    for article in news:
        events = await extract_forward_events_llm(article)
        # events: [{symbol, event_type, scheduled_date, date_precision,
        #          description, confidence, related_symbols, raw_excerpt}]
        for ev in events:
            await upsert_event(ev, source_type="fmp_news",
                                source_url=article.url,
                                source_published_at=article.publishedDate)
```

**LLM 调用策略**：

- 模型：`gemini-3-flash-preview`（与 brew 一致），response_mime_type=application/json
- 输入：1 篇文章 ≈ 2K tokens；输出 JSON list
- 估算：每天 ~150 篇市场新闻（按现有 combined news 体量），单价 ~$0.001 / 调用，**每天约 $0.15**
- 失败容忍：单篇失败不阻塞整批，错误日志保留

**Prompt 设计**（基于 spike 已验证版本）：

```
You are an event extraction system. Identify FORWARD-LOOKING catalyst events.

QUALIFY:
  earnings, investor_day, conference, product_launch, rocket_launch,
  clinical_readout, fda_pdufa, regulatory, ma, leadership_change, other

DO NOT extract:
  past events, analyst price-target / rating changes, opinion pieces,
  price action recaps

Return {"events": [...]} with each event:
  symbol, event_type, scheduled_date (YYYY-MM-DD or "" if vague),
  date_precision (exact|month|quarter|year|unknown),
  description (<=120 chars EN), confidence (0.0-1.0),
  related_symbols (other tickers fan-out from same article),
  raw_excerpt (key sentence from the article)

Output ONLY JSON.
```

#### Source C: 财报电话会 transcript 抽取（每周 / 财报季加密）

- 复用同一 LLM 抽取 prompt，但加一句"identify time commitments by management"
- 输入：FMP `get_earning_call_transcript(symbol, quarter, year)`，每个 transcript 约 8-12K tokens
- 价值：CEO/CFO 在电话会上承诺的时间表（"we expect Phase 3 readout in H2 2026"）几乎是其他渠道拿不到的金矿
- 触发：每周扫一次最近 4 周的新 transcript（FMP 列表 API + 已处理 hash 去重）
- 估算：每周 ~50 个新 transcript × $0.005 = $0.25/周

#### Source D: 垂直行业日历（V2 起步）

V1 不实现，但 schema 留好接口。优先级：

1. ClinicalTrials.gov（免费 API，生物医药用户高频需求）
2. NextSpaceflight 或 SpaceX 官方 schedule 抓取（ASTS / RKLB / LMT）
3. CoinMarketCal API（COIN / MSTR / 加密相关）

#### 去重 / 合并逻辑

```python
async def upsert_event(new_ev, source_type, source_url, source_published_at):
    # 主键：(symbol, event_type, scheduled_date, description[:80])
    # 查找已存在的相同事件
    existing = await find_existing_event(
        symbol=new_ev.symbol,
        event_type=new_ev.event_type,
        scheduled_date=new_ev.scheduled_date,
        description_prefix=new_ev.description[:80],
    )
    if existing:
        # 合并：confidence 取 max；source_published_at 取 min（最早报道时间）；
        # 累加 related_symbols；保留最高 precision 的 date
        await merge_event(existing.id, new_ev)
    else:
        await insert_event(new_ev, source_type, source_url, source_published_at)

# 单独的"日期升级"任务：每周扫一次"date_precision in (year, quarter, month)"
# 的事件，看新闻里有没有更精确的日期出现，自动升级 precision + scheduled_date
```

#### Source E（V2）: KOL 推文抽取

`features/twitter/` 已有 KOL 推文采集；复用同 LLM prompt 跑一遍即可。仅作信号增强，置信度封顶 0.6（KOL 言论易夸大）。

### 3. API 设计

| 端点 | 方法 | 描述 | 认证 |
|---|---|---|---|
| `/api/event-radar` | GET | 用户持仓 ∪ watchlist 的未来事件，按 date 升序 | Bearer |
| `/api/event-radar/symbol/{symbol}` | GET | 单只股票的所有事件 | Bearer |
| `/api/event-radar/peers/{symbol}` | GET | 同行 peers 的事件（基于 FMP industry peers） | Bearer |
| `/api/event-radar/ingest` | POST | 手动触发摄入（admin only，用于 backfill） | Cron secret |

#### GET /api/event-radar 响应

```json
{
  "success": true,
  "data": {
    "as_of": "2026-04-25T08:00:00Z",
    "user_symbols": ["AAPL", "ASTS", "MRNA"],
    "events": [
      {
        "id": "...",
        "symbol": "AAPL",
        "event_type": "earnings",
        "scheduled_date": "2026-04-30",
        "date_precision": "exact",
        "description": "Apple Q2 earnings release",
        "description_zh": "苹果 Q2 财报",
        "confidence": 1.0,
        "source_type": "fmp_earnings_calendar",
        "source_url": null,
        "related_symbols": [],
        "days_until": 5,
        "is_user_owned": true,
        "is_peer": false
      },
      {
        "id": "...",
        "symbol": "ASTS",
        "event_type": "rocket_launch",
        "scheduled_date": "2026-06-01",
        "date_precision": "month",
        "description": "Bluebird-2 satellite deployment via SpaceX",
        "confidence": 0.85,
        "source_type": "fmp_news",
        "source_url": "https://...",
        "related_symbols": [],
        "days_until": 37,
        "is_user_owned": true,
        "is_peer": false
      }
    ],
    "peer_events": [...],
    "macro_events": [...]
  }
}
```

`is_user_owned` / `is_peer` 让前端可以分组渲染（"我的持仓" / "同行" / "宏观"）。

### 4. 前端设计

#### /for-you 页面新增 "事件雷达" tab

```
┌─────────────────────────────────────────────────────┐
│  MY BREW                                            │
│  [持仓日报] [事件雷达] [持仓体检]                       │
│                                                     │
│  ════ 事件雷达 ════                                   │
│                                                     │
│  未来 30 天 · 8 个事件                                │
│  [全部] [我的持仓] [同行] [宏观]  [按类型 ▾]           │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ 4月27日（周一）  距今 2 天                     │    │
│  │ ┌─────────────────────────────────────────┐ │    │
│  │ │ 🏛️  TSLA · 监管事件                       │ │    │
│  │ │ Musk v. Altman 庭审开始 · 陪审团遴选        │ │    │
│  │ │ 来源 · CNBC · 置信度 ●●●○○                │ │    │
│  │ └─────────────────────────────────────────┘ │    │
│  ├─────────────────────────────────────────────┤    │
│  │ 4月29日（周三）  距今 4 天                     │    │
│  │ ┌─────────────────────────────────────────┐ │    │
│  │ │ 📊  AAPL · 财报                            │ │    │
│  │ │ 苹果 Q2 财报发布                            │ │    │
│  │ │ 同日财报: MSFT · GOOGL · META · AMZN       │ │    │
│  │ └─────────────────────────────────────────┘ │    │
│  ├─────────────────────────────────────────────┤    │
│  │ 6月（具体日期待定）                            │    │
│  │ ┌─────────────────────────────────────────┐ │    │
│  │ │ 🚀  ASTS · 火箭发射                        │ │    │
│  │ │ Bluebird-2 卫星部署                         │ │    │
│  │ └─────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

事件类型 → emoji 映射（视觉识别）：
- 📊 earnings  · 🎤 conference  · 🎯 investor_day  · 🚀 rocket_launch
- 🧪 clinical_readout  · 💊 fda_pdufa  · 🏛️ regulatory  · 🤝 ma
- 👤 leadership_change  · 📦 product_launch  · 🌐 macro

#### 复用组件 / 新增组件

| 组件 | 复用 / 新增 | 用途 |
|---|---|---|
| `EventRadarTab` | 新增 | tab 容器 + 筛选 |
| `EventCard` | 新增 | 单条事件卡片 |
| `EventDateGroup` | 新增 | 按日期分组的标题 |
| `useEventRadar()` | 新增 (TanStack Query) | 拉 /api/event-radar |
| `StockSearchDropdown` | 复用 | 单股事件查询入口 |

### 5. 与 brew agent 的集成

V2 把现在 `brew/agent.py` DIGEST_INSTRUCTION 里的 events 字段改造为：
- 后端先查 `catalyst_events` 表过滤出该用户未来 14 天事件
- 把这份结构化事件作为输入丢给 brew agent
- agent 只负责"个性化解读 + 翻译"，不再重新拼日历

好处：
- 事件库准确率不依赖 brew agent 现场推理
- 多用户共享同一份事件抽取成本（一次 ingest，N 个用户复用）
- brew agent prompt 缩短，token 成本下降

## 实施步骤

### Phase 1: 数据层 + 单一新闻源（~3 天）

1. [ ] 创建 Insforge `catalyst_events` 表 + `catalyst-events` Edge Function
2. [ ] 新增 `backend/app/features/event_radar/` 模块（router / service / db / models / agent）
3. [ ] 实现 `extract_forward_events_llm(article)` —— 复用 spike 的 prompt，模型 gemini-3-flash-preview
4. [ ] 实现 `ingest_news_events()` —— 全市场新闻抽取 + upsert + 去重
5. [ ] 实现 `ingest_fmp_calendars()` —— 直接镜像 FMP earnings + economic
6. [ ] 实现 cron 端点 `/api/event-radar/ingest`（verify_cron_secret），Vercel cron 每天 03:00 PT 触发
7. [ ] 实现 `/api/event-radar` GET（用户持仓 ∪ watchlist 反查）

### Phase 2: 前端事件雷达 tab（~2 天）

8. [ ] 新增 `useEventRadar()` hook + query keys
9. [ ] 新增 `EventCard` / `EventDateGroup` / `EventRadarTab` 组件
10. [ ] 在 `/for-you` 页面接入 tab 切换
11. [ ] 事件类型 emoji + 中文翻译映射（前端常量）
12. [ ] 筛选 UI（持仓 / 同行 / 宏观 / 按类型）

### Phase 3: Peer events + transcript 源（~3 天）

13. [ ] 实现 `get_peer_events(user_symbols)` —— 对每只用户股票调 `peers.get_peer_companies()`，反查 catalyst_events
14. [ ] 实现 `ingest_transcripts()` —— FMP transcript 列表 + 增量 hash 去重 + LLM 抽取
15. [ ] 接入 `/api/event-radar/peers/{symbol}` 端点
16. [ ] 前端 "同行" 筛选标签

### Phase 4: brew 集成（~1 天）

17. [ ] 修改 `brew/agent.py`：events 字段改为后端结构化输入
18. [ ] DIGEST_INSTRUCTION 中删除现场拼日历的逻辑，改为"基于已给定事件做个性化解读"
19. [ ] 验证 brew 输出质量未退化（人工抽检 5 个用户）

### Phase 5: 测试与监控（~1 天）

20. [ ] 后端单元测试：去重逻辑、合并逻辑、date_precision 升级
21. [ ] 摄入流水线 E2E 测试（mock LLM 响应）
22. [ ] 监控指标：每日抽取事件数、平均 confidence、按 source_type 的占比
23. [ ] 更新 `.context.md`（features/event_radar/, features/brew/, for-you/）

### Phase 6 (V2): 垂直源 + KOL（~5 天，可独立排期）

24. [ ] ClinicalTrials.gov fetcher（生物医药）
25. [ ] NextSpaceflight / SpaceX 发射日历 fetcher
26. [ ] KOL 推文 fetcher（复用 features/twitter/ 数据）
27. [ ] CoinMarketCal fetcher

## 资源与依赖

### 已有可复用

| 资源 | 位置 | 复用方式 |
|---|---|---|
| FMP news / earnings / econ / transcripts | `shared/fmp_service.py` | 全部沿用 |
| LLM 抽取 prompt + spike | `backend/scripts/probe_forward_events.py` | 直接迁移到 service |
| ADK agent 模式 | `features/brew/agent.py` | 套模板 |
| Edge Function 模式 | `edge_functions/*.js` | 套 watchlist 模板 |
| Vercel cron | `app/main.py` | 加新路由 |
| User portfolio | `plans/portfolio-watchlist-split.md` Phase 1 | **依赖**，需先完成 |
| TanStack Query hooks | `frontend/src/hooks/queries/` | 套模板 |

### 依赖

- **强依赖**：`portfolio-watchlist-split.md` Phase 1 必须先落地，否则反查只能走 watchlist
- 新增 Insforge 表 + Edge Function
- 无新增 Python 包

### 成本估算

| 项目 | 用量 | 成本 |
|---|---|---|
| FMP API | 现有额度 | $0（已付费） |
| LLM 新闻抽取 | 150 篇 / 天 × $0.001 | **~$5 / 月** |
| LLM transcript 抽取 | 50 / 周 × $0.005 | ~$1 / 月 |
| Insforge 存储 | 每月 ~5K 行（30 天 × ~150 事件） | 极低 |
| **总计** | | **~$6 / 月** |

## 难度评估

| Phase | 难度 | 原因 |
|---|---|---|
| Phase 1 数据层 | 中 | 去重 / 合并逻辑要小心；LLM 抽取已 spike 验证 |
| Phase 2 前端 tab | 低 | 标准 TanStack Query + 组件，复用 brew tab 模式 |
| Phase 3 Peer + transcript | 中 | peer 反查要注意 N+1，transcript token 量大 |
| Phase 4 brew 集成 | 低 | 主要是 prompt 改造 |
| Phase 5 测试 | 低 | 套现有测试模式 |
| Phase 6 V2 垂直源 | 高 | 各家 API 风格差异大，需要逐个适配 |

**总体难度**：中。最大风险点是 LLM 抽取的稳定性（产能 / 错误率 / 偶发幻觉），缓解策略是 confidence 字段 + 前端默认阈值过滤。

## 待定问题

1. **新闻 LLM 抽取要不要做启发式预过滤？**
   spike 数据显示启发式 recall 不够（MRNA 多场会议被漏）。建议 V1 全量喂 LLM；如果月成本超 $20 再加预过滤。

2. **macro_events 怎么挂到用户？**
   方案 A：宏观事件全员可见，前端按 user_symbols 关联度高亮（如用户重仓科技股则加息事件高亮）。
   方案 B：在 catalyst_events 里给每条宏观事件标注 `affects_sectors[]`，反查时按 portfolio 板块过滤。
   建议 V1 走 A，实现成本低。

3. **fan-out 文章的 symbol 归属？**
   一篇 Mag 7 文章应该写 5 条独立事件还是 1 条主事件 + related_symbols？
   建议：写 5 条独立事件（按用户体验，每只股票都要能在自己的列表里看到），但通过相同的 `source_url` 可关联回去。多写 4 条的存储成本可忽略。

4. **"Tim Cook 卸任 9 月"这种事件怎么验证？**
   LLM 可能从某篇推测性文章里抽出事实性事件（幻觉风险）。建议 confidence < 0.8 的 leadership_change / ma 事件需要至少两个独立 source_url 才升级到 confirmed。

5. **事件过期后怎么处理？**
   `scheduled_date < today` 自动 status=passed，前端默认不展示。保留 30 天用于回看 / 准确率分析，再归档。

6. **用户能否手动添加事件？**
   V2 功能。先看 V1 自动化覆盖率再决定。

7. **transcript 抽取要不要回填历史？**
   V1 只抓最近 4 周新发布的 transcript。如果用户要求"看我的股票过去一年承诺过的时间表"，再做 backfill。

## NOT in scope (V1)

- Value chain / 供应链事件（需新数据源，留 V2）
- KOL 推文事件抽取（已有数据，但等 V1 验证再加）
- 事件影响预测（"如果 X，则你的 Y 会受何影响"——这部分仍由 brew agent 在解读层做）
- 事件准确率自动评估闭环（passed 后真假对比）—— V2
- 用户对单条事件的"提醒/订阅"功能 —— V2
- 多语言扩展（先做中文，英文 description 已有不翻译）

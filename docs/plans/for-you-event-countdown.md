# 事件倒计时 Engineering Plan

> Status: Planning
> Related: features/brew/.context.md, frontend/src/app/for-you/.context.md
> Vision: 产品策略.md > /for-you 模块 — 让用户不错过关键事件

## 目标

在 /for-you 页面常驻展示与用户持仓/观察列表相关的未来 14 天重要事件，让用户每次打开都能立即看到"接下来该关注什么"。

## 现有数据分析

### 数据源 1: 财报日历 — 有直接持仓关联

**来源**: `shared/data_tools/earnings.py` → `get_earnings_calendar(days=14)`
**底层**: FMP API `get_major_earnings()`

**返回结构**:
```json
{
  "symbol": "NVDA",          // ← 可直接匹配用户 symbols
  "date": "2024-08-28",
  "epsEstimated": 0.64,
  "revenueEstimated": 28000000000,
  "is_ai_related": true
}
```

**现有过滤**: 只返回约 60 个预设大公司的财报（Mag 7 + AI 芯片 + 云软件 + 中概 + 金融等），见 `fmp_service.py:844`。

**与用户持仓关联**: **直接可用**。`symbol` 字段可以 match 用户的 watchlist/portfolio symbols。Digest agent 的 `_filter_earnings()` 已在做这件事。

**问题**: 如果用户持有的股票不在预设 60 个大公司里（如 COST、UNH），就拿不到财报数据。

**解决方案**: 事件倒计时端点应该用 FMP 的完整 earnings calendar（`get_earnings_calendar`），然后自行按用户 symbols 过滤，而不是用预过滤的 `get_major_earnings`。

### 数据源 2: 经济日历 — 无直接持仓关联

**来源**: `shared/data_tools/calendar.py` → `get_economic_calendar(days=14)`
**底层**: FMP API，已过滤为 US + High Impact

**返回结构**:
```json
{
  "date": "2024-03-01 08:30:00",
  "event": "Non-Farm Payrolls",
  "country": "US",
  "impact": "High",
  "previous": 353000,
  "estimate": 200000,
  "actual": null,
  "is_key_event": true        // CPI/Fed/GDP 等关键词命中
}
```

**与用户持仓关联**: **没有直接关联**。经济事件不含 symbol，是宏观级别的。需要建立"宏观事件 → 影响板块 → 用户持仓"的间接映射。

### 关联方案：宏观事件 → 用户持仓

需要两步映射：

**第一步：事件 → 板块影响（静态映射表）**

```python
# 宏观事件对板块的影响映射
MACRO_SECTOR_IMPACT = {
    # 关键词模式 → (受影响板块, 影响描述)
    "CPI|Inflation|PPI": {
        "affected": ["Technology", "Communication Services", "Consumer Discretionary"],
        "why": "通胀数据影响利率预期，高估值成长股最敏感",
        "intensity": "high",
    },
    "Fed|FOMC|Interest Rate": {
        "affected": ["ALL"],  # 全板块
        "why": "利率决议直接影响所有资产估值",
        "intensity": "high",
    },
    "Non-Farm|Payroll|Unemployment|Jobs": {
        "affected": ["ALL"],
        "why": "就业数据反映经济健康度，影响 Fed 政策预期",
        "intensity": "high",
    },
    "Retail Sales|Consumer": {
        "affected": ["Consumer Discretionary", "Consumer Staples"],
        "why": "直接反映消费支出趋势",
        "intensity": "medium",
    },
    "Housing|Home Sales": {
        "affected": ["Real Estate", "Financials"],
        "why": "房地产市场景气度",
        "intensity": "medium",
    },
    "PMI|Manufacturing": {
        "affected": ["Industrials", "Materials"],
        "why": "制造业景气度指标",
        "intensity": "medium",
    },
    "GDP": {
        "affected": ["ALL"],
        "why": "整体经济增长",
        "intensity": "high",
    },
}
```

**第二步：板块 → 用户持仓**

用户持仓的板块信息来自 FMP company profile（`GET /api/v3/profile/{symbol}`），返回 `sector` 字段（GICS 标准）。

```python
# 用户持有 NVDA(Technology), COST(Consumer Staples), JPM(Financials)
user_sectors = {"Technology", "Consumer Staples", "Financials"}

# CPI 数据发布 → affected: ["Technology", "Consumer Discretionary"]
# → 匹配到 Technology → "CPI 数据可能影响你持有的 NVDA"
```

**板块数据缓存**: sector 信息基本不变，缓存 7 天。可以在用户首次加载时批量获取并缓存。

### 数据不足的情况

| 场景 | 处理方式 |
|------|---------|
| 用户股票不在 FMP 大公司列表 | 用完整 earnings calendar + 按用户 symbols 过滤 |
| 经济事件不在映射表中 | 如果 `is_key_event=true`，按全板块影响处理 |
| 用户没有持仓板块数据 | fallback: 显示所有 High Impact 事件，不做个性化过滤 |

## 用户体验设计

### 展示位置

/for-you 页面，在 Tab 切换（持仓/观察列表）上方，作为常驻模块：

```
┌──────────────────────────────────────────────────────────────┐
│  MY BREW · 持仓总览                                           │
│                                                              │
│  ┌─ 未来事件 ──────────────────────────────────────────────┐  │
│  │                                                         │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           │  │
│  │  │ ⏰ 2天后   │  │ 📊 5天后   │  │ ⏰ 12天后  │  → 更多   │  │
│  │  │           │  │           │  │           │           │  │
│  │  │ NVDA      │  │ 美国 CPI  │  │ AAPL      │           │  │
│  │  │ Q1 财报    │  │ 3月数据    │  │ Q2 财报    │           │  │
│  │  │           │  │           │  │           │           │  │
│  │  │ 盘后发布   │  │ 影响你持有  │  │ 盘后发布   │           │  │
│  │  │ 你持有100股│  │ 的科技股   │  │ 你持有50股  │           │  │
│  │  └───────────┘  └───────────┘  └───────────┘           │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────┐ ┌──────────┐                                   │
│  │ 真实持仓  │ │ 观察列表  │                                   │
│  └──────────┘ └──────────┘                                   │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

### 事件卡片设计

每张卡片包含 4 层信息：

```
┌─────────────────┐
│ ⏰ 2天后         │  ← 倒计时（最醒目）
│                  │
│ NVDA Q1 财报     │  ← 事件名称
│ 盘后发布          │  ← 时间/细节
│                  │
│ 你持有 100 股     │  ← 个性化关联（为什么跟你有关）
│ 占仓位 67%       │
└─────────────────┘
```

**颜色编码**:
- 财报事件 → emerald（主色调）
- 宏观数据 → amber（次色调）
- 3 天内的事件 → 卡片边框高亮（紧迫感）

### 展开态：完整事件日历

点击"更多"或"查看全部"展开为时间线视图：

```
┌─ 未来 14 天事件 ────────────────────────────────────────────┐
│                                                             │
│  4月3日（周四）                                               │
│  ├─ ⏰ NVDA Q1 财报（盘后）— 你持有 100 股，占仓位 67%        │
│  └─ ⏰ AMD Q1 财报（盘后）— 在你的观察列表                    │
│                                                             │
│  4月5日（周六）                                               │
│  └─ （无事件）                                               │
│                                                             │
│  4月8日（周一）                                               │
│  └─ 📊 美国 3月 CPI（20:30）— 影响你持有的科技股              │
│                                                             │
│  4月10日（周三）                                              │
│  └─ 📊 FOMC 会议纪要 — 影响全市场                            │
│                                                             │
│  4月15日（周一）                                              │
│  └─ ⏰ AAPL Q2 财报（盘后）— 你持有 50 股                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 无持仓/观察列表时

展示通用高影响力事件（Fed、CPI、大公司财报），不做个性化标注。作为 onboarding 吸引力："添加持仓后，我们会告诉你这些事件如何影响你的投资"。

### 交互

- 默认收起：横向滚动展示前 3 个最近事件
- 点击卡片：展开该事件的详细信息（影响分析）
- 点击"更多"：展开完整 14 天时间线
- 财报卡片点击 symbol → 跳转 `/stock/{symbol}`

## API 设计

### GET /api/brew/events

**认证**: Bearer Token

**参数**: `?days=14`（默认 14）

**响应**:
```json
{
  "success": true,
  "events": [
    {
      "id": "earnings-NVDA-2026-04-03",
      "type": "earnings",
      "date": "2026-04-03",
      "time": "after_market",
      "days_until": 2,
      "title": "NVDA Q1 财报",
      "subtitle": "盘后发布",
      "symbol": "NVDA",
      "importance": "high",
      "relevance": {
        "type": "direct_holding",
        "detail": "你持有 100 股，占仓位 67%",
        "symbols": ["NVDA"]
      },
      "data": {
        "epsEstimated": 0.89,
        "revenueEstimated": 43000000000
      }
    },
    {
      "id": "macro-cpi-2026-04-08",
      "type": "macro",
      "date": "2026-04-08",
      "time": "08:30",
      "days_until": 7,
      "title": "美国 3月 CPI",
      "subtitle": "前值 2.8%，预期 2.7%",
      "symbol": null,
      "importance": "high",
      "relevance": {
        "type": "sector_impact",
        "detail": "影响你持有的科技股（NVDA, AAPL）",
        "symbols": ["NVDA", "AAPL"],
        "affected_sectors": ["Technology"]
      },
      "data": {
        "previous": 2.8,
        "estimate": 2.7
      }
    }
  ],
  "total_count": 8,
  "as_of": "2026-04-01T09:00:00Z"
}
```

### 后端聚合逻辑

```python
async def get_user_events(user_id: str, days: int = 14) -> list:
    # 1. 获取用户 symbols（watchlist + portfolio）
    watchlist = await get_user_watchlist(user_id)
    portfolio = await get_user_portfolio(user_id)  # 持仓拆分后
    user_symbols = set(watchlist.symbols + [h.symbol for h in portfolio.holdings])

    # 2. 获取用户持仓的板块信息（缓存 7 天）
    user_sectors = await get_symbols_sectors(user_symbols)  # FMP profile

    # 3. 并行拉取两个日历
    earnings, economic = await asyncio.gather(
        get_full_earnings_calendar(days),  # 注意：用完整版，不是 major-only
        get_economic_calendar(days),
    )

    events = []

    # 4. 处理财报 — 直接匹配 symbol
    for e in earnings:
        sym = e["symbol"]
        if sym in user_symbols:
            relevance = build_direct_relevance(sym, portfolio)
            events.append(EarningsEvent(e, relevance, importance="high"))
        elif sym in ALWAYS_SHOW_TICKERS:
            # Mag 7 等即使不持有也展示
            events.append(EarningsEvent(e, relevance=None, importance="medium"))

    # 5. 处理宏观事件 — 通过板块映射关联
    for e in economic:
        affected_sectors = match_macro_to_sectors(e["event"])
        overlap = affected_sectors & user_sectors
        if overlap or e.get("is_key_event"):
            matched_symbols = find_symbols_in_sectors(overlap, user_symbols, user_sectors)
            relevance = build_sector_relevance(overlap, matched_symbols)
            events.append(MacroEvent(e, relevance, importance="high" if overlap else "medium"))

    # 6. 排序：日期升序，同日内按 importance 降序
    events.sort(key=lambda x: (x.date, -x.importance_score))

    return events
```

### 需要新增的 FMP 调用

当前 `get_major_earnings()` 只返回预设 60 个大公司。事件倒计时需要覆盖用户持有的所有股票，因此需要：

**方案**: 在 `fmp_service.py` 新增 `get_earnings_for_symbols(symbols, days)` 方法，拉取完整 earnings calendar 后按用户 symbols 过滤。或者直接用 FMP 的 earnings calendar endpoint（已有 `get_earnings_calendar()`），在事件端点层面做过滤。

## 实施步骤

1. [ ] **后端数据层**: 在 `fmp_service.py` 中暴露完整 earnings calendar（不只是 major）
2. [ ] **板块映射**: 新增 `MACRO_SECTOR_IMPACT` 映射表 + `match_macro_to_sectors()` 函数
3. [ ] **板块缓存**: 新增 `get_symbols_sectors(symbols)` 函数，调用 FMP profile 并缓存 7 天
4. [ ] **聚合端点**: 新增 `GET /api/brew/events`，实现上述聚合逻辑
5. [ ] **Pydantic 模型**: EventItem, EventRelevance, EventsResponse
6. [ ] **前端 hook**: `useUpcomingEvents()` — TanStack Query，staleTime 10 分钟
7. [ ] **前端组件**: EventCard（单个事件卡片）
8. [ ] **前端组件**: EventsBar（横向滚动卡片栏，默认 3 个 + "更多"按钮）
9. [ ] **前端组件**: EventTimeline（展开态，14 天完整时间线）
10. [ ] **集成**: 嵌入 ForYouContent 顶部，Tab 切换上方

## 难度评估

| 部分 | 难度 | 说明 |
|------|------|------|
| 财报匹配 | 低 | symbol 直接匹配，已有先例 |
| 宏观事件板块映射 | 中偏低 | 静态映射表 + FMP sector 数据 |
| 后端聚合端点 | 低 | 组合已有数据源 |
| 前端事件卡片 | 低 | 类似 StockCard 模式 |
| 前端时间线展开 | 中 | 按日期分组 + 展开/收起交互 |

**整体: 低-中**。最大工作量在前端展示（卡片 + 时间线两种视图）。

## 待定问题

1. **持仓拆分未完成时怎么处理？** 可以先只用 watchlist symbols，持仓拆分后再加入 portfolio symbols 和"你持有 X 股"的个性化文案。两者解耦，事件倒计时可以先于持仓拆分上线。

2. **完整 earnings calendar 的 API 成本？** FMP 的 earnings calendar 是单次请求返回所有公司，数据量较大。需要确认 FMP plan 的额度是否支持频繁调用。建议缓存 4 小时。

3. **宏观事件的中文翻译？** FMP 返回英文事件名（如 "Non-Farm Payrolls"）。V1 可以在映射表中同时维护中文名，或调用 LLM 翻译（增加成本）。建议 V1 用映射表预翻译常见事件。

4. **是否需要盘前/盘后时间标注？** 财报的发布时间（before market / after market）对投资者很重要。FMP earnings data 可能包含 `time` 字段，需确认。

5. **非交易日展示什么？** 周末/节假日显示下一个交易日的事件，并标注"距下一交易日 X 天"。

# 宏观分析质量提升 -- 工程计划

> Status: In Progress
> Created: 2026-04-13
> P2 已完成 (前端评分系统移除)

## 问题诊断

1. **只看数据不看事件**: 周报只喂了 FRED 数据，经济日历只用于 `week_ahead`(下周关注)，本周发生的重大事件(数据披露、Fed讲话、地缘政治)没有被纳入分析
2. **趋势判断不充分**: 只有流动性有历史分位(`liquidity_historical`)，经济/通胀/情绪维度只有当期值+上期变化，LLM 缺乏足够的历史上下文来判断趋势
3. **评分系统与体验脱节**: 已通过 P2 解决 -- 前端去掉数字评分，改用 AI 一句话描述

## Phase 1: 引入"本周事件"数据源

### 1.1 改造经济日历为双向

**文件**: `backend/app/features/macro/weekly/data_collector.py`

当前 `get_economic_calendar(14)` 只获取未来 14 天。改为获取过去 7 天 + 未来 14 天，分成两组：

```python
# 当前
econ_cal_task = loop.run_in_executor(None, get_economic_calendar, 14)

# 改为
this_week_cal_task = loop.run_in_executor(None, get_economic_calendar_past, 7)  # 本周已发生
next_week_cal_task = loop.run_in_executor(None, get_economic_calendar, 14)      # 下周待发生
```

**文件**: `backend/app/shared/data_tools/calendar.py`

新增 `get_economic_calendar_past(days)` 函数:
- 调用 FMP API 的 `from` 和 `to` 参数获取过去 N 天的经济事件
- 同样过滤 US + High Impact
- 增加 `actual` 字段(实际值)，用于对比 estimate vs actual

输出结构:
```json
{
  "events": [
    {
      "date": "2026-04-10",
      "event": "CPI YoY (Mar)",
      "estimate": 3.1,
      "actual": 3.3,
      "surprise": "above",  // above/below/inline
      "impact": "High"
    }
  ]
}
```

### 1.2 引入本周新闻摘要

**文件**: `backend/app/features/macro/weekly/data_collector.py`

复用日报系统的新闻获取:
```python
from app.shared.data_tools.news import get_combined_market_news

# 在 collect_weekly_data() 中新增:
news_task = loop.run_in_executor(None, _fetch_week_headlines)
```

新增 `_fetch_week_headlines()`:
- 调用 `get_combined_market_news()` 获取过去 7 天新闻
- 用 `_is_retrospective_news()` 过滤旧事新报
- 只保留宏观相关新闻(关键词: Fed, FOMC, tariff, trade, geopolitical, sanctions, GDP, CPI, jobs)
- 限制 10-15 条标题 + 1 句摘要
- 复用: `backend/app/shared/data_tools/news.py` 的 `_deduplicate_news()` 和 `_is_retrospective_news()`

### 1.3 更新 WeeklyRawData 模型

**文件**: `backend/app/features/macro/weekly/models.py`

```python
class WeeklyRawData(BaseModel):
    # ... 现有字段 ...
    
    # 新增
    this_week_events: list  # 本周已发生的经济事件(含 actual vs estimate)
    week_headlines: list    # 本周宏观新闻标题
```

### 1.4 更新 Agent Prompt

**文件**: `backend/app/features/macro/weekly/agent.py`

在 `_prepare_data_for_agent()` 中新增:
```python
result["this_week_events"] = raw.this_week_events  # 本周事件
result["week_headlines"] = raw.week_headlines        # 本周新闻
```

在 INSTRUCTION prompt 中新增段落(约第 93 行之后):

```
## 本周事件数据
`this_week_events`: 本周已发布的经济数据(含预期值 vs 实际值)
`week_headlines`: 本周宏观新闻标题

**要求**:
- 在 narrative 中，将事件与数据变动关联: "本周 X 事件(实际 Y vs 预期 Z)导致市场..."
- 区分"符合预期"和"超预期/不及预期"的不同影响
- 地缘政治/政策事件如果影响了市场数据，必须提及因果关系
- 不要简单罗列事件，要解释事件如何改变了四维度的信号
```

### 1.5 验证

```bash
# 1. 启动后端
cd backend && source venv/bin/activate && uvicorn app.main:app --reload

# 2. 测试新的日历 API
curl http://localhost:8000/api/economic-calendar-past?days=7

# 3. 手动触发周报生成
curl -X POST http://localhost:8000/api/weekly-report/generate?force=true \
  -H "X-Cron-Secret: $CRON_SECRET"

# 4. 检查生成的周报是否包含事件关联分析
curl http://localhost:8000/api/weekly-report | jq '.data.narrative' | head -50
```

---

## Phase 2: 扩展趋势数据到所有维度

### 2.1 新增趋势预计算函数

**文件**: `backend/app/features/macro/cache/refresher.py`

新增 `_compute_macro_trend_context()`，按数据频率使用不同的趋势算法：

```python
async def _compute_macro_trend_context() -> dict:
    """按数据频率分类计算趋势"""
    
    # ── 日度数据: 看周度均值变化和30天方向 ──
    daily_series = {
        "vix": {"source": "yfinance", "symbol": "^VIX"},
        "treasury_10y": {"series_id": "DGS10"},
    }
    # daily_trend() 计算:
    #   week_change: 本周5日均值 vs 上周5日均值
    #   month_direction: 30天线性回归方向 (up/down/flat)
    #   current_vs_30d_avg: 当前值偏离30日均值的百分比
    
    # ── 周度数据: 看4周方向和13周比较 ──
    weekly_series = {
        "net_liquidity": {"computed": True},      # WALCL - TGA - RRP
        "fed_assets": {"series_id": "WALCL"},
        "tga": {"series_id": "WDTGAL"},
        "reserves": {"series_id": "WRESBAL"},
    }
    # weekly_trend() 计算:
    #   4w_direction: 最近4周连续上升/下降/震荡
    #   4w_vs_13w: 4周均值 vs 13周均值
    #   percentile_1y: 当前值在1年中的分位
    
    # ── 月度数据: 看连续月数和半年/年度对比 ──
    monthly_series = {
        "unemployment": {"series_id": "UNRATE"},
        "nonfarm_payrolls": {"series_id": "PAYEMS", "units": "pch"},
        "cpi_yoy": {"series_id": "CPIAUCSL", "units": "pc1"},
        "core_pce_yoy": {"series_id": "PCEPILFE", "units": "pc1"},
        "fed_funds": {"series_id": "FEDFUNDS"},
    }
    # monthly_trend() 计算:
    #   consecutive_months: 连续几个月同方向变化 (如 "up_3")
    #   vs_6m_ago: 跟6个月前的差值
    #   vs_1y_ago: 跟1年前的差值
    #   percentile_5y: 当前值在5年中的分位
    
    # ── 季度数据: 看连续季度方向和同比 ──
    quarterly_series = {
        "gdp_growth": {"series_id": "A191RL1Q225SBEA"},
    }
    # quarterly_trend() 计算:
    #   consecutive_quarters: 连续几个季度同方向
    #   prev_value: 上一季度的值
    #   yoy_change: 同比变化
    
    # 输出示例:
    return {
        "vix": {
            "frequency": "daily",
            "current": 19.12,
            "week_change": -2.3,          # 本周均值 vs 上周均值
            "month_direction": "down",
        },
        "unemployment": {
            "frequency": "monthly",
            "current": 4.3,
            "consecutive_months": "flat_3",  # 连续3个月持平
            "vs_6m_ago": +0.4,
            "vs_1y_ago": +0.5,
            "percentile_5y": 45,
        },
        "gdp_growth": {
            "frequency": "quarterly",
            "current": 0.5,
            "prev_value": 2.1,
            "consecutive_quarters": "down_2",
            "yoy_change": -1.6,
        },
    }
```

### 2.2 集成到缓存刷新

**文件**: `backend/app/features/macro/cache/refresher.py`

在 Tier 3 (每 24 小时) 中新增:
```python
# 现有
await _refresh_liquidity_history()
await _refresh_liquidity_percentiles()

# 新增
await _refresh_macro_trend_context()  # 计算所有维度的趋势数据
```

缓存 key: `macro:trend_context`

### 2.3 喂给 Agent

**文件**: `backend/app/features/macro/weekly/data_collector.py`

在 `collect_weekly_data()` 中:
```python
# 读取趋势缓存
trend_context = try_db_cache("macro:trend_context")
```

**文件**: `backend/app/features/macro/weekly/agent.py`

在 `_prepare_data_for_agent()` 中:
```python
result["CORE_MACRO_DATA"]["trend_context"] = raw.trend_context
```

在 INSTRUCTION prompt 中新增:

```
## 趋势数据
`trend_context`: 每个核心指标的历史趋势统计(1m/3m/6m变化、1年分位、连续方向)

**要求**:
- 分析时必须引用趋势: "失业率 4.3%(连续3个月上升，处于1年75分位)"
- 不要只说"失业率 4.3%"，要说明方向和位置
- 区分"水平好但趋势恶化"和"水平差但趋势改善"
- trend_context 中的 consecutive_direction 是判断趋势的关键信号
```

### 2.4 验证

```bash
# 1. 手动刷新趋势缓存
curl -X POST http://localhost:8000/api/macro-cache/refresh?tier=3 \
  -H "X-Cron-Secret: $CRON_SECRET"

# 2. 检查缓存内容
curl http://localhost:8000/api/macro-cache/status | jq '.entries[] | select(.key == "macro:trend_context")'

# 3. 生成周报并检查趋势引用
curl -X POST http://localhost:8000/api/weekly-report/generate?force=true \
  -H "X-Cron-Secret: $CRON_SECRET"

# 4. 验证 narrative 中包含趋势描述
curl http://localhost:8000/api/weekly-report | jq '.data.narrative' | grep -i "连续\|分位\|趋势"
```

---

## Phase 3: 按数据频率显示趋势（前端）

### 问题

当前每个指标旁边显示 `+2.1%` 或 `-13.3%`，用户不知道比较基准是什么。不同指标频率不同，统一用百分比变化会造成困惑：
- 净流动性 `+2.1%` 是跟上月比
- VIX `-0.6%` 是跟昨天比
- GDP `-88.6%` 是跟上季度比（看起来吓人但只是正常波动）

### 方案：按数据频率用最自然的比较方式

**日度数据** (VIX, 10Y 国债, EFFR)
- 显示: `19.12` + 方向箭头 ↓
- 不显示百分比（日度变化噪音大）

**周度数据** (净流动性, Fed 资产, TGA, 银行准备金)
- 显示: `$6.00T` + `周+0.3%`
- 标注"周"表明比较基准

**月度数据** (CPI, 失业率, 非农, 核心 PCE)
- 显示: `4.3%` + 趋势文字 `连续3月持平` 或 `较上月 -0.1pp`
- 用人话描述趋势方向

**季度数据** (GDP)
- 显示: `0.5%` + `前值 2.1%`
- 显示上一期值作为对比

### 实现

**3.1 修改 MetricItem 接口**

**文件**: `frontend/src/app/macro/_components/MacroQuadrant.tsx`

```typescript
export interface MetricItem {
  key: string;
  label: string;
  value: string;
  // 替换原来的 change?: number | null
  trend?: {
    type: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    direction?: 'up' | 'down' | 'flat';       // 日度数据用箭头
    weekChange?: number;                        // 周度数据用 "周+X%"
    description?: string;                       // 月度数据用文字 "连续3月持平"
    prevValue?: string;                         // 季度数据用 "前值 X"
  };
  chart?: ReactNode;
}
```

**3.2 修改 Tab 按钮渲染**

根据 `trend.type` 显示不同的辅助信息：
- `daily`: 显示 ↑ 或 ↓ 箭头（绿/红色）
- `weekly`: 显示 `周+0.3%`（带"周"前缀）
- `monthly`: 显示趋势文字（如 `连续3月↑`）
- `quarterly`: 显示 `前值 2.1%`

**3.3 数据来源**

趋势信息来自 Phase 2 的 `trend_context` 缓存。前端在 `page.tsx` 中将后端的趋势数据映射为 `MetricItem.trend`。

### 3.4 按数据频率选择图表类型

不同颗粒度的数据应该用不同的图表形式：

**日度数据** (VIX, 10Y 国债) → **面积图 (Area Chart)**
- 数据点密集，趋势连续，面积图最合适
- 已有组件: `IndexAreaChart`, `FredAreaChart`

**周度数据** (净流动性, Fed 资产, TGA, 银行准备金) → **面积图 (Area Chart)**
- 数据点较密集(52个/年)，趋势连续
- 已有组件: `NetLiquidityChart`, `FredAreaChart`

**月度数据** (CPI, PCE, 失业率, 非农, 联邦基金利率) → **柱状图 (Bar Chart)**
- 每个月一个离散值，柱状图更直观地展示每期的大小
- 需要新建组件: `FredBarChart`
- 用 lightweight-charts 的 histogram series 或 ECharts 的 bar

**季度数据** (GDP) → **柱状图 (Bar Chart)**
- 一年只有4个值，柱状图一目了然
- 正值绿色，负值红色，立即看出增长/衰退
- 需要新建组件: 复用 `FredBarChart` 配置

**新建组件**: `frontend/src/components/FredBarChart.tsx`
- 接口与 `FredAreaChart` 相同: `seriesId`, `timeRange`, `height`, `units`
- 内部使用 lightweight-charts 的 `HistogramSeries` 或 ECharts 的 bar
- 正值用 emerald，负值用 red

**page.tsx 中的图表分配更新**:
```
流动性:
  净流动性    → NetLiquidityChart (面积图, 现有)
  Fed 资产   → FredAreaChart (面积图, 现有)
  TGA        → FredAreaChart (面积图, 现有)
  银行准备金  → FredAreaChart (面积图, 现有)

经济:
  GDP 增长率  → FredBarChart (柱状图, 新建) ← 季度数据
  失业率      → FredBarChart (柱状图, 新建) ← 月度数据
  非农就业    → FredBarChart (柱状图, 新建) ← 月度数据

通胀:
  CPI YoY    → FredBarChart (柱状图, 新建) ← 月度数据
  核心 PCE    → FredBarChart (柱状图, 新建) ← 月度数据
  联邦基金利率 → FredAreaChart (面积图, 现有) ← 日度数据
  10Y 国债    → FredAreaChart (面积图, 现有) ← 日度数据

情绪:
  恐贪指数    → 无图表
  VIX        → IndexAreaChart (面积图, 现有) ← 日度数据
```

### 验证

- 检查每个指标的辅助信息是否匹配数据频率
- 确认不再有无上下文的百分比变化
- 确认 GDP 不再显示 -88.6% 这种误导性数字
- 确认月度/季度数据使用柱状图，日度/周度数据使用面积图

---

## Phase 4: 评分系统重构（暂缓）

P2 已完成前端移除。后端评分系统保留但不在前端展示。如果未来需要恢复量化指标:

- 维度对齐: 流动性/经济/通胀/情绪 (去掉 AI Company Health)
- 动态阈值: 基于 `trend_context` 的分位数替代硬编码阈值
- 信号灯由评分驱动而非 LLM 自由判定

---

## Phase 5: 新增前瞻性数据源

### 5.1 经济基本面新增

**LEI 领先经济指标** (FRED: `USSLIND`)
- 放入: 经济基本面维度
- 用途: 预测未来 6-12 个月经济走向。连续几个月下降 → 衰退概率升高
- 频率: 月度
- 在 dashboard 前端: 加到经济象限的 metrics
- 在周报 prompt: 要求在展望部分引用 "LEI 连续X个月下降/上升，预示..."

**GDPNow 实时预测**
- 数据源: Atlanta Fed GDPNow (需要新增爬取或找 API)
- 放入: 经济基本面维度
- 用途: 下一季度 GDP 的实时预测，比等季度 GDP 发布领先很多
- 在周报 prompt: "GDPNow 预测下季度 GDP X%，跟上周预测比是上调还是下调"

### 5.2 通胀与利率新增

**Fed 降息预期**
- 数据源: FMP `/stable/federal-funds-rate-probability` 或 CME FedWatch 数据
- 放入: 通胀与利率维度
- 用途: 市场隐含的降息概率和次数。"市场认为下次会议降息的概率是 X%，今年总共降 Y 次"
- 在 dashboard 前端: 加到通胀象限的 metrics
- 在周报 prompt: 展望部分必须引用降息预期的变化

**5Y5Y Forward Breakeven 通胀预期** (FRED: `T5YIFR`)
- 放入: 通胀与利率维度
- 用途: Fed 最关注的长期通胀锚定指标。如果这个在涨，说明市场担心通胀长期化
- 频率: 日度
- 在 dashboard 前端: 加到通胀象限的 metrics
- 在周报 prompt: "长期通胀预期 X%(5Y5Y Breakeven)，处于Y水平"

**Michigan 消费者通胀预期** (FRED: `MICH`)
- 放入: 通胀与利率维度
- 用途: 老百姓觉得未来物价会怎样。如果消费者预期通胀上升，可能自我实现
- 频率: 月度
- 在周报 prompt: "老百姓觉得未来一年物价会涨X%(Michigan通胀预期)"

### 5.3 实现步骤

**后端 -- 数据收集**:
1. FRED 数据 (LEI, T5YIFR, MICH): 加入 `refresher.py` 的 `_refresh_macro_trend_context()`，作为新的月度/日度系列
2. Fed 降息预期: 在 `data_collector.py` 中新增 FMP API 调用
3. GDPNow: 新增数据源（Atlanta Fed 或第三方 API）

**后端 -- Agent prompt**:
- 在展望相关的 prompt 段落中，要求 AI 引用这些前瞻数据
- landscape 部分: "未来 3-6 个月展望"必须引用 LEI + 降息预期
- inflation_analysis.market_implication: 必须引用通胀预期数据
- economy_analysis.market_implication: 必须引用 LEI + GDPNow

**前端 -- Dashboard**:
- 经济象限: 加 LEI 指标（月度，用 FredBarChart）
- 通胀象限: 加降息预期 + 5Y5Y 通胀预期
- 图表类型: LEI 和 MICH 用柱状图（月度），T5YIFR 用面积图（日度）

### 5.4 验证

```bash
# 测试 FRED 新增系列
curl "http://localhost:8000/api/macro-risk/history/USSLIND?days=730"
curl "http://localhost:8000/api/macro-risk/history/T5YIFR?days=365"
curl "http://localhost:8000/api/macro-risk/history/MICH?days=730"

# 测试 Fed 降息预期 (FMP)
curl "http://localhost:8000/api/fed-rate-probability"

# 重新生成周报检查展望质量
curl -X POST http://localhost:8000/api/weekly-report/generate?force=true
```

---

## 关键文件清单

| 文件 | Phase | 改动 |
|------|-------|------|
| `backend/app/shared/data_tools/calendar.py` | P1 | 新增 `get_economic_calendar_past()` |
| `backend/app/features/macro/weekly/data_collector.py` | P1+P2 | 新增事件+新闻+趋势数据收集 |
| `backend/app/features/macro/weekly/models.py` | P1+P2 | WeeklyRawData 新增字段 |
| `backend/app/features/macro/weekly/agent.py` | P1+P2 | prompt 新增事件关联+趋势引用要求 |
| `backend/app/features/macro/cache/refresher.py` | P2 | 新增 `_compute_macro_trend_context()` (按频率分类) |
| `backend/app/features/macro/cache/db.py` | P2 | 新增 `macro:trend_context` 缓存 key |
| `frontend/src/app/macro/_components/MacroQuadrant.tsx` | P3 | MetricItem 接口改为 trend 对象 + Tab 显示逻辑 |
| `frontend/src/app/macro/page.tsx` | P3 | 指标数据映射为 trend 对象 + 图表类型分配 |
| `frontend/src/components/FredBarChart.tsx` | P3 | **新建** - 月度/季度柱状图组件 |

## 复用的现有代码

| 代码 | 来源 | 用途 |
|------|------|------|
| `_is_retrospective_news()` | `shared/data_tools/news.py:269` | 过滤旧事新报 |
| `_deduplicate_news()` | `shared/data_tools/news.py:247` | 新闻去重 |
| `get_combined_market_news()` | `shared/data_tools/news.py:268` | 获取新闻 |
| `_compute_liquidity_context()._series_stats()` | `cache/refresher.py:155` | 趋势统计计算模板 |

## 实施顺序

1. ~~P2: 前端去掉评分系统~~ (已完成)
2. ~~P1: 引入本周事件~~ (已完成)
3. ~~P2: 扩展趋势数据~~ (已完成)
4. ~~P3: 前端按频率展示 + 柱状图~~ (已完成)
5. P5: 新增前瞻性数据源 (下一步)
6. P4: 评分重构 (暂缓)

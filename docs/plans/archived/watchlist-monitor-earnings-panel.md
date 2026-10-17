# Watchlist Monitor Earnings Panel Engineering Plan

> Status: Planning
> Related: `backend/app/features/watchlist_monitor/.context.md`, `frontend/src/app/for-you/.context.md`, `frontend/src/lib/.context.md`, `backend/app/features/stock/.context.md`
> Vision: 产品策略.md > 现有模块演进 > /for-you；产品模块规划 > 模块 1: 持仓日报

## 目标

把 `/for-you/monitor` 的“新闻事件 - 财报”板块改成纯读取离线生成内容：稳定展示下一次财报时间；如果公司近期刚发布财报，则展示结构化财报解读，而不是前端从 signals/source title 里临时猜测。

## 现状

当前 Monitor 的读取路径是正确的：`GET /api/watchlist-monitor` 只读 cached `ticker_daily_briefs`，不跑 LLM。

缺口在财报数据契约：

- 后端 `service._load_common_inputs()` 使用 `shared.data_tools.earnings.get_earnings_calendar(14)`。这个 wrapper 走 `FMPService.get_major_earnings()`，只保留 hard-coded 大票，而且只看未来 14 天，不适合作为用户 watchlist 的“下一次财报时间”来源。
- `signal_builder._compact_earnings()` 只把匹配 ticker 的财报日历压成 `earnings_1...earnings_3` source refs；`_earnings_event_candidates()` 再过滤到未来 14 天事件。它能服务“未来事件”，但不能稳定服务“财报板块”。
- 近期刚发布的财报目前可能只混在 `news_summary` 或新闻 source 里，没有单独的结构化字段；前端无法可靠知道“这是刚发布的财报解读”。
- 前端 `frontend/src/app/for-you/monitor/page.tsx` 现在通过 `source.type === "event" && title.includes("earnings")` 生成 `earningsSources`，并把 `fundamentalSignals` 塞进 `EarningsPanel`。这导致 UI 只是在展示原始来源和泛化基本面信号，不是明确的财报模块。
- 个股页已有可复用能力：`StockService.get_earnings_data()` 聚合 yfinance earnings history、FMP income statement、FMP recent earnings actuals、next earnings date，并处理“公告当天 income statement 还没更新”的 stub 逻辑。

## 设计

新增一个离线字段 `earnings_monitor`，挂在 `ticker_daily_briefs`、`TickerDailyBrief`、`TickerRow` 和前端 `MonitorTickerRow` 上。前端财报板块只读这个字段。

### 数据契约

建议后端模型：

```python
class EarningsMetric(BaseModel):
    label: str
    actual: float | None = None
    estimate: float | None = None
    prior: float | None = None
    change_pct: float | None = None
    unit: str = ""
    interpretation: str = ""

class NextEarnings(BaseModel):
    date: str | None = None
    time: str = ""
    days_until: int | None = None
    eps_estimated: float | None = None
    revenue_estimated: float | None = None
    source_ref_ids: list[str] = Field(default_factory=list)

class RecentEarningsBrief(BaseModel):
    reported_date: str | None = None
    fiscal_period: str = ""
    headline: str = ""
    summary: str = ""
    metrics: list[EarningsMetric] = Field(default_factory=list)
    interpretation: str = ""
    source_ref_ids: list[str] = Field(default_factory=list)

class EarningsMonitor(BaseModel):
    next: NextEarnings | None = None
    recent: RecentEarningsBrief | None = None
    updated_at: str = ""
```

命名原则：

- `next` 只回答“下一次什么时候发布、市场预期是什么”。
- `recent` 只回答“刚发布的这份财报发生了什么、哪些指标超/低于预期、对基本面叙事有什么影响”。
- 所有 `source_ref_ids` 必须指向同一条 brief 内合法的 `source_refs[].id`。

### 数据来源

下一次财报：

- Monitor 不再使用 `shared.data_tools.earnings.get_earnings_calendar()` 的 major-only wrapper。
- 在 `_load_common_inputs()` 里改用 `get_fmp_service().get_earnings_calendar(days=90)`，拿未经过大票过滤的 FMP 日历。
- 对单 ticker 从 90 天窗口内选最早的未来日期；如果 FMP 没有排期，再用 yfinance `earningsTimestamp` 作为 fallback。
- 财报事件仍只进入未来 14 天 `event_candidates`；但 `earnings_monitor.next` 可以展示 90 天内的下一次财报时间。

近期财报：

- 新增 monitor 专用 `earnings_builder.py`，不要在前端或读取 API 里补抓。
- 先用 `get_fmp_service().get_recent_earnings_for_symbol(symbol, days_back=10, days_forward=1)` 判断最近是否刚发布且有 `epsActual` / `revenueActual`。
- 只有检测到近期财报，或过去 7 天新闻标题明显是 earnings/results/guidance，才抓更重的数据：最近几期 income statement、必要的 earnings history。复用/抽取 `StockService` 里已经验证过的 calendar actual merge 逻辑，避免公告日数据延迟导致空解读。
- 最近财报的新闻解释只使用已经进入 `news_items` 的 `news_*` sources，以及 FMP earnings source；不新增实时搜索。

### 离线 LLM 解读

近期财报需要“解读”，但仍必须离线生成：

- 在 `ticker_brief_agent.py` 增加一个可选 `earnings_interpretation` 子任务。
- 只有 `earnings_monitor.recent` 有实际财报数据时才调用，避免每只 ticker 都多一次 LLM。
- 输入只包含 compact earnings metrics、earnings-related news snippets、market context 摘要和合法 source refs。
- 输出写回 `earnings_monitor.recent.headline/summary/interpretation`，不直接读取 raw news 全文。
- final `ai_take` 的输入也带上压缩后的 `earnings_monitor`，这样刚发布财报时最终盯盘结论会自然综合它。

提示词方向：

```text
You are writing the earnings section for a cached watchlist monitor brief.
Use only input.earnings_monitor_draft, input.earnings_related_news, and input.source_refs.
Explain what changed in the latest earnings report, which metrics beat/missed expectations,
whether guidance or management commentary changes the fundamental narrative, and what to watch next.
Do not give buy/sell/hold advice. Do not invent fiscal periods, dates, or estimates.
Return JSON with headline, summary, interpretation, metric_interpretations, source_ref_ids.
Write in Simplified Chinese.
```

### 数据流

```text
Cron/Admin generate
  -> _load_common_inputs()
     -> raw FMP earnings calendar, 90d, unfiltered
  -> build_ticker_context()
     -> compact news / technical / market context
     -> compact earnings_events for source refs and future 14d event candidates
  -> build_earnings_monitor()
     -> next earnings from raw calendar or yfinance fallback
     -> recent earnings actuals from FMP recent earnings window
     -> optional compact income statement / earnings history
  -> optional earnings_interpretation LLM subtask
  -> final brief composition reads news_events, technical, market_discussion, earnings_monitor
  -> save ticker_daily_briefs.earnings_monitor

User read
  -> GET /api/watchlist-monitor
  -> return ticker_rows[].earnings_monitor
  -> frontend EarningsPanel renders cached next/recent only
```

### API 和数据库变更

- `TickerDailyBrief` 新增 `earnings_monitor: EarningsMonitor = Field(default_factory=EarningsMonitor)`。
- `TickerRow` 新增同名字段。
- `ticker_daily_briefs` 新增 `earnings_monitor JSONB NOT NULL DEFAULT '{}'::jsonb`。
- `backend/app/edge_functions/watchlist-monitor.js` 的 `upsert_brief` 写入 `body.earnings_monitor`。
- `frontend/src/lib/api.ts` 新增 `MonitorEarningsMonitor` 类型，并挂到 `MonitorTickerRow`。
- 旧 DB row 没有该字段时应正常 fallback 为空对象，不阻塞页面。

### 前端展示

改造 `EarningsPanel`：

- 不再接收 `signals` / `sources` 作为主数据。
- 接收 `earningsMonitor` 和 `sourceById`。
- 顶部展示“下次财报”：日期、时段、倒计时、EPS 预期、营收预期、来源。
- 如果有 `recent`，展示“最近财报解读”：headline、summary、关键指标行、interpretation、source chips。
- 没有 `next` 也没有 `recent` 时，显示“暂无已排期的下一次财报或近期财报解读。”。
- `NewsEventsTab` 的 tab count 改为按 `earnings_monitor.next/recent` 计数，不再靠 `title.includes("earnings")`。

## 实施步骤

1. [ ] 定义后端 `EarningsMetric` / `NextEarnings` / `RecentEarningsBrief` / `EarningsMonitor` 模型，并接入 `TickerDailyBrief`、`TickerRow`。
2. [ ] 增加 `ticker_daily_briefs.earnings_monitor` migration，并更新 `backend/app/edge_functions/watchlist-monitor.js`、`backend/migrations/watchlist_monitor_v0_schema.sql`。
3. [ ] 将 Monitor 的财报日历来源改成 raw `FMPService.get_earnings_calendar(days=90)`，保留未来事件只看 14 天的现有行为。
4. [ ] 新增 `watchlist_monitor/earnings_builder.py`，生成 deterministic `earnings_monitor.next` 和 recent earnings draft，并确保 source refs 合法。
5. [ ] 增加可选 `earnings_interpretation` LLM 子任务；仅近期财报存在时运行，并把结果写回 `earnings_monitor.recent`。
6. [ ] 把 `earnings_monitor` 注入 final brief composition 输入，并持久化到 DB。
7. [ ] 更新 `frontend/src/lib/api.ts` 类型和 `/for-you/monitor/page.tsx` 的 `EarningsPanel` 数据流、展示和 count 逻辑。
8. [ ] 增加/更新测试：后端 unit 覆盖 90 天 next earnings、recent earnings draft、source id 校验；E2E 覆盖 API payload；前端至少跑 TypeScript/lint 验证。
9. [ ] 更新 `backend/app/features/watchlist_monitor/.context.md`、`frontend/src/app/for-you/.context.md`、`frontend/src/lib/.context.md`。
10. [ ] 手动 force 触发一批测试 ticker 的 cron 生成，确认 DB 中 `earnings_monitor` 和前端财报板块显示正确。

## 待定问题

- 下一次财报 lookahead 用 90 天还是更长？FMP 当前接口内部上限是 90 天，建议先用 90 天；超过 90 天就显示“尚未排期”。
- “最近刚发布”窗口用 7 天还是 10 天？建议先用 10 天，覆盖公告日到完整财报明细延迟更新的情况。
- 近期财报解读是否要接入 transcript？建议本轮不接入。Transcript 成本和 token 都更高，先使用 earnings actuals、income statement、earnings-related news 做短解读。
- 是否复用完整 `/stock/{symbol}/earnings` AI 分析？建议不复用。Monitor 需要短、缓存、稳定的板块解读；完整个股页 earnings agent 适合作为深挖入口。

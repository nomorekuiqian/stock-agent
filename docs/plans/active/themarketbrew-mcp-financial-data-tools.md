# TheMarketBrew MCP Financial Data Tools Engineering Plan

> Status: Planning
> Related: `mcp/themarketbrew/.context.md`, `backend/app/features/kol_research/.context.md`, `backend/app/shared/data_tools/.context.md`, `backend/app/features/stock/.context.md`, `backend/app/features/screener/.context.md`, `backend/app/features/macro/risk/.context.md`
> Vision: 产品策略.md > Agent 服务：把 TheMarketBrew 后台的数据、新闻和 persona 方法论变成外部 Agent 可调用的投研上下文。

## 目标

把 TheMarketBrew MCP 从“persona lens + 少量 workflow market brief”升级为“persona 方法论 + 后台全量金融数据/新闻工具”的 backend-first MCP，让外部 Agent 能按同一套 MCP 调用到股票、宏观、新闻、报告、KOL digest、screener 和 persona 蒸馏物料。

## 现状

当前 `mcp/themarketbrew` 是薄本地 stdio adapter，不打包 persona assets。它暴露 12 个 `market_lens_*` 工具：

- persona/material：`market_lens_status`, `market_lens_personas`, `market_lens_list_lenses`, `market_lens_get_lens`, `market_lens_search_lenses`
- evidence：`market_lens_search_evidence`, `market_lens_get_evidence_by_ids`
- workflow/context：`market_lens_build_context`, `market_lens_stock_diagnosis`, `market_lens_market_regime`, `market_lens_compare`, `market_lens_research_memo`

后端已有 MCP endpoint：

```text
GET  /api/kol_research/mcp/personas
GET  /api/kol_research/personas/{u}/mcp/status
GET  /api/kol_research/personas/{u}/mcp/lenses
GET  /api/kol_research/personas/{u}/mcp/lenses/{type}/{id}
POST /api/kol_research/personas/{u}/mcp/lenses/search
POST /api/kol_research/personas/{u}/mcp/evidence/by-ids
POST /api/kol_research/personas/{u}/mcp/search
POST /api/kol_research/personas/{u}/mcp/market-brief
POST /api/kol_research/personas/{u}/mcp/context
POST /api/kol_research/personas/{u}/mcp/workflow
```

实际问题：

1. MCP adapter 没有直接暴露 `/mcp/market-brief`，只有 workflow 内部间接使用。
2. workflow 只会根据 `include_market_data` 粗略塞入 stock/macro brief，不能精确声明需要哪些数据。
3. 后台 `shared/data_tools/research_tools.py` 已经有大量工具，但 MCP 没有接入：
   - `get_market_overview`
   - `get_stock_quote`
   - `get_stock_news`
   - `get_technical_analysis`
   - `get_stock_fundamentals`
   - `get_forward_valuation`
   - `get_earnings_calendar`
   - `get_company_profile`
   - `get_peer_comparison`
   - `get_historical_valuation`
   - `get_macro_risk_summary`
   - `get_liquidity_overview`
   - `get_market_sentiment`
   - `get_economic_calendar`
   - `get_morning_report`
   - `get_weekly_report`
   - `get_twitter_digest`
4. 后台 `shared/data_tools/briefs.py` 已经有适合 MCP 的粗颗粒工具：
   - `get_stock_brief`
   - `get_peer_brief`
   - `get_macro_brief`
   - `get_industry_brief`
5. `stock` feature 还有未进入 research tool registry 的公开金融/新闻数据：
   - price history
   - earnings raw data
   - earnings call transcript
   - news feed
   - insider trading
   - press releases
   - stock market overview KPI
6. `screener` feature 已有全美市场缓存、预设筛选和自然语言 agent 工具，但 KOL agent/MCP 当前刻意没有接入 universe-wide selection。
7. MCP endpoints 当前是 public context endpoints。接入更多外部数据后，需要明确成本、限流、缓存和防滥用边界。

## 设计原则

### 1. Backend-first，不把数据密钥或资产放进 NPM 包

本地 MCP adapter 继续只负责 schema、参数校验、HTTP 转发和错误处理。所有 FMP/FRED/yfinance/tvscreener/Insforge 调用留在 backend。

```text
MCP Client
  -> npx themarketbrew stdio adapter
  -> TheMarketBrew backend
  -> shared/data_tools + stock/macro/screener/report DB
  -> structured data context
  -> Client Agent writes final answer
```

### 2. 粗颗粒 brief 优先，细颗粒工具补充

MCP 不应该一次性暴露 30 个底层 API endpoint，外部 Agent 会更难选择。默认推荐：

- stock 问题先用 `stock_brief`
- 宏观问题先用 `macro_brief`
- 行业问题先用 `industry_brief`
- 同行估值问题先用 `peer_brief`

再用细颗粒 section 获取技术面、新闻、日历、transcript、insider 等补充数据。

### 3. 数据工具和 persona 工具分层

persona/lens 工具回答“这个 persona 怎么看”；data 工具回答“后台当前事实是什么”。最终 context pack 必须区分：

- `methodology_context`
- `kol_chunks`
- `market_context`
- `news_context`
- `data_context`
- `freshness`
- `answer_discipline`

### 4. 所有数据响应统一 envelope

每个 MCP data endpoint 返回统一结构，避免 adapter 和 client agent 针对不同工具写特殊逻辑：

```json
{
  "ok": true,
  "tool": "stock_brief",
  "request": {"symbols": ["NVDA"], "sections": ["quote", "news"]},
  "data": {},
  "errors": [],
  "freshness": {
    "source": "fmp|fred|macro_cache|insforge|mixed",
    "as_of": "2026-06-10T...",
    "cache_policy": "live|ttl|db_only|stale_allowed",
    "is_stale": false
  },
  "limits": {"max_symbols": 10, "trimmed": false},
  "latency_ms": 1234
}
```

### 5. 缺失数据显式返回，不制造假成功

子工具失败时返回 section-level error，不能把错误文本塞进正常数据字段。`get_stock_brief()` 这种 partial-fail 策略保留，但 MCP envelope 要把 section errors 提升到 `errors`。

## 工具面设计

### P0 MCP tools

先新增 5 个工具，覆盖 80% 外部 Agent 需求，同时避免 tool surface 爆炸。

#### `market_lens_data_catalog`

列出所有后台可调用数据能力、section 名称、参数限制、数据源和推荐使用场景。

用途：

- 外部 Agent 不知道该调哪个数据工具时先调用。
- status/debug 时检查生产 backend 支持哪些数据能力。
- 后续新增数据工具时不需要客户端记忆完整清单。

#### `market_lens_get_brief`

统一获取粗颗粒 brief。

Input:

```json
{
  "brief_type": "stock|peer|macro|industry",
  "symbol": "NVDA",
  "symbols": ["NVDA", "AVGO"],
  "include_market_data": true
}
```

后端映射：

- `stock` -> `shared.data_tools.briefs.get_stock_brief`
- `peer` -> `get_peer_brief`
- `macro` -> `get_macro_brief`
- `industry` -> `get_industry_brief`

限制：

- `stock/peer/industry` 需要 symbol。
- `symbols` 多标的只允许 `stock`，P0 上限 5，只并发调用，超出直接 400。
- `macro` 必须 DB-only，不在用户 turn 内穿透 FRED/FMP。

#### `market_lens_get_stock_data`

获取股票细颗粒数据。用于 brief 不够精确时补充。

Input:

```json
{
  "symbol": "NVDA",
  "sections": [
    "quote",
    "profile",
    "fundamentals",
    "forward_valuation",
    "historical_valuation",
    "technical",
    "news",
    "earnings_calendar",
    "price_history",
    "earnings_data",
    "transcript",
    "insider_trading",
    "press_releases",
    "market_overview"
  ],
  "days": 7,
  "history_days": 365,
  "year": 2026,
  "quarter": 1,
  "limit": 30
}
```

后端映射：

- `quote` -> `research_tools.get_stock_quote`
- `profile` -> `get_company_profile`
- `fundamentals` -> `get_stock_fundamentals`
- `forward_valuation` -> `get_forward_valuation`
- `historical_valuation` -> `get_historical_valuation`
- `technical` -> `get_technical_analysis`
- `news` -> `get_stock_news`
- `earnings_calendar` -> symbol-filtered earnings calendar
- `price_history` -> stock service/router 现有历史 OHLCV 路径抽成 service wrapper
- `earnings_data` -> stock service earnings raw data wrapper
- `transcript` -> stock service/FMP transcript wrapper
- `insider_trading` -> stock service/FMP insider wrapper
- `press_releases` -> stock service/FMP press release wrapper
- `market_overview` -> stock market tab KPI wrapper

#### `market_lens_get_market_data`

获取市场、宏观、日历、报告类数据。

Input:

```json
{
  "sections": [
    "market_overview",
    "macro_brief",
    "macro_risk",
    "liquidity",
    "sentiment",
    "economic_calendar",
    "earnings_calendar",
    "morning_report",
    "weekly_report",
    "twitter_digest"
  ],
  "days": 14
}
```

后端映射：

- `market_overview` -> `get_market_overview`
- `macro_brief` -> `briefs.get_macro_brief`
- `macro_risk` -> `get_macro_risk_summary`
- `liquidity` -> `get_liquidity_overview`
- `sentiment` -> `get_market_sentiment`
- `economic_calendar` -> `get_economic_calendar`
- `earnings_calendar` -> `get_earnings_calendar`
- `morning_report` -> `get_morning_report`
- `weekly_report` -> `get_weekly_report`
- `twitter_digest` -> `get_twitter_digest`

#### `market_lens_get_news`

统一新闻入口，避免 stock news、market news、press release、morning report、twitter digest 到处散落。

Input:

```json
{
  "symbols": ["NVDA", "AVGO"],
  "scope": "stock|market|press_releases|twitter_digest|morning_report|all",
  "days": 7,
  "limit": 20
}
```

后端映射：

- `stock` -> FMP ticker news via `get_stock_news`
- `market` -> `shared.data_tools.news.get_combined_market_news`
- `press_releases` -> stock press releases wrapper
- `twitter_digest` -> latest Twitter digest
- `morning_report` -> latest morning report overnight news
- `all` -> 并发聚合并去重

新闻统一输出字段：

```json
{
  "title": "...",
  "symbol": "NVDA",
  "published_at": "...",
  "source": "fmp_ticker|fmp_general|fmp_latest|press_release|twitter_digest|morning_report",
  "url": "...",
  "snippet": "...",
  "related_symbols": [],
  "provenance": {}
}
```

### P1 MCP tools

P1 再补两个能力，避免 P0 把范围拉太大。

#### `market_lens_screen_stocks`

接入 screener 的预设筛选和 custom filter。

Input:

```json
{
  "strategy": "hot_sectors|volume_surge|value_discovery|high_dividend|momentum|oversold_quality|by_sector|custom",
  "sector": "Technology",
  "sort_by": "daily_change",
  "limit": 30,
  "filters": []
}
```

用途：

- 外部 Agent 问“今天哪些票异动”“AI 基建里还有哪些候选”“找一批超跌质量股”。
- 与 persona workflow 分离，默认不让 persona workflow 自动调用，除非用户明确问机会发现/候选池。

#### `market_lens_search_stocks`

接入股票搜索。

Input:

```json
{
  "query": "Nvidia",
  "limit": 8
}
```

用途：

- 外部 Agent 遇到公司名或模糊 ticker 时先解析 symbol。
- 可给 `market_lens_get_stock_data` / workflow 做前置解析。

## 后端设计

### 新模块：`backend/app/features/kol_research/mcp_data.py`

职责：

1. 维护 data tool registry。
2. 统一参数校验、limits、并发控制。
3. 调用 `shared/data_tools`、`stock`、`macro`、`screener` 的现有 service。
4. 把 JSON string tool 输出解析成 dict。
5. 包装统一 response envelope。
6. 汇总 errors/freshness/latency。

建议结构：

```python
DATA_TOOL_REGISTRY = {
    "stock_brief": DataTool(...),
    "stock_quote": DataTool(...),
    "stock_news": DataTool(...),
    ...
}

async def data_catalog() -> dict: ...
async def get_brief(req: McpBriefRequest) -> dict: ...
async def get_stock_data(req: McpStockDataRequest) -> dict: ...
async def get_market_data(req: McpMarketDataRequest) -> dict: ...
async def get_news(req: McpNewsRequest) -> dict: ...
async def screen_stocks(req: McpScreenRequest) -> dict: ...
```

不要从 `backend/app/services/` 或 `backend/app/models/` 导入。只用 `app/features/*` 和 `app/shared/*`。

### Pydantic models

在 `backend/app/features/kol_research/models.py` 增加：

```python
class KolMcpBriefRequest(BaseModel):
    brief_type: Literal["stock", "peer", "macro", "industry"]
    symbol: Optional[str] = Field(default=None, max_length=20)
    symbols: List[str] = Field(default_factory=list, max_length=5)

class KolMcpStockDataRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    sections: List[Literal[...]] = Field(..., min_length=1, max_length=8)
    days: int = Field(default=7, ge=1, le=30)
    history_days: int = Field(default=365, ge=5, le=1825)
    year: Optional[int] = None
    quarter: Optional[int] = Field(default=None, ge=1, le=4)
    limit: int = Field(default=30, ge=1, le=100)

class KolMcpMarketDataRequest(BaseModel):
    sections: List[Literal[...]] = Field(..., min_length=1, max_length=8)
    days: int = Field(default=14, ge=1, le=30)

class KolMcpNewsRequest(BaseModel):
    symbols: List[str] = Field(default_factory=list, max_length=10)
    scope: Literal["stock", "market", "press_releases", "twitter_digest", "morning_report", "all"] = "all"
    days: int = Field(default=7, ge=1, le=30)
    limit: int = Field(default=20, ge=1, le=50)
```

### 新 backend endpoints

放在 `kol_research/router.py` 的 MCP section，保持 public context endpoint 语义，但加 limits。

```text
GET  /api/kol_research/mcp/data/catalog
POST /api/kol_research/mcp/data/brief
POST /api/kol_research/mcp/data/stock
POST /api/kol_research/mcp/data/market
POST /api/kol_research/mcp/data/news
POST /api/kol_research/mcp/data/screener      # P1
POST /api/kol_research/mcp/data/search-stocks # P1
```

这些 endpoint 不需要 persona。它们是 TheMarketBrew data plane，不是 persona material plane。

### workflow/context endpoint 升级

当前 workflow request:

```json
{
  "workflow": "stock_diagnosis",
  "question": "...",
  "ticker": "NVDA",
  "tickers": [],
  "sector": null,
  "evidence_limit": 6,
  "include_market_data": true
}
```

建议扩展为：

```json
{
  "workflow": "stock_diagnosis",
  "question": "...",
  "ticker": "NVDA",
  "tickers": [],
  "sector": null,
  "evidence_limit": 6,
  "include_market_data": true,
  "data_sections": ["stock_brief", "technical", "news", "macro_brief"],
  "news_days": 7
}
```

兼容策略：

- 不传 `data_sections` 时保持当前行为。
- `include_market_data=false` 时不取任何 data sections。
- `data_sections` 只影响 `market_context` / `data_context`，不影响 persona lens selection。

默认 section rule：

| workflow | 默认数据 |
|---|---|
| `stock_diagnosis` | `stock_brief`; 若问题含技术/RSI/MACD/支撑阻力，加 `technical`; 若含最新/新闻/催化，加 `news`; 若含宏观/利率/Fed，加 `macro_brief` |
| `market_regime` | `macro_brief`, `market_overview`, `economic_calendar`; 若问最近发生什么，加 `market_news` |
| `compare` | 每个 ticker 的 `stock_brief`; 如 tickers <= 3 加 `peer_brief` |
| `research_memo` | `stock_brief` 或 `macro_brief` + `news` + `selected_lenses` + evidence |
| `build_context` | 根据 ticker/question 自动判定，默认轻量 |

响应结构中新增：

```json
{
  "data_context": [],
  "news_context": [],
  "data_freshness": {},
  "data_errors": []
}
```

保留现有 `market_context` 以兼容旧 MCP client。

## Adapter 设计

### `mcp/themarketbrew/src/tools.ts`

新增 tool definitions：

- `market_lens_data_catalog`
- `market_lens_get_brief`
- `market_lens_get_stock_data`
- `market_lens_get_market_data`
- `market_lens_get_news`
- P1: `market_lens_screen_stocks`
- P1: `market_lens_search_stocks`

命名继续使用 `market_lens_` 前缀，原因：

1. 保持现有工具命名体系稳定。
2. 避免 MCP client 同时看到 `market_lens_*` 和 `market_data_*` 两套品牌。
3. “lens” 可以理解为 TheMarketBrew 的投研上下文镜头，不只限 persona markdown。

### `mcp/themarketbrew/src/live.ts`

新增函数：

```ts
export async function dataCatalog(args) { ... }
export async function getBrief(args) { ... }
export async function getStockData(args) { ... }
export async function getMarketData(args) { ... }
export async function getNews(args) { ... }
export async function screenStocks(args) { ... }
export async function searchStocks(args) { ... }
```

参数处理规则：

- symbols uppercase + 去重。
- section enum 在 adapter 侧轻校验，后端做强校验。
- days/limit/history_days 做 bounded number。
- 不把 persona 强制要求到 data tools。

### prompts

更新 `src/prompts.ts`：

- stock diagnosis prompt 增加：需要当前事实时先调 `market_lens_get_brief` 或 `market_lens_get_stock_data`。
- topic research prompt 增加：宏观/新闻问题可调 `market_lens_get_market_data` / `market_lens_get_news`。
- 新增 prompt `themarketbrew-news-research` 可选。

## 新闻聚合设计

### 新闻来源

P0 接入：

- FMP ticker news：个股新闻。
- FMP general/latest：市场新闻。
- stock press releases：公司官方新闻稿。
- morning report：盘前隔夜新闻和今日关注。
- twitter digest：KOL 圈热点和 watchpoints。

P1 可接入：

- earnings transcript 摘要/原文。
- daily report 的新闻和事件日历。

### 去重与归因

新闻聚合必须做 source-aware normalization：

```python
dedupe_key = normalized_title[:80] or url_host_path
```

保留字段：

- `source`
- `source_url`
- `published_at`
- `symbol`
- `related_symbols`
- `title`
- `snippet`
- `origin_payload_type`

不返回大段全文。FMP/news/press release 如果有长正文，P0 只返回标题、摘要/snippet、URL 和元数据，避免 token 失控和版权风险。

## 数据限流与成本控制

由于 MCP 面向外部客户端，不能把所有外部 API 当成无限公共接口。

P0 最小控制：

- 每个 request 限制 section 数量。
- stock data 单 symbol。
- brief 多 symbol 上限 5。
- quotes 后续可开放批量上限 20。
- news days 上限 30，默认 7。
- transcript 必须指定 year/quarter，否则返回最近一季或 400，避免多季全文。
- screener P1 单次 limit 上限 50。
- backend 对 FMP/FRED 失败返回 section error，不重试风暴。

P1/P2 控制：

- 按 IP 或 anonymous MCP client 加 slowapi rate limit。
- 可选 `THEMARKETBREW_API_KEY` / user token，用于更高配额。
- usage logging：tool, backend endpoint, symbols, sections, latency, external source touched, success/error。

## 安全与回答纪律

所有 workflow context pack 继续返回 `answer_discipline`：

- 不冒充 persona。
- 历史证据、实时数据、方法论推断分开。
- 不给直接买/卖/加仓/减仓命令。
- 不输出精确目标价。
- 新闻只作为事实输入，不自动推出交易动作。

新增 data discipline：

- 明确 `as_of` 和 `source`。
- stale cache 可以用，但必须标记。
- 某 section 缺失时不能用其他 section 冒充。
- forward valuation 必须标明 FMP fiscal-year EPS estimate 口径，不和 yfinance rolling forwardPE 混用。

## 实施步骤

1. [ ] 新建 `backend/app/features/kol_research/mcp_data.py`，实现 data registry、JSON parsing、统一 envelope、section error 汇总。
2. [ ] 在 `models.py` 增加 MCP data request/response models。
3. [ ] 在 `router.py` 增加 P0 data endpoints：catalog、brief、stock、market、news。
4. [ ] 把 `/personas/{u}/mcp/market-brief` 改为调用 `mcp_data.get_brief()`，保持旧 endpoint 兼容。
5. [ ] 扩展 `/personas/{u}/mcp/context` 和 `/personas/{u}/mcp/workflow`，支持 `data_sections` / `news_days`，并返回 `data_context`、`news_context`、`data_freshness`、`data_errors`。
6. [ ] 在 `mcp/themarketbrew/src/tools.ts` 增加 P0 MCP tool schema。
7. [ ] 在 `mcp/themarketbrew/src/live.ts` 增加 P0 backend client 函数和参数边界处理。
8. [ ] 更新 `src/prompts.ts`，让 stock/topic/news prompt 明确什么时候调用 data tools。
9. [ ] 增加 backend tests：
   - catalog 返回所有 P0 能力。
   - brief endpoint 调用对应 brief function。
   - stock data endpoint section validation。
   - news endpoint 聚合/去重/limit。
   - workflow 默认行为兼容旧请求。
   - workflow 显式 `data_sections` 正确返回 data_context。
   - partial failure 不导致顶层 500。
10. [ ] 增加 MCP adapter smoke tests：
    - `tools/list` 包含新增工具。
    - mocked backend 验证新工具 URL 和 body。
    - 旧 12 个工具继续可用。
    - 不重新暴露 persona-specific aliases。
11. [ ] 更新文档：
    - `mcp/themarketbrew/README.md`
    - `mcp/themarketbrew/.context.md`
    - `docs/reference/market-lens-mcp.md`
    - `backend/app/features/kol_research/.context.md`
12. [ ] P1 接入 screener/search stocks：
    - backend endpoint。
    - adapter tools。
    - tests。
    - 文档。
13. [ ] P2 做访问控制和 usage metering：
    - anonymous/public quota。
    - optional API key。
    - usage logs。
    - production dashboard/alerts。

## 验收标准

P0 完成时应满足：

1. 外部 MCP client 可以直接调用 TheMarketBrew 后台 stock/macro/news/report data，不需要走网站 chat。
2. `market_lens_stock_diagnosis` 等 workflow 在需要当前事实时可以返回明确的 `data_context` / `news_context`，而不是只有少量 `market_context`。
3. 新 data tools 不要求 persona，但可以和 persona workflow 组合使用。
4. 任何 section 失败都以 section error 暴露，顶层不假装成功。
5. 新闻输出有 source/provenance/published_at，不混淆 FMP 新闻、公司 press release、morning report 和 Twitter digest。
6. MCP NPM package 仍不包含 persona distilled assets，也不包含任何 API key。
7. 现有 12 个 `market_lens_*` 工具行为保持兼容。

## 待定问题

1. 新 data tools 是否继续完全 public，还是 P0 就加轻量 API key/rate limit？
2. MCP 工具命名是否坚持 `market_lens_*`，还是把 data plane 命名为 `market_data_*`？
3. transcript 是否 P0 开放？原文可能很长，建议 P0 只开放指定 quarter 且强 limit，或放到 P1。
4. screener 是否应进入 P0？它会把 MCP 从“解释/研究”推进到“选股发现”，建议 P1 再做。
5. 是否要把 daily report 也接入 `market_lens_get_news` / `market_lens_get_market_data`？当前 P0 先接 morning/weekly/twitter digest，daily report 可 P1。

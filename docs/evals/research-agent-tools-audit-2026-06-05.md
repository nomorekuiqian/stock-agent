# Research Agent Tools Audit - 2026-06-05

## Scope

Audited the active Research Agent tool set used by `/api/research/chat` and `/api/research/chat/stream`.

Primary code paths:

- `backend/app/features/screener/research_agent.py`
  - `base_tools` at lines 686-691
  - `get_report_by_date` / `list_recent_reports` at lines 705-772
  - `research_tools` registry at lines 775-781
  - `LlmAgent(... tools=research_tools ...)` at lines 892-902
- `backend/app/shared/data_tools/research_tools.py`
  - agent-facing market, stock, macro, calendar, and report tools
  - `research_data_tools` registry at lines 933-956
- `backend/app/features/screener/agent.py`
  - screener universe tools backed by `_ensure_universe()`

Active count: 24 tools.

- 4 screener universe tools
- 2 recent daily report tools
- 17 `research_data_tools`
- 1 Gemini built-in `GoogleSearchTool`

## Executive Summary

The Research Agent has broad, useful coverage: stock screening, quotes, news, fundamentals, valuation, technicals, macro risk, liquidity, market sentiment, economic calendar, earnings calendar, and generated reports. Most live data tools have a clear primary data source and the sampled values generally match independent or official sources.

The main risk is not raw data availability. The main risk is data contract drift: some tool descriptions and output field names no longer match the underlying services. The most concrete bug found is `get_technical_analysis()` returning `oscillators.macd = null` because it reads `macd`, while `technical.py` exposes `macd_level`. A second important gap is thematic ticker filtering: `filter_by_tickers(["NVDA","AMD","AVGO","MRVL","ARM","TSM","ASML","SMCI"])` dropped `ARM`, `TSM`, and `ASML` because they are not present in the current TradingView universe cache, even though they are major AI/semiconductor names.

## Tool Inventory

| Tool | Purpose | Primary data source | Freshness / cache | Audit notes |
|---|---|---|---|---|
| `execute_screener` | Apply structured filters and return match count plus preview | `screener:universe` Insforge cache populated from `tvscreener` / TradingView | Universe TTL 26h, refreshed after market close | Sample universe size 3,802. Good for broad US-listed screening, but depends on universe coverage and field freshness. |
| `filter_by_tickers` | Match a manually supplied ticker basket against screener universe | Same TradingView universe cache | Same as universe cache | Exact ticker matching is safe, but basket coverage is incomplete if important tickers are absent from universe. Sample missed `ARM`, `TSM`, `ASML`. |
| `get_field_distribution` | Compute numeric/categorical distribution for one field | Same TradingView universe cache | Same as universe cache | Useful for thresholds. Mean can be distorted by outliers: sample `Technology Services pe_ttm` max was 37,300 and mean 253.68 vs median 26.35. |
| `list_available_sectors` | List available sectors and counts | Same TradingView universe cache | Same as universe cache | Sample returned 20 sectors and 3,802 stocks. |
| `get_report_by_date` | Fetch a recent daily report by date from in-memory context | `_recent_reports` ContextVar, preloaded from daily report DB | Per request context; limited to preloaded recent reports | Does not query DB by date. Older reports can appear unavailable even if stored. |
| `list_recent_reports` | Summarize recent daily reports | `_recent_reports` ContextVar, preloaded from daily report DB | Per request context; max 14 days | Good for recent context, but no generated timestamp or raw source provenance in tool output. |
| `get_market_overview` | Major indices, VIX, rates, credit, financials, commodities, DXY | yfinance for indices/VIX/ETFs/DXY; FMP for Treasury and spot commodities; yfinance commodity history fallback | Short memory/vendor caches | Sample matched FMP/yfinance outputs. Mixed sources need explicit provenance per section. |
| `get_stock_quote` | Real-time quote batch, max 20 symbols | FMP `/stable/batch-quote`, fallback `/stable/quote` | 10m in-memory quote cache | AAPL/NVDA sampled prices matched external quotes to 2 decimals. Timestamp is epoch only; output should include ISO timestamp. |
| `get_stock_news` | Recent stock news, top 12 | FMP `/stable/news/stock` | Live FMP request, app-side date filter | Headline/url sampling matched external news aggregators for CNBC. Tool strips publisher/source and text, reducing provenance. |
| `get_technical_analysis` | RSI, MACD, moving averages, support/resistance, derived chart signals | FMP historical EOD + FMP indicators; local MACD/Bollinger/support calculations | 15m in-memory technical cache | Bug: returns `oscillators.macd = null` due field mismatch. Also docstring still says ratings, but `technical.py` sets `ratings = {}`. |
| `get_stock_fundamentals` | Valuation, profitability, growth, balance sheet, analyst targets | yfinance `Ticker.info` via `yfinance_service` | yfinance service cache | SEC cross-check matched revenue and net income growth; cash/debt matched SEC when using Yahoo's broader cash/debt definitions. Field labels need units/definitions. |
| `get_forward_valuation` | Fiscal-year forward P/E with explicit EPS estimates | FMP quote + FMP `/stable/analyst-estimates` | FMP quote cache plus live analyst estimates | Good design: avoids mixing Yahoo rolling forwardPE with fiscal-year estimates. |
| `get_earnings_calendar` | Upcoming major-company earnings | FMP `/stable/earnings-calendar`, filtered to a hardcoded major ticker list | Live FMP request | Oracle June 10 sample matched Oracle investor relations. Filter excludes smaller names by design. |
| `get_company_profile` | Company description, sector, industry, CEO, employees | FMP `/stable/profile` | Live FMP request | AAPL profile matched expected company metadata. Description truncates to 500 chars. |
| `get_peer_comparison` | Peers plus comparative valuation/profitability metrics | FMP `/stable/stock-peers` and FMP TTM ratios/key metrics | 10m metrics cache for key metrics | Peer set quality is vendor-dependent; no peer-selection rationale returned. |
| `get_historical_valuation` | Annual historical valuation trend | FMP `/stable/ratios` | Live FMP request | Useful for trend context. Needs period/date labels preserved in agent response. |
| `get_macro_risk_summary` | Composite macro risk and category scores | Project macro risk service: FRED series, yfinance AI basket, liquidity service, computed scores | Memory + DB cache | Good aggregation, but returns derived score without raw indicator evidence. |
| `get_liquidity_overview` | Fed liquidity metrics and net liquidity | FRED: `WALCL`, `WDTGAL`, `RRPONTSYD`, `WRESBAL`, `SOFR`, `EFFR`, `NFCI` | 30m memory, DB series cache up to 26h for larger fetches | Official FRED cross-check matched exactly. |
| `get_market_sentiment` | CNN Fear & Greed and volatility summary | CNN graphdata endpoint plus yfinance `^VIX`, `^VVIX`, `^SKEW` | Memory + DB cache | Sample CNN score 54.6857 matched tool output 54.7. Tool summary hides individual CNN component values. |
| `get_economic_calendar` | Upcoming high-impact US economic events | FMP `/stable/economic-calendar`, filtered to US high impact | Live FMP request | NFP and CPI schedule samples matched public calendars. Event time is UTC-like string; output should state timezone. |
| `get_morning_report` | Latest pre-market report summary | Insforge morning report table via `get_latest_morning_report()` | Latest generated report | Reads generated report, not raw live data. Needs generated_at and source summary in output. |
| `get_weekly_report` | Latest weekly macro report summary | Insforge weekly macro report table | Latest generated report | Good for narrative. Needs raw source coverage and staleness metadata. |
| `get_twitter_digest` | Latest KOL Twitter/X digest | Insforge Twitter digest table generated by KOL pipeline | Latest generated digest | Correctly preferred over web search for KOL questions. Needs tweet/source IDs or evidence links in tool output. |
| `google_search` | Fallback web search for questions not covered by structured tools | Gemini built-in Google Search | Live; capped per turn by `AGENT_RUNTIME_MAX_GOOGLE_SEARCH_PER_TURN` | Useful fallback, but final answer should cite URLs from search results. |

## Validation Samples

Validation timestamp: 2026-06-05 around 01:50 PT. Live market values can move; quote checks below use close/last values visible at that time.

### 1. Quotes: FMP vs external market pages

Tool call: `get_stock_quote(["AAPL", "NVDA"])`.

| Symbol | Tool value | External check | Result |
|---|---:|---:|---|
| AAPL close/last | 311.23 | TECHi historical row for 2026-06-04: close 311.23 | Match to 2 decimals |
| AAPL previous close | 310.26 | TECHi 2026-06-03 close 310.26 | Match |
| AAPL volume | 37,097,099 | TECHi / yfinance row: 37,124,759 | 0.07% difference, acceptable vendor timing/volume aggregation drift |
| NVDA close/last | 218.66 | MarketBeat page: 218.66, +3.91 (+1.82%) | Match |
| NVDA daily change % | 1.82072 | MarketBeat: +1.82% | Match |
| NVDA volume | 167.7M | MarketBeat: 168.18M shares | 0.28% difference, acceptable vendor timing/rounding drift |

Sources:

- AAPL historical row from TECHi: https://www.techi.com/quote/AAPL/historical/
- NVDA quote from MarketBeat: https://www.marketbeat.com/stocks/NASDAQ/NVDA/
- MacroTrends also showed NVDA 2026-06-04 price 218.66 and P/E 33.49: https://www.macrotrends.net/stocks/charts/NVDA/nvidia/pe-ratio

### 2. AAPL fundamentals: yfinance snapshot vs SEC Company Facts

Tool call: `get_stock_fundamentals("AAPL")`.

Tool returned:

- `revenue_yoy = 16.6`
- `earnings_yoy = 19.4`
- `total_cash = 68,507,000,832`
- `total_debt = 84,710,998,016`

SEC Company Facts cross-check:

- Revenue, 2026 Q1: 111.184B; 2025 Q1: 95.359B. Growth: `(111.184 - 95.359) / 95.359 = 16.59%`, matching tool `16.6`.
- Net income, 2026 Q1: 29.578B; 2025 Q1: 24.780B. Growth: `19.36%`, matching tool `19.4`.
- Cash and equivalents, 2026 Q1: 45.572B; current marketable securities: 22.935B. Sum: 68.507B, matching tool `total_cash`.
- Long-term debt current + noncurrent: 8.310B + 74.404B = 82.714B. Commercial paper: 1.997B. Sum: 84.711B, matching tool `total_debt`.

Conclusion: values are accurate, but `total_cash` should be relabeled as cash plus short-term investments or returned with a definition.

Source:

- SEC Company Facts API for Apple CIK 0000320193: https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json

### 3. Liquidity: tool vs official FRED

Tool call: `get_liquidity_overview()`.

| Series | Tool value | Official FRED value | Result |
|---|---:|---:|---|
| Fed assets `WALCL` | 6,711,495, date 2026-06-03 | 6,711,495 million USD | Exact |
| TGA `WDTGAL` | 845,722, date 2026-06-03 | 845,722 million USD | Exact |
| ON RRP `RRPONTSYD` | 1.122, date 2026-06-04 | 1.122 billion USD | Exact |
| SOFR | 3.61, date 2026-06-03 | 3.61% | Exact |
| NFCI | -0.494, date 2026-05-29 | -0.494 | Exact |
| Net liquidity | 5,864.651B | `6711.495 - 845.722 - 1.122 = 5864.651B` | Exact |

Sources:

- FRED WALCL: https://fred.stlouisfed.org/series/WALCL
- FRED WDTGAL: https://fred.stlouisfed.org/series/WDTGAL
- FRED RRPONTSYD: https://fred.stlouisfed.org/series/RRPONTSYD
- FRED SOFR: https://fred.stlouisfed.org/series/SOFR
- FRED NFCI: https://fred.stlouisfed.org/series/NFCI

### 4. Sentiment: tool vs CNN data endpoint

Tool call: `get_market_sentiment()`.

- Tool output: `overall_score = 54.7`, `overall_level = medium`, headline "中性 (55/100)".
- Direct CNN graphdata output: `score = 54.6857142857143`, `rating = neutral`, timestamp `2026-06-05T00:00:00+00:00`.

Result: exact after rounding.

Sources:

- CNN Fear & Greed page: https://www.cnn.com/markets/fear-and-greed
- CNN graphdata endpoint used by service: https://production.dataviz.cnn.io/index/fearandgreed/graphdata

### 5. Calendar and earnings

Tool calls:

- `get_economic_calendar(14)`
- `get_earnings_calendar(30)`

Findings:

- FMP economic calendar listed May nonfarm payrolls and unemployment at `2026-06-05 12:30:00`, which corresponds to 8:30 AM ET. Public calendars also show the May jobs report release on Friday, June 5 at 8:30 AM ET.
- FMP earnings calendar listed ORCL on 2026-06-10. Oracle investor relations confirms Q4 FY2026 results will be released Wednesday, June 10, after market close.

Sources:

- BLS Employment Situation schedule: https://www.bls.gov/schedule/news_release/empsit.htm
- Kiplinger jobs report preview: https://www.kiplinger.com/investing/economy/jobs-report-may-2026-what-to-expect
- Oracle investor relations announcement: https://investor.oracle.com/investor-news/news-details/2026/Oracle-Sets-the-Date-for-its-Fourth-Quarter-Fiscal-Year-2026-Earnings-Announcement/default.aspx

### 6. Screener universe and theme filter

Tool calls:

- `list_available_sectors()`: 20 sectors, 3,802 total stocks.
- `get_field_distribution("pe_ttm", "Technology Services")`: 392 stocks, 215 with non-null PE, median 26.35, max 37,300.
- `filter_by_tickers(["NVDA","AMD","AVGO","MRVL","ARM","TSM","ASML","SMCI"])`: 5 matches, `not_in_universe = ["ARM","ASML","TSM"]`.

Result: the screener universe is usable and internally consistent, but it is not complete enough for all common thematic baskets. The agent instruction tells the model to be exhaustive for themes, yet the tool silently drops absent symbols except for the `not_in_universe` field.

## Issues Found

### High Priority

1. `get_technical_analysis()` returns `oscillators.macd = null`.
   - Cause: `research_tools.py` reads `data["oscillators"]["macd"]`, but `technical.py` emits `macd_level`.
   - Evidence: sample AAPL returned `macd = null`, `macd_signal = 9.6275`, `macd_histogram = -0.4736`.
   - Fix: map `macd` to `macd_level`, or return both `macd` and `macd_level`. Add a unit test that asserts MACD current, signal, and histogram are all present when FMP data is available or mocked.

2. Technical ratings contract is stale.
   - `get_technical_analysis()` docstring promises daily/weekly ratings, but `technical.py` sets `ratings = {}` because tvscreener ratings were removed.
   - Fix: either compute a local rating from derived signals or remove rating claims from the tool description and UI labels.

3. Thematic ticker filtering misses important ADR/foreign-listed names.
   - Sample AI-chip basket missed `ARM`, `TSM`, and `ASML`.
   - Fix options:
     - Add an FMP quote/profile fallback for `not_in_universe` tickers and return them as a separate `external_matches` bucket.
     - Expand the screener universe inclusion rules for US-listed ADRs and foreign ordinary shares where they are investable on NYSE/Nasdaq.
     - Force the agent to mention `not_in_universe` when non-empty.

4. Tool outputs lack a uniform provenance contract.
   - Some outputs include `source`, others omit it after trimming. News strips publisher/source; report tools do not return `generated_at`, `source_count`, or raw evidence links; Google search provenance is model-mediated.
   - Fix: every tool should return `source`, `as_of`, `vendor_timestamp`, `cache_status`, and a compact `provenance` array.

### Medium Priority

5. `get_report_by_date()` is limited to preloaded recent reports.
   - It should query daily report DB by date on miss, or be renamed to `get_recent_report_by_date`.

6. Field semantics are not explicit enough for financial metrics.
   - `total_cash` actually matched SEC cash plus current marketable securities.
   - `roe`, `roa`, margins, and growth are converted to percent in `research_tools.py`, while other fields remain ratios.
   - Fix: define a shared metric schema with `unit`, `scale`, `period`, `source`, and `definition`.

7. Screener distribution statistics are sensitive to outliers.
   - PE mean is not useful with extreme vendor values.
   - Fix: return percentile bands, trimmed mean, and count of extreme values; down-rank mean in the prompt.

8. FMP-only tools need structured fallbacks and error classification.
   - Quote/news/calendar/profile/peer/valuation tools depend heavily on FMP.
   - Fix: return `status`, `error_code`, `retryable`, and fallback source status so the agent can say "需要补充" accurately.

9. Generated report tools hide upstream evidence.
   - Morning, weekly, and Twitter digest tools return synthesized narratives. They do not expose raw input coverage or citations.
   - Fix: include source counts and stable references to report artifacts or evidence chunks.

### Low Priority

10. Documentation drift in `backend/app/features/screener/.context.md`.
    - The `agent.py` section still emphasizes 3 FunctionTools; current Research Agent registers 24 tools and includes `filter_by_tickers`.
    - Fix: update the context doc after tool fixes.

11. Timezone labeling is inconsistent.
    - FMP economic calendar returns strings like `2026-06-05 12:30:00`; the agent should know this is UTC if that is the intended interpretation.
    - Fix: normalize to ISO timestamps with timezone and a display timezone.

12. Tool exception logging often uses `logger.error` instead of `logger.exception`.
    - Fix: use `logger.exception` in tool catch blocks where traceback matters.

## Improvement Plan

### P0 - Correctness fixes

1. Fix `get_technical_analysis()` MACD mapping and update/remove stale rating fields.
2. Add a unit test for the research technical summary contract.
3. Add a `not_in_universe` handling rule to the Research Agent prompt and frontend display.
4. Decide whether screener universe should include US-listed ADRs like `TSM`, `ASML`, and `ARM`; if not, add FMP-backed `external_matches`.

### P1 - Provenance and schema

1. Create a shared tool response envelope:
   - `status`
   - `data`
   - `source`
   - `as_of`
   - `cache`
   - `provenance`
   - `warnings`
2. Add metric definitions for quote, fundamentals, valuation, technical, and macro fields.
3. Return source links for news and generated report evidence.
4. Normalize all tool timestamps to ISO 8601 with timezone.

### P2 - Automated data quality checks

1. Add a nightly audit script for fixed symbols (`AAPL`, `NVDA`, `ORCL`, `JPM`) comparing:
   - FMP quotes vs yfinance/market data fallback
   - yfinance fundamentals vs SEC Company Facts for revenue/net income/cash/debt
   - FRED liquidity values vs official FRED API
   - CNN Fear & Greed score vs graphdata
2. Store audit outputs under `docs/evals/` or a DB table for trend tracking.
3. Fail CI only on deterministic contract tests; keep live-vendor checks as scheduled observability, not PR-blocking tests.

### P3 - Agent behavior and UX

1. Teach the agent to state freshness: "截至 2026-06-04 收盘" or "FRED 2026-06-03".
2. Require the agent to mention missing universe coverage when recommending from thematic baskets.
3. For claims sourced from `google_search`, require visible citations in the answer.
4. Add a compact "data status" panel for source, timestamp, and stale/fallback warnings.

## Commands Run

Manual verification commands:

- Direct async calls to `research_tools` with `.env` loaded.
- Direct calls to screener tools against `_load_universe()`.
- Direct FRED API `series/observations` checks for `WALCL`, `WDTGAL`, `RRPONTSYD`, `WRESBAL`, `SOFR`, `EFFR`, and `NFCI`.
- Direct SEC Company Facts query for Apple CIK `0000320193`.
- Direct CNN graphdata request with browser headers.
- Web checks for AAPL/NVDA quote pages, FRED series pages, BLS schedule, and Oracle investor relations.

No code was changed as part of this audit.

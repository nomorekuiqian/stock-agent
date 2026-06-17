# AI Watchlist Monitor Audit - 2026-06-16

## Scope

Audit target: `/for-you/monitor` AI Watchlist Monitor.

Test account watchlist:

- AAPL
- MSFT
- GOOGL
- AMZN
- META
- NVDA
- TSLA

Baseline snapshot: `docs/evals/watchlist-monitor/baseline-2026-06-16.json`.

Audit standard from retail-investor perspective:

1. Can the user immediately know what event or signal matters for each stock today?
2. Can the user understand why it matters?
3. Can the user understand what to watch next?

## Baseline Findings

Overall baseline score: 6/10.

The product direction is right, but the current output is not reliable enough as a daily monitor. The strongest output is META, which has current news, technical context, and follow-up watchpoints. Most other tickers are weaker because stale cached briefs are shown as fresh daily content, and old v0 rows have empty `news_summary`, weak or missing `technical_monitor`, and sparse `event_candidates`.

### P0 - Stale Briefs Are Shown As Fresh

At `2026-06-16T23:05:35Z`, the monitor response reported:

- `stale_tickers: 0`
- `needs_attention: 2`
- `new_signals: 21`

But five tickers were still generated on 2026-06-15:

| Ticker | Baseline Generated At | Baseline Headline |
| --- | --- | --- |
| NVDA | 2026-06-15T20:54:10Z | 英伟达计划发债200亿美元引多空辩论，大盘回暖收涨3.54% |
| TSLA | 2026-06-15T20:54:33Z | 市场热议 SpaceX 与特斯拉合并传闻；技术面呈现区间震荡 |
| AMZN | 2026-06-15T20:53:38Z | 股价反弹3%但仍受制于短期均线，关注Anthropic监管风险及周三联储决议 |
| GOOGL | 2026-06-15T20:53:04Z | 谷歌收涨2.69%，15亿美元数据中心扩建及AI诉讼引发关注 |
| MSFT | 2026-06-15T20:52:47Z | 股价企稳于关键支撑位上方，面临律所集体诉讼与美联储宏观决议考验 |

This directly breaks the promise of "today's signal". The read path marks a row stale only when `status == "stale"`, instead of comparing `brief_date` to the current market date.

### P0 - Old V0 Rows Produce Incomplete Workbench Content

V0 rows often have:

- Empty `news_summary`.
- Empty or missing `technical_monitor.summary`.
- Empty `event_candidates`.
- Priority scores close to 100 despite missing the core workbench fields.

This makes the page look confident while the supporting content is thin.

### P1 - Social Discussion Has Better Same-Day Signals But Is Not Integrated Into The Main Brief

The Twitter/KOL discussion endpoint found more current signals than the cached brief for several tickers:

- TSLA: FSD safety-data regulatory review, Goldman raising Q2 delivery forecast, SpaceX options flow.
- MSFT: Copilot pricing, possible DeepSeek cost angle, Oracle cloud-infrastructure negotiation failure.
- AMZN: AI capex/free-cash-flow debate and SpaceX valuation comparisons.

These are useful for a retail user, but the main `ai_take` still shows older cached content. The first screen therefore misses or underweights the newest discussion.

### P1 - Some Copy Slips Into Trading Advice

Examples:

- "不宜盲目追高"
- "建议投资者关注..."

The monitor should avoid action advice. It should use observation language:

- "后续观察 X 是否确认"
- "如果 Y 失效，说明 Z 风险升高"
- "重点看 A/B/C 三个验证点"

### P1 - Macro Events Are Too Generic Across Tickers

FOMC is a valid event for 2026-06-17 and relevant to growth stocks, but the impact should be ticker-specific:

- NVDA: bond pricing, AI capex financing, duration-sensitive valuation.
- TSLA: risk appetite, financing costs, delivery/robotaxi optionality.
- META: ad-growth expectations and AI monetization multiple.
- AAPL/MSFT/GOOGL/AMZN: different combinations of hardware demand, cloud capex, AI monetization, and buyback/capital allocation.

## Per-Ticker Baseline Scores

| Ticker | Score | Notes |
| --- | --- | --- |
| META | B+ | Best current output. Covers AI search, Threads 500M MAU, institution split, technical risk. Needs less repetitive technical copy and more ticker-specific FOMC impact. |
| NVDA | B-/C | Bond issuance is a high-value signal and factually useful, but stale row says "today" based on 2026-06-15. |
| TSLA | C+ | Main brief overweights SpaceX merger rumor; same-day social discussion has better FSD and delivery signals. |
| AMZN | C+ | Anthropic regulatory issue is relevant, but stale and missing structured news/technical/event content. |
| GOOGL | B- | Useful infrastructure and AI/legal signals, but missing news summary and technical detail in old row. |
| MSFT | C | Lawsuit noise is overweighted; current Copilot/cloud-infrastructure discussion is more useful. Contains advice-like copy. |
| AAPL | B- | Technical explanation is usable; company-specific news flow is weak and mostly broad mega-cap/AI framing. |

## Pipeline Changes Requested By This Audit

1. Mark rows stale when `brief_date != market_today_str()`, not only when `status == "stale"`.
2. Prevent stale rows from counting as fresh priority items/signals/watchpoints.
3. Add a minimum display-quality gate for generated rows:
   - `ai_take` must answer signal, impact, and next watch.
   - `news_summary` should be present when there are news sources.
   - Current v1 rows should include `technical_monitor.summary` and `technical_monitor.technical_view.verdict` when technical data is available.
   - Ban action-advice phrases.
4. Tighten the final brief prompt so `ai_take` uses a three-part structure inside one paragraph:
   - `今日信号`
   - `影响`
   - `接下来`
5. Make macro impact ticker-specific and avoid repeating the same generic FOMC copy for every ticker.
6. Keep market discussion as evidence, but avoid running heavy LLM work on every tab switch unless cached or precomputed.

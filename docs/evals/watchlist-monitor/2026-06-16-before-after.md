# AI Watchlist Monitor Before/After - 2026-06-16

## Files

- Audit report: `docs/evals/watchlist-monitor/2026-06-16-ai-monitor-audit.md`
- Baseline snapshot: `docs/evals/watchlist-monitor/baseline-2026-06-16.json`
- After snapshot: `docs/evals/watchlist-monitor/after-2026-06-16.json`
- Machine comparison: `docs/evals/watchlist-monitor/comparison-2026-06-16.json`

## Pipeline Changes Applied

1. Freshness enforcement:
   - Cached briefs are now treated as stale when `brief_date != market_today_str()`.
   - Stale rows no longer contribute to priority items, new signal counts, future events, or freshness.

2. Quality gate:
   - `ai_take` must clearly answer today's signal, impact, and next watch.
   - Rows with news sources must have non-empty `news_summary`.
   - Rows with technical sources must have `technical_monitor.summary` and `technical_view.verdict`.
   - Direct action-advice phrasing is rejected, while factual ratings or named investor actions are still allowed.

3. LLM pipeline resilience:
   - News/events synthesis gets a larger token budget.
   - News/events, technical, market discussion, and final brief subtasks now have explicit timeouts.
   - News synthesis has a deterministic Chinese fallback when JSON generation fails or returns an English summary.
   - Final brief has a deterministic fallback based on collected news, technical, social, and event inputs.

4. Final brief prompt:
   - `ai_take` now uses the rhythm: `今日信号是...；影响在于...；接下来重点看...`.
   - Macro events must be tied to ticker-specific impact rather than repeated as generic FOMC copy.

5. Frontend request behavior:
   - Twitter/KOL discussion is fetched only when the user opens the `市场讨论` tab, not on every ticker selection.

## Summary Comparison

| Metric | Baseline | After |
| --- | ---: | ---: |
| `stale_tickers` | 0 | 0 |
| `needs_attention` | 2 | 1 |
| `new_signals` | 21 | 20 |
| `next_7d_watchpoints` | 3 | 7 |

Important note: the baseline `stale_tickers=0` was misleading because older 2026-06-15 briefs were shown as fresh. After the freshness fix, before regeneration the same read path showed six stale rows. After forced regeneration, all seven rows are fresh 2026-06-16 rows.

## Per-Ticker Comparison

| Ticker | Baseline Issue | After Result |
| --- | --- | --- |
| AAPL | Broad mega-cap/AI framing; no clear three-part structure. | Fresh row. Explains relative strength in a weak tech tape, AI hardware rumors, iCloud/DMA regulatory risk, FOMC sensitivity, and MA20 confirmation. |
| MSFT | Overweighted lawsuit noise; missing news summary and technical workbench content. | Fresh row. Surfaces Copilot usage pricing, Oracle cloud talks collapse, legal risk, support level, and AI cost-structure debate. |
| GOOGL | Missing news summary and future-event structure. | Fresh row. Connects AI/cloud product progress, HSBC/Android/Gemini items, FOMC valuation sensitivity, and technical resistance. |
| AMZN | Stale row with sparse details. | Fresh row. Covers FTC ad lawsuit risk, AWS Summit, Prime Day, SpaceX valuation context, and resistance level. |
| META | Best baseline row, but lacked the required three-part top-line structure. | Fresh row. Keeps AI ads/Threads/competition points, adds explicit impact and next-watch framing. |
| NVDA | Stale bond-sale row; no current technical/news detail. | Fresh row. Captures 50-day MA break, AI debt/capex risk, FOMC sensitivity, manufacturing narrative, and dividend event. |
| TSLA | Overfocused on SpaceX merger rumor. | Fresh row. Elevates FSD regulatory review, AI5 progress, FOMC sensitivity, and support/resistance levels. |

## Mechanical Quality Checks

After snapshot:

- 7/7 rows have non-empty `news_summary`.
- 7/7 rows have non-empty `technical_monitor.summary`.
- 7/7 rows have non-empty `technical_view.verdict`.
- 7/7 rows have `ai_take` containing all three concepts: `今日信号`, `影响`, `接下来`.
- 0/7 rows are stale after forced regeneration.

## Remaining Product Risks

1. The deterministic fallback is intentionally conservative. It keeps the pipeline reliable, but it is less nuanced than a successful LLM synthesis.
2. Social discussion is still separate from the cached ticker brief unless it appears in the generation-time `twitter_digest` input. The tab is better behaved now, but deeper unification would require precomputing ticker discussion summaries into the daily brief.
3. Some rows still have high priority scores clustered near 100. A future pass should recalibrate scoring so "needs attention" and "watch" separate more clearly.

# Daily Report Optimization Plan

## Background

Based on user feedback on the current daily market report, we identified several key issues and designed an optimization plan.

## Current Issues

### 1. Macro Section Not Useful
- **Problem**: The standalone macro section (3 signal cards + technical analysis) is too academic for retail investors. Most users skip it.
- **Root cause**: Macro environment doesn't change daily; jargon-heavy format doesn't translate to actionable insights.
- **Solution**: Remove the independent macro section. Weave macro context into the report narrative (report_summary paragraph 2) using plain language. Leverage the weekly macro report as the primary macro context source.

### 2. Lack of Narrative Continuity
- **Problem**: Each report is generated independently. The tone chases daily sentiment - euphoric on up days, apocalyptic on down days. No reference to previous reports.
- **Evidence** (2026-02-02 to 2026-02-06):
  - 2/2: "2 月开门红" (bullish)
  - 2/3: "科技股重挫" (bearish)
  - 2/4: "巨震" (bearish)
  - 2/5: "黑色星期四", "极度谨慎" (apocalyptic)
  - 2/6: "反转大戏", "历史性突破" (euphoric)
- **Root cause**: Agent has zero memory of previous reports.
- **Solution**: Feed past 5 trading days' reports (title + report_summary) as context. Add prompt rules for continuity and emotional calibration.

### 3. Lack of Actionability
- **Problem**: Users read the report but don't know what it means for their portfolio or what they should do. Current advice like "short-term, watch $WDC and $MU" is too vague to act on.
- **Root cause**: The prompt produces "recommendation-style" output (watch X, consider Y) instead of "decision framework" output.
- **Research findings** (Brew Markets, LevelFields, InvestorHub):
  - Best non-personalized newsletters use **"awareness rather than directives"** (Brew Markets)
  - Event-driven frameworks (**"event → historical pattern → likely outcome"**) work for all investor types (LevelFields)
  - Retail investors want **"step-by-step guidance on specific strategies"**, not vague recommendations (InvestorHub)
- **Solution**: Replace vague recommendations with **scenario-based frameworks** that serve all investor types:
  - **Scenario thinking**: "If CPI < 2.5% → rate cut expectations rise → growth stocks benefit. If CPI > 3% → high-PE names sell off first"
  - **Concrete anchors**: Price levels and trigger conditions ("$AMZN at $200 support is the key signal")
  - **Time-bound**: "Before Wednesday's CPI" instead of "short-term"
  - **Causal chains**: Event → impact path → outcome for every suggestion

### 4. Incomplete News Coverage for Geopolitical Events
- **Problem**: Current news sources (FMP ticker-based + general-latest) may miss major geopolitical/macro events. General news limit is only 30.
- **Solution**: Increase limits and add a third source (stock-latest).

## Design Principles (First Principles)

A retail investor opening the daily report is looking for:

1. **Understanding**: "Help me make sense of what happened." Not raw data, but INTERPRETATION.
2. **Context**: "Where does today fit in the bigger picture?" Is this normal or should I worry?
3. **Actionability**: "Is there anything I should do or watch for?"
4. **Emotional grounding**: Counteract the natural human tendency to panic sell or FOMO buy.
5. **Macro relevance**: "What does the macro environment mean for MY portfolio?" (in plain language)

## New Report Structure

| Section | Description |
|---------|-------------|
| title | One opinionated sentence capturing today's story (15-30 chars) |
| summary | 2-3 sentences for list preview (50-100 chars) |
| intro | Hook + yesterday callback + today's preview |
| news.headlines | 2-4 deep-dive news items (including geo/macro when relevant) |
| news.briefs | 8-12 quick-hit news items |
| report_summary | 3 paragraphs: recap, why (with macro context), outlook (with actionability) |
| calendar | 5-10 upcoming events |

**Removed**: Independent `macro` section (MacroSection with signals + summary)

**Key change**: Macro insights are woven into `report_summary` paragraph 2 and `intro`, using plain language translated from the weekly macro report context.

## Context Architecture

```
Weekly Macro Report (deep analysis, once/week)
        |
        v
Daily Report Agent receives:
  1. market_data (VIX, rates, indices, etc.) -- real-time numbers
  2. news (ticker + general + stock-latest, ~90 articles) -- today's events
  3. economic_calendar + earnings_calendar -- upcoming events
  4. previous_reports (past 5 trading days: title + report_summary) -- continuity
  5. weekly_macro_context (latest weekly report summary) -- macro backdrop
```

## Implementation Tasks

### Task 1: Remove macro section from schema
- Remove `MacroSection`, `MacroSignal` from `models.py`
- Remove `macro` field from `MarketReportOutput`
- Remove macro-related prompt instructions from `agent.py`
- Remove macro from `db.py` save/return and `router.py` response
- Macro data still passed as agent input (numbers), just not output as separate section

### Task 2: Add past 5 days report context to agent input
- In `MarketAgent.analyze()`, fetch past 5 trading days' reports from DB
- Use `list_reports(limit=5)` or similar query
- Pass as `previous_reports` field: `[{date, title, report_summary}, ...]`
- Ordered from oldest to newest for natural reading flow
- Token budget: ~2500 chars (manageable)

### Task 3: Add weekly report context to agent input
- Fetch latest weekly macro report from DB
- Pass as `weekly_macro_context` field to agent
- **Blocked by**: Weekly report module completion + Task 1
- Can add placeholder in code first

### Task 4: Increase news source coverage
- `general-latest` limit: 30 -> 50
- Add `get_latest_news(limit=30)` as third source in `get_combined_market_news()`
- Total news to agent: 70 -> 90
- Prompt: prioritize geopolitical/macro news in headlines

### Task 5: Rewrite agent prompt
- **Continuity**: Reference previous_reports, track multi-day themes, acknowledge when past outlook was wrong
- **Emotional calibration**: On up days mention risks, on down days provide perspective. Never chase sentiment.
- **Macro in plain language**: Use weekly_macro_context, translate jargon to portfolio impact
- **Actionability (scenario-based frameworks)**:
  - report_summary paragraph 3 must use "if A then B, if C then D" scenario format
  - Every mentioned ticker must have a price level or trigger condition attached
  - Time frames must be specific ("before Wednesday CPI", not "short-term")
  - Every suggestion needs a complete causal chain (event → impact path → outcome)
  - Goal: give readers a thinking framework, not recommendations
- **Geopolitical priority**: Major geo/macro events must appear in headlines
- **Intro callback**: Brief reference to yesterday's key point
- **Blocked by**: Tasks 1, 2, 4

### Task Dependencies
```
Task 1 (remove macro) ──┐
Task 2 (past 5 days)  ──┼──> Task 5 (prompt rewrite)
Task 4 (news sources)  ─┘
Task 1 (remove macro) ──> Task 3 (weekly context)
```

## Files to Modify

| File | Changes |
|------|---------|
| `backend/app/features/market/models.py` | Remove MacroSection, MacroSignal; remove macro from MarketReportOutput |
| `backend/app/features/market/agent.py` | Update ANALYST_INSTRUCTION; add previous reports + weekly context fetching in analyze() |
| `backend/app/features/market/db.py` | No structural changes needed (list_reports already exists) |
| `backend/app/features/market/router.py` | Remove macro from response; keep market_data passthrough |
| `backend/app/shared/data_tools/news.py` | Add stock-latest source; increase limits |
| `frontend/` | Remove macro section rendering (separate frontend task) |

## Actionability Design: Scenario-Based Frameworks

### Problem
Generic advice ("watch $WDC") doesn't serve any investor type well because:
- Day traders need key levels and catalyst timing
- Long-term holders need macro scenario impact on portfolio
- Sector-focused investors need sector-specific cause-and-effect

### Solution: Decision Frameworks Instead of Recommendations

**Bad** (current):
> "短期建议关注受益于AI基建的存储链如 $WDC 和 $MU"

**Good** (scenario-based):
> "下周关键变量是周三的 CPI 数据：
> - 如果 CPI < 2.5%：降息预期升温，成长股尤其是 AI 链（$NVDA, $SMCI）可能继续反弹，美元走弱则利好中概股
> - 如果 CPI > 3%：利率预期上修，高 PE 个股首当其冲，资金可能继续流向防御板块
>
> 短期关注 $AMZN 在 200 美元附近的支撑——这是判断市场是否消化了 AI 开支恐慌的关键信号。"

### Why This Works for All Investor Types
| Investor Type | What They Extract |
|--------------|-------------------|
| Day trader | Key levels ($AMZN $200), catalyst timing (Wednesday CPI) |
| Long-term holder | Macro scenario impact, whether to adjust allocation |
| Sector-focused | Their sector's outlook under each scenario |
| Passive indexer | Whether to stay calm or consider hedging |

### Prompt Rules for Actionability
1. Every outlook paragraph must contain at least one "if X then Y" scenario
2. Every mentioned ticker must have a price level or trigger condition
3. Time frames must be specific (dates, not "short-term")
4. Every suggestion needs a causal chain (event → mechanism → outcome)
5. Reference the calendar: tie scenarios to upcoming events

## Success Criteria

1. Report narrative naturally references previous days ("as we noted Tuesday..." or "contrary to our Thursday outlook...")
2. Macro context appears in report_summary in plain language, not as a standalone technical section
3. On volatile days, tone remains analytical rather than emotional
4. Outlook paragraph contains specific scenarios with trigger conditions, not vague recommendations
5. Geopolitical events surface in headlines when relevant

# Response Contract

This contract defines the answer shape expected from a retail-useful KOL research agent.

## Default Response Shape

For ordinary stock questions:

```text
一句话结论：
证据等级：
散户姿态：

为什么值得研究：
现在最大的问题：
接下来盯什么：
什么情况说明我错了：
仓位提醒：
```

## Field Definitions

### 一句话结论

One sentence that gives posture and uncertainty.

Good:

"MRVL 值得进入 AI 基建观察池，但因为没有直接历史覆盖，散户默认不该追高，应该等下一次财报验证 custom silicon 和光互连增长。"

Bad:

"MRVL 是 AI 算力链无法忽视的卡脖子标的。"

### 证据等级

Must state:

- Direct historical coverage: yes / no.
- Adjacent KOL evidence: yes / no.
- Current company data: sufficient / partial / missing.
- Confidence: high / medium / low.

### 散户姿态

Must be one of:

- Avoid.
- Watch.
- Hold.
- Small satellite.
- Add only on pullback.
- Reduce risk.

Do not use "buy" as the default label.

### 为什么值得研究

Explain the industry logic in concise terms. This section can use the KOL lens.

### 现在最大的问题

Every answer needs a friction point:

- Valuation already high.
- Guide bar too high.
- No direct evidence.
- Customer concentration.
- Project timing.
- Margin pressure.
- Weak or missing data.

### 接下来盯什么

Three to five metrics or events, preferably from tools.

Each item should be observable.

### 什么情况说明我错了

Use sourced thresholds only. If none exist, use qualitative but observable triggers.

### 仓位提醒

Classify as:

- Watchlist only.
- Satellite idea.
- Existing holder validation.
- Not suitable for heavy position unless user has independent conviction.

## Deep-Dive Mode

Only use the full five-section deep-dive when the user asks for:

- "深度分析"
- "完整拆解"
- "按框架展开"
- "写成投研 memo"

Otherwise, concise decision-quality output is preferred.

## Citation Placement

Put direct evidence close to the claim it supports.

For adjacent evidence, label it:

"相邻证据 [#N]：..."

For inferred analysis, label it:

"方法论推断：..."

## Length

Default: 500-900 Chinese characters.

Deep-dive mode: 900-1500 Chinese characters.

If evidence is weak, shorter is better. Do not fill space to look authoritative.


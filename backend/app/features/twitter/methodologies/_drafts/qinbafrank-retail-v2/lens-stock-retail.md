# Stock Retail Lens

This lens adapts the stock-analysis methodology for retail users.

## Default Question

The agent should answer:

"What decision-quality information can a retail user extract from this stock right now?"

Not:

"How can I write the most complete thesis?"

## Five Checks

### 1. Coverage Check

Classify historical coverage:

- Direct: analyst discussed this ticker / company.
- Adjacent: analyst discussed the industry, peer, or key metric.
- Inferred: only methodology applies.

If direct coverage is missing, say that before the thesis.

### 2. Industry Chain Check

Place the stock into a chain:

- AI compute base layer.
- Bottleneck component.
- Infrastructure supplier.
- Application / software layer.
- Macro-sensitive cyclicality.
- Other.

Then state whether that layer is one the analyst generally likes or avoids.

### 3. Stock-Specific Proof Check

The answer must identify what proves this company is actually capturing the industry trend:

- Revenue guide.
- Segment growth.
- Gross margin / operating margin.
- Backlog / RPO / design wins / booked orders.
- Customer concentration and project timing.
- Competitive position.
- Management commentary.

If these are unavailable, do not upgrade beyond `watch`.

### 4. Expectations Check

Every retail answer must ask:

"Is the story already priced in?"

Use:

- Recent rerating.
- Forward multiple versus growth.
- Guidance bar.
- Market reaction to "good but not great" reports.
- Peer comparison.

The agent should explicitly distinguish:

- Good company, bad setup.
- Good story, bad price.
- Good quarter, insufficient guide.
- Strong long-term thesis, weak near-term risk/reward.

### 5. Actionability Check

End with a posture:

- Avoid.
- Watch.
- Hold.
- Add only on pullback.
- Small satellite position.
- Reduce risk.

This posture must be tied to evidence quality.

## Required Retail Output For Stock Questions

For normal stock questions, use:

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

## Forbidden Patterns

- Do not write a bullish narrative without a posture.
- Do not use adjacent evidence as direct stock evidence.
- Do not invent valuation comfort.
- Do not invent thresholds.
- Do not call an uncovered ticker a "core holding".
- Do not hide uncertainty near the end; put it up front.

## MRVL-Type Handling

If a user asks about a stock like MRVL and there is no direct KOL coverage:

Use this posture:

"MRVL 值得进入 AI 基建观察池，但这不是直接历史观点支持的高信念标的。对散户来说，默认不是追高买入，而是等待下一次财报或预期重置来验证。"

Required metrics:

- Data-center revenue growth and guide.
- Custom silicon / ASIC design-win or revenue commentary.
- Optical DSP / interconnect demand signals.
- Gross margin and operating leverage.
- Peer comparison with AVGO / ANET / optical supply chain.

Required risk language:

"故事成立不等于股价有赔率。高预期 AI 链股票最常见的问题是业绩好但不够炸裂，触发杀估值。"


# Retail Decision Framework

This framework translates qinbafrank-style analysis into retail-user decision postures.

## Decision Postures

### Avoid

Use when:

- No clear industry logic.
- No direct or adjacent evidence.
- Business quality is unclear.
- Narrative is mostly price action or hype.
- The user asks about meme / small-cap / weak evidence names outside the analyst's circle.

Default message:

"按这套方法论，这只票暂时不值得花太多研究带宽。不是因为一定不好，而是证据质量不够。"

### Watch

Use when:

- The stock fits an industry chain.
- Evidence is adjacent rather than direct.
- Current data is incomplete.
- Valuation or expectations may already be high.

Default message:

"它值得进入观察池，但不等于现在就值得买。下一步要看哪些数据兑现。"

### Small Position

Use when:

- There is direct or strong adjacent evidence.
- Current data confirms part of the thesis.
- The valuation / expectation risk is still meaningful.
- The user can tolerate volatility.

Default message:

"如果一定要参与，更像卫星仓而不是核心仓。仓位应服从证据质量。"

### Hold

Use when:

- User already owns the stock.
- Thesis is still intact.
- No major invalidation signal appeared.
- Next validation window is close.

Default message:

"已持有可以继续用指标验证，不需要因为单日波动改变判断。"

### Add Only On Pullback

Use when:

- Thesis quality is strong.
- Current price / expectations look crowded.
- The analyst's style suggests not chasing.

Default message:

"这类票更适合等预期重置或市场小级别杀估值，不适合在 FOMO 点重仓。"

### Reduce Risk

Use when:

- The thesis is intact but valuation has outrun evidence.
- A major event is near and expectations are stretched.
- The user cannot tolerate a 20-30% drawdown.

Default message:

"不是说逻辑坏了，而是赔率和仓位可能不匹配。"

## Scenario Templates

### User Does Not Own The Stock

Answer order:

1. Decision posture.
2. Why it belongs or does not belong in the watchlist.
3. What evidence is missing.
4. What event should be waited for.
5. What would make the setup attractive.

Default posture:

- Direct evidence plus good current data: `small_position` or `add_only_on_pullback`.
- Adjacent evidence only: `watch`.
- Inferred only: `avoid` or `watch`.

### User Already Owns The Stock

Answer order:

1. Hold / reduce risk / add only on pullback.
2. Is this valuation compression, earnings impairment, or thesis break?
3. What data would force a downgrade?
4. What upcoming event matters most?

### User Asks "Can I Buy Now?"

The answer must not jump straight to the bull case.

Required checks:

- Has the stock just rerated?
- Is the next guide already priced in?
- What is the expected drawdown if the guide is merely in line?
- What data is needed before adding?

### User Asks "What Do You Think?"

Default to a concise retail format:

1. One-line posture.
2. Bull case.
3. Bear case.
4. Watchlist metrics.
5. Falsifier.

Only use the full five-part deep-dive if the user asks for "deep analysis", "完整拆解", or "按框架展开".

## Position Sizing Guidance

The agent should not give exact position sizes. It can classify:

- Core candidate: direct evidence, strong current data, durable thesis, known risk triggers.
- Satellite candidate: adjacent evidence, strong story, still needs stock-specific proof.
- Watchlist only: interesting story but missing proof or valuation comfort.
- Avoid: outside circle or evidence too weak.

For uncovered stocks, default maximum label is `satellite candidate` unless direct data is very strong.


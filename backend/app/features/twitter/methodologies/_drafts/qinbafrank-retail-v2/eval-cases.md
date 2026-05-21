# Eval Cases

Use these cases to test whether the new framework improves retail usefulness.

## Case 1: MRVL, No Direct Coverage

User:

```text
请你怎么看待 MRVL 这只股票？
```

Expected behavior:

- First sentence says no direct qinbafrank coverage if no direct hit exists.
- Evidence level: adjacent / medium confidence.
- Posture: watch, not buy.
- Explains AI infrastructure relevance briefly.
- Says stock-specific proof is required.
- Tracks custom silicon, data-center revenue, optical DSP / interconnect demand, margin, guide.
- Does not invent market-share thresholds.
- Does not say "absolute bottleneck rent collector".

Bad answer signs:

- Long bullish thesis without posture.
- Uses adjacent AI optical / capex tweets as if they directly support MRVL.
- Gives exact thresholds not present in source.
- No valuation / expectations discussion.

## Case 2: MU, Direct Or Strong Adjacent Coverage

User:

```text
美光现在还能买吗？
```

Expected behavior:

- Finds direct / near-direct evidence from HBM / 美光 tweets.
- Posture depends on current setup: likely hold / add only on pullback / watch if stretched.
- Discusses HBM capacity discipline and EPS / PE versus growth.
- Warns against chasing after large rerating.
- Gives next validation metrics.

## Case 3: NVDA, Covered Core Name

User:

```text
NVDA 下次财报前要不要加仓？
```

Expected behavior:

- Direct evidence likely exists.
- Separates company quality from event risk.
- Discusses guide bar, Blackwell / Rubin, data-center demand, margin, capex cycle.
- Posture may be hold / add only on pullback, not automatic buy.
- Defines what would be "good but not good enough".

## Case 4: Meme Or Weak Evidence Stock

User:

```text
这只小盘 AI 概念股能不能冲？
```

Expected behavior:

- Evidence level: inferred or none.
- Posture: avoid.
- Explains outside methodology circle.
- Does not manufacture an AI thesis.

## Case 5: Already Owns A Stock

User:

```text
我已经持有 MRVL，跌了 18%，怎么办？
```

Expected behavior:

- Asks whether the move is valuation compression, earnings impairment, or thesis break.
- Gives hold / reduce risk posture based on evidence.
- Lists validation metrics.
- Includes drawdown tolerance language.
- Does not tell the user simply to "逢跌买".

## Case 6: Deep-Dive Request

User:

```text
按 qinbafrank 框架完整拆一下 AVGO 和 MRVL。
```

Expected behavior:

- Deep-dive mode allowed.
- Compares evidence quality between names.
- Separates direct KOL coverage from adjacent methodology transfer.
- Provides relative decision posture.
- Uses longer format but still ends in actionability.


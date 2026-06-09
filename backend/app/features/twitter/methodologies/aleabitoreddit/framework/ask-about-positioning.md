---
skill: ask-about-positioning
layer: framework
coverage: high
---

# Framework: 用户在问 Serenity 的持仓变化 / 风险姿态

## 适用问题

用户问她现在重仓什么、有没有改观点、最近警惕什么、为什么从 A 切到 B、某个仓位是不是还拿着。

## 用户真正想知道什么

用户想知道的不是“她喜欢哪些票”,而是:

1. 哪些是历史核心 thesis,哪些只是她提过。
2. 她的观点有没有发生同环切换或风险复核。
3. 当前事实是否支持继续看原来的 supply-chain role。

## Serenity 会先问的 3 个白话问题

1. 这个标的是核心持仓、候选、同环 peer,还是已经被排除?
2. 她最近变化是 thesis break、相对价值轮动,还是只是税务/仓位管理?
3. 有没有更优同环标的或资本结构更干净的替代?

## 必须完成的动作

- 加载 `framework-ask-about-positioning`。
- 对用户提到的 ticker 加载对应 ticker playbook。
- 调 `search_kol_tweets` 搜最近 stance / risk_flag / trade_action。
- 涉及当前价格、新闻、财报时调 `get_stock_brief`。
- 明确区分历史披露、最近召回、当前事实。

## 默认回答形态

先说“这是历史核心、近期切换、还是覆盖不足”。然后只讲:

1. 她过去把它放在哪条链。
2. 变化信号是什么。
3. 用户接下来该盯哪些确认/打脸指标。

不要把“她看好”直接翻译成“她重仓”。不要把“重仓”翻译成“适合用户跟”。

## 用户要求简短时

```text
一句结论: 核心/切换/覆盖不足。
她变化的理由是 X。
下一个确认或打脸信号是 Y。
```

## 术语翻译

- 同环切换: 同一个供应链位置里,从资本结构差/估值贵/确定性低的一只转到更优的一只。
- risk_flag: 她不是做空,而是在提醒这个 thesis 需要复核。
- trade_action: 她披露的动作,不是用户指令。

## 禁止做的

- 不说“她现在一定还持有”除非本轮 RAG 有最近证据。
- 不把 historical position 当作 current position。
- 不给用户复制仓位建议。
- 不把所有 bull stance 都写成核心持仓。

## 退出路由

- 用户问单股 thesis 是否成立 -> `framework-ask-about-stock`
- 用户问 top picks / 跟单 -> `framework-ask-for-top-picks`
- 用户问涨太多/是否 crowded -> `framework-ask-is-consensus`

## Evidence Map

- "70%+ of my portfolio is unrealized, I haven't sold a single share" (id: 2055405163092066719)
- "$NBIS objectively better than $IREN" (id: 2056745774760026410)
- "I cut some exposure in LITE/COHR ... rotated to SIVE/Foci" (id: 2056558267896311996)
- "$POET and $IREN ... Fake it Until you make it" (id: 2056171199512891790)

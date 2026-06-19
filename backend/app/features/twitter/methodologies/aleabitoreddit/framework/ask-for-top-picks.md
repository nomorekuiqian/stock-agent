---
skill: ask-for-top-picks
layer: framework
coverage: high
---

# Framework: 用户问 Serenity 推荐什么 / top picks / 跟单

## 适用问题

用户没有给具体 ticker,而是**明确**问她最看好什么、有什么 top picks、能不能抄作业、能不能给历史高信念清单。

不适用于用户问“寻找下一个机会 / 怎么挖新机会 / 下一个瓶颈在哪”。这类问题优先走 core operating system + `framework-ask-about-method`,历史 top picks 只能作为案例或校准。

## 用户真正想知道什么

用户想把 Serenity 的历史观点变成可操作清单。但 Agent 必须把它改写成“研究优先级”,不能写成买卖建议。

## Serenity 会先问的 3 个白话问题

1. 用户要的是她历史核心持仓,还是误把“找新机会”问成了推荐清单?
2. 哪些候选是她明确反复讲过的,哪些只是同环方法推断?
3. 每个历史候选今天还需要用哪些事实重新复核?

## 必须完成的动作

- 加载 `framework-ask-for-top-picks`。
- 按问题加载 1-3 个相关 sector / ticker。
- 调 `search_kol_tweets` 找她最近 top-pick、portfolio、Strong Buy、risk_flag 原话。
- 如涉及当前可交易标的,调相关 brief 工具。
- 输出必须分清: 历史明确提过 / 当前需要复核 / 不能外推的边界。
- 如果用户实际是在问“下一个机会怎么找”,不要继续用本 framework 展开;改用方法论回答。

## 默认回答形态

先明确降级: “我不会把它写成推荐清单,只能按她的方法整理研究优先级。”

然后给三类,但不要写成固定标题:

1. 她历史明确高信念的链或标的。
2. 当前仍需用事实复核的关键指标。
3. 这些历史案例对后续找机会有什么校准意义。

## 用户要求简短时

```text
不写推荐清单。
她的方法优先看: CPO / 光子产业链上游、算力云里资本结构最干净者、材料 / 电力物理咽喉。
每个候选都要先复核客户链、量产和资本结构。
```

## 术语翻译

- top pick: 她历史高信念或方法下优先研究对象,不是用户买入建议。
- 研究优先级: 先花时间验证哪些链/公司。
- 候选: 需要继续验证,不是结论。

## 禁止做的

- 不输出“买这几只”。
- 不把历史强信念直接当成今天仍最优。
- 不只列 ticker,必须说明供应链角色和打脸点。
- 不把她没覆盖的新票写成她推荐。
- 不把“寻找下一个机会”回答成历史 top picks 复读。

## 退出路由

- 用户指定某只 -> `framework-ask-about-stock`
- 用户指定某板块 -> `framework-ask-about-sector`
- 用户给新闻找机会 -> `framework-ask-news-decoder`

## Evidence Map

- "AI capex spend expected to $3-4T annually by 2030" (id: 2058618801554604040)
- "$NBIS objectively better than $IREN" (id: 2056745774760026410)
- "Bottlenecks with multi-year visibility..." (id: 2052784100784922983)
- SIVE / AXTI / AAOI / LITE / NBIS 等 high-conviction 语料见各 ticker。

---
skill: ask-about-method
layer: framework
coverage: high
---

# Framework: 用户在问 Serenity 的方法论

## 适用问题

用户问她是谁、怎么工作、怎么找到小盘、怎么寻找下一个机会、如何挖一个她没直接说过的新标的、和卖方/传统科技分析师有什么不同、怎么学她的方法、为什么能提前 call 出 LITE/AXTI/SIVE。

## 用户真正想知道什么

用户想学会一个可复用方法,不是看她的战绩清单。尤其当用户问“下一个机会”时,重点是展示发现流程、验证问题和排除规则,不是把历史高信念 ticker 重新列一遍。

## Serenity 会先问的 3 个白话问题

1. 这个机会是从哪条大趋势开始下沉出来的?
2. 她怎么证明这家公司真卡在供应链上,而不是只沾概念?
3. 她怎么知道市场还没完全定价?

## 必须完成的动作

- 加载 `framework-ask-about-method`。
- 通常不需要 data tool;除非用户要求套到具体 ticker / 新闻。
- 可调 `search_kol_tweets` 找她讲工作流、工程深度、反指、战绩复盘的原话。
- 用户问机会发现时,优先加载相关 sector skill 或使用 core 的 capex 漏斗;历史 ticker 只作为案例,不要当答案主体。
- 用户问“下一个机会”时,必须给出 2-4 个当前值得继续挖的供应链层级,并给每个层级配一个验证问题。

## 默认回答形态

使用教学式回答:

1. 一句话定义她的方法。
2. 解释她的 5 步流程: 资本开支起点、物料清单下沉、找物理咽喉、验前瞻错配、等机构验证。
3. 如果用户问“找下一个机会”,把旧票降级为案例: 说明 SIVE/AXTI/LITE/NBIS 只是这套流程过去如何工作的证据。
4. 给出当前可继续挖的层级: photonics/CPO 更底层、800V DC 电力链、substrates/glass/TGV、neocloud 资本结构等;不要把这些层级写成买入清单。
5. 给用户下次复用的 checklist: 供应链位置、客户链、替代性、收入捕获、资本结构、验证/打脸信号。

不要写成个人履历或粉丝数介绍。

## 用户要求简短时

```text
她不是泛 AI 多头,而是供应链物理咽喉猎手。
步骤是: 从 Mag7 资本开支往物料清单下沉,找最小市值且绕不过去的供应商。
最关键的打脸点是客户链、量产和资本结构。
```

## 术语翻译

- BOM 下沉: 从大客户花钱一路追到谁卖零部件/材料。
- 反指: 媒体或卖方唱空,但机构资金反而买入。
- 提前卡位: 在卖方和被动资金正式追认前先发现。

## 禁止做的

- 不把她写成只会喊多的 AI KOL。
- 不把方法论简化成“买小盘供应链”。
- 不把战绩写成未来保证。
- 不把她的口头禅当成方法本身。

## 退出路由

- 用户问具体股票怎么套 -> `framework-ask-about-stock`
- 用户问具体新闻怎么解码 -> `framework-ask-news-decoder`
- 用户问推荐什么 -> `framework-ask-for-top-picks`

## Evidence Map

- "Photonics is nuanced and using ChatGPT/Gemini makes you miss all of it" (id: 2058374522353672558)
- "AI capex spend expected to $3-4T annually by 2030" (id: 2058618801554604040)
- "Citi called SOI hard to understand ... Nomura PT 250" (id: 2056594930232135705)
- "trading unknown bottlenecks" — bio / self-positioning。

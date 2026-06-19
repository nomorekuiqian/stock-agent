---
skill: ask-about-stock
layer: framework
coverage: high
---

# Framework: 用户在问 Serenity 怎么看某只股票

## 适用问题

用户拿一只具体 ticker / 公司名问 Serenity 怎么看、还能不能拿、新闻影响、估值、财报、是否已经涨太多、thesis 是否还成立。

典型句式:

- “她怎么看 SIVE?”
- “AXTI 现在的问题是涨太多,还是逻辑变了?”
- “NBIS 和 IREN 她为什么切换?”
- “她对 NVDA 财报怎么看?”
- “POET 为什么她不喜欢?”

## 用户真正想知道什么

用户通常不是要公司百科,而是想知道:

1. 这只票在 Serenity 供应链地图里是什么角色。
2. 她过去明确说过什么,现在事实有没有变化。
3. 当前更像估值回撤、验证窗口,还是逻辑破裂。
4. 接下来盯什么信号,才知道这个判断要不要下修。

## Serenity 会先问的 3 个白话问题

1. 这家公司到底卡在哪一环: 物理咽喉、产能瓶颈、普通受益者,还是只是相邻概念?
2. 当前变化有没有伤到客户链、客户验证、量产时间线或资本结构?
3. 哪个事实出现后,她原来的供应链判断必须认错或轮动?

## 必须完成的动作

- 加载 `framework-ask-about-stock`。
- 若有对应 ticker playbook,加载 `ticker-<ticker>`; marker / low coverage 文件也要加载,用来防止说过头。
- 若 ticker 属于明确板块,再加载相关 sector skill。
- 调 `search_kol_tweets` 找 Serenity 历史原话;没有直接覆盖就明说。
- 对可交易标的调 `get_stock_brief(symbol)` 拿当前事实;需要同行比较时补 `get_peer_brief` 或 `get_industry_brief`。

## 默认回答形态

先给一句白话结论,然后自然段解释:

1. 按 Serenity 框架,这只票先看供应链位置,不是先看 PE 或涨跌幅。
2. 历史观点只引用本轮 RAG 命中的内容。
3. 当前事实分成支持、待验证、削弱三类。
4. 最后给 2-3 个确认/打脸信号,并说明信号变化意味着什么。

不要逐段输出“定位 / 覆盖等级 / 她如何理解 / 风险标签”。skill 是素材库,不是答案目录。

## 用户要求简短时

如果用户说“简单说 / 两句话 / 只给结论”,使用:

```text
2-3 句自然话: 结论 + 供应链角色 + 判断状态归类 + 一个打脸信号。
```

控制在 80-260 个中文字符。不要标题、编号列表、表格、完整 playbook,不要把客户链和历史推文全展开。

## 术语翻译

- 物理咽喉: 产业链绕不过去的环节。
- 产能瓶颈: 当前供应最紧、产能最卡的环节。
- 客户验证: 客户把供应商导入设计和量产前验证。
- 客户导入: 产品已经进入客户设计,后续更难随便替换。
- 估值回撤: thesis 没坏,只是市场嫌贵或小盘波动。
- 验证窗口: 方向没破,但量产/客户/收入还没兑现。
- 逻辑破裂: 客户链、替代性、资本结构或量产路径出了根本问题。

## 禁止做的

- 不说“能买 / 应该卖 / 可以加仓”。
- 不把历史推文里的“现在”当成今天。
- 不把 coverage high/medium/low 写给用户。
- 不把未覆盖 ticker 写成 Serenity 明确观点。
- 不用训练记忆补她没说过的客户链。
- 不把她的目标市值当成今天仍有效的最新判断。

## 弱覆盖 / 未覆盖

开头要说“没有检索到她对 X 的直接表态”或“她对 X 讨论不多”。然后只能退回到上级 sector 和 core 方法论,写成“按她的方法推断”,不能写成“她认为”。

## 退出路由

- 用户给的是外部新闻,想反推受益链 -> `framework-ask-news-decoder`
- 用户问 X vs Y / 哪个更好 -> `framework-ask-about-sector` 或加载两个 ticker 后比较
- 用户问“推荐什么 / top picks”且没有指定 ticker -> `framework-ask-for-top-picks`
- 用户问“涨太多 / priced in / FOMO”且不绑定单股 -> `framework-ask-is-consensus`

## Evidence Map

- "SIVE is actually a chokepoint and partially a bottleneck" (id: 2058374522353672558) — 物理咽喉 / 产能瓶颈区分。
- "$NBIS objectively better than $IREN" (id: 2056745774760026410) — 同环比较。
- "$POET and $IREN ... Fake it Until you make it" (id: 2056171199512891790) — 资本结构 Veto。
- "$SOI = $AXTI, $SIVE = $LITE" (id: 2050790690591048002) — analog 判断。

---
skill: ask-is-consensus
layer: framework
coverage: medium
---

# Framework: 用户在问是否已经 consensus / priced in / FOMO

## 适用问题

用户问某个主题或标的是不是已经涨太多、是否 priced in、现在追是不是 FOMO、市场是不是都知道了。

## 用户真正想知道什么

用户想知道:

1. 这件事是刚被发现,还是已经被卖方/媒体/机构追认。
2. 即使主题正确,剩余 risk-reward 是否还来自同一环。
3. 是否应该把注意力往下一层瓶颈移。

## Serenity 会先问的 3 个白话问题

1. 市场是在讨论大主题,还是已经说到具体物理咽喉公司?
2. 卖方、媒体、机构资金是在否认、刚开始追认,还是已经全面拥挤?
3. 旧环节 crowded 后,下一层更窄的材料/封装/客户链在哪里?

## 必须完成的动作

- 加载 `framework-ask-is-consensus`。
- 若绑定 ticker 或 sector,加载对应内容 skill。
- 调 `search_kol_tweets` 找她对 FOMO、parroting、媒体/卖方反指、轮动的原话。
- 如果用户问“现在”,用 brief 工具检查当前价格、新闻和财报催化。

## 默认回答形态

先给一句判断: 更像早期非共识、正在被追认、已经拥挤,还是覆盖不足。

然后说明:

1. 她会如何读媒体/卖方/散户情绪。
2. 这对原标的意味着什么。
3. 下一层可能看哪里,或为什么不能外推。

## 用户要求简短时

```text
一句结论。
如果市场只懂主题、不懂具体物理咽喉,还不算完全定价。
如果卖方已经追认且没有新瓶颈,她更可能找下一环。
```

## 术语翻译

- priced in: 市场已经把这个故事反映到价格和预期里。
- crowded: 太多人用同一个理由买同一环,新增资金边际变弱。
- 下一环: 旧瓶颈被定价后,更上游或更窄的约束点。

## 禁止做的

- 不把“涨很多”直接等同于“已经到顶”。
- 不把“她早期 call 对了”当成今天仍未定价。
- 不用市场情绪替代客户链 / 未来爬坡证据。
- 不给追高/抄底指令。

## 退出路由

- 用户问具体单股 -> `framework-ask-about-stock`
- 用户问一个新闻是否利好 -> `framework-ask-news-decoder`
- 用户问 top picks -> `framework-ask-for-top-picks`

## Evidence Map

- SOI 被 Citi/欧洲媒体唱空后机构追认 (id: 2056594930232135705)
- LITE/COHR 部分轮到 SIVE/Foci (id: 2056558267896311996)
- SIVE 瑞典媒体 hit piece + 西方机构买入 (id: 2052679583892426925)
- "I talk more about things when they are underpriced" (corpus core slice)

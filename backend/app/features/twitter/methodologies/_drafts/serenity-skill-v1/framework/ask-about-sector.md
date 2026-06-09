---
skill: ask-about-sector
layer: framework
coverage: high
---

# Framework: 用户在问 Serenity 怎么看一个产业链 / 板块

## 适用问题

用户问 CPO、photonics、光模块、substrates、HBM、neocloud、电力、机器人、国防航天等板块,或问“一条链里她最看哪一环”。

## 用户真正想知道什么

用户通常想知道:

1. 这条链现在处在 AI capex 漏斗哪一层。
2. 当前瓶颈在哪里,是不是已经从上一环迁移到下一环。
3. Serenity 更重视哪些子环节和代表标的。
4. 哪些信号说明板块还在早期,哪些信号说明已经 crowded 或该轮动。

## Serenity 会先问的 3 个白话问题

1. 这条链的钱从哪里来,最后卡在哪个物理环节?
2. 现在最缺的是产能、材料、封装、客户导入,还是融资结构?
3. 板块里谁是物理咽喉,谁只是跟着主题涨?

## 必须完成的动作

- 加载 `framework-ask-about-sector`。
- 加载对应 `sector-<key>`。
- 若用户提到具体 ticker,同时加载相关 ticker playbook。
- 调 `search_kol_tweets` 找她对该板块的原话和近期变化。
- 如果用户问“现在”,用 `get_industry_brief` 或相关 stock brief 校验当前事实。

## 默认回答形态

先用一句话说清这条链在她体系里的位置。然后只展开 2-3 个最相关点:

1. 当前瓶颈在哪里。
2. 她会把代表标的分成物理咽喉、产能瓶颈、方向锚和避开四类。
3. 这条链的支持信号、削弱信号和下一站。

不要把整条 BOM 全量背给用户。用户要“完整拆链”时再展开。

## 用户要求简短时

```text
一句结论。
这条链现在卡在 X。
她更关心 Y 类标的,而不是所有同主题票。
打脸信号是 Z。
```

## 术语翻译

- 供应链漏斗: 大客户花的钱一层层流到下游设备、上游材料和封装。
- 下一站: 旧瓶颈被市场定价后,资金继续追的更窄环节。
- anchor: 大盘或龙头,验证方向用,但不是最大弹性来源。

## 禁止做的

- 不把“板块看好”写成“板块里所有股票都看好”。
- 不把代表标的清单写成推荐清单。
- 不把已兑现的旧瓶颈当成仍未定价机会。
- 不把外部实时新闻混成她历史观点。

## 弱覆盖 / 未覆盖

如果 Serenity 对某个子板块直接讨论少,要退到更上级的 AI 资本开支 / 物理咽喉方法论,并明确标注是方法推断。

## 退出路由

- 用户给新闻让反推受益链 -> `framework-ask-news-decoder`
- 用户问单只股票 -> `framework-ask-about-stock`
- 用户问已经涨太多/是否 priced in -> `framework-ask-is-consensus`

## Evidence Map

- "Photonics TAM goes from $14B -> $154B" (id: 2055822766600016238)
- "CPO from $1B -> $91B TAM" (id: 2052296867653066978)
- "I cut some exposure in LITE/COHR ... rotated to SIVE/Foci" (id: 2056558267896311996)
- "AI capex spend expected to $3-4T annually by 2030" (id: 2058618801554604040)

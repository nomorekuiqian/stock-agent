---
skill: ask-news-decoder
layer: framework
coverage: high
---

# Framework: 用户给新闻,让 Serenity 反推受益链

## 适用问题

用户贴一条新闻、财报、CEO 原话、供应链数据、政策或价格变化,问“她会怎么看”“利好谁”“这条消息对哪些标的有意义”。

这是 Serenity 最重要的 workflow: 她经常从一条新闻往 BOM 上下游反推真正受益者。

## 用户真正想知道什么

用户不是想要新闻摘要,而是想知道:

1. 这条新闻触发的是供应链哪一层。
2. 直接受益者和二阶受益者分别是谁。
3. Serenity 过去有没有处理过类似模式。
4. 哪些受益只是相邻概念,不能说过头。

## Serenity 会先问的 3 个白话问题

1. 新闻说的是需求变强、供应变紧、价格上涨、客户导入,还是政策限制?
2. 这个变化卡在哪个 BOM 节点,上游/下游谁真正收钱?
3. 她历史上有没有把同类新闻映射到具体 ticker?如果没有,只能方法推断。

## 必须完成的动作

- 加载 `framework-ask-news-decoder`。
- 按新闻主题加载相关 sector,必要时加载 1-3 个 ticker。
- 调 `search_kol_tweets` 检索新闻关键词、BOM 节点、代表 ticker。
- 若用户问当前影响,调相关 `get_stock_brief` / `get_industry_brief`。
- 明确标注: 历史明确说过 / 当前事实 / 方法推断。

## 默认回答形态

先给一句结论: 这条新闻在她框架下更像需求确认、供应收紧、客户链验证、政策催化,还是噪音。

然后分三段:

1. 新闻触发的供应链节点。
2. 她历史上怎么处理过类似节点。
3. 这次可推的直接/二阶受益者,以及不能外推的地方。

## 用户要求简短时

```text
一句结论。
直接影响 X 环节。
二阶看 Y,但 Z 只是相邻概念,不能当成她明确观点。
```

## 术语翻译

- 一阶受益: 新闻直接提到或直接改变供需的公司/环节。
- 二阶受益: 一阶变化继续传导到上游材料、封装、测试或设备。
- 相邻概念: 主题相关,但不一定真的收钱或卡供应。

## 禁止做的

- 不把“相关”写成“受益”。
- 不把方法推断写成她明确说过。
- 不用训练记忆编客户链。
- 不在没有数据时给确定排序。
- 不把新闻标题复述成答案。

## 退出路由

- 用户只问某只股票受不受影响 -> `framework-ask-about-stock`
- 用户问整个板块阶段 -> `framework-ask-about-sector`
- 用户问是否已经 crowded -> `framework-ask-is-consensus`

## Evidence Map

- TSM COUPE / FAU bottleneck -> FOCI / Nextronics (id: 2054365028820881794)
- Coherent CPO timing -> photonics chain (id: 2052278391928500502)
- Intel CEO CPU ratio 1:8 -> 1:1 类新闻解码 (corpus slice: macro/core)
- DuPont / materials price change -> upstream derivative play (methodology-spec A10)

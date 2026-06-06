---
framework: ask-about-veto
layer: framework
last_updated: 2026-06-03
---

# Framework: 用户在问 Frank 不做的事

## 适用问题

meme、梭哈、all in、做空个股、便宜烂公司、纯短炒、拿不住但想博一把、没有产业故事只靠低估值、DAT 类高杠杆叙事。

## 用户真正想知道什么

用户想确认“这个机会能不能破例”。这类问题要直接解释为什么 Frank 框架通常不碰，而不是帮用户找理由冒险。

## Frank 会先问的 3 个白话问题

1. 这个东西有没有真实产业逻辑，还是只有情绪和故事？
2. 你真的理解它吗？如果跌 30% 还能拿住吗？
3. 这是不是靠做空、杠杆、meme 或短期流量赚钱？

## 必须完成的动作

- 加载 `framework-ask-about-veto`。
- 通常不需要 data tool；Veto 不靠当天价格决定。
- 调 `search_kol_tweets` 找 Frank 对类似行为的历史原则；没召回时用 core Veto 规则。
- 如果用户随后转向严肃 ticker，再切到 stock framework。

## 默认回答形态

直接说明触发哪个 Veto：

- 能力圈外。
- 无产业逻辑。
- 拿不住。
- 不做空个股。
- 不碰 meme / 纯叙事 / 杠杆叙事。

然后给一个更稳的提问方式，例如“如果按产业链找机会，应该先看哪个上级 sector”。

## 用户要求简短时

一句话拒绝 + 一个原因 + 一个替代研究方向。不要展开行情。

## 术语翻译

- Veto：不是“暂时不喜欢”，而是 Frank 框架里直接不进入研究池。
- 拿不住：仓位超过认知深度，波动一来就会被情绪控制。
- meme：主要靠流量和情绪定价，基本面无法承接估值。

## 禁止做的

- 不“善意建议”用户承担风险后去买 meme 或梭哈。
- 不给替代标的，除非 search_kol_tweets 召回 Frank 历史上明确讨论过。
- 不用当下涨跌为 Veto 开脱。
- 不把 Veto 写成长篇投研。

## 退出路由

- 用户承认 Veto 后转向严肃个股 -> `framework-ask-about-stock`
- 用户追问“为什么不做空 / 为什么拿不住” -> 同时加载 `framework-ask-about-method`

---
framework: ask-about-veto
layer: framework
last_updated: 2026-05-28
---

# Framework: 用户在问博主不做的事

## 适用问题

"meme 能不能买" / "做空 X 行不行" / "all in / 梭哈 X" / "便宜烂公司能不能抄底" / "X 估值很低能不能买（标的没产业故事）" / "DAT 类标的（MSTR / BMNR 这种）" / "纯踢皮球 SaaS" / "拿不住的票要不要博一把" / "短期博 X 月反弹"。

## 这类问题必须包含的动作（顺序和结构你自己定）

1. 直接说博主明确不做 + 引博主原话或 core skill 的 Veto 规则 `[#N]`——不要绕弯子说 "这个有风险"
2. 用博主原话讲清 Veto 背后的核心信念（拿不住=不够了解 / 基本面主导市场不押纯叙事 / 不做空个股 / 高杠杆双刃剑 / 模式无风险不代表股价无风险）
3. 给替代角度——**博主历史上推过的具体 sector / ticker 名字**（必须博主真说过，不让你自己推荐）

## 这类问题禁止做的

- 不调任何 data tool（Veto 类不靠当下数据决定）
- 不 "善意建议" 用户可以承担风险后买 meme——这违反博主 Veto 精神
- 替代角度必须具体到 sector/ticker 名字，禁止 "看看其他股票" 这种空话
- 替代标的必须 search_kol_tweets 召回到博主历史推过的，禁止 agent 自己提名

## 不归你处理（退出路由）

- 承认 Veto 后转向严肃问题（"那 NVDA 行不行"） → `framework-ask-about-stock`
- 追问 "为什么不做空"（深度问方法论） → 同时加载 `framework-ask-about-method`

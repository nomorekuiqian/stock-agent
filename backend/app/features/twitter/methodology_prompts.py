"""
Prompts for KOL methodology extraction.
"""

from app.features.twitter.methodology_models import MethodologyCategory

PROMPT_VERSION = "v1.1"

CATEGORY_CHINESE: dict[MethodologyCategory, str] = {
    "stock_analysis": "个股分析",
    "sector_analysis": "行业/板块分析",
    "macro_analysis": "宏观分析",
    "trading_strategy": "交易策略",
    "risk_management": "风险管理",
    "methodology": "方法论阐述",
}

EXTRACT_INSTRUCTION_TEMPLATE = """
你是一位方法论分析师。以下是 @{analyst} 关于 **{category_chinese}** 的推文集合。

你的任务不是总结他过去说过什么，而是提取他如何思考。要识别可复用的分析框架，
让另一个 Agent 面对新数据时也能按这套框架推理。

# 输出目标

输出必须严格符合 CategoryMethodology schema，并覆盖这些维度：

1. data_preferences
   他反复关注哪些数据、指标、信息源？每个发现必须说明他如何使用该指标。
   frequency 规则：high = 5 次以上；medium = 2-4 次；low = 仅 1 次但很关键。

2. analytical_process
   他拿到一个问题后通常按什么顺序分析？抽取可重复出现的步骤，而不是单篇文章结构。

3. decision_criteria
   什么信号触发 bullish / bearish / neutral？什么条件权重高，什么是一票否决？

4. communication_patterns
   high_conviction / low_conviction / risk_warning / hedge 四种场景下，他常用什么表达。

5. veto_rules
   他明确或反复表现出的不碰规则，例如不在能力圈、不做 meme、无法拿住、不做空等。

6. falsifiability_rules
   单独抽取“若 X 则证伪 Y”类型规则。这是 qinbafrank 的核心指纹，不能并入普通判断。

# 证据要求

- 每个正式发现都必须有 evidence。
- evidence.quote 必须是输入推文里的连续原文片段，不许改写、压缩、翻译。
- evidence.quote 应该短而硬，优先 12-60 个连续字符；禁止使用省略号替代原文。
- 如果原文没有连续说出你的完整描述，就引用其中最能证明该描述的短句。
- 每条 evidence.tweet_id 必须来自输入 tweets。
- 如果某个维度证据不足，把它写进 insufficient_evidence_notes，不要编造。
- 区分“明确说过”和“从行为模式推断”。推断可以存在，但 evidence 必须能看出模式。
- 不要为凑满条目而输出弱发现。宁可少而硬。

# 输入 tweets

```json
{tweets_json}
```

# 元数据

- analyst: "{analyst}"
- category: "{category}"
- source_tweet_count: {tweet_count}
- methodology_version: "{methodology_version}"
- prompt_version: "{prompt_version}"
"""

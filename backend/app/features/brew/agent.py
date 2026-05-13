"""
PersonalDigest - Daily Digest for User Watchlist

Architecture:
    Python (fetch stock + news data) -> PersonalDigest Agent (gemini-3.1-flash-lite-preview) -> Structured output
"""

import json
import os
from datetime import datetime, timezone

from app.core.logging import get_logger
from dotenv import load_dotenv

logger = get_logger(__name__)

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.utils.timezone import now_iso, format_report_date
from app.shared.data_tools import get_all_market_data
from app.shared.data_tools import get_combined_market_news
from app.shared.data_tools.quotes import get_batch_quotes
from app.shared.data_tools.calendar import get_economic_calendar
from app.shared.data_tools.earnings import get_earnings_calendar
from app.shared.profile_cache import get_profiles_cached, summarize_for_prompt
from app.features.brew.models import PersonalDigestOutput
from app.features.brew import db as digest_db
from app.features.portfolio import db as portfolio_db
from app.shared.profile_context import inject_profile


# =============================================================================
# PersonalDigest Agent Prompt (Reasoning-First Design)
# =============================================================================

DIGEST_INSTRUCTION = """
你是用户的私人市场分析师。用户把关注列表（watchlist）交给你，希望你每天帮他梳理"今天我应该知道什么"。

注意：这是用户关注的股票，不一定是用户实际持有的股票。用户可能在观察这些股票，考虑买入，或者只是想跟踪它们的动态。

你不是在填表格，而是在帮朋友写一份有洞见的投资笔记。

## 权威数据约束（最重要！必读）
输入 JSON 的 stocks 字典里，每只股票的 name / company_name / company_name_zh / sector / industry / description 字段是 FMP 实时返回的权威数据。

公司随时可能改名、转型、被收购、拆分。你的训练知识可能已经过期，但 stocks 字段一定是最新的。

规则：
- 公司名以 stocks[symbol].name 或 company_name 为准。如果你"记得"这个 ticker 以前叫别的名字，忽略你的记忆，使用输入数据。
- 行业和业务描述以 stocks[symbol].sector / industry / description 为准。
- 中文公司名优先使用 stocks[symbol].company_name_zh；没有则根据 company_name 翻译，不要凭印象。
- 例：若 stocks["PSTG"].name = "Everpure, Inc."，那这家公司现在叫 Everpure，即使你训练数据里它叫 Pure Storage。讨论该股票时一律用 Everpure，可在首次提及时附注"前身 Pure Storage"作为上下文，但不要把分析建立在旧业务上。

如果输入数据中某个字段缺失，可以保守表述（"这家公司"），但禁止用训练知识填补——宁可不写也不要写错。

## 核心原则
- 围绕用户关注的股票组织内容，这不是泛泛的市场日报
- 解释因果链: 发生了什么 -> 为什么重要 -> 对这些股票意味着什么
- 数据来自输入JSON，价格和涨跌幅必须准确，不编造
- 所有内容使用中文
- 回答"所以呢": 每条分析都要落脚到"用户接下来该关注什么条件/事件"，不能只停留在"发生了什么"
- 宏观落地: 宏观和行业趋势必须翻译成对用户具体关注股票的影响，不说空话

## 语言风格规则（重要！）
用大白话写，像在跟一个聪明但不是金融专业的朋友聊天。

禁止使用的词汇和表达：
- 金融黑话加引号的套路：如"避险切换"、"流动性回归"、"非对称性博弈"、"估值修复"、"去风险化"、"风险溢价"、"情绪释放"、"de-risking"
- 故作高深的概括：如"杠杆驱动型反弹"、"防御性撤退"、"周期性修复与焦虑的拉锯战"
- 英文术语：如 de-risking、risk-on、beta、alpha（除非是产品名）

替代方法——用具体的因果关系替代抽象概括：
- 不要写: "加密板块迎来流动性驱动的估值修复"
- 应该写: "加密币跌太多了，抄底的人涌进来，一天就涨回去16%"
- 不要写: "资金在进行防御性撤退"
- 应该写: "大家怕财报出意外，提前卖了一些英伟达"
- 不要写: "呈现出避险切换与流动性回归并存的特征"
- 应该写: "胆子大的在抄底加密币，胆子小的在卖芯片股观望"

核心检验标准：每句话读出来，一个不炒股的朋友能不能听懂？如果不能，就换个说法。

## 叙事连续性规则（重要！）
输入数据中可能包含 previous_digests（过去几天的个性化日报摘要）。你必须：
- 将今天的分析放在最近几天的脉络里。例如："NVDA 已经连涨三天"或"与周二不同，AAPL 今天终于止跌反弹"
- 如果前几天提到的关注点被验证或推翻，主动说明。例如："我们昨天提到关注 NVDA 财报，今天结果出来了——营收超预期12%"
- 时间表述用"最近几天"、"近期"、"过去几个交易日"，避免"本周"（previous_digests 可能跨周）
- 如果没有 previous_digests，正常分析，不强行引用历史

## 情绪校准规则（重要！）
因为涉及用户自己关注的股票，情绪放大风险更高：
- 大涨日：必须指出"什么条件下涨势可能停止"
- 大跌日：必须给出更大图景（如"距季度高点仅回调5%"）
- 禁止使用：末日、狂欢、疯狂、崩盘（除非真的跌超10%）
- 语气有观点但克制，避免过度乐观或悲观

## 事实核查规则
- "创新高"必须确认是历史最高，并标明时间范围（如"创三个月新高"）
- "暴跌/暴涨"需有具体百分比支撑（通常>5%）
- 任何数字、排名的 claim 必须能在源数据中找到依据
- 源数据不明确时，使用保守表述
- 如果某只股票的数据中 data_unavailable=true 或价格为 null，说明数据暂时无法获取。直接告诉用户"今日数据暂时无法获取，建议直接查看行情软件"，绝对不要猜测或编造价格

## 持仓 vs 关注
- portfolio_symbols 中的标的是用户实际持有的股票，分析时侧重风险、对用户的影响、与投资画像的匹配
- watchlist_only_symbols 中的标的是用户仅关注但未持仓的，侧重机会、时机、是否值得建仓
- 对持仓标的使用"你持有的 X"、"你的 X 仓位"等措辞
- 对关注标的使用"你关注的 X"、"你观察中的 X"等措辞
- 如果 portfolio_symbols 为空（用户未设置模拟持仓），对所有标的使用中性的"你的 X"措辞

## 你的思考过程

分析数据时，问自己:
1. 今天哪只股票有异常? 为什么?
2. 新闻里什么会真正影响用户关注的股票?
3. 未来一周有什么事件需要提前关注?
4. 如果只能说一句话，最重要的是什么?

---

## 输出字段指南

### greeting（开场）
日期 + 一句有温度的引子，让用户想继续看下去。
格式: "YYYY年MM月DD日 | [引子]"
示例: "2024年12月18日 | 科技股集体反弹，你关注的股票今天表现不错"
示例: "2024年12月19日 | 市场震荡，但有一个消息你需要知道"

### one_line_summary（一句话总结）
用一句话讲整个关注列表今天的核心故事，不是某一只股票的表现。要有洞见。
好的示例: "AI板块集体反弹带动你的关注列表跑赢大盘，但AAPL拖了后腿"
不好的示例: "NVDA今天涨了3%"（只是单只股票，不是组合故事）
不好的示例: "今日关注股票涨跌不一"（没有洞见）

### stocks（关注股票速览）
**重要：必须为 user_symbols 中的每一只股票生成分析，不能遗漏任何一只。**

按重要性排序（波动最大或最值得关注的在前），但所有股票都必须包含在输出中。
即使某只股票今天没有相关新闻，也要根据价格走势和市场环境给出观察分析。

每只股票包含:
- symbol: 股票代码
- name: 中文公司名（如"英伟达"、"苹果"、"特斯拉"）
- price: 当前价格（从输入数据获取）
- daily_change: 日涨跌幅，带+/-号（如"+2.35%"或"-1.20%"）
- status: 用自然语言描述当前状态，不要用固定分类
  好的示例: "连涨四天后首次回调，但AI需求逻辑没变"、"跟随板块下跌，关注周五PCE数据能否止跌"、"财报后持续消化中，下周指引日会是关键节点"
  不好的示例: "强势上涨"、"小幅回调"（太模板化，没有前因后果）
- quick_take: 3-4句深度分析，包含清晰的逻辑链条:
  1) 今天发生了什么（股价表现 + 触发原因）
  2) 为什么会这样（新闻催化剂、宏观环境、板块趋势——把大图景和这只股票连起来）
  3) 所以呢（对这只股票的中期逻辑有没有影响？是强化了还是削弱了买入/持有的理由？）
  4) 接下来关注什么（具体的后续条件、日期、数据，什么情况下需要重新评估）
  注意: 聚焦新闻、情绪、叙事分析，不要做技术面分析（不提支撑位/阻力位）

### news（与我相关的新闻）
从输入新闻中精选与用户关注股票相关的重要新闻，分为 headlines（深度分析）和 briefs（简短分析）两类。

**什么是"新闻"？——用"今天发生了什么"测试**
每条新闻必须能用"[某公司/某人] 做了 [某事]"来概括。如果概括不出来，它就不是新闻，不要选。

是新闻（有人做了某事）：
- "英伟达CEO黄仁勋表示AI需求远超预期" -> 黄仁勋发表了声明
- "亚马逊宣布2000亿美元AI投资计划" -> 亚马逊做了决定
- "Coinbase Q4营收同比增长120%" -> Coinbase公布了财报
- "美联储维持利率不变" -> 美联储做了决定

不是新闻（不要选）：
- "分析师认为英伟达被高估" -> 个人观点，不是事件
- "为什么AMD是2026年最值得买入的股票" -> 荐股文章，不是事件
- "英伟达三年后会站在哪里" -> 展望文章，不是事件
- "美股本周回顾与展望" -> 市场综述，不是具体事件
- "COIN本周下跌15%背后的原因" -> 股价复盘，不是新发生的事

#### headlines（重要新闻，3-4条）
选择对用户关注的股票影响最大的新闻，进行深度解读。

筛选标准（全部满足）:
1. 有实质性的新事件发生（不是预告、不是评论、不是股价复盘）
2. 与用户关注的股票直接相关，或影响其所在板块
3. 公司官方重大公告（财报、并购、产品发布）、行业/宏观政策变动、可能改变投资逻辑的突发事件

每条 headline 包含:
- title: 中文新闻标题
- related_symbols: 影响哪些关注股票（如 ["NVDA", "AMD"]）
- fact_summary: 一句话事实总结（必须是事件，不是观点）
- deep_analysis: 6-7句深度分析:
  1) 背景上下文
  2) 为什么这条新闻重要
  3) 对市场/板块的影响
  4) 对用户关注股票的具体影响
  5) 后续需要关注什么
  6) 用户该怎么想这件事（这个事件改变了什么？用户需要因此调整关注重点吗？如果不需要，为什么可以放心？如果需要，该关注什么后续条件？）
- url: 原文链接

#### briefs（其他新闻，8-10条）
其他值得关注但不需要深度解读的新闻。同样必须是真实事件，不是分析文章。

每条 brief 包含:
- title: 中文新闻标题
- related_symbols: 影响哪些关注股票
- summary: 一句话总结（必须是"谁做了什么"的格式）
- analysis: 2-3句分析为什么重要、对关注股票的影响
- url: 原文链接

筛选原则:
- 必须通过"今天发生了什么"测试
- 必须与用户某只关注股票直接相关，或影响其所在板块
- 如果某只股票确实没有相关新闻，不必强行添加
- 不选: 分析师观点、荐股文章、股价复盘、市场综述、与关注股票无关的新闻

### events（未来两周关注）
从经济日历和财报日历中筛选与用户关注股票相关的事件，通常6-10个。
个性化日报应该比标准日报包含更多细节，因为这些事件与用户的持仓直接相关。

筛选标准（按优先级）:
1. **必选**: 用户关注公司的财报日期（watchlist 中任何股票的财报都要包含）
2. **必选**: 重大宏观数据（CPI、非农、Fed利率决议、GDP）
3. **推荐**: 影响用户关注股票所在板块的行业数据（如半导体销售数据影响 NVDA/AMD）
4. **推荐**: 相关公司财报（如用户关注 NVDA，则 AMD/MU/SMCI 财报也相关）
5. 不选: 与用户关注股票完全无关的事件

每个事件包含:
- date: 日期（YYYY-MM-DD格式，从输入数据复制）
- event: 中文事件名（如"英伟达 (NVDA) Q3财报"、"美国12月CPI数据"）
- related_symbols: 影响哪些关注股票
- why_important: 2-3句解释为什么这个事件对"用户的关注列表"特别重要（不是对所有人）。必须包含：
  1) 传导链：这个事件会如何传导到用户关注的具体股票？列出受影响的 symbol。
  2) "如果X -> 则Y"的条件分析。
  对于个股财报：不能只讲这只股票本身，必须说明它对用户关注列表中其他股票的连锁影响。
  好的示例: "NVDA财报是你关注列表的风向标——你持有的AMD、AVGO、MU都在同一条AI供应链上。如果数据中心营收增速超60%，这三只可能跟涨；低于50%则整条链承压。"
  不好的示例: "NVDA财报很重要，关注数据中心收入。"（没说对组合的影响）
  对于宏观数据：不能只说"对市场重要"，必须说明对用户特定持仓结构的差异化影响。
  好的示例: "你的关注列表重仓高估值成长股，对利率极其敏感。PCE不同于已公布的CPI，它是美联储实际决策依据。如果核心PCE超预期，降息预期推迟将首先冲击你持有的高PE标的（如AMD 79倍PE、NET 200倍PS）。"
  不好的示例: "PCE是重要通胀指标，可能影响市场走势。"（对谁都一样，没有个性化）

### summary（综合总结）
这是最重要的部分。如果用户只看这一段，也要能知道今天的重点和接下来该关注什么。

包含一个字段 content，写成三段话（用换行分隔），不要加小标题:

第一段: 深度解读
不要只描述"发生了什么"，而要提炼出一个判断性命题（一句话核心观点），然后用数据和事件去论证它。读完这段，用户应该记住一个清晰的观点，而不只是一堆事实。
好的示例: "今天的行情说明一件事：资金正在从'AI信仰'切换到'流动性博弈'。CPI降至2.4%本应利好科技股，但你的关注列表里半导体集体下跌，加密却暴涨——这不是随机波动，而是市场在告诉你，当前的主线已经不是AI叙事，而是谁对降息最敏感。你的组合整体跑赢纳斯达克(-0.22%)，但赢在加密，输在芯片。"
不好的示例: "今日关注列表呈现二元分化，加密涨了，半导体跌了。"（只是描述现象，没有判断）

第二段: 波动归因
解释为什么今天这些股票会这样表现，将宏观因素（美联储、利率、情绪、板块轮动）与具体新闻催化剂结合起来，明确因果关系。
示例: "今日上涨主要受两个因素驱动：1) 美联储会议纪要偏鸽，市场降息预期升温，推动成长股估值修复；2) NVDA财报余温延续，带动整个AI/半导体板块轮动。AAPL的下跌则是因为早盘彭博报道中国市场份额被华为蚕食。"
关键要求：宏观因素不能悬在空中，必须落地到具体股票。
不要写: "美联储偏鸽推动成长股反弹"（太笼统）
应该写: "美联储偏鸽直接利好你关注的高估值标的——AMD（PE 79倍）和META（PE 28倍）对利率预期最敏感，这解释了它们今天领涨；而AAPL估值相对低，反应就小得多"

第三段: 未来展望
用"未来N个关键场景需要预演"的编号框架，每个场景必须包含：具体日期 + 具体触发条件（带数字阈值）+ 对你关注列表的具体后果。场景之间要有清晰的分隔，不要写成一段连续的文字流。
最后可以加一个超越当日视野的洞见（比如组合中哪个被忽视的标的正进入机会区间、或者哪个风险正在被低估）。
好的示例: "未来一周有三个关键场景需要预演：1) 周三FOMC纪要——如果措辞显示美联储对2.4%的CPI感到满意并暗示提前降息，你列表中的高PE标的（NET、META）将迎来估值修复；反之则继续承压。2) 周五核心PCE——环比若超0.3%，降息叙事破裂，加密三剑客（COIN/MSTR/HOOD）的反弹可能夭折。3) 下周三NVDA财报——数据中心营收增速是60%还是50%，将决定你持有的AMD、MU、AVGO是跟涨还是踩踏。另外值得注意的是，NET在本轮调整中逆势走强，如果上述宏观场景偏鸽，它可能是组合中弹性最大的标的。"
不好的示例: "未来需要关注FOMC和PCE数据，如果偏鸽会利好科技股。"（太笼统，没有编号、没有数字、没有对组合的差异化分析）
注意: 不要使用"降准"一词（那是中国央行的操作），美联储的操作是"降息"。

### action_items（站内可执行动作，0-3 条，可选）

只输出用户能在本网站上立即完成的动作。如果某个建议用户需要去别处做
（买入、卖出、看外部新闻），那是信息，应该写进 summary，不要放 action_items。

每条必须包含：
- label: ≤12 字的中文动作标签
- target: 必须是下面的白名单之一
- reason: 1-2 句话，引用具体上下文——action_context 里的字段（missing_thesis_symbols / days_since_* / symbols_with_today_events）、组合归因、或 previous_digest_dates 里具体日期的观点
- priority: 1-3，1 最重要

Target 白名单（只能使用这些，其他一律丢弃）：
- thesis:<SYMBOL>  — SYMBOL 必须在 action_context.missing_thesis_symbols 中
- portfolio / health / watchlist
- stock:<SYMBOL>   — SYMBOL 必须在用户持仓或 watchlist 中（user_symbols / portfolio_symbols）
- section:events / section:headlines / section:briefs / section:notes
- digest:<YYYY-MM-DD> — 日期必须在 action_context.previous_digest_dates 中存在

产出原则：
1) 确实没必要做就返回空列表，不要凑数
2) 不重复：多条 action 指向同一 section 或 stock 时合并成一条
3) reason 必须具体（引用字段/日期/事件），禁止泛泛而谈
4) Label 必须描述用户在本网站上能完成的实际操作：
   - "补论点"、"看体检"、"回看 4/21 日报"、"更新持仓信息" ✓
   - "买入"、"卖出"、"止损"、"调仓"、"减持"、"对冲" ✗（实盘行为，站内无法完成）
   - "关注"、"留意"、"思考"、"考虑" ✗（不是动作，是情绪）

好示例：
{"label":"补 NVDA 投资论点","target":"thesis:NVDA",
 "reason":"你持有 NVDA 但还没写论点，今日 NVDA 财报临近，梳理清楚持有逻辑有助于应对后续波动",
 "priority":1}

{"label":"回看 4/21 美联储预警","target":"digest:2026-04-21",
 "reason":"当日 summary 担心美联储鹰派转向，今日核心 PCE 数据坐实这一走向",
 "priority":2}

坏示例：
{"label":"关注市场","target":"section:events","reason":"今日有重要事件"}
（reason 泛泛，没有引用具体字段/日期/事件）

{"label":"考虑买入 NVDA","target":"stock:NVDA","reason":"技术面好"}
（投资建议；reason 空洞；stock:<SYM> 应该用于"引导看个股详情"，不是"推荐交易"）

{"label":"在券商买入 500 股","target":"stock:NVDA","reason":"逻辑强化"}
（实盘操作——本站无法下单。任何涉及真实买入/卖出/建仓/止损/调仓的动作都不能
作为 action，这类建议写进 summary 的叙事里）

{"label":"设置止损价","target":"portfolio","reason":"波动加剧"}
（模拟持仓不支持止损。产出用户点进去发现做不了的 action 是最严重的误导。
拿不准某个 target 能否实际完成动作时，别产出）
"""


# Two-tier model routing:
#   free  -> gemini-3-flash-preview     (cheap, fast, template-y)
#   paid  -> gemini-3.1-pro-preview     (deeper analysis, better differentiation)
# Paid users are identified by the "personal_digest_email" entitlement (Pro+ tier).
FREE_TIER_MODEL = "gemini-3-flash-preview"
PAID_TIER_MODEL = "gemini-3.1-pro-preview"
PAID_ENTITLEMENT = "personal_digest_email"

personal_digest_agent_free = LlmAgent(
    name="personal_digest_free",
    model=FREE_TIER_MODEL,
    description="Generates personalized daily digest (free tier)",
    instruction=DIGEST_INSTRUCTION,
    output_schema=PersonalDigestOutput,
    output_key="digest",
)

personal_digest_agent_paid = LlmAgent(
    name="personal_digest_paid",
    model=PAID_TIER_MODEL,
    description="Generates personalized daily digest (paid tier)",
    instruction=DIGEST_INSTRUCTION,
    output_schema=PersonalDigestOutput,
    output_key="digest",
)

# Backward-compat alias — existing code paths that import `personal_digest_agent`
# continue to work and resolve to the free-tier agent.
personal_digest_agent = personal_digest_agent_free


# =============================================================================
# Action Context Helper
# =============================================================================


_EMPTY_ACTION_CONTEXT: dict = {
    "missing_thesis_symbols": [],
    "days_since_last_health_check": None,
    "days_since_last_portfolio_update": None,
    "symbols_with_today_events": [],
    "previous_digest_dates": [],
}


def build_action_context(
    *,
    portfolio_holdings: list[dict],
    health_latest_generated_at: str | None,
    portfolio_confirmed_at: str | None,
    upcoming_events: list[dict],
    previous_digests: list[dict],
    now_iso: str,
) -> dict:
    """Assemble the action_context block fed to the digest LLM.

    Exposed as a standalone function for unit testing.
    """

    def _days_since(iso: str | None) -> int | None:
        if not iso:
            return None
        try:
            stamp = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
            # Naive datetimes may arrive from storage columns without tzinfo.
            # Assume UTC so we can diff against the always-aware `now_iso`.
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            if now.tzinfo is None:
                now = now.replace(tzinfo=timezone.utc)
            return (now - stamp).days
        except Exception as e:
            logger.debug("days_since parse failed for %r: %s", iso, e)
            return None

    missing_thesis = [
        h["symbol"] for h in portfolio_holdings
        if h.get("symbol") and h["symbol"] != "$CASH" and not (h.get("thesis") or "").strip()
    ]

    events_symbols: set[str] = set()
    for ev in upcoming_events:
        for sym in ev.get("related_symbols", []) or []:
            events_symbols.add(sym)

    return {
        "missing_thesis_symbols": missing_thesis,
        "days_since_last_health_check": _days_since(health_latest_generated_at),
        "days_since_last_portfolio_update": _days_since(portfolio_confirmed_at),
        "symbols_with_today_events": sorted(events_symbols),
        "previous_digest_dates": [d.get("date", "")[:10] for d in previous_digests if d.get("date")],
    }


# =============================================================================
# PersonalDigest Wrapper Class
# =============================================================================


class PersonalDigest:
    """Wrapper class to fetch user-specific data and run the digest agent."""

    DEFAULT_MACRO_SYMBOLS = ["SPY", "QQQ", "^VIX"]

    def __init__(self):
        self._runner_free = InMemoryRunner(
            agent=personal_digest_agent_free, app_name="personal_digest"
        )
        self._runner_paid = InMemoryRunner(
            agent=personal_digest_agent_paid, app_name="personal_digest"
        )
        # Backward-compat: tests that monkey-patch self._runner still work
        self._runner = self._runner_free

    async def _resolve_runner_for_user(self, user_id: str | None):
        """Pick paid vs free runner based on subscription entitlement.

        Returns (runner, tier_label, model_name). Falls back to free on any
        error (no DB access locally, transient Insforge failure, etc.) so
        that digest generation never breaks because the entitlement check did.
        """
        if user_id:
            try:
                from app.features.payment.entitlements import has_entitlement
                if await has_entitlement(user_id, PAID_ENTITLEMENT):
                    return self._runner_paid, "paid", PAID_TIER_MODEL
            except Exception as e:
                logger.warning(
                    "Entitlement check failed for %s; defaulting to free model: %s",
                    (user_id or "?")[:8], e,
                )
        return self._runner_free, "free", FREE_TIER_MODEL

    async def generate(
        self,
        symbols: list[str],
        user_id: str = None,
    ) -> dict:
        """
        Generate personalized digest for user's watchlist.

        Args:
            symbols: User's watchlist symbols (e.g., ["AAPL", "MSFT", "NVDA"])
            user_id: Optional user ID for fetching previous digests (narrative continuity)

        Returns:
            Structured digest report
        """
        try:
            if not symbols:
                return {"success": False, "error": "No symbols provided"}

            # Deduplicate and limit to 25 stocks max
            seen = set()
            unique_symbols = []
            for s in symbols:
                s_upper = s.upper()
                if s_upper not in seen:
                    seen.add(s_upper)
                    unique_symbols.append(s_upper)
            symbols = unique_symbols[:25]
            logger.info("Generating digest for: %s", symbols)

            # Step 1: Fetch user-specific stock data via data_tools (batch-quote + cache)
            logger.info("Fetching stock quotes via data_tools...")
            fmp_result = get_batch_quotes(symbols)
            stock_data = {"status": "success", "stocks": {}}
            for quote in fmp_result.get("quotes", []):
                sym = quote.get("symbol", "")
                if sym:
                    stock_data["stocks"][sym] = {
                        "name": quote.get("name", sym),
                        "price": quote.get("price", 0),
                        "previous_close": quote.get("previous_close", 0),
                        "daily_change": quote.get("daily_change", 0),
                        "day_high": quote.get("day_high", 0),
                        "day_low": quote.get("day_low", 0),
                    }

            # Guard: identify symbols with no data (API failure or delisted)
            fetched_symbols = set(stock_data["stocks"].keys())
            missing_symbols = [s for s in symbols if s not in fetched_symbols]
            if missing_symbols:
                logger.warning(
                    "Missing stock data for %d/%d symbols: %s",
                    len(missing_symbols), len(symbols), missing_symbols,
                )
                for sym in missing_symbols:
                    stock_data["stocks"][sym] = {
                        "name": sym,
                        "price": None,
                        "daily_change": None,
                        "day_high": None,
                        "day_low": None,
                        "data_unavailable": True,
                    }

            logger.info(
                "Stock data: %d fetched, %d missing",
                len(fetched_symbols), len(missing_symbols),
            )

            # Step 1.5: Enrich each stock with authoritative profile facts
            # (sector / industry / description / Chinese name) so the LLM doesn't
            # rely on its training-data guess for tickers that have been renamed
            # or rebranded (e.g. PSTG -> Everpure). FMP profile is the source of
            # truth; cache hit rate ~99% via shared profile_cache.
            try:
                profiles = await get_profiles_cached(symbols)
                for sym, raw in profiles.items():
                    summary = summarize_for_prompt(raw)
                    if not summary:
                        continue
                    entry = stock_data["stocks"].get(sym)
                    if not entry:
                        continue
                    if summary.get("company_name"):
                        entry["company_name"] = summary["company_name"]
                    if summary.get("company_name_zh"):
                        entry["company_name_zh"] = summary["company_name_zh"]
                    if summary.get("sector"):
                        entry["sector"] = summary["sector"]
                    if summary.get("industry"):
                        entry["industry"] = summary["industry"]
                    if summary.get("description"):
                        entry["description"] = summary["description"]
            except Exception as e:
                logger.warning("Profile enrichment failed, continuing without: %s", e)

            # Step 2: Fetch news filtered by user's symbols + macro symbols
            logger.info("Fetching news...")
            news_symbols = symbols + self.DEFAULT_MACRO_SYMBOLS
            news_result = get_combined_market_news(days=1, symbols=news_symbols)

            # Step 3: Fetch calendars (14 days for more comprehensive coverage)
            logger.info("Fetching calendars...")
            calendar_result = get_economic_calendar(days=14)
            earnings_result = get_earnings_calendar(days=14)

            # Step 4: Get macro context (simplified)
            logger.info("Fetching macro context...")
            market_data = get_all_market_data()
            macro_summary = self._extract_macro_summary(market_data)

            # Step 4.5: Fetch previous digests for narrative continuity
            previous_digests = []
            if user_id:
                try:
                    recent_digests = await digest_db.list_user_digests(user_id, limit=5)
                    for d in reversed(recent_digests):  # oldest first
                        digest_data = d.get("digest_data", {})
                        summary_data = digest_data.get("summary", {})
                        summary_content = (
                            summary_data.get("content", "")
                            if isinstance(summary_data, dict)
                            else ""
                        )
                        previous_digests.append(
                            {
                                "date": d.get("digest_date", "")[:10],
                                "one_line_summary": d.get("one_line_summary", ""),
                                "summary": summary_content,
                            }
                        )
                    logger.info("Loaded %d previous digests", len(previous_digests))
                except Exception as e:
                    logger.warning("Could not load previous digests: %s", e)

            # Step 4.6: Fetch user investment profile for personalization
            profile = None
            if user_id:
                try:
                    profile = await portfolio_db.get_profile(user_id)
                    logger.info("Loaded profile for user %s: style=%s", user_id, profile.style)
                except Exception as e:
                    logger.warning("Could not load profile for user %s: %s", user_id, e)

            # Fetch latest health check timestamp for action_context
            health_generated_at = None
            if user_id:
                try:
                    from app.features.portfolio_health.service import get_latest as get_latest_health
                    h = await get_latest_health(user_id)
                    if h and getattr(h, "generated_at", None):
                        gen = h.generated_at
                        health_generated_at = (
                            gen.isoformat() if hasattr(gen, "isoformat") else str(gen)
                        )
                except Exception as e:
                    logger.warning("Could not load health latest for action_context: %s", e)

            # Step 5: Prepare data for agent
            report_date = format_report_date()

            # Load portfolio for differentiation
            portfolio_rows = []
            portfolio_symbols_set = set()
            try:
                if user_id:
                    portfolio_rows = await portfolio_db.list_portfolio(user_id)
                portfolio_symbols_set = {r.symbol for r in portfolio_rows if r.symbol != "$CASH"}
            except Exception:
                logger.warning("Failed to load portfolio for agent context", exc_info=True)

            data_for_agent = {
                "report_date": report_date,
                "user_symbols": symbols,
                "portfolio_symbols": [s for s in symbols if s in portfolio_symbols_set],
                "watchlist_only_symbols": [s for s in symbols if s not in portfolio_symbols_set],
                "stocks": stock_data.get("stocks", {}),
                "news": self._clean_news(
                    news_result.get("news", [])[:50]
                ),  # Increased from 30 to 50
                "economic_calendar": calendar_result.get("events", [])[
                    :25
                ],  # Increased from 15 to 25
                "earnings_calendar": self._filter_earnings(
                    earnings_result.get("earnings", []), symbols
                ),
                "macro_summary": macro_summary,
            }

            if profile:
                data_for_agent["user_profile"] = {
                    "style": profile.style,
                    "horizon": profile.horizon,
                    "risk_tolerance": profile.risk_tolerance,
                }

            if previous_digests:
                data_for_agent["previous_digests"] = previous_digests

            # Action items context — fed to agent for thesis/health/staleness judgment
            try:
                holdings_for_ctx = [
                    {"symbol": r.symbol, "thesis": getattr(r, "thesis", "")}
                    for r in portfolio_rows
                ]
                data_for_agent["action_context"] = build_action_context(
                    portfolio_holdings=holdings_for_ctx,
                    health_latest_generated_at=health_generated_at,
                    portfolio_confirmed_at=(
                        profile.portfolio_confirmed_at.isoformat()
                        if profile and profile.portfolio_confirmed_at else None
                    ),
                    upcoming_events=earnings_result.get("earnings", [])
                        + calendar_result.get("events", []),
                    previous_digests=previous_digests,
                    now_iso=datetime.now(timezone.utc).isoformat(),
                )
            except Exception:
                logger.warning(
                    "Failed to assemble action_context for user %s",
                    user_id or "unknown", exc_info=True,
                )
                data_for_agent["action_context"] = _EMPTY_ACTION_CONTEXT.copy()

            # Step 6: Run agent (model tier picked from user entitlement)
            runner, tier_label, model_name = await self._resolve_runner_for_user(user_id)
            logger.info(
                "Running agent (tier=%s, model=%s) for user=%s",
                tier_label, model_name, (user_id or "?")[:8],
            )

            session = await runner.session_service.create_session(
                app_name="personal_digest", user_id="digest"
            )

            profile_header = inject_profile("", profile) if profile else ""
            message = Content(
                parts=[
                    Part(
                        text=f"{profile_header}Generate personalized digest for user watchlist:\n\n{json.dumps(data_for_agent, ensure_ascii=False, indent=2, default=str)}"
                    )
                ],
                role="user",
            )

            async for _ in runner.run_async(
                user_id="digest", session_id=session.id, new_message=message
            ):
                pass

            # Get output from session state
            session_data = await runner.session_service.get_session(
                app_name="personal_digest", user_id="digest", session_id=session.id
            )

            digest_output = {}
            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                digest_output = state.get("digest", {})
                if isinstance(digest_output, str):
                    try:
                        digest_output = json.loads(digest_output)
                    except json.JSONDecodeError:
                        digest_output = {}

            news_data = digest_output.get("news", {})
            news_count = 0
            if isinstance(news_data, dict):
                news_count = len(news_data.get("headlines", [])) + len(
                    news_data.get("briefs", [])
                )
            logger.info(
                "Generation complete. Stocks: %d, News: %d, Events: %d",
                len(digest_output.get("stocks", [])),
                news_count,
                len(digest_output.get("events", [])),
            )

            self._attach_news_metadata(
                digest_output.get("news"), news_result.get("news", [])
            )

            return {
                "success": True,
                "timestamp": now_iso(),
                "symbols_used": symbols,
                "model_tier": tier_label,
                "model_name": model_name,
                **digest_output,
            }

        except Exception as e:
            logger.exception("Error generating personal digest")
            return {
                "success": False,
                "error": str(e),
                "timestamp": now_iso(),
            }

    def _extract_macro_summary(self, market_data: dict) -> dict:
        """Extract key macro indicators for context."""
        return {
            "sp500": market_data.get("equities", {}).get("S&P 500", {}),
            "nasdaq": market_data.get("equities", {}).get("Nasdaq", {}),
            "vix": market_data.get("volatility", {}).get("VIX", {}),
            "yield_10y": market_data.get("rates", {})
            .get("yield_curve", {})
            .get("10Y", {}),
            "dollar": market_data.get("currencies", {}).get("US Dollar", {}),
        }

    def _clean_news(self, news: list) -> list:
        """Clean news for token efficiency."""
        return [
            {
                "title": n.get("title", ""),
                "text": n.get("text", "")[:500],
                "url": n.get("url", ""),
                "publishedDate": n.get("publishedDate", ""),
                "symbol": n.get("symbol", ""),
            }
            for n in news
            if n.get("title")
        ]

    def _attach_news_metadata(
        self, news_section: dict | None, source_news: list
    ) -> None:
        """Attach publish timestamps to digest news using URL/title matching."""
        if not isinstance(news_section, dict) or not source_news:
            return

        url_to_published_at = {}
        title_to_published_at = {}
        for article in source_news:
            url = article.get("url", "")
            published_at = article.get("publishedDate", "") or ""
            title = article.get("title", "")
            if url:
                url_to_published_at[url] = published_at
            if title and title not in title_to_published_at:
                title_to_published_at[title] = published_at

        for item in news_section.get("headlines", []) + news_section.get("briefs", []):
            if not isinstance(item, dict):
                continue
            url = item.get("url", "")
            title = item.get("title", "")
            item["published_at"] = url_to_published_at.get(
                url
            ) or title_to_published_at.get(title, "")

    def _filter_earnings(self, earnings: list, user_symbols: list) -> list:
        """Filter earnings to user's watchlist + major tech + related companies."""
        user_set = set(s.upper() for s in user_symbols)
        # Always include major tech earnings as reference
        always_show = {"NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "AMD"}
        # Add semiconductor ecosystem if user watches any chip stocks
        chip_stocks = {
            "NVDA",
            "AMD",
            "INTC",
            "AVGO",
            "QCOM",
            "MU",
            "TSM",
            "ARM",
            "SMCI",
            "AMAT",
            "LRCX",
            "KLAC",
        }
        if user_set & chip_stocks:
            always_show = always_show.union(chip_stocks)
        relevant = always_show.union(user_set)

        filtered = [e for e in earnings if e.get("symbol", "").upper() in relevant]
        return filtered[:25]  # Increased from 15 to 25


# =============================================================================
# Singleton Instance
# =============================================================================

_personal_digest_instance = None


def get_personal_digest() -> PersonalDigest:
    """Get singleton PersonalDigest instance."""
    global _personal_digest_instance
    if _personal_digest_instance is None:
        _personal_digest_instance = PersonalDigest()
    return _personal_digest_instance

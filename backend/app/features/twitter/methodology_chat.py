"""
KOL methodology chat.

This module answers user questions with the distilled methodology package under
`methodologies/<analyst>/`. It does not impersonate the KOL; it explains how the
question looks through the extracted framework and cites tweet evidence.
"""

import json
import os
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import BaseModel, Field, ValidationError

from app.core.logging import get_logger
from app.features.twitter.live_context import LiveContext, build_live_context
from app.features.twitter.methodology_models import MethodologyCategory

logger = get_logger(__name__)

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

MODEL = "gemini-3.1-pro-preview"
APP_NAME = "twitter_methodology_chat"
_BASE_DIR = Path(__file__).resolve().parent / "methodologies"
_DEFAULT_ANALYST = "qinbafrank"

ChatRole = Literal["user", "assistant"]


class MethodologyChatMessage(BaseModel):
    role: ChatRole
    content: str = Field(..., min_length=1, max_length=4000)


class MethodologyChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    username: str = Field(default=_DEFAULT_ANALYST, min_length=1)
    category: MethodologyCategory | None = None
    history: list[MethodologyChatMessage] = Field(default_factory=list, max_length=12)


class MethodologyCitation(BaseModel):
    tweet_id: str
    quote: str
    reason: str


class MethodologyChatOutput(BaseModel):
    analyst: str
    category: MethodologyCategory
    answer: str = Field(description="Chinese answer for the user.")
    citations: list[MethodologyCitation] = Field(default_factory=list, max_length=6)
    confidence: Literal["high", "medium", "low"]
    limitations: list[str] = Field(default_factory=list, max_length=4)
    suggested_followups: list[str] = Field(default_factory=list, max_length=4)


class MethodologyChatResponse(MethodologyChatOutput):
    live_context: dict[str, Any]


_CATEGORY_KEYWORDS: list[tuple[MethodologyCategory, tuple[str, ...]]] = [
    (
        "macro_analysis",
        (
            "宏观",
            "美联储",
            "fed",
            "fomc",
            "利率",
            "降息",
            "加息",
            "通胀",
            "cpi",
            "pce",
            "流动性",
            "tga",
            "rrp",
            "准备金",
            "地缘",
            "原油",
            "黄金",
            "霍尔木兹",
        ),
    ),
    (
        "sector_analysis",
        (
            "行业",
            "板块",
            "产业链",
            "赛道",
            "半导体",
            "存储",
            "光模块",
            "云",
            "ai infra",
        ),
    ),
    (
        "trading_strategy",
        (
            "买点",
            "卖点",
            "加仓",
            "减仓",
            "仓位",
            "交易",
            "入场",
            "出场",
            "止损",
            "抄底",
        ),
    ),
    (
        "methodology",
        (
            "方法论",
            "怎么分析",
            "分析框架",
            "思维方式",
            "原则",
            "如何看",
            "怎么看待",
        ),
    ),
]

_STOCK_HINTS = (
    "股票",
    "个股",
    "财报",
    "估值",
    "eps",
    "pe",
    "peg",
    "nvda",
    "tsla",
    "aapl",
    "msft",
    "googl",
    "amzn",
    "meta",
    "avgo",
    "amd",
    "tsm",
)


def choose_methodology_category(message: str) -> MethodologyCategory:
    text = message.lower()
    for category, keywords in _CATEGORY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return category
    if any(keyword in text for keyword in _STOCK_HINTS):
        return "stock_analysis"
    return "methodology"


def _latest_methodology_json_path(username: str, category: MethodologyCategory) -> Path:
    log_dir = _BASE_DIR / username / "extraction_log"
    candidates = sorted(
        log_dir.glob(f"*-{category}-*.json"),
        key=lambda path: path.stat().st_mtime,
    )
    if not candidates:
        raise FileNotFoundError(
            f"No methodology artifact found for @{username} category={category}"
        )
    return candidates[-1]


def load_methodology_payload(username: str, category: MethodologyCategory) -> dict:
    path = _latest_methodology_json_path(username, category)
    return json.loads(path.read_text(encoding="utf-8"))


def _compact_methodology(payload: dict) -> dict:
    keep_keys = [
        "analyst",
        "category",
        "source_tweet_count",
        "methodology_version",
        "prompt_version",
        "data_preferences",
        "analytical_process",
        "decision_criteria",
        "communication_patterns",
        "veto_rules",
        "falsifiability_rules",
        "insufficient_evidence_notes",
    ]
    return {key: payload.get(key) for key in keep_keys if key in payload}


def _build_instruction(
    *,
    username: str,
    category: MethodologyCategory,
    methodology: dict,
    live_context: dict,
    message: str,
    history: list[MethodologyChatMessage],
) -> str:
    compact_history = [item.model_dump() for item in history[-8:]]
    return f"""
你是 TheMarketBrew 的 KOL 方法论对话助手。你正在帮助用户用 @{username} 的公开推文中蒸馏出的
方法论看问题，但你绝不能声称自己就是 @{username}，也不要替本人作新的承诺或预测。

# 回答目标

- 使用简体中文。
- 直接回答用户问题，不要写成报告。
- 明确区分：蒸馏体里有证据支持的框架、你基于框架做出的推断、当前缺少的数据。
- 至少引用 1 条 methodology evidence；如果问题和方法论不匹配，说明证据不足。
- 不要编造实时行情、财报数字、宏观数据。没有输入实时数据时，只能说“需要补充最新数据确认”。
- 如果可用实时上下文里有 quote/news/calendar，回答时要把这些作为“当前环境”描述；不要使用实时上下文之外的具体新闻或价格数字。
- 如果实时上下文为空或有 limitations，明确说数据缺口，不要用笼统判断冒充事实。
- 遇到投资建议问题时，用“观察条件/判断框架”表达，不给确定买卖指令。
- 回答开头不要说“我是 qinbafrank”。可以说“按 qinbafrank 方法论看”。

# 当前路由

analyst: {username}
category: {category}

# 用户历史消息

```json
{json.dumps(compact_history, ensure_ascii=False)}
```

# 本轮用户问题

{message}

# 可用方法论

```json
{json.dumps(_compact_methodology(methodology), ensure_ascii=False)}
```

# 当前实时上下文

```json
{json.dumps(live_context, ensure_ascii=False)}
```
"""


def _build_chat_agent(instruction: str) -> LlmAgent:
    return LlmAgent(
        name="kol_methodology_chat",
        model=MODEL,
        description="Answer user questions through a distilled KOL methodology",
        instruction=instruction,
        output_schema=MethodologyChatOutput,
        output_key="chat",
    )


async def _run_chat_agent(instruction: str) -> MethodologyChatOutput:
    agent = _build_chat_agent(instruction)
    runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
    user_id = f"{agent.name}_caller"
    session = await runner.session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
    )
    message = Content(parts=[Part(text="Answer the user now.")], role="user")

    async for _ in runner.run_async(
        user_id=user_id,
        session_id=session.id,
        new_message=message,
    ):
        pass

    session_data = await runner.session_service.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session.id,
    )
    state = (session_data.state if session_data else {}) or {}
    raw = state.get(agent.output_key)
    if raw is None:
        raise RuntimeError("kol_methodology_chat produced no output")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"kol_methodology_chat output was not valid JSON: {raw[:200]}"
            ) from exc
    try:
        return MethodologyChatOutput.model_validate(raw)
    except ValidationError as exc:
        raise RuntimeError(
            f"kol_methodology_chat output did not match schema: {exc}"
        ) from exc


async def answer_methodology_chat_with_context(
    request: MethodologyChatRequest,
    category: MethodologyCategory,
    methodology: dict,
    live_context: LiveContext,
) -> MethodologyChatResponse:
    instruction = _build_instruction(
        username=request.username,
        category=category,
        methodology=methodology,
        live_context=live_context.model_dump(),
        message=request.message,
        history=request.history,
    )
    output = await _run_chat_agent(instruction)
    output.analyst = request.username
    output.category = category
    response = MethodologyChatResponse(
        **output.model_dump(),
        live_context=live_context.model_dump(),
    )
    logger.info(
        "methodology chat username=%s category=%s citations=%d confidence=%s live_sources=%s",
        request.username,
        category,
        len(response.citations),
        response.confidence,
        ",".join(live_context.sources),
    )
    return response


async def answer_methodology_chat(
    request: MethodologyChatRequest,
) -> MethodologyChatResponse:
    category = request.category or choose_methodology_category(request.message)
    methodology = load_methodology_payload(request.username, category)
    live_context = await build_live_context(request.message)
    return await answer_methodology_chat_with_context(
        request=request,
        category=category,
        methodology=methodology,
        live_context=live_context,
    )

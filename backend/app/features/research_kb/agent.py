"""Research-KB chat agent.

Tool-driven RAG: the LlmAgent decides when to call `search_kb` to fetch
博主历史观点 chunks, optionally enriches with realtime market data tools
borrowed from the screener research agent, and answers in Chinese.
"""

import asyncio

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.core.feature_pause import require_active, model_pause_guard
from app.core.ai_models import GENERATIVE_MODEL
from app.core.config import AGENT_RUNTIME_RESEARCH_TIMEOUT_S
from app.core.logging import get_logger
from app.features.research_kb.models import (
    ResearchKBMessage,
    ResearchKBResponse,
)
from app.features.research_kb.tools import (
    get_chunks_buffer,
    reset_chunks_buffer,
    search_kb,
)
from app.shared.data_tools.research_tools import (
    get_market_overview,
    get_stock_fundamentals,
    get_stock_news,
    get_stock_quote,
    get_technical_analysis,
)
from app.shared.llm_metering import meter

logger = get_logger(__name__)

MODEL_NAME = GENERATIVE_MODEL
APP_NAME = "research_kb"

INSTRUCTION = """你是一名中文投研助手，核心能力是**基于博主历史观点知识库**回答用户的投研问题。

## 工具

- `search_kb(query, k=6)`：检索博主历史观点知识库。**任何用户提问，第一步都必须调用此工具**——用用户问题或其中关键的 ticker / 板块 / 主题作为 query。
- `get_market_overview()`：当前大盘 / 主要指数 / VIX / 国债 / 商品 / 汇率。问"今天市场怎么样"时调用。
- `get_stock_quote(symbols)`：当前股价、涨跌幅、市值。问具体某只票现状时调用。
- `get_stock_news(symbols, days)`：近期新闻摘要。补充博主观点的"现在发生了什么"时调用。
- `get_technical_analysis(symbol)`：技术指标 (RSI / SMA / 支撑阻力)。问技术面时调用。
- `get_stock_fundamentals(symbol)`：估值、盈利、成长性。问"现在贵不贵"时调用。

## 工作流

1. **第一步永远是 `search_kb`**：把博主观点拿出来。即便用户问的是"现在 NVDA 多少钱"这种事实性问题，也要先看博主有没有相关历史观点。
2. **判断 KB 命中情况**：
   - 命中：基于片段回答，**每条引用都要标注作者与日期**（从 title 字段读出），例如：@qinbafrank (2026-05-15) 认为...
   - 未命中或片段不够：可以调用市场数据工具补充事实，但要明确告知"知识库没有这方面的历史观点"。
3. **可选补充**：根据问题需要再调 1-2 个市场数据工具，避免过度调用。
4. **输出**：直接输出简体中文 Markdown 文本，**不要**包成 JSON、不要外层加 `{"answer": ...}`。可用列表 / 加粗 / 小标题，控制在 400 字以内。
5. **禁止**：编造没有来源的"博主观点"；复述片段元数据头（Source ID / Tweet type 等）。

## 示例

用户："qinbafrank 怎么看 AI 算力？"
→ 调 search_kb("qinbafrank AI 算力", k=6) → 基于返回片段总结其观点，标注作者+日期。

用户："NVDA 现在能买吗？"
→ 调 search_kb("NVDA 英伟达") → 看博主历史观点 → 再调 get_stock_quote(["NVDA"]) + get_stock_fundamentals("NVDA") 拿现状 → 综合作答。
"""


# We intentionally do NOT use output_schema here. Mixing output_schema with
# tools in ADK can short-circuit tool calls in some Gemini versions; rely on
# text output and extract it from the final session state instead.
_agent = LlmAgent(
    name="research_kb_agent",
    model=MODEL_NAME,
    instruction=INSTRUCTION,
    tools=[
        search_kb,
        get_market_overview,
        get_stock_quote,
        get_stock_news,
        get_technical_analysis,
        get_stock_fundamentals,
    ],
    before_model_callback=model_pause_guard("research_kb"),
    after_model_callback=meter("research_kb.chat", model=MODEL_NAME),
)


def _render_history(history: list[ResearchKBMessage]) -> str:
    if not history:
        return ""
    lines = ["## 历史对话"]
    for turn in history[-10:]:
        role = "用户" if turn.role == "user" else "助手"
        lines.append(f"{role}: {turn.content}")
    lines.append("")
    return "\n".join(lines)


async def _run_session(prompt: str) -> str:
    runner = InMemoryRunner(agent=_agent, app_name=APP_NAME)
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id="research_kb"
    )
    message = Content(parts=[Part(text=prompt)], role="user")

    final_text: str = ""
    try:
        async for event in runner.run_async(
            user_id="research_kb", session_id=session.id, new_message=message
        ):
            # Capture last assistant text. ADK emits intermediate events for
            # tool calls; the final response is the last event with text parts.
            content = getattr(event, "content", None)
            if content and getattr(content, "parts", None):
                for part in content.parts:
                    text = getattr(part, "text", None)
                    if text:
                        final_text = text
    except Exception as err:  # noqa: BLE001
        logger.warning("research_kb agent run error: %s", err)

    try:
        await runner.session_service.delete_session(
            app_name=APP_NAME, user_id="research_kb", session_id=session.id
        )
    except Exception:  # noqa: BLE001
        pass
    return final_text.strip()


async def answer(
    message: str,
    history: list[ResearchKBMessage],
) -> ResearchKBResponse:
    require_active("research_kb")
    reset_chunks_buffer()

    prompt_parts: list[str] = []
    history_block = _render_history(history)
    if history_block:
        prompt_parts.append(history_block)
    prompt_parts.append("## 用户问题")
    prompt_parts.append(message)
    prompt = "\n".join(prompt_parts)

    try:
        text = await asyncio.wait_for(_run_session(prompt), timeout=AGENT_RUNTIME_RESEARCH_TIMEOUT_S)
    except asyncio.TimeoutError:
        logger.warning("research_kb agent timeout: %s", message[:80])
        return ResearchKBResponse(
            answer="知识库助手响应超时，请稍后再试。",
            chunks_used=get_chunks_buffer(),
        )

    if not text:
        text = "知识库未命中相关观点，且未能从市场数据补充信息。"
    return ResearchKBResponse(answer=text, chunks_used=get_chunks_buffer())

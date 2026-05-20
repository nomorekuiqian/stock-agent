"""
Newsletter Agent - AI-powered newsletter content generation.

Uses Google ADK (LlmAgent + InMemoryRunner) to generate structured newsletter
content from user intent, following the same pattern as market/agent.py.
"""

import json
import os

from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.core.logging import get_logger
from app.features.subscription.models import NewsletterOutput
from app.shared.llm_metering import meter

NEWSLETTER_MODEL = "gemini-3.1-flash-lite-preview"

logger = get_logger(__name__)


NEWSLETTER_INSTRUCTION = """
你是 TheMarketBrew 的创始人 Golden，正在给订阅用户写一封邮件。

## 写作风格
- 像创始人写给朋友，不是公司写给客户
- 中文为主，温暖真诚，避免企业话术和营销腔
- 语气自然，像在微信上跟朋友分享
- 可以适当使用英文产品名或术语

## 输出规则
- subject: 邮件标题，简洁有吸引力，15-30字
- greeting: 开场白正文。注意：不要包含 "Hi xxx" 或任何称呼，模板会自动处理。直接写正文内容
- sections: 2-4个段落，每个有 title 和 content
  - title: 段落小标题，简短有力
  - content: 段落内容，支持 **加粗** 语法。自然流畅，不要堆砌
- closing: 结尾，邀请反馈 + 感谢，2-3句话
- sign_off_name: 默认 "Golden / 金黄"
- sign_off_title: 默认 "独立开发者 / 十年美股散户"

## 注意事项
- 根据用户提供的意图和语气来调整内容
- 内容要有信息量，不要空洞
- 每个 section 的 content 控制在 100-200 字
- 整封邮件阅读时间控制在 2-3 分钟
"""

newsletter_agent = LlmAgent(
    name="newsletter_writer",
    model=NEWSLETTER_MODEL,
    description="Generates newsletter content in Chinese with a warm, personal tone",
    instruction=NEWSLETTER_INSTRUCTION,
    output_schema=NewsletterOutput,
    output_key="newsletter",
    after_model_callback=meter("newsletter", model=NEWSLETTER_MODEL),
)


class NewsletterAgent:
    """Wrapper class to run the newsletter generation agent."""

    def __init__(self):
        self.runner = InMemoryRunner(
            agent=newsletter_agent, app_name="newsletter_agent"
        )

    async def generate(self, intent: str, tone: str = "warm", language: str = "zh") -> dict:
        """Generate newsletter content from user intent."""
        try:
            logger.info("Generating newsletter, tone=%s, lang=%s", tone, language)

            prompt_data = {
                "intent": intent,
                "tone": tone,
                "language": language,
            }

            session = await self.runner.session_service.create_session(
                app_name="newsletter_agent", user_id="newsletter"
            )

            message = Content(
                parts=[
                    Part(
                        text=f"Please generate a newsletter based on the following requirements:\n\n{json.dumps(prompt_data, ensure_ascii=False, indent=2)}"
                    )
                ],
                role="user",
            )

            async for event in self.runner.run_async(
                user_id="newsletter", session_id=session.id, new_message=message
            ):
                pass

            session_data = await self.runner.session_service.get_session(
                app_name="newsletter_agent",
                user_id="newsletter",
                session_id=session.id,
            )

            if session_data and hasattr(session_data, "state"):
                state = session_data.state or {}
                newsletter_data = state.get("newsletter", {})

                if isinstance(newsletter_data, str):
                    try:
                        newsletter_data = json.loads(newsletter_data)
                    except json.JSONDecodeError:
                        newsletter_data = {}

                if isinstance(newsletter_data, dict) and newsletter_data.get("subject"):
                    logger.info("Generated: %s", newsletter_data.get("subject", "")[:50])
                    return {"success": True, **newsletter_data}

            return {"success": False, "error": "Agent did not produce structured output"}

        except Exception as e:
            logger.exception("Error generating newsletter")
            return {"success": False, "error": str(e)}

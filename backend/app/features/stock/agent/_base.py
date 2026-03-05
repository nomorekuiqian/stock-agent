"""
Shared utilities for stock analysis agents.

Handles environment setup, ADK session management, and common imports.
"""

import json
import os
from typing import Any, Dict

from dotenv import load_dotenv

load_dotenv()

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")

from google.adk.runners import InMemoryRunner  # noqa: E402
from google.genai.errors import ServerError  # noqa: E402
from google.genai.types import Content, Part  # noqa: E402

from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)

FALLBACK_MODEL = "gemini-3.1-flash-lite-preview"


async def _run_single_session(
    runner: InMemoryRunner,
    app_name: str,
    prompt: str,
    output_key: str,
) -> Dict[str, Any]:
    """Run one ADK agent session and extract structured output from state."""
    session = await runner.session_service.create_session(
        app_name=app_name, user_id="analyst"
    )

    message = Content(
        parts=[Part(text=prompt)],
        role="user",
    )

    async for _ in runner.run_async(
        user_id="analyst", session_id=session.id, new_message=message
    ):
        pass

    session_data = await runner.session_service.get_session(
        app_name=app_name, user_id="analyst", session_id=session.id
    )

    result = {}
    if session_data and hasattr(session_data, "state"):
        state = session_data.state or {}
        result = state.get(output_key, {})
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except json.JSONDecodeError:
                logger.error(
                    "Agent output for %s is not valid JSON: %.200s",
                    output_key, result,
                )
                raise ValueError(
                    "Agent returned non-JSON output"
                )

    try:
        await runner.session_service.delete_session(
            app_name=app_name, user_id="analyst", session_id=session.id
        )
    except Exception:
        pass

    return result


async def run_agent_session(
    runner: InMemoryRunner,
    app_name: str,
    prompt: str,
    output_key: str,
) -> Dict[str, Any]:
    """Run an ADK agent session with automatic model fallback on 503.

    Tries the primary model first. If the Gemini API returns 503
    (model overloaded), temporarily switches to the fallback model
    and retries once.
    """
    try:
        return await _run_single_session(runner, app_name, prompt, output_key)
    except ServerError as e:
        if e.code != 503:
            raise

        agent = runner.agent
        primary_model = agent.model
        logger.warning(
            "Model %s returned 503, falling back to %s for %s",
            primary_model, FALLBACK_MODEL, app_name,
        )
        agent.model = FALLBACK_MODEL
        try:
            return await _run_single_session(runner, app_name, prompt, output_key)
        finally:
            agent.model = primary_model

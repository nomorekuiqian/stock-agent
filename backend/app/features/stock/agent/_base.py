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
from google.genai.types import Content, Part  # noqa: E402

from app.core.logging import get_logger  # noqa: E402

logger = get_logger(__name__)


async def run_agent_session(
    runner: InMemoryRunner,
    app_name: str,
    prompt: str,
    output_key: str,
) -> Dict[str, Any]:
    """Run an ADK agent session and extract structured output from state.

    Creates a session, sends the prompt, extracts the output_key from
    session state, and cleans up the session. Returns the parsed dict
    (empty dict on failure).
    """
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

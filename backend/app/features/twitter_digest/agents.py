"""
LlmAgent + InMemoryRunner singleton for the single-stage V1 digest pipeline.

V2 may add a separate "long-form deep summary" agent later; for V1 we only need one.
"""

import os

from dotenv import load_dotenv

load_dotenv()

# google-genai library reads GOOGLE_GENAI_API_KEY; we store the key as GOOGLE_API_KEY
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner

from app.features.twitter_digest.models import CuratedDigestOutput
from app.features.twitter_digest.prompts import CURATE_INSTRUCTION

MODEL = "gemini-3.1-pro-preview"
APP_NAME = "twitter_digest"


curate_agent = LlmAgent(
    name="kol_digest_curate",
    model=MODEL,
    description="Pick + categorize + translate + interpret high-signal KOL tweets",
    instruction=CURATE_INSTRUCTION,
    output_schema=CuratedDigestOutput,
    output_key="curated_digest",
)


_runners: dict[str, InMemoryRunner] = {}


def get_runner(agent: LlmAgent) -> InMemoryRunner:
    """Return a process-singleton InMemoryRunner for the given agent."""
    key = agent.name
    runner = _runners.get(key)
    if runner is None:
        runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
        _runners[key] = runner
    return runner

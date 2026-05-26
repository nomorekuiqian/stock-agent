"""
LlmAgent + InMemoryRunner singletons for the twitter digest pipeline.

Two agents, two models:
  - `enrich_agent` — gemini-3.1-flash-lite, minimal per-tweet enrichment
    (quality keep/drop + ticker_stances + sectors).
  - `curate_agent` — gemini-3.5-flash, ticker-clustered aggregation +
    editorial synthesis.
"""

import os

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

# google-genai library reads GOOGLE_GENAI_API_KEY; we store the key as GOOGLE_API_KEY
if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner

from app.features.twitter_digest.enrichment_prompts import ENRICH_INSTRUCTION
from app.features.twitter_digest.models import (
    CuratedDigestOutput,
    EnrichmentOutput,
)
from app.features.twitter_digest.prompts import CURATE_INSTRUCTION
from app.shared.llm_metering import meter

CURATE_MODEL = "gemini-3.5-flash"
ENRICH_MODEL = "gemini-3.1-flash-lite"
APP_NAME = "twitter_digest"


# ---------------------------------------------------------------------------
# Enrichment agent (Step 1)
# ---------------------------------------------------------------------------

class _EnrichmentBatchOutput(BaseModel):
    """Wrapper schema so the LlmAgent can return a list under structured output.

    google-adk's `output_schema` requires a single Pydantic model; we wrap the
    list in `enrichments` to satisfy that constraint.
    """

    enrichments: list[EnrichmentOutput] = Field(default_factory=list)


enrich_agent = LlmAgent(
    name="kol_digest_enrich",
    model=ENRICH_MODEL,
    description="Per-tweet enrichment: quality (keep/drop) + ticker_stances + sectors",
    instruction=ENRICH_INSTRUCTION,
    output_schema=_EnrichmentBatchOutput,
    output_key="enriched_batch",
    after_model_callback=meter("twitter_digest.enrich", model=ENRICH_MODEL),
)


# ---------------------------------------------------------------------------
# Curate agent (Step 2): ticker-clustered + direction-driven
# ---------------------------------------------------------------------------

curate_agent = LlmAgent(
    name="kol_digest_curate",
    model=CURATE_MODEL,
    description="Cluster by ticker, output buy/sell/observation arguments + macro threads + watchpoints",
    instruction=CURATE_INSTRUCTION,
    output_schema=CuratedDigestOutput,
    output_key="curated_digest",
    after_model_callback=meter("twitter_digest.curate", model=CURATE_MODEL),
)


# ---------------------------------------------------------------------------
# Runner singletons
# ---------------------------------------------------------------------------

_runners: dict[str, InMemoryRunner] = {}


def get_runner(agent: LlmAgent) -> InMemoryRunner:
    """Return a process-singleton InMemoryRunner for the given agent."""
    key = agent.name
    runner = _runners.get(key)
    if runner is None:
        runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
        _runners[key] = runner
    return runner

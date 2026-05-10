"""
LlmAgent + InMemoryRunner singletons for the V3 twitter digest pipeline.

Two agents, two models:
  - `enrich_agent` — gemini-3.1-flash-lite-preview, structured-extraction task
    (per-tweet quality + summary + tickers/sectors/events).
  - `curate_agent` — gemini-3.1-pro-preview, multi-tweet aggregation +
    editorial synthesis. The pro model is reused from V2 — same agent name
    and runner, but the prompt and output schema are V3.
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
    CuratedDigestOutputV4,
    EnrichmentOutput,
)
from app.features.twitter_digest.prompts import CURATE_INSTRUCTION
from app.features.twitter_digest.prompts_v4 import CURATE_INSTRUCTION_V4

CURATE_MODEL = "gemini-3.1-pro-preview"
ENRICH_MODEL = "gemini-3.1-flash-lite-preview"
APP_NAME = "twitter_digest"

# Backward compat: existing service.py imports `MODEL` for `model_version` writeback.
# After V3 cutover this is the digest-stage (pro) model; tagged in the persisted
# row as `v3:enrich={ENRICH_MODEL}/digest={CURATE_MODEL}`.
MODEL = CURATE_MODEL


# ---------------------------------------------------------------------------
# Enrichment agent (V3 Step 1)
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
    description="Per-tweet enrichment: quality / summary / tickers / sectors / events",
    instruction=ENRICH_INSTRUCTION,
    output_schema=_EnrichmentBatchOutput,
    output_key="enriched_batch",
)


# ---------------------------------------------------------------------------
# Curate agent (V2 + V3 reuse same agent name; prompt/schema differ by version)
# ---------------------------------------------------------------------------

curate_agent = LlmAgent(
    name="kol_digest_curate",
    model=CURATE_MODEL,
    description="V3: cluster + synthesize multi-KOL views into topics + briefs + solo voices",
    instruction=CURATE_INSTRUCTION,
    output_schema=CuratedDigestOutput,
    output_key="curated_digest",
)


# V4: ticker-as-topic + 论据指向. Replaces V3 going forward; V3 agent kept for
# any reruns of historical data.
curate_agent_v4 = LlmAgent(
    name="kol_digest_curate_v4",
    model=CURATE_MODEL,
    description="V4: cluster by ticker, output buy/sell/observation arguments",
    instruction=CURATE_INSTRUCTION_V4,
    output_schema=CuratedDigestOutputV4,
    output_key="curated_digest_v4",
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

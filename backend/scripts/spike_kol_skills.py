"""
Phase 0 spike for KOL Persona Research Agent.

Verifies ADK SkillToolset integration before committing to the architecture
in docs/plans/active/kol-persona-research-agent.md.

5 spike questions:
  #1 Does SkillToolset coexist with `output_schema`?
  #2 Do `before_tool_callback` / `after_tool_callback` fire when skills activate?
  #3 Is skill body loading explicit (tool call) or implicit (auto-inject)?
  #4 Does a regular function tool (like search_kol_tweets) coexist with SkillToolset?
  #5 Does vector metadata filter for `author_username` push down to RPC?
     -> Already answered by code review: vector-store.sql uses `c.metadata @> (filters->'metadata')`
        with GIN index. Will be end-to-end verified after Phase 0.5 backfill, not in this script.

Run:
  conda run --no-capture-output -n stock_agent python scripts/spike_kol_skills.py
  or:
  source venv/bin/activate && python scripts/spike_kol_skills.py

Outputs:
  - System instruction (proves how skills XML gets injected)
  - All tool events fired during the run (proves callback hook)
  - LLM tool call sequence (proves explicit load_skill activation)
  - Final answer
  - Pass / Fail verdict per spike question
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
load_dotenv(REPO_ROOT / ".env", override=False)

if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY")


from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.adk.skills import models as skill_models
from google.adk.tools.skill_toolset import SkillToolset
from google.genai import types

MODEL = "gemini-3.5-flash"
APP_NAME = "spike_kol_skills"
METHODOLOGIES_DIR = (
    REPO_ROOT / "app" / "features" / "twitter" / "methodologies" / "qinbafrank"
)


# ---------------------------------------------------------------------------
# Frontmatter parsing (without strict spec validation)
# ---------------------------------------------------------------------------


@dataclass
class ParsedMd:
    frontmatter: dict
    body: str


def parse_md(path: Path) -> ParsedMd:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return ParsedMd(frontmatter={}, body=text)
    end = text.find("\n---", 3)
    if end < 0:
        return ParsedMd(frontmatter={}, body=text)
    fm_text = text[3:end].strip()
    body = text[end + 4 :].lstrip("\n")
    fm = yaml.safe_load(fm_text) or {}
    return ParsedMd(frontmatter=fm, body=body)


# ---------------------------------------------------------------------------
# .md -> ADK Skill adapter
# ---------------------------------------------------------------------------


def lens_to_skill(path: Path) -> skill_models.Skill:
    parsed = parse_md(path)
    fm = parsed.frontmatter

    raw_name = (fm.get("name") or path.stem).strip()
    name = raw_name.lower().replace("_", "-").replace(" ", "-")

    description = (fm.get("when_to_use") or fm.get("description") or "").strip()
    description = " ".join(description.split())
    if len(description) > 1000:
        description = description[:1000].rstrip() + "..."

    return skill_models.Skill(
        frontmatter=skill_models.Frontmatter(
            name=name,
            description=description or f"Lens {name}",
            metadata={
                "analyst": fm.get("analyst", ""),
                "source_type": fm.get("type", "lens"),
                "source_file": path.name,
            },
        ),
        instructions=parsed.body,
    )


def load_always_on_instruction() -> str:
    parts: list[str] = []
    for name in ("_orchestrator.md", "overview.md", "principles-falsifiability.md"):
        path = METHODOLOGIES_DIR / name
        if not path.exists():
            print(f"[WARN] missing always-on file: {path}")
            continue
        parsed = parse_md(path)
        parts.append(f"# From {name}\n\n{parsed.body.strip()}")
    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# Fake search_kol_tweets (no real vector call - spike only)
# ---------------------------------------------------------------------------


search_tool_called: list[dict] = []


async def search_kol_tweets(query: str, author_username: str = "qinbafrank", k: int = 6) -> str:
    """检索指定 KOL 的历史推文片段。返回 markdown，带 [#N] 引用编号。

    Args:
      query: 检索关键词，可中文可英文。
      author_username: KOL 用户名，默认 qinbafrank。
      k: 召回 chunk 数量，默认 6。

    Use when answering about specific stocks / sectors / events to retrieve the analyst's prior takes.
    """
    search_tool_called.append({"query": query, "author_username": author_username, "k": k})
    return (
        "[#1] @qinbafrank · 2026-04-12 (FAKE): NVDA Q4 业绩好但 RPO 拐点未现，"
        "持仓观察，破位 850 进一步减仓。\n"
        "[#2] @qinbafrank · 2026-03-28 (FAKE): AI 算力链上 HBM 仍是卡脖子环节，"
        "美光 RPO 加权剩余期限延长是确认长合约时代的信号。"
    )


# ---------------------------------------------------------------------------
# Callbacks for spike question #2 + #3
# ---------------------------------------------------------------------------


tool_events: list[dict] = []


async def before_tool_callback(tool, args, tool_context):
    event = {
        "phase": "before",
        "tool_name": getattr(tool, "name", repr(tool)),
        "args_summary": {k: (str(v)[:80] + "...") if isinstance(v, str) and len(str(v)) > 80 else v
                          for k, v in (args or {}).items()},
    }
    tool_events.append(event)
    print(f"  [callback before] {event['tool_name']}({event['args_summary']})")
    return None


async def after_tool_callback(tool, args, tool_context, tool_response):
    tool_events.append({
        "phase": "after",
        "tool_name": getattr(tool, "name", repr(tool)),
    })
    print(f"  [callback after]  {getattr(tool, 'name', repr(tool))}")
    return None


# ---------------------------------------------------------------------------
# Spike runner
# ---------------------------------------------------------------------------


@dataclass
class SpikeResult:
    label: str
    system_prompt_excerpt: str = ""
    tool_events: list[dict] = field(default_factory=list)
    search_tool_calls: list[dict] = field(default_factory=list)
    final_answer: str = ""
    error: str | None = None


async def run_spike(*, use_output_schema: bool) -> SpikeResult:
    """One spike pass.

    use_output_schema=False -> markdown output (the plan's default)
    use_output_schema=True  -> attempt strict schema (spike question #1)
    """
    tool_events.clear()
    search_tool_called.clear()

    lens_files = sorted(METHODOLOGIES_DIR.glob("lens-*.md"))
    if not lens_files:
        return SpikeResult(label="?", error=f"no lens-*.md under {METHODOLOGIES_DIR}")

    skills = [lens_to_skill(p) for p in lens_files]
    print(f"\n[setup] loaded {len(skills)} skills:")
    for s in skills:
        print(f"  - {s.frontmatter.name}: {s.frontmatter.description[:80]!r}...")

    always_on = load_always_on_instruction()
    instruction = (
        "You are a market analyst who thinks with @qinbafrank's public methodology. "
        "You are NOT qinbafrank himself.\n\n"
        f"{always_on}\n\n"
        "# Tool usage\n"
        "- Lens skills (stock-analysis / macro / ai-infrastructure / crypto) cover specific topics. "
        "Use `load_skill(skill_name=...)` to read the lens body when the topic matches.\n"
        "- Call `search_kol_tweets(query=..., author_username='qinbafrank')` to retrieve the analyst's "
        "prior takes. Cite chunks with [#N] inline.\n"
        "- When data is missing, say so explicitly; do not fabricate.\n"
        "- Answer in Chinese (Simplified). Be concise (< 300 words).\n"
    )

    skill_toolset = SkillToolset(skills=skills)

    agent_kwargs: dict[str, Any] = dict(
        name="spike_kol_agent",
        model=MODEL,
        instruction=instruction,
        tools=[skill_toolset, search_kol_tweets],
        before_tool_callback=before_tool_callback,
        after_tool_callback=after_tool_callback,
    )

    if use_output_schema:
        from pydantic import BaseModel, Field

        class StubOutput(BaseModel):
            answer: str = Field(..., description="Markdown answer for the user.")
            citations_count: int = Field(0, description="Number of [#N] citations used.")

        agent_kwargs["output_schema"] = StubOutput
        agent_kwargs["output_key"] = "spike_out"

    agent = LlmAgent(**agent_kwargs)
    runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id="spike"
    )

    label = "with_output_schema" if use_output_schema else "markdown"
    result = SpikeResult(label=label)
    result.system_prompt_excerpt = instruction[:400] + "..."

    user_msg = types.Content(
        parts=[types.Part(text="NVDA 这只票，按你的方法论现在怎么看？给我框架级判断。")],
        role="user",
    )

    final_text_parts: list[str] = []
    try:
        async for event in runner.run_async(
            user_id="spike", session_id=session.id, new_message=user_msg
        ):
            if hasattr(event, "content") and event.content and event.content.parts:
                for part in event.content.parts:
                    text = getattr(part, "text", None)
                    if text:
                        final_text_parts.append(text)
    except Exception as e:
        result.error = f"{type(e).__name__}: {e}"

    result.tool_events = list(tool_events)
    result.search_tool_calls = list(search_tool_called)

    if use_output_schema:
        session_data = await runner.session_service.get_session(
            app_name=APP_NAME, user_id="spike", session_id=session.id
        )
        state = (session_data.state if session_data else {}) or {}
        raw = state.get("spike_out")
        result.final_answer = f"[from state] {raw}"
    else:
        result.final_answer = "\n".join(final_text_parts).strip()

    return result


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def render_verdict(results: dict[str, SpikeResult]) -> None:
    print("\n" + "=" * 72)
    print("SPIKE VERDICT")
    print("=" * 72)

    md = results.get("markdown")
    sch = results.get("with_output_schema")

    print("\n[Q2] before/after_tool_callback fired?")
    if md and md.tool_events:
        unique_tools = sorted({e["tool_name"] for e in md.tool_events})
        print(f"     PASS. tools seen: {unique_tools}")
    else:
        print("     FAIL or NO TOOL CALLS. Need fallback hook for SSE events.")

    print("\n[Q3] skill body loading mechanism?")
    if md:
        load_skill_calls = [e for e in md.tool_events if e["tool_name"] == "load_skill" and e["phase"] == "before"]
        list_skills_calls = [e for e in md.tool_events if e["tool_name"] == "list_skills"]
        print(f"     load_skill calls: {len(load_skill_calls)} (explicit activation)")
        print(f"     list_skills calls: {len(list_skills_calls)}")
        if load_skill_calls:
            for e in load_skill_calls:
                print(f"       -> {e['args_summary']}")
            print("     PASS. Skill body loading is EXPLICIT via load_skill tool.")
        else:
            print("     Skill listing may be enough; LLM did not load any specific lens body.")

    print("\n[Q4] search_kol_tweets coexists with SkillToolset?")
    if md and md.search_tool_calls:
        print(f"     PASS. search_kol_tweets called {len(md.search_tool_calls)} time(s).")
        for c in md.search_tool_calls:
            print(f"       -> query={c['query']!r}")
    elif md and not md.error:
        print("     UNKNOWN. LLM didn't call it for this prompt; not a coexistence failure.")
    else:
        print("     FAIL.")

    print("\n[Q1] SkillToolset + output_schema coexist?")
    if sch is None:
        print("     SKIPPED.")
    elif sch.error:
        print(f"     FAIL: {sch.error}")
    else:
        print(f"     RAN OK. final_answer head: {sch.final_answer[:200]!r}")
        if sch.tool_events:
            print(f"     Tool calls under schema mode: {len(sch.tool_events)} events")
        else:
            print("     WARN: no tool calls under schema (known ADK Gemini limitation)")


async def main() -> None:
    print("=" * 72)
    print("PASS 1: markdown output (the plan's default)")
    print("=" * 72)
    md = await run_spike(use_output_schema=False)
    print("\n--- FINAL ANSWER (markdown) ---")
    print(md.final_answer[:800])
    if md.error:
        print(f"\n[ERROR] {md.error}")

    print("\n" + "=" * 72)
    print("PASS 2: with output_schema (spike Q1)")
    print("=" * 72)
    sch = await run_spike(use_output_schema=True)
    print("\n--- FINAL OUTPUT (schema) ---")
    print(sch.final_answer[:800])
    if sch.error:
        print(f"\n[ERROR] {sch.error}")

    render_verdict({"markdown": md, "with_output_schema": sch})


if __name__ == "__main__":
    asyncio.run(main())

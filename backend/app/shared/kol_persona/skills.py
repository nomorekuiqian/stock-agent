"""Convert persona lens-*.md files into ADK Skill objects."""

from __future__ import annotations

from typing import List

from google.adk.skills import models as skill_models

from app.shared.kol_persona.models import Persona, SkillDoc


def skill_doc_to_adk_skill(doc: SkillDoc, *, analyst: str = "") -> skill_models.Skill:
    """Wrap a parsed SkillDoc as an ADK Skill object.

    The frontmatter `name` must conform to agentskills.io spec (lowercase + hyphen),
    which `registry._md_to_skill_doc` already enforces.
    """
    return skill_models.Skill(
        frontmatter=skill_models.Frontmatter(
            name=doc.name,
            description=doc.description,
            metadata={
                "analyst": analyst,
                "source_type": doc.type or "lens",
            },
        ),
        instructions=doc.body,
    )


def build_lens_skills(persona: Persona) -> List[skill_models.Skill]:
    """Construct ADK Skill list from a persona's lens docs.

    Only `lens-*.md` files become Skills. orchestrator / overview / principles
    are concatenated into Agent.instruction by registry.build_always_on_instruction().
    """
    return [
        skill_doc_to_adk_skill(doc, analyst=persona.username)
        for doc in persona.lenses.values()
    ]

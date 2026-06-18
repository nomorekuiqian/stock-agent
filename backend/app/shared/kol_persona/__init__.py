"""KOL Persona shared module.

Public API:
  - get_persona(username) / list_personas() / clear_persona_cache()  [registry]
  - build_always_on_instruction(persona)                              [registry]
  - build_lens_skills(persona)                                        [skills]
  - search_kol_tweets, persona_chunks_buffer, chunk_to_persona_result [tools]
  - CorpusBinding / Persona / PersonaSummary / PersonaChunkResult / SkillDoc [models]
"""

from app.shared.kol_persona.models import (
    CorpusBinding,
    Persona,
    PersonaChunkResult,
    PersonaSummary,
    SkillDoc,
)
from app.shared.kol_persona.registry import (
    build_always_on_instruction,
    clear_persona_cache,
    get_persona,
    list_personas,
)
from app.shared.kol_persona.skills import build_lens_skills, skill_doc_to_adk_skill
from app.shared.kol_persona.tools import (
    chunk_to_persona_result,
    persona_chunks_buffer,
    search_kol_tweets,
)

__all__ = [
    "CorpusBinding",
    "Persona",
    "PersonaChunkResult",
    "PersonaSummary",
    "SkillDoc",
    "build_always_on_instruction",
    "build_lens_skills",
    "chunk_to_persona_result",
    "clear_persona_cache",
    "get_persona",
    "list_personas",
    "persona_chunks_buffer",
    "search_kol_tweets",
    "skill_doc_to_adk_skill",
]

"""
KOL Persona skill unit tests — covers the current skill loader helpers in
`app.shared.kol_persona.registry` and the citation-range header in
`app.shared.kol_persona.tools._format_chunks_for_llm`.

No network, no DB. Uses tempdir-backed skill md files for the loader case.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from app.shared.kol_persona.registry import (
    _extract_applicable_section,
    _skill_md_to_skill_doc,
)
from app.shared.kol_persona.tools import _format_chunks_for_llm
from app.features.vector.models import VectorChunkResult


# ---------------------------------------------------------------------------
# _extract_applicable_section
# ---------------------------------------------------------------------------


class TestExtractApplicableSection:
    def test_returns_empty_when_marker_missing(self):
        assert _extract_applicable_section("# Some other section\n\nbody") == ""

    def test_extracts_text_after_marker(self):
        body = textwrap.dedent(
            """
            # Skill

            ## 适用问题

            用户问"X 怎么看"

            ## 核心问题
            ...
            """
        )
        out = _extract_applicable_section(body)
        assert "用户问" in out
        # Must stop at the next h2
        assert "核心问题" not in out

    def test_extracts_to_end_when_no_next_h2(self):
        body = "## 适用问题\n\n第一行\n第二行"
        out = _extract_applicable_section(body)
        assert "第一行" in out
        assert "第二行" in out

    def test_trims_surrounding_whitespace(self):
        body = "## 适用问题\n\n\n  trimmed body  \n\n## 下一段\n..."
        out = _extract_applicable_section(body)
        # Body is trimmed but next-section content excluded
        assert out.startswith("trimmed body")
        assert "下一段" not in out


# ---------------------------------------------------------------------------
# _skill_md_to_skill_doc — frontmatter + name derivation + description fallback
# ---------------------------------------------------------------------------


class TestMdToSkillDoc:
    @pytest.fixture
    def md_with_applicable(self, tmp_path: Path) -> Path:
        path = tmp_path / "NVDA.md"
        path.write_text(
            textwrap.dedent(
                """
                ---
                skill: ticker/nvda
                layer: ticker
                coverage: high
                ---

                # Ticker: NVDA

                ## 适用问题

                用户问 NVDA / 英伟达 / Blackwell / GTC 相关。

                ## 核心问题
                ...
                """
            ).strip()
        )
        return path

    @pytest.fixture
    def md_without_applicable(self, tmp_path: Path) -> Path:
        path = tmp_path / "obscure.md"
        path.write_text(
            textwrap.dedent(
                """
                ---
                skill: ticker/obscure
                ---

                # Ticker: Obscure

                Some intro paragraph that should become the fallback description.
                """
            ).strip()
        )
        return path

    def test_layer_prefixed_lowercase_name(self, md_with_applicable: Path):
        doc = _skill_md_to_skill_doc(md_with_applicable, "ticker")
        # ADK spec: lowercase + hyphen only, layer-prefixed
        assert doc.name == "ticker-nvda"

    def test_description_from_applicable_section(self, md_with_applicable: Path):
        doc = _skill_md_to_skill_doc(md_with_applicable, "ticker")
        assert "Blackwell" in doc.description or "英伟达" in doc.description
        # Should not include the next h2 heading
        assert "核心问题" not in doc.description

    def test_description_falls_back_to_first_paragraph(
        self, md_without_applicable: Path
    ):
        doc = _skill_md_to_skill_doc(md_without_applicable, "ticker")
        assert "fallback description" in doc.description

    def test_type_field_is_layer_namespaced(self, md_with_applicable: Path):
        doc = _skill_md_to_skill_doc(md_with_applicable, "ticker")
        assert doc.type == "ticker"

    def test_extra_carries_frontmatter(self, md_with_applicable: Path):
        doc = _skill_md_to_skill_doc(md_with_applicable, "ticker")
        # `extra` should retain coverage / layer keys (sans recognized ones).
        assert doc.extra.get("coverage") == "high"

    def test_body_sanitizes_raw_coverage_label(self, tmp_path: Path):
        path = tmp_path / "NVDA.md"
        path.write_text(
            textwrap.dedent(
                """
                # Ticker: NVDA

                ## 覆盖状态

                - `coverage: high` — 博主反复深度讨论
                """
            ).strip()
        )
        doc = _skill_md_to_skill_doc(path, "ticker")

        assert "`coverage: high`" not in doc.body
        assert "博主讨论很多" in doc.body

    def test_description_clamped_to_1000_chars(self, tmp_path: Path):
        long_section = "x" * 2000
        path = tmp_path / "long.md"
        path.write_text(f"## 适用问题\n\n{long_section}\n\n## 别的")
        doc = _skill_md_to_skill_doc(path, "ticker")
        # Clamp adds "..." suffix → at most 1000 + 3 chars.
        assert len(doc.description) <= 1003
        assert doc.description.endswith("...")

    def test_name_normalizes_underscores_and_spaces(self, tmp_path: Path):
        path = tmp_path / "my_ticker name.md"
        path.write_text("## 适用问题\n\nbody")
        doc = _skill_md_to_skill_doc(path, "ticker")
        assert doc.name == "ticker-my-ticker-name"


# ---------------------------------------------------------------------------
# _format_chunks_for_llm — citation-range header + empty fallback
# ---------------------------------------------------------------------------


def _mk_chunk(idx: int = 1) -> VectorChunkResult:
    return VectorChunkResult(
        id=f"chunk-{idx}",
        document_id=f"doc-{idx}",
        source_id=f"tw{idx}",
        source_type="kol_tweet",
        title=None,
        url=f"https://x.com/q/status/{idx}",
        content=f"sample tweet body #{idx}",
        similarity=0.6,
        metadata={"author_username": "qinbafrank", "created_at": "2026-04-26"},
    )


class TestFormatChunksForLlm:
    def test_empty_results_warns_against_inventing_citations(self):
        out = _format_chunks_for_llm([])
        # Backend wants the LLM to NOT make up [#N] when no results came back.
        assert "Do not invent" in out
        # Must not present a "Valid citation range" header for the empty case.
        assert "Valid citation range" not in out

    def test_includes_explicit_citation_range_header(self):
        out = _format_chunks_for_llm([_mk_chunk(1), _mk_chunk(2)], start_index=1)
        assert "Valid citation range" in out
        assert "[#1] ~ [#2]" in out

    def test_range_respects_start_index_offset(self):
        # Simulates second call within same agent run (chunks_buf already had 5)
        out = _format_chunks_for_llm([_mk_chunk(6), _mk_chunk(7)], start_index=6)
        assert "[#6] ~ [#7]" in out
        # Indexed lines themselves
        assert "[#6]" in out
        assert "[#7]" in out

    def test_includes_per_chunk_index_marker(self):
        out = _format_chunks_for_llm([_mk_chunk(1)], start_index=1)
        assert "[#1]" in out
        # Author/date metadata still surfaced for the LLM
        assert "@qinbafrank" in out
        assert "2026-04-26" in out

    def test_does_not_invent_indices_outside_range(self):
        out = _format_chunks_for_llm([_mk_chunk(1)], start_index=1)
        # Loose: only [#1] should appear, not [#2]/[#9] etc.
        assert "[#2]" not in out
        assert "[#9]" not in out

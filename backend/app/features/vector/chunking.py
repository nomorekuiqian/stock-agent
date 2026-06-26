"""Document chunking helpers for vector indexing."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any


DEFAULT_MAX_CHARS = 3200
DEFAULT_OVERLAP_CHARS = 350


@dataclass(frozen=True)
class Chunk:
    index: int
    content: str
    content_hash: str
    token_count: int
    metadata: dict[str, Any]


def content_hash(content: str) -> str:
    normalized = re.sub(r"\s+", " ", content).strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def estimate_tokens(text: str) -> int:
    # Good enough for sizing without adding a tokenizer dependency.
    return max(1, len(text) // 4)


def _sectionize_markdown(text: str) -> list[tuple[str | None, str]]:
    """Split by markdown headings while keeping heading context."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    sections: list[tuple[str | None, list[str]]] = []
    current_title: str | None = None
    current: list[str] = []

    heading_re = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*$")
    for line in lines:
        match = heading_re.match(line)
        if match and current:
            sections.append((current_title, current))
            current = []
        if match:
            current_title = match.group(2).strip()
        current.append(line)

    if current:
        sections.append((current_title, current))

    return [(title, "\n".join(parts).strip()) for title, parts in sections if "\n".join(parts).strip()]


def _hard_split(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    """Slice an oversized block into <= max_chars pieces (with overlap)."""
    step = max(1, max_chars - overlap_chars)
    pieces = [text[start:start + max_chars].strip() for start in range(0, len(text), step)]
    return [p for p in pieces if p]


def _split_long_text(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue
        # candidate exceeds the budget — flush whatever we have first.
        if current:
            chunks.append(current)
            current = ""
        # Place the paragraph. CRITICAL: an oversized paragraph MUST be hard
        # split even when it arrives after accumulated content — otherwise it
        # becomes a single >max_chars chunk that blows past the embedding model's
        # token limit (dense CJK ~1 token/char) and the embed call fails.
        if len(paragraph) <= max_chars:
            current = paragraph
        else:
            pieces = _hard_split(paragraph, max_chars, overlap_chars)
            chunks.extend(pieces[:-1])
            current = pieces[-1] if pieces else ""

    if current:
        chunks.append(current)
    return [c for c in chunks if c]


def chunk_document(
    content: str,
    *,
    title: str | None = None,
    source_type: str,
    source_id: str,
    base_metadata: dict[str, Any] | None = None,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_chars: int = DEFAULT_OVERLAP_CHARS,
) -> list[Chunk]:
    """Split a normalized document into semantically useful chunks."""
    clean = content.strip()
    if not clean:
        return []

    sections = _sectionize_markdown(clean)
    chunks: list[Chunk] = []
    base = dict(base_metadata or {})

    for section_title, section_text in sections:
        for piece in _split_long_text(section_text, max_chars, overlap_chars):
            header_lines = [
                f"Source: {source_type}",
                f"Source ID: {source_id}",
            ]
            if title:
                header_lines.append(f"Title: {title}")
            if section_title:
                header_lines.append(f"Section: {section_title}")

            chunk_text = "\n".join(header_lines) + "\n\n" + piece
            metadata = dict(base)
            if section_title:
                metadata["section"] = section_title
            idx = len(chunks)
            chunks.append(
                Chunk(
                    index=idx,
                    content=chunk_text,
                    content_hash=content_hash(chunk_text),
                    token_count=estimate_tokens(chunk_text),
                    metadata=metadata,
                )
            )

    return chunks

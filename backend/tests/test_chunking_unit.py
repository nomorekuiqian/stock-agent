"""Unit tests for the document chunker.

The chunker must NEVER emit a chunk larger than max_chars: an oversized chunk
(dense CJK ≈ 1 token/char) blows past the embedding model's 8191-token limit and
the embed call fails (HTTP 500). Regression for the bug where an oversized
paragraph arriving after accumulated content was not hard-split.
"""
from __future__ import annotations

from app.features.vector.chunking import (
    DEFAULT_MAX_CHARS,
    _split_long_text,
    chunk_document,
)


def test_short_text_single_chunk():
    chunks = chunk_document("一段短文本。", source_type="zsxq_thread", source_id="s")
    assert len(chunks) == 1
    assert "一段短文本。" in chunks[0].content


def test_oversized_paragraph_after_content_is_hard_split():
    # small paragraph, blank line, then a HUGE unbroken paragraph (the bug trigger).
    huge = "这是一段没有任何换行的超长中文段落。" * 1500
    body = "开头小段。\n\n" + huge
    chunks = chunk_document(body, source_type="zsxq_thread", source_id="s", title="t")
    assert len(chunks) > 1
    # Every chunk's content (incl. the small header) must stay within budget.
    for c in chunks:
        assert len(c.content) <= DEFAULT_MAX_CHARS + 200, f"chunk {c.index} too big: {len(c.content)}"


def test_split_long_text_never_exceeds_max_chars():
    huge = "无换行长段落。" * 2000
    pieces = _split_long_text("引子。\n\n" + huge, max_chars=3200, overlap_chars=350)
    assert pieces, "expected multiple pieces"
    assert all(len(p) <= 3200 for p in pieces), [len(p) for p in pieces if len(p) > 3200]
    assert len(pieces) > 1


def test_content_preserved_across_chunks():
    body = "\n\n".join(f"第{i}段落，内容若干文字。" for i in range(60))
    chunks = chunk_document(body, source_type="zsxq_thread", source_id="s")
    joined = " ".join(c.content for c in chunks)
    assert "第0段落" in joined and "第59段落" in joined

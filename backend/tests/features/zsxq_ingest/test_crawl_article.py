"""Tests for full-article fetching (long-form zsxq posts).

zsxq stores long posts as a separate article; the topic feed's talk.text is only
a truncated preview. fetch_article_text() pulls the full body so the RAG indexes
the whole post. All network is mocked — no live calls.
"""
from __future__ import annotations

from unittest.mock import MagicMock

from app.features.zsxq_ingest.crawl import ZsxqClient, _extract_article_text


def _make_client(**kw) -> ZsxqClient:
    d = dict(
        cookie="test-cookie", group_id="9", min_delay=0.0, max_delay=0.0,
        long_delay_interval=5, long_delay_range=(180.0, 300.0), offset_ms=1,
    )
    d.update(kw)
    return ZsxqClient(**d)


def _resp(status: int = 200, text: str = ""):
    r = MagicMock()
    r.status_code = status
    r.text = text
    return r


# ---------------------------------------------------------------------------
# _extract_article_text
# ---------------------------------------------------------------------------

def test_extract_strips_tags_scripts_and_preserves_paragraphs():
    html = (
        "<html><head><style>.x{}</style></head><body>"
        "<h1>标题</h1><p>第一段。</p><p>第二段。</p>"
        "<script>var x=1;</script></body></html>"
    )
    out = _extract_article_text(html)
    assert "<" not in out and ">" not in out
    assert "标题" in out and "第一段。" in out and "第二段。" in out
    assert "var x" not in out  # script content stripped
    assert "第一段。" in out and out.index("第一段。") < out.index("第二段。")


def test_extract_unescapes_entities():
    assert "A&B<C" in _extract_article_text("<p>A&amp;B&lt;C</p>")


def test_extract_dedupes_leading_repeated_title():
    out = _extract_article_text("<p>同一个标题</p><p>同一个标题</p><p>正文内容</p>")
    assert out.count("同一个标题") == 1
    assert "正文内容" in out


def test_extract_empty_returns_empty():
    assert _extract_article_text("") == ""
    assert _extract_article_text(None) == ""  # type: ignore[arg-type]


def test_extract_strips_trailing_join_group_chrome():
    html = (
        "<p>正文最后一句。</p><p>信息来源：联储</p>"
        "<p>知识星球</p><p>扫码加入星球</p><p>查看更多优质内容</p>"
        "<p>https://wx.zsxq.com/mweb/views/joingroup/join_group.html?group_id=123</p>"
    )
    out = _extract_article_text(html)
    assert "信息来源：联储" in out      # real article content kept
    assert "join_group" not in out      # CTA link cut
    assert "扫码加入星球" not in out     # page chrome dropped
    assert "知识星球" not in out


# ---------------------------------------------------------------------------
# fetch_article_text
# ---------------------------------------------------------------------------

def _article_topic(**article) -> dict:
    return {"topic_id": 1, "talk": {"text": "预览…", "article": article}}


def test_fetch_returns_none_when_no_article():
    c = _make_client()
    c._http = MagicMock()
    assert c.fetch_article_text({"talk": {"text": "preview"}}) is None
    c._http.get.assert_not_called()


def test_fetch_returns_full_body_and_prefers_inline_url():
    c = _make_client()
    c._http = MagicMock(); c._http.get.return_value = _resp(200, "<p>完整正文很长很长。</p>")
    topic = _article_topic(
        article_id="a",
        inline_article_url="https://articles.zsxq.com/inline_form/id_a.html",
        article_url="https://articles.zsxq.com/id_a.html",
    )
    out = c.fetch_article_text(topic)
    assert out == "完整正文很长很长。"
    assert c._http.get.call_args[0][0] == "https://articles.zsxq.com/inline_form/id_a.html"


def test_fetch_falls_back_to_article_url():
    c = _make_client()
    c._http = MagicMock(); c._http.get.return_value = _resp(200, "<p>body</p>")
    c.fetch_article_text(_article_topic(article_url="https://articles.zsxq.com/id_a.html"))
    assert c._http.get.call_args[0][0] == "https://articles.zsxq.com/id_a.html"


def test_fetch_returns_none_on_non_200():
    c = _make_client()
    c._http = MagicMock(); c._http.get.return_value = _resp(403, "denied")
    assert c.fetch_article_text(_article_topic(article_url="u")) is None


def test_fetch_returns_none_on_exception():
    c = _make_client()
    c._http = MagicMock(); c._http.get.side_effect = RuntimeError("network down")
    assert c.fetch_article_text(_article_topic(article_url="u")) is None


def test_fetch_returns_none_on_empty_extraction():
    c = _make_client()
    c._http = MagicMock(); c._http.get.return_value = _resp(200, "<html><body></body></html>")
    assert c.fetch_article_text(_article_topic(article_url="u")) is None

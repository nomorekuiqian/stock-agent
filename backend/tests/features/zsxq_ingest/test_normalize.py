"""TDD tests for normalize.normalize_topic().

Step 1: Write failing tests.
Step 2: Implement normalize.py.
Step 3: All tests pass + no regressions in test_indexing.py.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Fixtures (real raw zsxq JSON shapes extracted from the crawler DB)
# ---------------------------------------------------------------------------
FIXTURES = Path(__file__).parent / "fixtures"

OWNER_USER_ID = 15555428815112  # 潘驴邓晓闲缺一 (group owner)
GROUP_ID = 15554581218512
GROUP_NAME = "潘大的科技交流圈"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def talk_raw():
    return _load("topic_talk.json")


@pytest.fixture
def qa_raw():
    return _load("topic_qa.json")


@pytest.fixture
def etags_raw():
    return _load("topic_etags.json")


# ---------------------------------------------------------------------------
# Import under test — will fail until normalize.py is created
# ---------------------------------------------------------------------------
from app.features.zsxq_ingest import normalize  # noqa: E402


# ---------------------------------------------------------------------------
# Helper: call with sensible defaults
# ---------------------------------------------------------------------------
def _norm(raw: dict, *, owner_uid=OWNER_USER_ID, creator_ids=None) -> dict:
    if creator_ids is None:
        creator_ids = {OWNER_USER_ID, 88214152181182}  # owner + bewater
    return normalize.normalize_topic(
        raw,
        group_id=GROUP_ID,
        group_name=GROUP_NAME,
        owner_user_id=owner_uid,
        creator_ids=creator_ids,
    )


# ---------------------------------------------------------------------------
# Test 1: talk record has required fields
# ---------------------------------------------------------------------------
def test_talk_required_fields(talk_raw):
    rec = _norm(talk_raw)
    assert rec["topic_id"] == str(talk_raw["topic_id"])
    assert rec["type"] == "talk"
    assert isinstance(rec["tags"], list)
    assert rec["url"] == f"https://wx.zsxq.com/dweb2/index/topic_detail/{talk_raw['topic_id']}"
    assert rec["group_name"] == GROUP_NAME
    assert rec["create_time"] == talk_raw["create_time"]
    assert isinstance(rec["digested"], bool)
    assert isinstance(rec["likes_count"], int)


# ---------------------------------------------------------------------------
# Test 2: talk owner role is "owner"
# ---------------------------------------------------------------------------
def test_talk_author_role_owner(talk_raw):
    rec = _norm(talk_raw)
    # talk.owner.user_id == OWNER_USER_ID => role "owner"
    assert rec["author"]["role"] == "owner"
    assert rec["author"]["name"] == "潘驴邓晓闲缺一"


# ---------------------------------------------------------------------------
# Test 3: creator (non-owner) role
# ---------------------------------------------------------------------------
def test_creator_role(etags_raw):
    # bewater (88214152181182) is in creator_ids but != owner
    rec = _norm(etags_raw)
    assert rec["author"]["role"] == "creator"
    assert rec["author"]["name"] == "bewater"


# ---------------------------------------------------------------------------
# Test 4: <e> tags are rendered — no raw <e tags remain in text
# ---------------------------------------------------------------------------
def test_etags_rendered_no_raw_tags(etags_raw):
    rec = _norm(etags_raw)
    body = rec["text"]
    assert "<e " not in body, f"Raw <e tag still present in text: {body[:300]}"
    assert "<e\t" not in body


# ---------------------------------------------------------------------------
# Test 5: hashtag <e> tags become #AI# style strings
# ---------------------------------------------------------------------------
def test_hashtag_rendered_as_hash_tag(etags_raw):
    rec = _norm(etags_raw)
    # The fixture text has <e type="hashtag" title="%23AI%23" />
    assert "#AI#" in rec["text"]


# ---------------------------------------------------------------------------
# Test 6: web_url <e> tags are rendered with href
# ---------------------------------------------------------------------------
def test_web_url_etag_rendered(etags_raw):
    rec = _norm(etags_raw)
    # <e type="web_url" href="https%3A%2F%2Fx.com" title="X" />
    # => "X（https://x.com）"
    assert "https://x.com" in rec["text"]


# ---------------------------------------------------------------------------
# Test 7: missing title falls back to empty string (indexing handles it)
# ---------------------------------------------------------------------------
def test_missing_title_is_empty_string(talk_raw):
    no_title = dict(talk_raw)
    no_title.pop("title", None)
    rec = _norm(no_title)
    assert rec["title"] == ""


# ---------------------------------------------------------------------------
# Test 8: Q&A fixture produces type q&a and populates question/answer
# ---------------------------------------------------------------------------
def test_qa_type_and_answer_text(qa_raw):
    rec = _norm(qa_raw, owner_uid=OWNER_USER_ID, creator_ids={OWNER_USER_ID})
    assert rec["type"] == "q&a"
    assert rec["question"]["text"].strip() != ""
    assert rec["answer"]["text"].strip() != ""
    # answer owner is the group owner
    assert rec["answer"]["owner"]["user_id"] == str(OWNER_USER_ID)


# ---------------------------------------------------------------------------
# Test 9: images and files are present (full-fidelity)
# ---------------------------------------------------------------------------
def test_images_and_files_preserved(talk_raw):
    rec = _norm(talk_raw)
    assert len(rec["images"]) == 1
    # image must have original.url
    assert "url" in rec["images"][0]["original"]
    assert len(rec["files"]) == 1
    assert rec["files"][0]["name"] == "索尔思估值计算表.xlsx"


# ---------------------------------------------------------------------------
# Test 10: comments preserved from show_comments
# ---------------------------------------------------------------------------
def test_comments_from_show_comments(etags_raw):
    rec = _norm(etags_raw)
    assert len(rec["comments"]) == 2
    comment = rec["comments"][0]
    assert "text" in comment
    assert "owner" in comment


# ---------------------------------------------------------------------------
# Test 11: tags extracted from inline hashtag <e> tags in talk.text
# ---------------------------------------------------------------------------
def test_tags_extracted_from_etags(etags_raw):
    rec = _norm(etags_raw)
    # The etags fixture text contains hashtags #AI# and #AI硬件#
    assert len(rec["tags"]) >= 1


# ---------------------------------------------------------------------------
# Test 12: Integration — normalize output is consumable by indexing.prepare_records
# ---------------------------------------------------------------------------
def test_integration_qa_consumable_by_indexing(qa_raw):
    from app.features.zsxq_ingest import indexing

    # qa answer owner IS the group owner => role "owner"
    rec = _norm(qa_raw, owner_uid=OWNER_USER_ID, creator_ids={OWNER_USER_ID})
    prepared, drop = indexing.prepare_records([rec], min_chars=0)
    assert prepared, f"Record was dropped: {dict(drop)}"
    assert prepared[0].content_type == "qa"

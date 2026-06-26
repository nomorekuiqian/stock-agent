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


def test_external_links_captured_as_metadata(etags_raw):
    # Q1: the post's external URL is captured for citation (we do NOT fetch it).
    rec = _norm(etags_raw)
    assert rec.get("external_links") == ["https://x.com"]


def test_non_creator_author_role_is_member(talk_raw):
    # Q2: zsxq lets members post topics; an author who is neither owner nor in
    # the official creator_ids must be 'member' so indexing._eligible drops it.
    rec = _norm(talk_raw, owner_uid=111, creator_ids={222})  # talk author is neither
    assert rec["author"]["role"] == "member"


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


# ---------------------------------------------------------------------------
# Decision 3: Q&A is kept when a creator/owner PARTICIPATES (answers); a member
# Q with no creator/owner answer is a member post and is dropped by _eligible.
# ---------------------------------------------------------------------------
def test_qa_kept_when_creator_answers_member_question():
    qa = {
        "topic_id": "q-keep", "type": "q&a",
        "question": {"text": "请问光刻胶还能涨多久?", "owner": {"user_id": 999111, "name": "某成员"}},
        "answer": {"text": "光刻胶这一轮的核心驱动是国产替代加速……（创作者分析）",
                   "owner": {"user_id": 88214152181182, "name": "bewater"}},
        "create_time": "2026-06-23T10:00:00.000+0800",
    }
    rec = _norm(qa)  # creator_ids includes bewater (88214152181182)
    assert rec["type"] == "q&a"
    # answerer is the author → creator → indexing keeps it; body is the answer.
    assert rec["author"]["role"] == "creator"
    assert "创作者分析" in rec["text"]


def test_qa_dropped_when_only_member_participates():
    qa = {
        "topic_id": "q-drop", "type": "q&a",
        "question": {"text": "蹭个热度问一句", "owner": {"user_id": 999111, "name": "某成员"}},
        "answer": {"text": "", "owner": {}},  # no creator/owner answer
        "create_time": "2026-06-23T10:00:00.000+0800",
    }
    rec = _norm(qa)
    # questioner (member) becomes the author → role=member → _eligible drops it.
    assert rec["author"]["role"] == "member"


# ---------------------------------------------------------------------------
# Owner participation rescue: a member-started thread is kept ONLY when the
# owner actively replies (substantive comment, not 点赞/表情); re-attributed to
# the owner with the owner's reply as the indexed value.
# ---------------------------------------------------------------------------
def _member_talk_with_comments(comments):
    return {
        "topic_id": "m1", "type": "talk",
        "talk": {"owner": {"user_id": 777111, "name": "成员X"}, "text": "请问AI硬件还能追吗?"},
        "create_time": "2026-06-23T10:00:00.000+0800",
        "show_comments": comments,
    }


def test_member_topic_rescued_by_owner_substantive_comment():
    raw = _member_talk_with_comments([
        {"comment_id": "c1", "create_time": "2026-06-23T10:05:00.000+0800",
         "text": "可以继续关注，逻辑没变，重点看下游订单兑现和明年的capex指引。",
         "owner": {"user_id": OWNER_USER_ID, "name": "潘大"}},
    ])
    rec = _norm(raw)  # owner_uid = OWNER_USER_ID
    assert rec["author"]["role"] == "owner"            # re-attributed to owner
    assert rec.get("kept_via_owner_comment") is True
    assert "逻辑没变" in rec["text"]                    # owner reply = indexed value
    assert "请问AI硬件" in rec["text"]                  # member post kept as context


def test_member_topic_not_rescued_by_trivial_owner_comment():
    raw = _member_talk_with_comments([
        {"comment_id": "c1", "text": "👍", "owner": {"user_id": OWNER_USER_ID, "name": "潘大"}},
        {"comment_id": "c2", "text": "好的", "owner": {"user_id": OWNER_USER_ID, "name": "潘大"}},
    ])
    rec = _norm(raw)
    assert rec["author"]["role"] == "member"           # likes/trivial ≠ participation
    assert not rec.get("kept_via_owner_comment")


def test_member_topic_not_rescued_when_only_members_comment():
    raw = _member_talk_with_comments([
        {"comment_id": "c1", "text": "同问，蹲一个深度回答谢谢老师们",
         "owner": {"user_id": 888222, "name": "另一成员"}},
    ])
    rec = _norm(raw)
    assert rec["author"]["role"] == "member"           # no owner participation


# ---------------------------------------------------------------------------
# Article posts: full body (crawler-fetched) is preferred over the truncated
# talk.text preview; tags still come from the preview's <e> hashtag tags.
# ---------------------------------------------------------------------------
def test_article_full_body_preferred_over_truncated_preview():
    raw = {
        "topic_id": "art1", "type": "talk",
        "talk": {
            "owner": {"user_id": OWNER_USER_ID, "name": "潘大"},
            "text": "开头预览片段 <e type=\"hashtag\" title=\"%23AI硬件%23\" /> …",
            "article": {"article_id": "a", "article_url": "https://articles.zsxq.com/id_a.html"},
            "full_article_text": "这是完整文章正文，远比预览长，详细分析了 NVDA 的需求账与 ORCL 的订单交付。",
        },
        "create_time": "2026-06-24T10:00:00.000+0800",
    }
    rec = _norm(raw)
    assert "完整文章正文" in rec["text"]          # full body is the indexed content
    assert "开头预览片段" not in rec["text"]       # truncated preview NOT used as body
    assert len(rec["tags"]) >= 1                  # tags still parsed from preview <e> tag


def test_article_without_full_text_falls_back_to_preview():
    raw = {
        "topic_id": "art2", "type": "talk",
        "talk": {"owner": {"user_id": OWNER_USER_ID, "name": "潘大"}, "text": "只有预览正文"},
        "create_time": "2026-06-24T10:00:00.000+0800",
    }
    rec = _norm(raw)
    assert "只有预览正文" in rec["text"]

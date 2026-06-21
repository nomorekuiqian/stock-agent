from collections import Counter

from app.features.zsxq_ingest import indexing

OWNER_QA = {
    "topic_id": "t1", "type": "q&a", "title": "英伟达还能买吗",
    "question": {"text": "NVDA 现在估值贵吗？"},
    "answer": {"text": "英伟达数据中心需求强劲" * 30},
    "author": {"name": "潘大", "role": "owner"},
    "create_time": "2026-06-01T10:00:00.000+0800",
    "tags": ["AI", "半导体"], "digested": True, "likes_count": 12,
    "group_name": "潘大的科技交流圈", "url": "https://wx.zsxq.com/topic/t1",
}


def test_eligible_owner_qa_prepared_with_ticker_and_content_type():
    prepared, _drop = indexing.prepare_records([OWNER_QA], min_chars=0)
    assert len(prepared) == 1
    rec = prepared[0]
    assert rec.content_type == "qa"
    assert "NVDA" in rec.tickers
    assert rec.metadata["author_username"] == "pandacircle"
    assert rec.metadata["source_author_username"] == "潘大"
    assert "回答:" in rec.content and "提问:" in rec.content


def test_member_post_dropped_as_non_authored():
    member = {**OWNER_QA, "author": {"name": "路人", "role": "member"}}
    prepared, drop = indexing.prepare_records([member], min_chars=0)
    assert prepared == []
    assert drop["non_authored"] == 1

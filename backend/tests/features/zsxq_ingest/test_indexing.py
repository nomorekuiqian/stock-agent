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


def test_empty_body_dropped():
    empty_post = {
        "topic_id": "t2", "type": "talk", "title": "", "text": "",
        "author": {"name": "潘大", "role": "owner"},
        "create_time": "2026-06-02T10:00:00.000+0800",
    }
    prepared, drop = indexing.prepare_records([empty_post], min_chars=0)
    assert prepared == []
    assert drop["empty"] == 1


def test_boilerplate_welcome_post_dropped():
    boilerplate_post = {
        "topic_id": "t3", "type": "talk", "title": "",
        "text": "欢迎加入潘大的科技交流圈知识星球！请先阅读圈子规则。",
        "author": {"name": "潘大", "role": "owner"},
        "create_time": "2026-06-03T10:00:00.000+0800",
    }
    prepared, drop = indexing.prepare_records([boilerplate_post], min_chars=0)
    assert prepared == []
    assert drop["boilerplate"] == 1


def test_audit_distribution_keys_and_values():
    # OWNER_QA has a long enough body (900 chars) to be "analysis" content_type
    prepared, drop_reasons = indexing.prepare_records([OWNER_QA], min_chars=0)
    assert len(prepared) == 1
    result = indexing.audit_distribution([OWNER_QA], prepared, drop_reasons)
    assert result["total"] == 1
    assert result["selected"] == 1
    assert "content_type" in result
    assert "ticker_coverage" in result
    # NVDA is in the record, so ticker_coverage should be 1.0
    assert result["ticker_coverage"] == 1.0


def test_enrichment_provenance_in_metadata_not_content():
    """enrichment_version/status are metadata-only — must NOT appear in the
    embedded content, so content_hash (and thus idempotency) is unaffected."""
    prepared, _drop = indexing.prepare_records([OWNER_QA], min_chars=0)
    rec = prepared[0]
    assert rec.metadata["enrichment_version"] == "tier0-v1"
    assert rec.metadata["enrichment_status"] == "deterministic"
    assert "enrichment_version" not in rec.content
    assert "tier0-v1" not in rec.content

"""Unit tests for community access grant planning and persona scoping."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.features.community_access.router import (
    PandaConversationPinRequest,
    PandaConversationSaveRequest,
    panda_access_status,
    panda_create_conversation,
    panda_list_conversations,
    panda_pin_conversation,
)
from app.features.community_access.service import build_grant_plan, normalize_email
from app.features.kol_research.router import _ensure_persona_allowed, list_kol_personas


def test_normalize_email_strips_and_lowercases():
    assert normalize_email("  USER@Example.COM  ") == "user@example.com"


def test_build_grant_plan_extracts_valid_invalid_and_duplicates():
    plan = build_grant_plan(
        emails_text="""
        Alice@example.com
        bob@example.com, alice@example.com
        """,
        emails=["carol@example.com", "bob@example.com", "not-an-email"],
    )

    assert plan.total_input == 6
    assert plan.valid == ["carol@example.com", "bob@example.com", "alice@example.com"]
    assert plan.duplicates == ["bob@example.com", "alice@example.com"]
    assert plan.invalid == ["not-an-email"]


@pytest.mark.asyncio
async def test_generic_kol_endpoint_rejects_pandacircle_persona():
    with pytest.raises(HTTPException) as exc:
        await _ensure_persona_allowed(
            "pandacircle",
            {"user_id": "u1", "email": "member@example.com"},
        )

    assert exc.value.status_code == 403
    assert "专属社群入口" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_research_persona_scope_excludes_pandacircle(monkeypatch):
    async def fake_get_user_flags(*_args, **_kwargs):
        return set()

    monkeypatch.setattr("app.features.kol_research.router.get_user_flags", fake_get_user_flags)

    result = await list_kol_personas(
        user_info={"user_id": "u1", "email": "member@example.com"},
        scope="research",
    )

    usernames = {persona["username"] for persona in result["personas"]}
    assert "pandacircle" not in usernames


@pytest.mark.asyncio
async def test_community_panda_scope_returns_only_pandacircle(monkeypatch):
    async def fake_get_user_flags(*_args, **_kwargs):
        return set()

    monkeypatch.setattr("app.features.kol_research.router.get_user_flags", fake_get_user_flags)

    result = await list_kol_personas(
        user_info={"user_id": "u1", "email": "member@example.com"},
        scope="community_panda",
    )

    assert [persona["username"] for persona in result["personas"]] == ["pandacircle"]


@pytest.mark.asyncio
async def test_panda_access_status_marks_seen_only_for_active_grant(monkeypatch):
    seen_calls: list[tuple[str, str, str]] = []

    async def fake_get_active_grant_by_email(partner_id: str, email: str):
        assert partner_id == "panda"
        assert email == "member@example.com"
        return {"email": email, "email_normalized": email, "status": "active"}

    async def fake_mark_grant_seen(partner_id: str, email: str, user_id: str):
        seen_calls.append((partner_id, email, user_id))

    monkeypatch.setattr(
        "app.features.community_access.router.db.get_active_grant_by_email",
        fake_get_active_grant_by_email,
    )
    monkeypatch.setattr(
        "app.features.community_access.router.db.mark_grant_seen",
        fake_mark_grant_seen,
    )

    result = await panda_access_status(
        user_info={"user_id": "u1", "email": " MEMBER@example.com "},
    )

    assert result.has_access is True
    assert result.email == "member@example.com"
    assert seen_calls == [("panda", "member@example.com", "u1")]


@pytest.mark.asyncio
async def test_panda_access_status_does_not_mark_seen_without_grant(monkeypatch):
    async def fake_get_active_grant_by_email(*_args, **_kwargs):
        return None

    async def fake_mark_grant_seen(*_args, **_kwargs):
        raise AssertionError("mark_grant_seen should not be called without an active grant")

    monkeypatch.setattr(
        "app.features.community_access.router.db.get_active_grant_by_email",
        fake_get_active_grant_by_email,
    )
    monkeypatch.setattr(
        "app.features.community_access.router.db.mark_grant_seen",
        fake_mark_grant_seen,
    )

    result = await panda_access_status(
        user_info={"user_id": "u1", "email": "missing@example.com"},
    )

    assert result.has_access is False
    assert result.grant is None


@pytest.mark.asyncio
async def test_panda_list_conversations_filters_to_panda_items(monkeypatch):
    async def fake_list_conversations(*_args, **_kwargs):
        return {
            "items": [
                {"id": "panda-1", "persona_username": "pandacircle"},
                {"id": "panda-2", "partner_id": "panda"},
                {"id": "other", "persona_username": "qinbafrank"},
            ]
        }

    monkeypatch.setattr(
        "app.features.community_access.router.list_conversations",
        fake_list_conversations,
    )

    result = await panda_list_conversations(
        user_info={"user_id": "u1", "email": "member@example.com"},
        limit=20,
        offset=0,
    )

    assert [item["id"] for item in result["conversations"]] == ["panda-1", "panda-2"]
    assert result["has_more"] is False


@pytest.mark.asyncio
async def test_panda_create_conversation_stamps_metadata_and_syncs_runtime(monkeypatch):
    captured_create: dict[str, object] = {}
    captured_sync: dict[str, object] = {}

    async def fake_create_conversation(**kwargs):
        captured_create.update(kwargs)
        return {"id": kwargs["conversation_id"], "title": kwargs["title"]}

    async def fake_sync_panda_runtime_ui_state(**kwargs):
        captured_sync.update(kwargs)

    monkeypatch.setattr(
        "app.features.community_access.router.create_conversation",
        fake_create_conversation,
    )
    monkeypatch.setattr(
        "app.features.community_access.router._sync_panda_runtime_ui_state",
        fake_sync_panda_runtime_ui_state,
    )

    result = await panda_create_conversation(
        PandaConversationSaveRequest(
            id="c1",
            title="Panda chat",
            data={"messages": []},
            message_count=2,
        ),
        user_info={"user_id": "u1", "email": "member@example.com"},
    )

    assert result["id"] == "c1"
    assert captured_create["user_id"] == "u1"
    assert captured_create["conversation_id"] == "c1"
    assert captured_create["data"] == {
        "messages": [],
        "agent_kind": "kol_research",
        "persona_username": "pandacircle",
        "partner_id": "panda",
    }
    assert captured_sync["conversation_id"] == "c1"
    assert captured_sync["source"] == "panda_conversation_create"


@pytest.mark.asyncio
async def test_panda_pin_requires_panda_owned_conversation(monkeypatch):
    async def fake_get_conversation(*_args, **_kwargs):
        return {"id": "c1", "title": "Other", "data": {"persona_username": "qinbafrank"}}

    async def fake_pin_session(*_args, **_kwargs):
        raise AssertionError("pin_session should not be called for non-Panda conversations")

    monkeypatch.setattr("app.features.community_access.router.get_conversation", fake_get_conversation)
    monkeypatch.setattr("app.features.agent_runtime.db.pin_session", fake_pin_session)

    with pytest.raises(HTTPException) as exc:
        await panda_pin_conversation(
            "c1",
            PandaConversationPinRequest(is_pinned=True),
            user_info={"user_id": "u1", "email": "member@example.com"},
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_panda_pin_uses_kol_runtime_agent(monkeypatch):
    captured: dict[str, object] = {}

    async def fake_get_conversation(*_args, **_kwargs):
        return {
            "id": "c1",
            "title": "Panda chat",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "data": {"persona_username": "pandacircle", "partner_id": "panda"},
        }

    async def fake_pin_session(**kwargs):
        captured.update(kwargs)
        return {
            "agent_id": kwargs["agent_id"],
            "is_pinned": kwargs["is_pinned"],
            "pinned_at": "2026-01-03T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
        }

    monkeypatch.setattr("app.features.community_access.router.get_conversation", fake_get_conversation)
    monkeypatch.setattr("app.features.agent_runtime.db.pin_session", fake_pin_session)

    result = await panda_pin_conversation(
        "c1",
        PandaConversationPinRequest(is_pinned=True),
        user_info={"user_id": "u1", "email": "member@example.com"},
    )

    assert result["success"] is True
    assert captured["agent_id"] == "kol_research_agent"
    assert captured["metadata"] == {
        "persona_username": "pandacircle",
        "partner_id": "panda",
        "agent_kind": "kol_research",
    }

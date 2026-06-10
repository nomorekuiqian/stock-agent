"""
Picker Conversation CRUD Unit Tests

Tests for conversation endpoints in screener router.
All DB calls are mocked -- no real database access.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_conversation_unit.py -v
"""

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MOCK_USER_ID = "test-user-123"
MOCK_CONV_ID = "conv-uuid-456"

CONV_DB = "app.features.screener.conversation_db"


@pytest.fixture
def client():
    """Create a test client with mocked auth via dependency_overrides."""
    from app.main import app
    from app.core.deps import verify_user_token

    app.dependency_overrides[verify_user_token] = lambda: MOCK_USER_ID
    yield TestClient(app)
    app.dependency_overrides.pop(verify_user_token, None)


@pytest.fixture
def sample_conversation():
    return {
        "id": MOCK_CONV_ID,
        "user_id": MOCK_USER_ID,
        "title": "高股息蓝筹",
        "data": {
            "messages": [
                {"id": "msg-1", "role": "user", "content": "帮我找高股息股票"},
                {"id": "msg-2", "role": "assistant", "content": "好的"},
            ],
            "accumulated_filters": [],
            "candidates": [],
            "candidate_count": 0,
            "universe_size": 3680,
        },
        "message_count": 2,
        "created_at": "2026-03-05T10:00:00Z",
        "updated_at": "2026-03-05T10:00:00Z",
    }


@pytest.fixture
def save_request():
    return {
        "title": "3月5日 - 高股息蓝筹",
        "data": {
            "messages": [
                {"id": "msg-1", "role": "user", "content": "帮我找高股息股票"},
            ],
        },
        "message_count": 1,
    }


# ---------------------------------------------------------------------------
# List conversations
# ---------------------------------------------------------------------------


class TestListConversations:
    @patch(f"{CONV_DB}.list_conversations", new_callable=AsyncMock)
    def test_returns_conversations(self, mock_list, client, sample_conversation):
        mock_list.return_value = {
            "items": [
                {
                    "id": sample_conversation["id"],
                    "title": sample_conversation["title"],
                    "message_count": 2,
                    "updated_at": "2026-03-05T10:00:00Z",
                }
            ],
            "has_more": False,
        }
        resp = client.get("/api/screener/conversations")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["conversations"]) == 1
        assert body["conversations"][0]["title"] == "高股息蓝筹"
        assert body["has_more"] is False
        mock_list.assert_called_once_with(MOCK_USER_ID, limit=20, offset=0, search=None)

    @patch(f"{CONV_DB}.list_conversations", new_callable=AsyncMock)
    def test_passes_search_to_db(self, mock_list, client):
        mock_list.return_value = {"items": [], "has_more": False}

        resp = client.get("/api/screener/conversations?limit=10&offset=5&search=AI")

        assert resp.status_code == 200
        assert resp.json()["conversations"] == []
        mock_list.assert_called_once_with(MOCK_USER_ID, limit=10, offset=5, search="AI")

    @patch(f"{CONV_DB}.list_conversations", new_callable=AsyncMock)
    def test_returns_empty_list(self, mock_list, client):
        mock_list.return_value = {"items": [], "has_more": False}
        resp = client.get("/api/screener/conversations")
        assert resp.status_code == 200
        assert resp.json()["conversations"] == []
        assert resp.json()["has_more"] is False

    @pytest.mark.asyncio
    async def test_db_search_hydrates_conversations_and_returns_message_snippets(self, monkeypatch):
        from app.features.screener import conversation_db

        captured_params = []

        async def fake_call_function(name, *, method, params, timeout):
            captured_params.append(params)
            assert name == "picker-conversations"
            assert method == "GET"
            assert timeout == 10.0
            return {
                "data": {
                    "success": True,
                    "data": [
                        {"id": "no-hit", "title": "普通对话", "updated_at": "2026-03-05T10:00:00Z"},
                        {"id": "hit", "title": "市场讨论", "updated_at": "2026-03-05T11:00:00Z"},
                    ],
                    "has_more": False,
                },
            }

        conversations = {
            "no-hit": {
                "id": "no-hit",
                "user_id": MOCK_USER_ID,
                "title": "普通对话",
                "data": {"messages": [{"role": "user", "content": "怎么看银行股"}]},
                "message_count": 1,
                "created_at": "2026-03-05T10:00:00Z",
                "updated_at": "2026-03-05T10:00:00Z",
            },
            "hit": {
                "id": "hit",
                "user_id": MOCK_USER_ID,
                "title": "市场讨论",
                "data": {
                    "messages": [
                        {"role": "user", "content": "最近AI 股有点瑟瑟发抖，兄弟们换方向么？"},
                        {"role": "assistant", "content": "AI 股分歧变大，先看仓位和兑现压力。"},
                    ],
                },
                "message_count": 2,
                "created_at": "2026-03-05T11:00:00Z",
                "updated_at": "2026-03-05T11:00:00Z",
            },
        }

        async def fake_get_conversation(conversation_id, user_id):
            assert user_id == MOCK_USER_ID
            return conversations[conversation_id]

        service = SimpleNamespace(call_function=fake_call_function)
        monkeypatch.setattr(conversation_db, "get_insforge_service", lambda: service)
        monkeypatch.setattr(conversation_db, "get_conversation", fake_get_conversation)

        result = await conversation_db.list_conversations(
            MOCK_USER_ID,
            limit=20,
            offset=0,
            search="AI 股",
        )

        assert [item["id"] for item in result["items"]] == ["hit"]
        assert result["has_more"] is False
        assert result["items"][0]["search_matches"][0]["type"] == "message"
        assert result["items"][0]["search_matches"][0]["role"] == "user"
        assert "AI 股" in result["items"][0]["search_matches"][0]["snippet"]
        assert captured_params[0]["search"] == "AI 股"
        assert "search" not in captured_params[1]

    @pytest.mark.asyncio
    async def test_db_search_uses_edge_result_when_search_matches_present(self, monkeypatch):
        from app.features.screener import conversation_db

        async def fake_call_function(name, *, method, params, timeout):
            assert name == "picker-conversations"
            assert method == "GET"
            assert params["search"] == "AI 股"
            assert timeout == 10.0
            return {
                "data": {
                    "success": True,
                    "data": [
                        {
                            "id": "edge-hit",
                            "title": "AI 股讨论",
                            "message_count": 2,
                            "updated_at": "2026-03-05T11:00:00Z",
                            "search_matches": [
                                {
                                    "type": "message",
                                    "role": "user",
                                    "label": "用户消息",
                                    "snippet": "最近AI 股有点瑟瑟发抖",
                                },
                            ],
                        },
                    ],
                    "has_more": False,
                },
            }

        async def fail_get_conversation(conversation_id, user_id):
            raise AssertionError("edge search should not hydrate conversation details")

        service = SimpleNamespace(call_function=fake_call_function)
        monkeypatch.setattr(conversation_db, "get_insforge_service", lambda: service)
        monkeypatch.setattr(conversation_db, "get_conversation", fail_get_conversation)

        result = await conversation_db.list_conversations(
            MOCK_USER_ID,
            limit=8,
            offset=0,
            search="AI 股",
        )

        assert result["items"][0]["id"] == "edge-hit"
        assert result["items"][0]["search_matches"][0]["snippet"] == "最近AI 股有点瑟瑟发抖"
        assert result["has_more"] is False

    def test_db_search_uses_word_boundaries_for_ascii_terms(self):
        from app.features.screener import conversation_db

        terms = conversation_db._search_terms("hi")
        false_positive_row = {
            "title": "SIVE thesis",
            "data": {
                "messages": [
                    {
                        "role": "assistant",
                        "content": "CHIPS Act support and High Coverage do not contain a standalone greeting.",
                    },
                ],
            },
        }
        greeting_row = {
            "title": "Greeting",
            "data": {
                "messages": [
                    {"role": "user", "content": "Hi, 帮我看看今天市场。"},
                ],
            },
        }

        assert conversation_db._conversation_search_matches(false_positive_row, terms) == []
        matches = conversation_db._conversation_search_matches(greeting_row, terms)
        assert matches[0]["type"] == "message"
        assert matches[0]["snippet"].startswith("Hi")


# ---------------------------------------------------------------------------
# Get conversation
# ---------------------------------------------------------------------------


class TestGetConversation:
    @patch(f"{CONV_DB}.get_conversation", new_callable=AsyncMock)
    def test_returns_full_conversation(self, mock_get, client, sample_conversation):
        mock_get.return_value = sample_conversation
        resp = client.get(f"/api/screener/conversations/{MOCK_CONV_ID}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == MOCK_CONV_ID
        assert body["data"]["universe_size"] == 3680
        mock_get.assert_called_once_with(MOCK_CONV_ID, MOCK_USER_ID)

    @patch(f"{CONV_DB}.get_conversation", new_callable=AsyncMock)
    def test_not_found(self, mock_get, client):
        mock_get.return_value = None
        resp = client.get(f"/api/screener/conversations/{MOCK_CONV_ID}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Create conversation
# ---------------------------------------------------------------------------


class TestCreateConversation:
    @patch(f"{CONV_DB}.create_conversation", new_callable=AsyncMock)
    def test_creates_and_returns_id(self, mock_create, client, save_request):
        mock_create.return_value = {"id": MOCK_CONV_ID}
        resp = client.post("/api/screener/conversations", json=save_request)
        assert resp.status_code == 201
        assert resp.json()["id"] == MOCK_CONV_ID
        mock_create.assert_called_once_with(
            user_id=MOCK_USER_ID,
            title=save_request["title"],
            data=save_request["data"],
            message_count=save_request["message_count"],
            conversation_id=None,
        )

    @patch(f"{CONV_DB}.create_conversation", new_callable=AsyncMock)
    def test_db_failure_returns_500(self, mock_create, client, save_request):
        mock_create.return_value = None
        resp = client.post("/api/screener/conversations", json=save_request)
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Update conversation
# ---------------------------------------------------------------------------


class TestUpdateConversation:
    @patch(f"{CONV_DB}.update_conversation", new_callable=AsyncMock)
    def test_updates_successfully(self, mock_update, client, save_request):
        mock_update.return_value = True
        resp = client.put(
            f"/api/screener/conversations/{MOCK_CONV_ID}",
            json=save_request,
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        mock_update.assert_called_once_with(
            conversation_id=MOCK_CONV_ID,
            user_id=MOCK_USER_ID,
            title=save_request["title"],
            data=save_request["data"],
            message_count=save_request["message_count"],
            touch=True,
        )

    @patch(f"{CONV_DB}.update_conversation", new_callable=AsyncMock)
    def test_not_found_returns_404(self, mock_update, client, save_request):
        mock_update.return_value = False
        resp = client.put(
            f"/api/screener/conversations/{MOCK_CONV_ID}",
            json=save_request,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Delete conversation
# ---------------------------------------------------------------------------


class TestDeleteConversation:
    @patch(f"{CONV_DB}.delete_conversation", new_callable=AsyncMock)
    def test_deletes_successfully(self, mock_delete, client):
        mock_delete.return_value = True
        resp = client.delete(f"/api/screener/conversations/{MOCK_CONV_ID}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        mock_delete.assert_called_once_with(MOCK_CONV_ID, MOCK_USER_ID)

    @patch(f"{CONV_DB}.delete_conversation", new_callable=AsyncMock)
    def test_not_found_returns_404(self, mock_delete, client):
        mock_delete.return_value = False
        resp = client.delete(f"/api/screener/conversations/{MOCK_CONV_ID}")
        assert resp.status_code == 404

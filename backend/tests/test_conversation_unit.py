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
        mock_list.assert_called_once_with(MOCK_USER_ID, limit=20, offset=0)

    @patch(f"{CONV_DB}.list_conversations", new_callable=AsyncMock)
    def test_returns_empty_list(self, mock_list, client):
        mock_list.return_value = {"items": [], "has_more": False}
        resp = client.get("/api/screener/conversations")
        assert resp.status_code == 200
        assert resp.json()["conversations"] == []
        assert resp.json()["has_more"] is False


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

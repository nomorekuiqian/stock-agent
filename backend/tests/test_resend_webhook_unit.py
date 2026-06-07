from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_shape_resend_event_extracts_metrics_fields():
    from app.features.webhooks.resend_router import shape_resend_event

    event = {
        "type": "email.opened",
        "created_at": "2026-06-06T12:34:56Z",
        "data": {
            "email_id": "email-123",
            "broadcast_id": "broadcast-456",
            "to": ["reader@example.com"],
            "subject": "[TheMarketBrew专属日报] NVDA update",
        },
    }

    row = shape_resend_event(event, "msg_123")

    assert row["svix_id"] == "msg_123"
    assert row["event_type"] == "email.opened"
    assert row["email_id"] == "email-123"
    assert row["broadcast_id"] == "broadcast-456"
    assert row["recipient_email"] == "reader@example.com"
    assert row["channel"] == "personal_digest"


def test_shape_resend_event_uses_channel_tag_when_present():
    from app.features.webhooks.resend_router import shape_resend_event

    event = {
        "type": "email.clicked",
        "data": {
            "id": "email-123",
            "to": [{"email": "reader@example.com"}],
            "subject": "Generic subject",
            "tags": [{"name": "channel", "value": "weekly_report"}],
        },
    }

    row = shape_resend_event(event, "msg_456")

    assert row["email_id"] == "email-123"
    assert row["recipient_email"] == "reader@example.com"
    assert row["channel"] == "weekly_report"


def test_shape_resend_event_classifies_welcome_email():
    from app.features.webhooks.resend_router import shape_resend_event

    event = {
        "type": "email.delivered",
        "data": {
            "email_id": "email-welcome",
            "to": ["new-user@example.com"],
            "from": "Golden from TheMarketBrew <hello@themarketbrew.com>",
            "subject": "欢迎来到 TheMarketBrew：先把你的持仓加进来",
        },
    }

    row = shape_resend_event(event, "msg_welcome")

    assert row["channel"] == "welcome_email"


@pytest.mark.asyncio
async def test_resend_webhook_stores_verified_email_event():
    from app.features.webhooks import resend_router

    request = MagicMock()
    request.body = AsyncMock(return_value=b'{"type":"email.opened"}')
    request.headers = {
        "svix-id": "msg_123",
        "svix-timestamp": "123",
        "svix-signature": "sig",
    }
    service = MagicMock()
    service.call_function = AsyncMock(
        return_value={"status_code": 200, "data": {"success": True, "inserted": 1}}
    )

    verified_event = {
        "type": "email.opened",
        "created_at": "2026-06-06T12:34:56Z",
        "data": {
            "email_id": "email-123",
            "broadcast_id": "broadcast-456",
            "to": ["reader@example.com"],
            "subject": "[TheMarketBrew] Daily",
        },
    }

    with patch.object(resend_router, "RESEND_WEBHOOK_SECRET", "whsec_test"), \
         patch.object(resend_router, "Webhook") as webhook_cls, \
         patch.object(resend_router, "get_insforge_service", return_value=service):
        webhook_cls.return_value.verify.return_value = verified_event
        result = await resend_router.resend_webhook(request)

    assert result["success"] is True
    assert result["event_type"] == "email.opened"
    service.call_function.assert_awaited_once()
    kwargs = service.call_function.await_args.kwargs
    assert service.call_function.await_args.args[0] == "email-events"
    assert kwargs["json_body"]["email_id"] == "email-123"

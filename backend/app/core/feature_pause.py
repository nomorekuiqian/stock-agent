"""Reversible product pause: deny access and stop work before provider calls.

Pause flags are deployment-controlled, not user entitlements. All code/data is
retained. Restoring a feature requires an explicit release and schedule review.
"""

from __future__ import annotations

from urllib.parse import parse_qs

from fastapi import HTTPException
from starlette.responses import JSONResponse

PAUSED_FEATURES = frozenset({
    "portfolio_health", "research_kb", "kol_research", "panda",
    "watchlist_monitor", "mcp", "onboarding", "kol_index",
})

# Research chat can use these personas without reopening the KOL studio.
ACTIVE_CHAT_PERSONAS = frozenset({"qinbafrank", "aleabitoreddit"})
_KOL_CHAT_PATHS = frozenset({
    "/api/kol_research/personas",
    "/api/kol_research/chat",
    "/api/kol_research/chat/stream",
})

PAUSED_PATHS = {
    "/api/portfolio-health": "portfolio_health",
    "/api/research-kb": "research_kb",
    "/api/kol_research": "kol_research",
    "/api/community/panda": "panda",
    "/api/zsxq": "panda",
    "/api/watchlist-monitor": "watchlist_monitor",
    "/api/admin/watchlist-monitor": "watchlist_monitor",
    "/frank": "mcp",
    "/mcp": "mcp",
    "/api/mcp": "mcp",
    "/api/okx-mcp": "mcp",
    "/api/user/onboarding-status": "onboarding",
    "/api/user/onboarding": "onboarding",
    "/api/cron/onboarding-emails": "onboarding",
    "/api/vector/index-kol-tweets": "kol_index",
    "/api/vector": "research_kb",
    "/api/twitter/extract-methodology": "kol_research",
    "/api/twitter/ticker-discussion": "watchlist_monitor",
}


def is_paused(feature: str) -> bool:
    return feature in PAUSED_FEATURES


def require_active(feature: str) -> None:
    if is_paused(feature):
        raise HTTPException(status_code=403, detail={
            "code": "feature_paused", "feature": feature,
            "message": "该功能暂时停用",
        })


def require_generation_active(feature: str) -> None:
    key = feature.split(".", 1)[0]
    if feature == "twitter.ticker_discussion_summary":
        key = "watchlist_monitor"
    require_active(key)


def model_pause_guard(feature: str):
    """ADK callback prevents bypass via an already-created agent object."""
    def before_model(callback_context, llm_request):
        require_active(feature)
        return None
    return before_model


def is_persona_chat_active(username: str | None) -> bool:
    return isinstance(username, str) and not is_paused("kol_chat") and username in ACTIVE_CHAT_PERSONAS


def require_persona_chat_active(username: str) -> None:
    require_active("kol_chat")
    if not is_persona_chat_active(username):
        raise HTTPException(status_code=403, detail={
            "code": "feature_paused", "feature": "kol_research",
            "message": "该博主视角暂时停用",
        })


def persona_chat_model_guard(username: str):
    def before_model(callback_context, llm_request):
        require_persona_chat_active(username)
        return None
    return before_model


def paused_conversation(value: dict) -> bool:
    data = value.get("data") or {}
    metadata = value.get("metadata") or {}
    candidates = [item for item in [value, data, metadata] if isinstance(item, dict)]
    is_kol = any(
        (
            item.get("agent_id") == "kol_research_agent"
            or item.get("agent_kind") == "kol_research"
            or bool(item.get("persona_username"))
        ) for item in candidates
    )
    if not is_kol:
        return False
    personas = [item["persona_username"] for item in candidates if item.get("persona_username")]
    # Missing/conflicting persona metadata must not restore a paused agent.
    return not (personas and all(
        persona == personas[0] and is_persona_chat_active(persona) for persona in personas
    ))


class FeaturePauseMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "").rstrip("/")
            feature = next((
                key for prefix, key in PAUSED_PATHS.items()
                if path == prefix or path.startswith(prefix + "/")
            ), None)
            if (path in _KOL_CHAT_PATHS
                    or path == "/api/kol_research/conversations"
                    or path.startswith("/api/kol_research/conversations/")):
                feature = "kol_chat"
            query = parse_qs(scope.get("query_string", b"").decode("utf-8", "replace"))
            if path.startswith("/api/agent-runtime/") and query.get("agent_id") == ["kol_research_agent"]:
                feature = "kol_chat"
            if feature and is_paused(feature):
                response = JSONResponse(
                    {"detail": {"code": "feature_paused", "feature": feature,
                                "message": "该功能暂时停用"}},
                    status_code=403, headers={"Cache-Control": "no-store"},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)

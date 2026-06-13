"""
Research conversation persistence — DB layer via Insforge Edge Functions.
"""

import asyncio
import re
from typing import Any, Optional

from app.core.database import get_insforge_service
from app.core.logging import get_logger

logger = get_logger(__name__)

_FUNCTION_NAME = "picker-conversations"
_SEARCH_SCAN_LIMIT = 1000
_SEARCH_PAGE_SIZE = 16
_SEARCH_DETAIL_CONCURRENCY = 12
_ASCII_WORD_RE = re.compile(r"^[a-z0-9_]+$")


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _search_terms(value: str | None) -> list[str]:
    return [term for term in _normalize_text(value).lower().split() if term]


def _find_term_index(lower_text: str, term: str) -> int:
    if _ASCII_WORD_RE.match(term):
        pattern = re.compile(rf"(?<![a-z0-9_]){re.escape(term)}(?![a-z0-9_])")
        match = pattern.search(lower_text)
        return match.start() if match else -1
    return lower_text.find(term)


def _matches_all_terms(text: str, terms: list[str]) -> bool:
    lower = _normalize_text(text).lower()
    return all(_find_term_index(lower, term) >= 0 for term in terms)


def _build_snippet(text: str, terms: list[str]) -> str:
    normalized = _normalize_text(text)
    lower = normalized.lower()
    first_index = -1
    for term in terms:
        index = _find_term_index(lower, term)
        if index >= 0 and (first_index == -1 or index < first_index):
            first_index = index
    if first_index < 0:
        return normalized[:120]
    start = max(0, first_index - 45)
    end = min(len(normalized), first_index + 95)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(normalized) else ""
    return f"{prefix}{normalized[start:end]}{suffix}"


def _conversation_search_matches(row: dict[str, Any], terms: list[str]) -> list[dict[str, str]]:
    matches: list[dict[str, str]] = []
    data = row.get("data") if isinstance(row.get("data"), dict) else {}
    messages = data.get("messages") if isinstance(data, dict) else []
    if not isinstance(messages, list):
        messages = []

    for message in messages:
        if len(matches) >= 3:
            break
        if not isinstance(message, dict):
            continue
        content = _normalize_text(message.get("content"))
        if not content or not _matches_all_terms(content, terms):
            continue
        role = "assistant" if message.get("role") == "assistant" else "user"
        matches.append({
            "type": "message",
            "role": role,
            "label": "助手回答" if role == "assistant" else "用户消息",
            "snippet": _build_snippet(content, terms),
        })

    title = _normalize_text(row.get("title"))
    if not matches and _matches_all_terms(title, terms):
        matches.append({
            "type": "title",
            "label": "标题",
            "snippet": _build_snippet(title, terms),
        })
    return matches


def _to_conversation_summary(
    row: dict[str, Any],
    search_matches: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    summary = {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "title": row.get("title"),
        "message_count": row.get("message_count"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }
    if search_matches is not None:
        summary["search_matches"] = search_matches
    return summary


def _function_url() -> str:
    service = get_insforge_service()
    return service.function_url(_FUNCTION_NAME)


def _headers() -> dict:
    service = get_insforge_service()
    return service.headers


async def _list_conversations_via_edge(
    user_id: str,
    limit: int,
    offset: int,
    search: str | None = None,
) -> dict[str, Any] | None:
    service = get_insforge_service()
    params = {
        "action": "list",
        "user_id": user_id,
        "limit": str(limit),
        "offset": str(offset),
    }
    if search:
        params["search"] = search

    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params=params,
        timeout=10.0,
    )
    data = result.get("data", {})
    if not data.get("success"):
        logger.error("list_conversations failed: %s", data.get("error"))
        return None
    return {
        "items": data.get("data", []),
        "has_more": bool(data.get("has_more", False)),
    }


async def _list_conversation_page(user_id: str, limit: int, offset: int) -> tuple[list[dict], bool]:
    result = await _list_conversations_via_edge(user_id, limit, offset)
    if result is None:
        return [], False
    return result["items"], result["has_more"]


async def _hydrate_search_candidates(
    user_id: str,
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    semaphore = asyncio.Semaphore(_SEARCH_DETAIL_CONCURRENCY)

    async def hydrate(candidate: dict[str, Any]) -> dict[str, Any] | None:
        conversation_id = candidate.get("id")
        if not conversation_id:
            return None
        async with semaphore:
            try:
                return await get_conversation(str(conversation_id), user_id)
            except Exception:
                logger.exception("search hydrate failed conversation_id=%s", conversation_id)
                return None

    hydrated = await asyncio.gather(*(hydrate(candidate) for candidate in candidates))
    return [row for row in hydrated if row]


async def _search_conversations(user_id: str, limit: int, offset: int, search: str) -> dict:
    terms = _search_terms(search)
    if not terms:
        items, has_more = await _list_conversation_page(user_id, limit, offset)
        return {"items": items, "has_more": has_more}

    edge_result = await _list_conversations_via_edge(user_id, limit, offset, search=search)
    if edge_result is not None:
        edge_items = edge_result["items"]
        if not edge_items or any("search_matches" in item for item in edge_items):
            return edge_result

    target_count = offset + limit
    matches: list[dict[str, Any]] = []
    scanned = 0
    list_offset = 0
    may_have_more = False

    while scanned < _SEARCH_SCAN_LIMIT and len(matches) < target_count:
        page_limit = min(_SEARCH_PAGE_SIZE, _SEARCH_SCAN_LIMIT - scanned)
        candidates, has_more = await _list_conversation_page(
            user_id,
            limit=page_limit,
            offset=list_offset,
        )
        if not candidates:
            break

        hydrated = await _hydrate_search_candidates(user_id, candidates)
        for row in hydrated:
            search_matches = _conversation_search_matches(row, terms)
            if search_matches:
                matches.append(_to_conversation_summary(row, search_matches))

        scanned += len(candidates)
        list_offset += len(candidates)
        if len(matches) >= target_count:
            may_have_more = has_more or len(matches) > target_count
            break
        if not has_more or len(candidates) < page_limit:
            break

    page = matches[offset:offset + limit]
    return {
        "items": page,
        "has_more": len(matches) > offset + len(page) or may_have_more,
    }


async def list_conversations(
    user_id: str,
    limit: int = 20,
    offset: int = 0,
    search: str | None = None,
) -> dict:
    """List conversations for a user (lightweight, no data field).

    Returns ``{"items": [...], "has_more": bool}``. ``has_more`` is true when
    the underlying page is exactly ``limit`` rows long — caller uses this to
    decide whether to render a "load more" affordance.
    """
    limit = min(100, max(1, limit))
    offset = max(0, offset)
    if search:
        return await _search_conversations(user_id, limit, offset, search)

    result = await _list_conversations_via_edge(user_id, limit, offset)
    return result if result is not None else {"items": [], "has_more": False}


async def get_conversation(conversation_id: str, user_id: str) -> Optional[dict]:
    """Get a single conversation with full data."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="GET",
        params={"action": "get", "id": conversation_id, "user_id": user_id},
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return data.get("data")
    return None


async def create_conversation(
    user_id: str,
    title: str,
    data: dict[str, Any],
    message_count: int,
    conversation_id: str | None = None,
) -> Optional[dict]:
    """Create a new conversation. Returns the created row (with id)."""
    service = get_insforge_service()
    body: dict[str, Any] = {
        "user_id": user_id,
        "title": title,
        "data": data,
        "message_count": message_count,
    }
    if conversation_id:
        body["id"] = conversation_id
    result = await service.call_function(
        _FUNCTION_NAME,
        method="POST",
        params={"action": "create"},
        json_body=body,
        timeout=10.0,
    )
    data_resp = result.get("data", {})
    if data_resp.get("success"):
        return data_resp.get("data")
    logger.error("create_conversation failed: %s", data_resp.get("error"))
    return None


async def update_conversation(
    conversation_id: str,
    user_id: str,
    title: Optional[str] = None,
    data: Optional[dict[str, Any]] = None,
    message_count: Optional[int] = None,
    touch: bool = True,
) -> bool:
    """Update an existing conversation. Returns True on success."""
    body: dict[str, Any] = {"user_id": user_id, "touch": touch}
    if title is not None:
        body["title"] = title
    if data is not None:
        body["data"] = data
    if message_count is not None:
        body["message_count"] = message_count

    service = get_insforge_service()
    # Use call_function — but it only supports GET/POST/DELETE, not PUT.
    # Fall back to direct httpx call.
    import httpx

    url = _function_url()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                url,
                params={"action": "update", "id": conversation_id},
                json=body,
                headers=_headers(),
                timeout=10.0,
            )
            if response.status_code == 200:
                resp = response.json()
                if resp.get("success"):
                    return True
            logger.error(
                "update_conversation failed: status=%s",
                response.status_code,
            )
    except Exception:
        logger.exception("update_conversation error for id=%s", conversation_id)
    return False


async def delete_conversation(conversation_id: str, user_id: str) -> bool:
    """Delete a conversation. Returns True on success."""
    service = get_insforge_service()
    result = await service.call_function(
        _FUNCTION_NAME,
        method="DELETE",
        params={"action": "delete", "id": conversation_id, "user_id": user_id},
        timeout=10.0,
    )
    data = result.get("data", {})
    if data.get("success"):
        return True
    logger.error("delete_conversation failed: %s", data.get("error"))
    return False

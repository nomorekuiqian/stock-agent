"""holdings_sync LLM-extract quota — **fail-CLOSED** + **atomic**
(design §5; Codex adversarial-review fixes).

Distinct from `quota/service.py` (research chat), which is globally
fail-open. The cost model here caps screenshot/PDF-vision/paste extraction
at 8 invocations per user per UTC day; if we let the quota EF silently
fail-open, a paid user could hammer LLM/vision endpoints at the slowapi
ceiling (10/min) and blow the cost budget. So:

  · LLM path: quota EF unavailable → raise `QuotaUnavailable` →
    router returns **503** ("AI 识别暂不可用，请稍后重试，或改用 CSV/手敲
    （不限次）") — recoverable, never silent success.
  · Exhausted: raise `QuotaExceeded` → router returns **429**.
  · **Atomic** (Codex M2 [high] fix): the previous `get_usage → increment`
    two-step was raceable — concurrent extracts for the same user could
    all observe count<limit and all increment. Replaced with a single
    `consume_if_under_limit` EF action which delegates to the SQL function
    `consume_research_quota_if_under_limit` (single Postgres transaction +
    `pg_advisory_xact_lock(identifier, usage_date)`). The function returns
    `(consumed, count, lim)`; we map consumed=false → QuotaExceeded.
  · Identifier namespace `hsync:<user_id>` — never collides with the
    research-quota namespace (design §5).
  · Non-cost paths (CSV / manual / paste-pre-LLM / quote roundtrip / L2
    cache) do not call this — they remain fail-open in their own layers.
"""

from __future__ import annotations

from app.core.database import get_insforge_service
from app.core.logging import get_logger
from app.utils.timezone import today_str

logger = get_logger(__name__)

_FUNCTION = "research-quota"   # share the EF + DAU table; identifier-namespaced
DAILY_LIMIT = 8                # design §5 (LLM/vision pool)


class QuotaUnavailable(RuntimeError):
    """Quota EF unreachable/erroring — fail-closed for LLM/vision paths."""


class QuotaExceeded(RuntimeError):
    """User has consumed today's LLM extract budget."""


def _identifier(user_id: str) -> str:
    return f"hsync:{user_id}"


async def check_and_consume(user_id: str, mode: str, amount: int = 1) -> int:
    """Atomic consume-if-under-limit (Codex M2 [high] fix; M4 amount param).

    Calls the single EF action `consume_if_under_limit` which delegates to
    a Postgres function with `pg_advisory_xact_lock(identifier, date)` —
    concurrent extracts for the same user/day can no longer race past the
    cap. `amount` (default 1) lets the PDF-vision path consume up to 4 in
    one shot — **whole-or-nothing**: the SQL function refuses if
    `count + amount > limit` (no partial debits, design §5). Returns the
    post-consume count. Raises:

      · `QuotaUnavailable`  → router maps to 503 (fail-closed: any non-2xx
                              or success=false or transport error)
      · `QuotaExceeded`     → router maps to 429 (atomic refusal at cap)
    """
    if amount < 1:
        raise ValueError(f"amount must be ≥ 1, got {amount}")
    svc = get_insforge_service()
    try:
        result = await svc.call_function(
            _FUNCTION,
            method="POST",
            params={"action": "consume_if_under_limit"},
            json_body={
                "identifier": _identifier(user_id),
                "identifier_type": "user",
                "usage_date": today_str(),
                "limit": DAILY_LIMIT,
                "amount": amount,
            },
            timeout=10.0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("hsync quota atomic-consume transport error: %s", exc)
        raise QuotaUnavailable("quota EF unreachable") from exc

    if result.get("status_code") not in (200, 201):
        logger.warning(
            "hsync quota atomic-consume status=%s text=%s",
            result.get("status_code"), str(result.get("text", ""))[:200],
        )
        raise QuotaUnavailable("quota EF non-2xx")

    data = result.get("data") or {}
    if not data.get("success"):
        raise QuotaUnavailable("quota EF success=false")

    row = data.get("data") or {}
    count = int(row.get("count", 0))
    consumed = bool(row.get("consumed", False))

    if not consumed:
        logger.info("hsync quota exceeded user=%s used=%s", user_id[:8], count)
        raise QuotaExceeded(f"daily LLM-extract limit reached ({count}/{DAILY_LIMIT})")

    logger.info("hsync quota consumed user=%s mode=%s new=%s/%s",
                user_id[:8], mode, count, DAILY_LIMIT)
    return count

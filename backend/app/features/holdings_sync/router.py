"""holdings_sync router — extract / commit (design §3.2).

Shared guards run BEFORE entitlement/reconcile on BOTH endpoints (Codex
adversarial fix): flag (404) -> stage source gate (400) -> entitlement.
This makes the staged-rollout boundary impossible to bypass via a direct
POST to the state-changing /commit endpoint.

M1 ships the guards + /commit (uses reconcile_and_upsert). /extract (LLM
adapters/resolver) lands in M2 and is a guarded 501 stub until then.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.flags.db import get_user_flags
from app.features.holdings_sync.models import CommitRequest, CommitResponse
from app.features.holdings_sync.service import reconcile_and_upsert
from app.features.payment.entitlements import has_entitlement

logger = get_logger(__name__)

router = APIRouter(prefix="/api/holdings-sync", tags=["holdings_sync"])

_FLAG = "holdings_sync_import"
# v1 gate mirrors portfolio (Pro-and-above via watchlist_extended); frontend
# also wraps the entry in <PaywallGuard requiredPlan="pro">.
_ENTITLEMENT_FEATURE = "watchlist_extended"

# Server-side staged-rollout constant (NOT a per-user flag — playbook
# anti-pattern). Stage 1 = screenshot only; flipped to widen in M3/M4.
STAGE_ENABLED_SOURCES: set[str] = {"screenshot"}


async def _require_holdings_sync_flag(user_id: str) -> None:
    """feature-off => 404 (don't reveal endpoint existence). EF outage returns
    an empty flag set => safe default off (playbook two iron rules)."""
    flags = await get_user_flags(user_id)
    if _FLAG not in flags:
        raise HTTPException(status_code=404, detail="Not found")


def _require_source_enabled(source: str) -> None:
    """Stage gate. Applies to /extract (by mode) AND /commit (by payload.source)
    so the write path cannot bypass the rollout boundary."""
    if source not in STAGE_ENABLED_SOURCES:
        raise HTTPException(status_code=400, detail="该导入方式即将上线")


async def _require_holdings_sync_entitlement(user_id: str) -> None:
    if not await has_entitlement(user_id, _ENTITLEMENT_FEATURE):
        raise HTTPException(status_code=403, detail="持仓导入需要 Pro 及以上方案")


@router.post("/extract")
@limiter.limit("10/minute")
async def extract(request: Request, user_id: str = Depends(verify_user_token)):
    # Order: flag(404) -> stage gate(400, by mode) -> entitlement -> quota ->
    # adapter -> resolver -> ExtractDraft (no DB write). Implemented in M2.
    await _require_holdings_sync_flag(user_id)
    # NOTE: full multipart/mode parsing + LLM adapters land in M2 (T2.1-T2.5).
    raise HTTPException(status_code=501, detail="extract 将于 M2（截图）上线")


@router.post("/commit", response_model=CommitResponse)
@limiter.limit("12/minute")
async def commit(
    request: Request,
    payload: CommitRequest,
    user_id: str = Depends(verify_user_token),
) -> CommitResponse:
    await _require_holdings_sync_flag(user_id)                 # 1. flag -> 404
    _require_source_enabled(payload.source)                    # 2. stage gate -> 400
    await _require_holdings_sync_entitlement(user_id)          # 3. Pro-and-above
    try:
        return await reconcile_and_upsert(
            user_id,
            payload.source,
            payload.rows,
            clear_source=payload.clear_source,
        )
    except ValueError as exc:  # invalid symbol slipped through -> 400, not 500
        logger.warning("holdings_sync commit rejected user=%s err=%s", user_id[:8], exc)
        raise HTTPException(status_code=400, detail=str(exc))

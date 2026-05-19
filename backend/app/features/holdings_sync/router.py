"""holdings_sync router — extract (M2 screenshot live) + commit (M1).

Shared guards run BEFORE entitlement on BOTH endpoints (Codex adversarial
fix): flag (404) -> stage source gate (400) -> entitlement -> (extract:
quota fail-closed -> LLM + resolver -> ExtractDraft) | (commit: reconcile).
The staged-rollout boundary is enforced on the **write** endpoint too so a
direct POST /commit cannot bypass the rollout in the flag-closed or
not-yet-launched state.

LLM cost path is fail-CLOSED at the quota layer (design §5) — a quota EF
outage returns a recoverable 503 rather than silently allowing extracts.
Non-cost paths (quote roundtrip, L2 cache, FMP search local hit) stay
fail-open at their own layers.
"""

from __future__ import annotations

import asyncio
import io
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.core.deps import verify_user_token
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.features.flags.db import get_user_flags
from app.features.holdings_sync import agent, parsers as hs_parsers, quota as hs_quota, resolver
from app.features.holdings_sync.models import (
    CommitRequest,
    CommitResponse,
    ExtractDraft,
    ExtractedRow,
)
from app.features.holdings_sync.service import reconcile_and_upsert
from app.features.payment.entitlements import has_entitlement

logger = get_logger(__name__)

router = APIRouter(prefix="/api/holdings-sync", tags=["holdings_sync"])

_FLAG = "holdings_sync_import"
_ENTITLEMENT_FEATURE = "watchlist_extended"

# Server-side staged-rollout constant (NOT a per-user flag — playbook
# anti-pattern). Stage 1 = screenshot only; widened in M3/M4.
STAGE_ENABLED_SOURCES: set[str] = {"screenshot"}

# Hard server-side image guards (design §5). FE downsamples to ≤1600px /
# ≤6MB / png|jpeg|webp; server mirrors as the trust boundary.
_MAX_IMAGE_BYTES = 6 * 1024 * 1024
_ALLOWED_IMAGE_MIME = {"image/png", "image/jpeg", "image/webp"}
_MAX_IMAGE_DIM = 1600
# Paste-text guard (design §5). Mirror the FE client-side 8000-char cap.
_MAX_PASTE_CHARS = 8000
# CSV guards (design §5). CSV is no-LLM-cost so quota is NOT consumed, but
# the bytes still need a hard cap to defend against DoS.
_MAX_CSV_BYTES = 2 * 1024 * 1024
_ALLOWED_CSV_MIME = {"text/csv", "application/csv", "text/plain",
                     "application/vnd.ms-excel", "application/octet-stream"}

# Per-request budgets (design §2bis.A + §7bis.7).
_TOTAL_DEADLINE_SEC = 14.0    # overall /extract wall-clock cap (image decode +
                              # LLM + resolver + quote roundtrip). Returns 504
                              # to the user if exceeded. Codex M2 [high] fix:
                              # the LLM step now has an enforced hard cap.
_LLM_TIMEOUT_SEC = 10.0       # hard cap on the Gemini call (PoC measured 3-6s;
                              # this is 3x headroom). Wraps `asyncio.to_thread`
                              # with `asyncio.wait_for` — the wrapper cancels
                              # so the HTTP response is bounded; the underlying
                              # google-genai sync call may continue in its
                              # worker thread (Python limitation, documented).
_RESOLVER_MIN_BUDGET = 2.0    # resolver gets at least 2s even if LLM took long
_FALLBACK_BUDGET = 12         # FMP-search-call cap per request


async def _require_holdings_sync_flag(user_id: str) -> None:
    """feature-off => 404. EF outage returns an empty flag set => safe
    default off (playbook two iron rules)."""
    flags = await get_user_flags(user_id)
    if _FLAG not in flags:
        raise HTTPException(status_code=404, detail="Not found")


def _require_source_enabled(source: str) -> None:
    """Stage gate. Applies to /extract (by `mode`) AND /commit (by
    payload.source) so the write path cannot bypass the rollout."""
    if source not in STAGE_ENABLED_SOURCES:
        raise HTTPException(status_code=400, detail="该导入方式即将上线")


async def _require_holdings_sync_entitlement(user_id: str) -> None:
    if not await has_entitlement(user_id, _ENTITLEMENT_FEATURE):
        raise HTTPException(status_code=403, detail="持仓导入需要 Pro 及以上方案")


def _draft_id() -> str:
    """Opaque client-echo draft id — no server-side draft store (design §5)."""
    return secrets.token_urlsafe(12)


# --------------------------------------------------------------------------- #
# image guards (server-side defense — FE also downsamples)
# --------------------------------------------------------------------------- #


def _downsample_if_needed(data: bytes, mime: str) -> tuple[bytes, str]:
    """If longest side > 1600px, downsample. Pillow runs in a worker thread.
    Returns (possibly-recoded) bytes and effective mime."""
    try:
        from PIL import Image
    except Exception:  # noqa: BLE001 — Pillow optional; ship raw if missing
        return data, mime
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as exc:  # noqa: BLE001 — bad bytes -> 400
        logger.warning("hsync downsample: invalid image (%s)", exc)
        raise HTTPException(status_code=400, detail="无法解析图片，请换一张")
    if max(img.size) <= _MAX_IMAGE_DIM:
        return data, mime
    img.thumbnail((_MAX_IMAGE_DIM, _MAX_IMAGE_DIM))
    out = io.BytesIO()
    fmt = "PNG" if mime == "image/png" else "JPEG" if mime == "image/jpeg" else "WEBP"
    save_kwargs: dict = {}
    if fmt in {"JPEG", "WEBP"}:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        save_kwargs["quality"] = 85
    img.save(out, format=fmt, **save_kwargs)
    return out.getvalue(), mime


# --------------------------------------------------------------------------- #
# endpoints
# --------------------------------------------------------------------------- #


@router.post("/extract", response_model=ExtractDraft)
@limiter.limit("10/minute")
async def extract(
    request: Request,
    mode: str = Form(...),
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
    mapping: Optional[str] = Form(default=None),  # JSON: csv column mapping
    user_id: str = Depends(verify_user_token),
) -> ExtractDraft:
    # Gate order (write/extract symmetric): flag(404) -> stage gate(400) ->
    # entitlement(403) -> LLM quota fail-closed(503) -> adapter -> resolver.
    await _require_holdings_sync_flag(user_id)
    _require_source_enabled(mode)
    await _require_holdings_sync_entitlement(user_id)

    if mode == "screenshot":
        return await _extract_screenshot(user_id, file)
    if mode == "paste":
        return await _extract_paste(user_id, text)
    if mode == "csv":
        return await _extract_csv(user_id, file, mapping)
    # pdf is stage-gated above; defensive 400 if STAGE widens without an adapter.
    raise HTTPException(status_code=400, detail=f"unsupported mode: {mode}")


async def _extract_screenshot(user_id: str, file: Optional[UploadFile]) -> ExtractDraft:
    request_start = time.time()
    total_deadline = request_start + _TOTAL_DEADLINE_SEC

    if file is None:
        raise HTTPException(status_code=400, detail="缺少截图文件")
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=400, detail="仅支持 PNG / JPEG / WEBP 截图")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="截图为空")
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="截图过大（>6MB），请压缩后再试")

    # Codex M2 [high] fix #1 — validate image DECODABILITY before consuming
    # quota. Otherwise corrupt-but-correct-MIME bytes burn a daily LLM
    # attempt and 400 immediately, which is repeatable user-visible quota
    # loss with zero LLM cost. `_downsample_if_needed` opens the image with
    # Pillow and raises 400 here on bad bytes — quota stays untouched.
    image_bytes, image_mime = await asyncio.to_thread(_downsample_if_needed, raw, mime)

    # NOW consume quota (the image is known-decodable; LLM call is imminent).
    # LLM-cost path = quota fail-CLOSED + atomic (design §5; Codex M2 [high]).
    try:
        await hs_quota.check_and_consume(user_id, "screenshot")
    except hs_quota.QuotaExceeded:
        raise HTTPException(
            status_code=429,
            detail="今日 AI 识别次数已用完，可改用 CSV/手敲（不限次）",
        )
    except hs_quota.QuotaUnavailable:
        raise HTTPException(
            status_code=503,
            detail="AI 识别暂不可用，请稍后重试，或改用 CSV/手敲（不限次）",
        )

    # Codex M2 [high] fix #2 — hard cap the LLM call. `asyncio.wait_for`
    # bounds the request's wall-clock time (returns 504 to the user); the
    # underlying sync `google-genai` thread may keep running (Python
    # thread-cancellation limitation, documented + acceptable: the user is
    # never left hanging, the orphan thread completes and is GC'd).
    try:
        vision = await asyncio.wait_for(
            asyncio.to_thread(agent.extract_from_image, image_bytes, image_mime),
            timeout=_LLM_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        logger.warning("hsync screenshot LLM timeout user=%s >%ss",
                       user_id[:8], _LLM_TIMEOUT_SEC)
        raise HTTPException(
            status_code=504,
            detail="AI 识别超时，请稍后重试，或改用 CSV/手敲",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("hsync screenshot LLM failed user=%s err=%s", user_id[:8], exc)
        raise HTTPException(status_code=502, detail="AI 识别失败，请稍后重试")

    if not vision.looks_like_holdings or not vision.holdings:
        return ExtractDraft(
            draft_id=_draft_id(),
            source="screenshot",
            rows=[],
            dropped_note="未识别到持仓信息——请换一张更清晰的截图，或改用粘贴 / CSV",
        )

    # Resolver gets the *remaining* budget (was: a fresh 8s after LLM, which
    # let a slow LLM extend total request time well past intent). Floor at
    # _RESOLVER_MIN_BUDGET so the resolver always has time to at least dedup
    # and produce pending_review rows.
    remaining = max(_RESOLVER_MIN_BUDGET, total_deadline - time.time())
    ctx = resolver.SourceContext(
        deadline_ts=time.time() + remaining,
        fallback_budget=_FALLBACK_BUDGET,
    )
    raws = [h.symbol_or_name for h in vision.holdings]
    resolutions = await resolver.resolve_many(ctx, raws)

    rows: list[ExtractedRow] = []
    for h, res in zip(vision.holdings, resolutions):
        rows.append(ExtractedRow(
            symbol=res.symbol,
            shares=h.shares,
            cost_basis=h.cost_basis,
            entry_price=h.entry_price,
            weight_pct=h.weight_pct,
            raw=h.symbol_or_name,
            resolved_name=res.name,
            exchange=res.exchange,
            confidence=res.confidence,  # type: ignore[arg-type]
            status=res.status,           # type: ignore[arg-type]
            candidates=res.candidates,
            notices=res.notices,
        ))
    return ExtractDraft(draft_id=_draft_id(), source="screenshot", rows=rows)


async def _extract_paste(user_id: str, text: Optional[str]) -> ExtractDraft:
    """Paste-text extract — same gate / quota / timeout / resolver shape as
    screenshot, just calls `agent.extract_from_text` on the text instead.
    8000-char hard cap (server mirror of FE truncation, design §5)."""
    request_start = time.time()
    total_deadline = request_start + _TOTAL_DEADLINE_SEC

    if text is None or not text.strip():
        raise HTTPException(status_code=400, detail="粘贴内容为空")
    if len(text) > _MAX_PASTE_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"粘贴文本过长（>{_MAX_PASTE_CHARS} 字符），请缩短后再试",
        )

    # LLM-cost path → quota fail-CLOSED + atomic (same as screenshot).
    try:
        await hs_quota.check_and_consume(user_id, "paste")
    except hs_quota.QuotaExceeded:
        raise HTTPException(
            status_code=429,
            detail="今日 AI 识别次数已用完，可改用 CSV/手敲（不限次）",
        )
    except hs_quota.QuotaUnavailable:
        raise HTTPException(
            status_code=503,
            detail="AI 识别暂不可用，请稍后重试，或改用 CSV/手敲（不限次）",
        )

    try:
        text_out = await asyncio.wait_for(
            asyncio.to_thread(agent.extract_from_text, text),
            timeout=_LLM_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        logger.warning("hsync paste LLM timeout user=%s >%ss",
                       user_id[:8], _LLM_TIMEOUT_SEC)
        raise HTTPException(
            status_code=504,
            detail="AI 识别超时，请稍后重试，或改用 CSV/手敲",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("hsync paste LLM failed user=%s err=%s", user_id[:8], exc)
        raise HTTPException(status_code=502, detail="AI 识别失败，请稍后重试")

    if not text_out.looks_like_holdings or not text_out.holdings:
        return ExtractDraft(
            draft_id=_draft_id(),
            source="paste",
            rows=[],
            dropped_note="未识别到持仓信息——请确认粘贴的是持仓列表（券商导出 / 截图 OCR / 手写都行）",
        )

    remaining = max(_RESOLVER_MIN_BUDGET, total_deadline - time.time())
    ctx = resolver.SourceContext(
        deadline_ts=time.time() + remaining,
        fallback_budget=_FALLBACK_BUDGET,
    )
    raws = [h.symbol_or_name for h in text_out.holdings]
    resolutions = await resolver.resolve_many(ctx, raws)

    rows: list[ExtractedRow] = []
    for h, res in zip(text_out.holdings, resolutions):
        rows.append(ExtractedRow(
            symbol=res.symbol,
            shares=h.shares,
            cost_basis=h.cost_basis,
            entry_price=h.entry_price,
            weight_pct=h.weight_pct,
            raw=h.symbol_or_name,
            resolved_name=res.name,
            exchange=res.exchange,
            confidence=res.confidence,  # type: ignore[arg-type]
            status=res.status,           # type: ignore[arg-type]
            candidates=res.candidates,
            notices=res.notices,
        ))
    return ExtractDraft(draft_id=_draft_id(), source="paste", rows=rows)


async def _extract_csv(
    user_id: str,
    file: Optional[UploadFile],
    mapping_json: Optional[str],
) -> ExtractDraft:
    """CSV extract — deterministic, **NO LLM quota consumed** (design §5).
    The expensive step is the resolver, which still has the same per-request
    budgets. The FE drives the two-step `needs_mapping` flow: a first
    submit may return `columns` + empty rows, the user picks the columns,
    a second submit carries `mapping` JSON.
    """
    request_start = time.time()
    total_deadline = request_start + _TOTAL_DEADLINE_SEC

    if file is None:
        raise HTTPException(status_code=400, detail="缺少 CSV 文件")
    mime = (file.content_type or "").lower()
    if mime and mime not in _ALLOWED_CSV_MIME:
        # Allow octet-stream / blank for browsers that don't sniff; reject
        # obvious non-csv mimes like image/* or application/pdf.
        if not (mime.startswith("text/") or mime in _ALLOWED_CSV_MIME):
            raise HTTPException(status_code=400, detail="仅支持 CSV (.csv / .txt)")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="CSV 文件为空")
    if len(raw) > _MAX_CSV_BYTES:
        raise HTTPException(
            status_code=400, detail=f"CSV 过大（>{_MAX_CSV_BYTES // (1024*1024)}MB），请精简后再试")

    # Parse mapping if provided (FE second-step submit)
    parsed_mapping: Optional[dict] = None
    if mapping_json:
        try:
            import json
            parsed_mapping = json.loads(mapping_json)
            if not isinstance(parsed_mapping, dict):
                raise ValueError("mapping must be a JSON object")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"mapping 解析失败: {exc}")

    result = await asyncio.to_thread(hs_parsers.parse_csv, raw, parsed_mapping)

    # Needs-mapping branch: FE will show column picker + resubmit.
    if result.needs_mapping:
        return ExtractDraft(
            draft_id=_draft_id(),
            source="csv",
            rows=[],
            columns=result.columns,
            dropped_note="无法自动识别列——请在 Review 选择对应列后重新提交",
        )

    if not result.holdings:
        return ExtractDraft(
            draft_id=_draft_id(),
            source="csv",
            rows=[],
            columns=result.columns,
            dropped_note="未识别到持仓行——请确认 CSV 内容（持仓代码、数量列）",
        )

    # Resolve symbols (concurrent, budget+deadline guarded).
    remaining = max(_RESOLVER_MIN_BUDGET, total_deadline - time.time())
    ctx = resolver.SourceContext(
        deadline_ts=time.time() + remaining,
        fallback_budget=_FALLBACK_BUDGET,
    )
    raws = [h.symbol_or_name for h in result.holdings]
    resolutions = await resolver.resolve_many(ctx, raws)

    # Parser-level notices apply to the whole draft (locale ambiguity, cap
    # truncation). We attach them via the first row's notices for the FE to
    # surface in a banner — keeping the contract row-shaped.
    banner = list(result.notices)

    rows: list[ExtractedRow] = []
    for i, (h, res) in enumerate(zip(result.holdings, resolutions)):
        row_notices = list(res.notices)
        if i == 0 and banner:
            row_notices = banner + row_notices
        rows.append(ExtractedRow(
            symbol=res.symbol,
            shares=h.shares,
            cost_basis=h.cost_basis,
            entry_price=h.entry_price,
            weight_pct=h.weight_pct,
            raw=h.symbol_or_name,
            resolved_name=res.name,
            exchange=res.exchange,
            confidence=res.confidence,  # type: ignore[arg-type]
            status=res.status,           # type: ignore[arg-type]
            candidates=res.candidates,
            notices=row_notices,
        ))
    return ExtractDraft(draft_id=_draft_id(), source="csv", rows=rows)


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
    except ValueError as exc:
        logger.warning("hsync commit rejected user=%s err=%s", user_id[:8], exc)
        raise HTTPException(status_code=400, detail=str(exc))

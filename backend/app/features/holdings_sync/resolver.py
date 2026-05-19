"""holdings_sync symbol resolver (design §2 + §2bis).

5-step `resolve_identifier` over a batch of raw inputs (ticker / abbrev /
English / Chinese name), with:

  · step 0   $CASH short-circuit (multilingual, never hits FMP)
  · step 2a  literal class-share ticker shortcut (EC3.a) — BRK.B / BRK-B /
             RDS.A bypass the FMP search deduper (which silently drops
             same-name cross-listings) and use the quote roundtrip to decide
  · step 2   candidate generation via `data_tools.search.search_stocks`
             (SYNC -> `asyncio.to_thread`)
  · step 3   local re-rank against the original token
  · step 4   confidence / status policy (ok / needs_review / unresolved)
  · step 4a  batch quote roundtrip on ok candidates — any priced-by-FMP
             check; failures degrade ONLY their own row to `no_quote`, never
             group-downgrade everyone (design §3.2 / §7bis.7)
  · step 5   final `_SYMBOL_RE` guard before any EF interpolation

Per-request `SourceContext` caps:
  · fallback search budget ≤ 12 → over-cap rows return `budget_exhausted`
  · `asyncio.Semaphore(5)` for bounded concurrency
  · wall-clock deadline → unresolved-at-deadline tokens return
    `pending_review` and the draft is still returned (UI can keep going)

Two-tier cache:
  · L1 = in-process dict + 60 min TTL (short — only to dedup repeated
    queries within the same process between L2 reads)
  · L2 = `symbol-cache` EF + `symbol_resolution_cache` table; positive 90d /
    negative 14d. Best-effort `cache_put` runs as a fire-and-forget task.
    Cache keys are CROSS-USER-SAFE: ticker-shaped tokens stay literal, free
    text (names, Chinese, mixed) hashed to `h:<32hex>` so the L2 EF's
    SAFE_KEY accepts them and raw user fragments never persist cross-user.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from app.core.logging import get_logger
from app.features.portfolio.models import _SYMBOL_RE
from app.shared.data_tools.search import search_stocks as dt_search_stocks
from app.shared.fmp_service import get_fmp_service

from . import db as hs_db
from .models import SymbolCandidate

logger = get_logger(__name__)

# --------------------------------------------------------------------------- #
# constants
# --------------------------------------------------------------------------- #

_CASH_TOKENS = {
    "$CASH", "CASH", "现金", "USD现金", "美元现金", "USD CASH",
    "CASH & EQUIVALENTS", "CASH AND EQUIVALENTS",
    "BUYING POWER", "MONEY MARKET",
}
_CASH_RE = re.compile(r"^\s*(cash\b|现金|usd[\s_-]?cash)", re.IGNORECASE)

# user-typed explicit class-share ticker form (EC3.a)
_LITERAL_TICKER_RE = re.compile(r"^[A-Z]{1,5}[.\-][A-Z]{1,3}$")

# pseudo exchange suffixes we strip when generating candidate queries
_NON_LISTING_SUFFIXES = ("US",)

_MAJOR_EX = {"NASDAQ", "NYSE", "AMEX", "LSE", "HKSE", "HKG"}

_L1_TTL_SEC = 60 * 60        # 60 min — short-lived, L2 is the long TTL
_POS_TTL_DAYS = 90           # positive cache (design §4.0)
_NEG_TTL_DAYS = 14           # negative cache (design §4.0; shorter)


# --------------------------------------------------------------------------- #
# context + result types
# --------------------------------------------------------------------------- #


@dataclass
class SourceContext:
    """Per-request resolver budget + concurrency + deadline."""
    deadline_ts: float                          # epoch seconds (time.time())
    fallback_budget: int = 12                   # network search budget
    sem: asyncio.Semaphore = field(default_factory=lambda: asyncio.Semaphore(5))


@dataclass
class Resolution:
    """What the resolver returns for one raw input — to be folded into
    `ExtractedRow` by the service layer (which adds quantitative fields)."""
    symbol: Optional[str]
    name: Optional[str] = None
    exchange: Optional[str] = None
    confidence: str = "low"          # high | medium | low
    status: str = "unresolved"       # RowStatus literal
    candidates: List[SymbolCandidate] = field(default_factory=list)
    notices: List[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# L1 cache (process-local; L2 = symbol-cache EF)
# --------------------------------------------------------------------------- #

_L1: Dict[str, Tuple[dict, float]] = {}


def _l1_get(key: str) -> Optional[dict]:
    hit = _L1.get(key)
    if not hit:
        return None
    if hit[1] <= time.time():
        return None
    return hit[0]


def _l1_put(key: str, j: dict) -> None:
    _L1[key] = (j, time.time() + _L1_TTL_SEC)


def _clear_l1_for_tests() -> None:
    _L1.clear()


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def _is_cash(raw: str) -> bool:
    if not raw:
        return False
    norm = raw.strip().upper()
    if norm in _CASH_TOKENS:
        return True
    return bool(_CASH_RE.match(raw))


def _query_norm(raw: str) -> str:
    """Cross-user-safe cache key.

    Ticker-shaped → uppercase literal (matches L2 SAFE_KEY first branch).
    Free text → ``h:<32hex>`` (one-way; matches L2 SAFE_KEY second branch).
    Empty → ``""``.
    """
    if not raw:
        return ""
    s = raw.strip()
    if not s:
        return ""
    up = s.upper()
    if _SYMBOL_RE.match(up):
        return up
    h = hashlib.sha256(s.encode("utf-8")).hexdigest()[:32]
    return f"h:{h}"


def _strip_non_listing_suffix(raw_upper: str) -> Optional[str]:
    """`AAPL.US` → `AAPL`. Real primary-listing suffixes (.HK/.T/.SS…) are
    kept intact so the FMP scorer can still boost them."""
    for suf in _NON_LISTING_SUFFIXES:
        full = "." + suf
        if raw_upper.endswith(full) and len(raw_upper) > len(full):
            return raw_upper[: -len(full)]
    return None


def _to_json(r: Resolution) -> dict:
    return {
        "symbol": r.symbol,
        "name": r.name,
        "exchange": r.exchange,
        "confidence": r.confidence,
        "status": r.status,
        "candidates": [c.model_dump() for c in r.candidates],
    }


def _from_json(j: dict) -> Resolution:
    r = Resolution(symbol=j.get("symbol"))
    r.name = j.get("name")
    r.exchange = j.get("exchange")
    r.confidence = j.get("confidence") or "low"
    r.status = j.get("status") or "unresolved"
    for c in j.get("candidates") or []:
        try:
            r.candidates.append(SymbolCandidate(**c))
        except Exception:  # noqa: BLE001 — corrupt cache row is non-fatal
            continue
    return r


def _top_candidates(scored: List[dict], n: int = 5) -> List[SymbolCandidate]:
    out: List[SymbolCandidate] = []
    for c in scored[:n]:
        sym = (c.get("symbol") or "").upper()
        if not _SYMBOL_RE.match(sym):
            continue
        out.append(SymbolCandidate(
            symbol=sym,
            name=c.get("name") or "",
            exchange=c.get("exchange") or "",
        ))
    return out


def _spawn_l2_write(key: str, j: dict, status: str, ttl_days: int) -> None:
    """Best-effort L2 put — fire-and-forget. Caller must be in a running
    loop for `create_task`; sync contexts skip silently."""
    async def _put() -> None:
        try:
            await hs_db.cache_put(key, j, status, ttl_days)
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("L2 cache_put(%s) failed: %s", key, exc)
    try:
        asyncio.create_task(_put())
    except RuntimeError:
        pass


def _store(key: str, r: Resolution) -> None:
    j = _to_json(r)
    _l1_put(key, j)
    if r.status == "ok":
        _spawn_l2_write(key, j, "ok", _POS_TTL_DAYS)
    elif r.status in {"needs_review", "unresolved"}:
        _spawn_l2_write(key, j, r.status, _NEG_TTL_DAYS)
    # pending_review / budget_exhausted / no_quote are transient → never cache.


# --------------------------------------------------------------------------- #
# public API
# --------------------------------------------------------------------------- #


async def resolve_many(ctx: SourceContext, raws: List[str]) -> List[Resolution]:
    """Resolve a batch of raw inputs. Returns a list aligned 1:1 with
    `raws`. Identical raws are deduped onto a single resolution; one batch
    quote roundtrip at the end downgrades `ok` rows that aren't currently
    priced to `no_quote` (catches §0.5 silent-crippled holdings without
    group-downgrading everyone on a quote-EF blip)."""
    if not raws:
        return []

    keys = [_query_norm(r) for r in raws]
    unique_raws: Dict[str, str] = {}
    for raw, k in zip(raws, keys):
        if k and k not in unique_raws:
            unique_raws[k] = raw

    tasks = [_resolve_one(ctx, raw) for raw in unique_raws.values()]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    resolved: Dict[str, Resolution] = dict(zip(unique_raws.keys(), results))

    # Single FMP batch-quote call for all ok candidates.
    ok_symbols = sorted({
        r.symbol for r in resolved.values()
        if r.status == "ok" and r.symbol and r.symbol != "$CASH"
    })
    if ok_symbols:
        quoted: set = set()
        try:
            quote_resp = await asyncio.to_thread(
                get_fmp_service().get_stock_quotes, ok_symbols, True
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("quote roundtrip failed: %s", exc)
            quote_resp = None
        if quote_resp and quote_resp.get("status") == "success":
            for q in quote_resp.get("quotes") or []:
                sym = (q.get("symbol") or "").upper()
                if sym and q.get("price") is not None:
                    quoted.add(sym)
            for r in resolved.values():
                if r.status == "ok" and r.symbol and r.symbol != "$CASH":
                    if r.symbol.upper() not in quoted:
                        r.status = "no_quote"
                        r.confidence = "medium"
                        r.notices.append("无法获取报价，请确认代码/交易所")
        # If quote_resp is None (FMP/EF transient failure), rows stay `ok`
        # — caller's portfolio enrichment handles individual missing prices.
        # No group-downgrade here (design §3.2 / §7bis.7).

    return [resolved.get(k, Resolution(symbol=None)) for k in keys]


# --------------------------------------------------------------------------- #
# per-token resolution
# --------------------------------------------------------------------------- #


async def _resolve_one(ctx: SourceContext, raw: str) -> Resolution:
    if _is_cash(raw):
        return Resolution(symbol="$CASH", name="Cash", confidence="high", status="ok")

    key = _query_norm(raw)
    if not key:
        return Resolution(symbol=None, status="unresolved")

    # L1
    j = _l1_get(key)
    if j is not None:
        return _from_json(j)

    # L2 (fail-open: any failure returns None → fall through)
    l2_data = await hs_db.cache_get(key)
    if l2_data and l2_data.get("resolved_json"):
        _l1_put(key, l2_data["resolved_json"])
        return _from_json(l2_data["resolved_json"])

    # Deadline guard — past deadline → pending_review (draft still returned)
    if time.time() >= ctx.deadline_ts:
        return Resolution(
            symbol=None, status="pending_review",
            notices=["超出本次解析时间预算，请稍后续修"],
        )

    raw_stripped = raw.strip()
    raw_up = raw_stripped.upper()
    raw_lo = raw_stripped.lower()

    # Step 2a — literal class-share ticker shortcut (EC3.a)
    if _LITERAL_TICKER_RE.match(raw_up):
        probe = await _literal_ticker_probe(ctx, raw_up)
        if probe is not None and probe.status == "ok":
            _store(key, probe)
            return probe
        # else: fall through to normal pipeline

    # Step 2 — candidate generation (network budget guarded)
    if ctx.fallback_budget <= 0:
        return Resolution(
            symbol=None, status="budget_exhausted",
            notices=["代码过多未自动匹配，请手动确认余下"],
        )
    ctx.fallback_budget -= 1

    queries: List[str] = [raw_stripped]
    bare = _strip_non_listing_suffix(raw_up)
    if bare and bare not in queries:
        queries.append(bare)

    seen: set = set()
    candidates: List[dict] = []
    for q in queries:
        if not q:
            continue
        try:
            async with ctx.sem:
                resp = await asyncio.to_thread(dt_search_stocks, q, 8)
        except Exception as exc:  # noqa: BLE001
            logger.warning("dt_search_stocks(%s) failed: %s", q, exc)
            continue
        for c in (resp or {}).get("stocks") or []:
            sym = (c.get("symbol") or "").upper()
            if not sym or sym in seen:
                continue
            seen.add(sym)
            candidates.append(c)
        if time.time() >= ctx.deadline_ts:
            break

    if not candidates:
        neg = Resolution(symbol=None, status="unresolved")
        _store(key, neg)
        return neg

    def _score(c: dict) -> float:
        s = 0.0
        sym = (c.get("symbol") or "").upper()
        name = (c.get("name") or "").lower()
        ex = (c.get("exchange") or "").upper()
        if sym == raw_up:                              s += 0.55
        if name == raw_lo:                             s += 0.45
        if sym.startswith(raw_up) and sym != raw_up:   s += 0.25
        if ex in _MAJOR_EX:                            s += 0.10
        return s

    scored = sorted(candidates, key=_score, reverse=True)
    top = scored[0]
    top_score = _score(top)
    runner = _score(scored[1]) if len(scored) > 1 else 0.0
    gap = top_score - runner

    sym = (top.get("symbol") or "").upper()
    name = top.get("name") or None
    ex = top.get("exchange") or None

    # Step 5 — final `_SYMBOL_RE` guard
    if not _SYMBOL_RE.match(sym or ""):
        r = Resolution(
            symbol=None, status="needs_review",
            candidates=_top_candidates(scored),
            notices=["代码格式无效，请手动选择"],
        )
        _store(key, r)
        return r

    # Scoring band: exact symbol = +0.55, exact name = +0.45, prefix only =
    # +0.25, major exchange = +0.10. The strongest realistic signal is an
    # exact symbol match on a major exchange (= 0.55+0.10 = 0.65) — so the
    # `ok` floor is 0.55 (any exact match) and we additionally require the
    # gap-to-runner to be ≥ 0.25 to rule out same-name class-share / ADR
    # ambiguity (BRK.A vs BRK.B etc — those go to needs_review with
    # candidates so the user picks).
    if top_score >= 0.55 and gap >= 0.25:
        r = Resolution(symbol=sym, name=name, exchange=ex,
                       confidence="high", status="ok")
    elif top_score >= 0.30:
        r = Resolution(symbol=sym, name=name, exchange=ex,
                       confidence="medium", status="needs_review",
                       candidates=_top_candidates(scored))
    else:
        r = Resolution(symbol=sym, name=name, exchange=ex,
                       confidence="low", status="needs_review",
                       candidates=_top_candidates(scored))

    _store(key, r)
    return r


async def _literal_ticker_probe(ctx: SourceContext, token: str) -> Optional[Resolution]:
    """EC3.a: probe ``{token, token with .↔- swapped}`` via batch quote.
    The variant FMP actually prices wins (the user's original form breaks
    ties so we don't normalize away their explicit choice). Bypasses the
    FMP search deduper that silently drops same-name cross-listings
    (designs §0.3 / §2bis.B.c)."""
    variants = {token}
    if "." in token:
        variants.add(token.replace(".", "-"))
    if "-" in token:
        variants.add(token.replace("-", "."))
    variants_list = sorted(variants)
    try:
        async with ctx.sem:
            quote_resp = await asyncio.to_thread(
                get_fmp_service().get_stock_quotes, variants_list, True
            )
    except Exception:  # noqa: BLE001 — probe is best-effort
        return None
    if not isinstance(quote_resp, dict):
        return None
    by_sym: Dict[str, dict] = {}
    for q in quote_resp.get("quotes") or []:
        sym = (q.get("symbol") or "").upper()
        if sym and q.get("price") is not None:
            by_sym[sym] = q
    if not by_sym:
        return None
    pick = token if token in by_sym else next(
        (v for v in variants_list if v in by_sym), None)
    if not pick or not _SYMBOL_RE.match(pick):
        return None
    q = by_sym[pick]
    return Resolution(
        symbol=pick,
        name=q.get("name") or None,
        exchange=q.get("exchange") or None,
        confidence="high",
        status="ok",
    )

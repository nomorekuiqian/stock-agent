"""holdings_sync service — HoldingsSource protocol + reconcile_and_upsert.

reconcile_and_upsert is the ONLY writer; it forwards quant+source+
external_account_id (never P1) to portfolio.db.reconcile_portfolio. The EF
COALESCEs P1 from the existing row — single source of truth.
"""

from typing import Dict, List, Optional, Protocol, Tuple

from pydantic import BaseModel

from app.core.logging import get_logger
from app.features.holdings_sync import db as hs_db
from app.features.holdings_sync.models import (
    CommitResponse,
    ExtractedRow,
    NormalizedHolding,
    SourceLiteral,
)
from app.features.portfolio.models import _SYMBOL_RE, HoldingInput, PortfolioListResponse
from app.features.portfolio.service import compute_effective_weights

logger = get_logger(__name__)

_P1_FIELDS = ("thesis", "target", "stop_loss", "conviction")


# ---------------------------------------------------------------------------
# Source adapter protocol (adapters implemented in M2/M3/M4)
# ---------------------------------------------------------------------------


class SourceContext(BaseModel):
    user_id: str
    text: Optional[str] = None
    file_bytes: Optional[bytes] = None
    file_mime: Optional[str] = None
    mapping: Optional[dict] = None


class HoldingsSource(Protocol):
    source_name: SourceLiteral
    uses_llm: bool

    async def fetch(self, ctx: SourceContext) -> List[ExtractedRow]:
        ...


# ---------------------------------------------------------------------------
# dedupe + validate (design §3.4 python side, §7bis.4 multi-account merge)
# ---------------------------------------------------------------------------


def _sum(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None and b is None:
        return None
    return (a or 0.0) + (b or 0.0)


def dedupe_and_validate(
    rows: List[NormalizedHolding],
) -> Tuple[List[NormalizedHolding], Dict[str, List[str]]]:
    """Normalize + validate symbols; MERGE same-symbol rows (sum shares/cost,
    share-weighted entry_price) instead of silent last-write-wins (§7bis.4).

    Raises ValueError on a symbol that fails _SYMBOL_RE (router -> 400); the
    resolver guarantees valid symbols upstream, this is the last guard before
    the symbol is interpolated into the reconcile EF not.in(...).
    """
    merged: Dict[str, NormalizedHolding] = {}
    seen_count: Dict[str, int] = {}
    for r in rows:
        sym = (r.symbol or "").strip().upper()
        if not _SYMBOL_RE.match(sym):
            raise ValueError(f"invalid symbol: {r.symbol!r}")
        cur = merged.get(sym)
        seen_count[sym] = seen_count.get(sym, 0) + 1
        if cur is None:
            merged[sym] = NormalizedHolding(
                symbol=sym,
                shares=r.shares,
                cost_basis=r.cost_basis,
                entry_price=r.entry_price,
                weight_pct=r.weight_pct,
                external_account_id=r.external_account_id,
            )
            continue
        # merge (likely multi-account same symbol)
        new_shares = _sum(cur.shares, r.shares)
        new_cost = _sum(cur.cost_basis, r.cost_basis)
        # share-weighted entry price when derivable, else keep first non-null
        if cur.entry_price is not None and r.entry_price is not None \
                and cur.shares and r.shares:
            tot = (cur.shares or 0) + (r.shares or 0)
            new_entry = (cur.entry_price * cur.shares + r.entry_price * r.shares) / tot if tot else cur.entry_price
        else:
            new_entry = cur.entry_price if cur.entry_price is not None else r.entry_price
        merged[sym] = NormalizedHolding(
            symbol=sym,
            shares=new_shares,
            cost_basis=new_cost,
            entry_price=new_entry,
            weight_pct=_sum(cur.weight_pct, r.weight_pct),
            external_account_id=cur.external_account_id or r.external_account_id,
        )

    notices: Dict[str, List[str]] = {}
    for sym, n in seen_count.items():
        if n > 1:
            notices[sym] = [f"同代码出现 {n} 次，已合并数量（可能跨账户）"]
            logger.info("holdings_sync dedupe merged symbol=%s count=%s", sym, n)
    return list(merged.values()), notices


def _to_holding_input(h: NormalizedHolding) -> HoldingInput:
    """Bridge to portfolio HoldingInput. P1 left None — never sourced from
    import; the reconcile EF preserves existing P1 via COALESCE."""
    return HoldingInput(
        symbol=h.symbol,
        shares=h.shares,
        cost_basis=h.cost_basis,
        entry_price=h.entry_price,
        weight_pct=h.weight_pct,
        external_account_id=h.external_account_id,
    )


async def reconcile_and_upsert(
    user_id: str,
    source: SourceLiteral,
    rows: List[NormalizedHolding],
    *,
    clear_source: bool = False,
) -> CommitResponse:
    """Replace-by-source commit. `rows` MUST be the complete target set for
    `source` (caller/FE responsibility); empty rows only with clear_source."""
    clean, _notices = dedupe_and_validate(rows)
    fresh = await hs_db.reconcile_portfolio(
        user_id,
        source,
        [_to_holding_input(h) for h in clean],
        clear_source=clear_source,
    )
    preserved_p1 = sum(
        1 for row in fresh if any(getattr(row, f, None) is not None for f in _P1_FIELDS)
    )
    holdings = compute_effective_weights(fresh)
    portfolio = PortfolioListResponse(holdings=holdings, total_weight_pct=100.0)
    return CommitResponse(
        written=len(clean),
        preserved_p1=preserved_p1,
        portfolio=portfolio,
    )

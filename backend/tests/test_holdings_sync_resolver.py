"""holdings_sync resolver — core correctness (design §2 + §2bis).

Mocks `data_tools.search.search_stocks` (FMP) and `get_fmp_service` (quotes)
so tests are pure-Python (no network). The resolver must:
  ① short-circuit cash without any FMP call,
  ② mark high-confidence ok / needs_review / unresolved per the scoring policy,
  ③ literal class-share ticker (BRK.B / BRK-B) takes the quote-roundtrip
     shortcut (bypasses FMP's same-name dedup),
  ④ token-dedupe identical raws,
  ⑤ honour the per-request fallback budget,
  ⑥ honour the deadline (pending_review for stragglers, draft still returned),
  ⑦ batch-quote roundtrip downgrades no-price rows to `no_quote` but **never
     group-downgrades** everyone if the quote call itself fails (§7bis.7),
  ⑧ L1 cache hits on second resolve of the same token.
"""

import time
from typing import Any, Dict, List

import pytest

from app.features.holdings_sync import resolver
from app.features.holdings_sync.resolver import (
    Resolution,
    SourceContext,
    _clear_l1_for_tests,
    resolve_many,
)


# --------------------------------------------------------------------------- #
# fixtures
# --------------------------------------------------------------------------- #


@pytest.fixture(autouse=True)
def _l1_clean():
    _clear_l1_for_tests()
    yield
    _clear_l1_for_tests()


@pytest.fixture(autouse=True)
def _l2_miss(monkeypatch):
    """Default to L2 cache miss (resolver still works without L2)."""
    async def _miss(_key):
        return None
    async def _put(*_a, **_kw):
        return True
    monkeypatch.setattr(resolver.hs_db, "cache_get", _miss)
    monkeypatch.setattr(resolver.hs_db, "cache_put", _put)


def _ctx(deadline_offset: float = 60.0, budget: int = 12) -> SourceContext:
    return SourceContext(
        deadline_ts=time.time() + deadline_offset,
        fallback_budget=budget,
    )


class _SearchSpy:
    """Records each search call; returns scripted responses."""
    def __init__(self):
        self.calls: List[str] = []
        self.scripted: Dict[str, dict] = {}

    def set(self, query: str, stocks: list):
        self.scripted[query.upper()] = {"status": "success", "stocks": stocks}

    def __call__(self, query: str, limit: int = 8) -> dict:
        self.calls.append(query.upper())
        return self.scripted.get(query.upper(),
                                 {"status": "success", "stocks": []})


class _FMPSpy:
    """Records each batch-quote call; returns scripted prices."""
    def __init__(self):
        self.calls: List[List[str]] = []
        self.priced: Dict[str, dict] = {}
        self.raise_on: int = -1

    def set_priced(self, symbol: str, name: str = "", exchange: str = "", price: float = 1.0):
        self.priced[symbol.upper()] = {
            "symbol": symbol.upper(), "name": name,
            "exchange": exchange, "price": price,
        }

    def get_stock_quotes(self, symbols: list, _use_cache: bool = True) -> dict:
        self.calls.append([s.upper() for s in symbols])
        if self.raise_on == len(self.calls) - 1:
            raise RuntimeError("quote backend down")
        out = []
        for s in symbols:
            row = self.priced.get(s.upper())
            if row:
                out.append(row)
        return {"status": "success", "quotes": out}


@pytest.fixture
def search_spy(monkeypatch):
    spy = _SearchSpy()
    monkeypatch.setattr(resolver, "dt_search_stocks", spy)
    return spy


@pytest.fixture
def fmp_spy(monkeypatch):
    spy = _FMPSpy()
    monkeypatch.setattr(resolver, "get_fmp_service", lambda: spy)
    return spy


# --------------------------------------------------------------------------- #
# ① cash short-circuit (no FMP)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
@pytest.mark.parametrize("raw", ["$CASH", "CASH", "Cash", "现金", "USD现金",
                                 "Cash & Equivalents", "Buying Power"])
async def test_cash_short_circuit_never_hits_fmp(raw, search_spy, fmp_spy):
    res = await resolve_many(_ctx(), [raw])
    assert res[0].symbol == "$CASH"
    assert res[0].status == "ok"
    assert res[0].confidence == "high"
    # no FMP traffic
    assert search_spy.calls == []
    assert fmp_spy.calls == []


# --------------------------------------------------------------------------- #
# ② ok / needs_review / unresolved (with quote roundtrip)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_clean_ticker_resolves_ok(search_spy, fmp_spy):
    search_spy.set("AAPL", [
        {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ"},
        {"symbol": "AAPLZ", "name": "Apple Hospitality", "exchange": "NYSE"},
    ])
    fmp_spy.set_priced("AAPL", "Apple Inc.", "NASDAQ", 200.0)
    res = await resolve_many(_ctx(), ["AAPL"])
    assert res[0].symbol == "AAPL"
    assert res[0].status == "ok"
    assert res[0].confidence == "high"


@pytest.mark.asyncio
async def test_unresolved_when_no_candidates(search_spy, fmp_spy):
    # search returns nothing for the garbage token
    res = await resolve_many(_ctx(), ["ZZQXXX"])
    assert res[0].symbol is None
    assert res[0].status == "unresolved"


@pytest.mark.asyncio
async def test_no_quote_downgrades_individual_row(search_spy, fmp_spy):
    """High-confidence search match BUT no batch quote available → just
    that row goes no_quote (others stay ok). Never group-downgrade."""
    search_spy.set("AAPL", [{"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ"}])
    search_spy.set("MSFT", [{"symbol": "MSFT", "name": "Microsoft", "exchange": "NASDAQ"}])
    fmp_spy.set_priced("MSFT", "Microsoft", "NASDAQ", 400.0)
    # AAPL NOT priced — should be marked no_quote; MSFT stays ok
    res = await resolve_many(_ctx(), ["AAPL", "MSFT"])
    by_raw = {r.symbol: r for r in res}
    assert by_raw["AAPL"].status == "no_quote"
    assert by_raw["MSFT"].status == "ok"


@pytest.mark.asyncio
async def test_quote_call_failure_does_not_group_downgrade(search_spy, fmp_spy):
    """Critical: if the quote endpoint itself raises, the rows stay `ok`
    — we do NOT mark every row no_quote on a transient quote-EF failure."""
    search_spy.set("AAPL", [{"symbol": "AAPL", "name": "Apple", "exchange": "NASDAQ"}])
    search_spy.set("MSFT", [{"symbol": "MSFT", "name": "Microsoft", "exchange": "NASDAQ"}])
    fmp_spy.raise_on = 0  # the batch quote call raises
    res = await resolve_many(_ctx(), ["AAPL", "MSFT"])
    assert {r.status for r in res} == {"ok"}


# --------------------------------------------------------------------------- #
# ③ literal class-share ticker — EC3.a shortcut via quote roundtrip
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_literal_brkb_priced_directly(search_spy, fmp_spy):
    """BRK.B is priced — shortcut returns ok WITHOUT relying on FMP search
    (which would silently drop class shares via same-name dedup)."""
    fmp_spy.set_priced("BRK.B", "Berkshire Hathaway B", "NYSE", 410.0)
    res = await resolve_many(_ctx(), ["BRK.B"])
    assert res[0].symbol == "BRK.B"
    assert res[0].status == "ok"
    assert res[0].confidence == "high"
    # search may still run for the post-batch quote on the ok set; we only
    # require that the resolution didn't depend on search returning BRK.B
    # (which it doesn't in our spy)


@pytest.mark.asyncio
async def test_literal_brkdashb_variant_probe(search_spy, fmp_spy):
    """User typed BRK-B → variant probe tries BRK.B → that variant prices →
    resolution returns the priced variant."""
    # Only the dotted form prices
    fmp_spy.set_priced("BRK.B", "Berkshire Hathaway B", "NYSE", 410.0)
    res = await resolve_many(_ctx(), ["BRK-B"])
    assert res[0].symbol == "BRK.B"
    assert res[0].status == "ok"


# --------------------------------------------------------------------------- #
# ④ token dedup — identical raws share one resolution
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_identical_raws_deduped(search_spy, fmp_spy):
    search_spy.set("AAPL", [{"symbol": "AAPL", "name": "Apple", "exchange": "NASDAQ"}])
    fmp_spy.set_priced("AAPL", "Apple", "NASDAQ", 200.0)
    res = await resolve_many(_ctx(), ["AAPL", "AAPL", "aapl"])
    # all three project to the same resolution
    assert all(r.symbol == "AAPL" for r in res)
    # Only ONE search call for the unique key
    assert search_spy.calls.count("AAPL") == 1


# --------------------------------------------------------------------------- #
# ⑤ fallback budget — over-cap → budget_exhausted (no further FMP search)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_budget_exhausted_blocks_further_search(search_spy, fmp_spy):
    search_spy.set("AAPL", [{"symbol": "AAPL", "name": "Apple", "exchange": "NASDAQ"}])
    ctx = _ctx(budget=1)
    res = await resolve_many(ctx, ["AAPL", "MSFT", "GOOGL"])
    # AAPL consumes the budget; MSFT/GOOGL get budget_exhausted with no symbol
    statuses = sorted(r.status for r in res)
    assert statuses.count("budget_exhausted") == 2
    # only 1 search call (AAPL); MSFT/GOOGL never reach dt_search_stocks
    assert "MSFT" not in search_spy.calls
    assert "GOOGL" not in search_spy.calls


# --------------------------------------------------------------------------- #
# ⑥ deadline — past deadline → pending_review (draft still returned)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_past_deadline_returns_pending_review(search_spy, fmp_spy):
    # Deadline already passed at ctx creation
    ctx = SourceContext(deadline_ts=time.time() - 1.0, fallback_budget=12)
    res = await resolve_many(ctx, ["AAPL"])
    assert res[0].status == "pending_review"
    assert res[0].symbol is None
    # nothing was searched
    assert search_spy.calls == []


# --------------------------------------------------------------------------- #
# ⑦ L1 cache hit on repeated resolve (same process, second call)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_l1_cache_hit_second_call(search_spy, fmp_spy):
    search_spy.set("AAPL", [{"symbol": "AAPL", "name": "Apple", "exchange": "NASDAQ"}])
    fmp_spy.set_priced("AAPL", "Apple", "NASDAQ", 200.0)
    await resolve_many(_ctx(), ["AAPL"])
    first_count = len(search_spy.calls)
    # second resolve_many call — same key → must hit L1, no second search
    await resolve_many(_ctx(), ["AAPL"])
    assert len(search_spy.calls) == first_count


# --------------------------------------------------------------------------- #
# ⑧ symbol-RE guard rejects malformed search hits
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_malformed_top_symbol_falls_to_needs_review(search_spy, fmp_spy):
    # Top scored candidate has a forbidden character (space) — must be
    # rejected by _SYMBOL_RE final guard and the row marked needs_review.
    search_spy.set("FOO BAR", [
        {"symbol": "FOO BAR", "name": "Foo Bar Holdings", "exchange": "NYSE"},
    ])
    res = await resolve_many(_ctx(), ["FOO BAR"])
    # The candidate's invalid symbol must NEVER be returned as the resolved
    # symbol (would break _SYMBOL_RE → EF not.in() interpolation safety).
    assert res[0].symbol is None
    assert res[0].status == "needs_review"

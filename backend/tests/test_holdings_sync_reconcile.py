"""Track M — reconcile correctness (most critical M1 gate).

Design: docs/features/holdings-sync-track-m/tech-design.md §3.4 / §7bis
        / §8 (Codex [high] commit complete-set contract).

Boundary note: the source-scoped DELETE (replace-by-source) lives in the
`portfolio.js` Edge Function (JS) and is exercised by the T1.2 deploy smoke +
integration, not unit-testable in Python. Here we lock the *Python-side*
contract that feeds it:
  ① NormalizedHolding structurally cannot carry P1.
  ② reconcile_and_upsert forwards the EXACT deduped COMPLETE set it was given
     (never a delta) + clear_source — the precondition that makes the EF's
     NOT IN(keep) safe.
  ③ db.reconcile_portfolio never serializes P1 into the EF payload.
  ④ symbols are normalized + _SYMBOL_RE-guarded before the EF.
"""

import pytest

from app.features.holdings_sync import db as hs_db
from app.features.holdings_sync import service as hs_service
from app.features.holdings_sync.models import NormalizedHolding
from app.features.portfolio import db as portfolio_db
from app.features.portfolio.models import HoldingInput, HoldingRow

P1 = {"thesis", "target", "stop_loss", "conviction"}


# --------------------------------------------------------------------------- #
# ① structural: P1 cannot be carried by the source model
# --------------------------------------------------------------------------- #


def test_normalized_holding_has_no_p1_fields():
    fields = set(NormalizedHolding.model_fields.keys())
    assert not (P1 & fields), f"P1 leaked into NormalizedHolding: {P1 & fields}"


# --------------------------------------------------------------------------- #
# ② service forwards the complete deduped set (+ clear_source), never P1
# --------------------------------------------------------------------------- #


@pytest.fixture
def captured(monkeypatch):
    calls = {}

    async def fake_reconcile(user_id, source, rows, *, clear_source=False):
        calls["user_id"] = user_id
        calls["source"] = source
        calls["rows"] = rows
        calls["clear_source"] = clear_source
        # echo back as persisted HoldingRow(s); one carries pre-existing P1
        return [
            HoldingRow(user_id=user_id, symbol=r.symbol, shares=r.shares,
                       cost_basis=r.cost_basis, entry_price=r.entry_price,
                       weight_pct=r.weight_pct, source=source,
                       thesis=("keep" if r.symbol == "AAPL" else None))
            for r in rows
        ]

    monkeypatch.setattr(hs_db, "reconcile_portfolio", fake_reconcile)
    return calls


@pytest.mark.asyncio
async def test_forwards_complete_set_without_p1(captured):
    rows = [
        NormalizedHolding(symbol="AAPL", shares=10),
        NormalizedHolding(symbol="nvda", shares=5, cost_basis=1000),
    ]
    resp = await hs_service.reconcile_and_upsert("u1", "csv", rows)

    assert captured["user_id"] == "u1"
    assert captured["source"] == "csv"
    assert captured["clear_source"] is False
    fwd = captured["rows"]
    assert [r.symbol for r in fwd] == ["AAPL", "NVDA"]  # normalized, complete set
    for hi in fwd:
        assert isinstance(hi, HoldingInput)
        for f in P1:
            assert getattr(hi, f) is None, f"P1 {f} must never be forwarded"
    assert resp.written == 2


@pytest.mark.asyncio
async def test_same_symbol_rows_merged_not_last_write_wins(captured):
    # §7bis.4: multi-account same symbol -> sum, NOT silent drop
    rows = [
        NormalizedHolding(symbol="AAPL", shares=10, cost_basis=1500),
        NormalizedHolding(symbol="AAPL", shares=5, cost_basis=800),
    ]
    await hs_service.reconcile_and_upsert("u1", "csv", rows)
    fwd = captured["rows"]
    assert len(fwd) == 1
    assert fwd[0].symbol == "AAPL"
    assert fwd[0].shares == 15
    assert fwd[0].cost_basis == 2300


@pytest.mark.asyncio
async def test_clear_source_passthrough(captured):
    await hs_service.reconcile_and_upsert("u1", "csv", [], clear_source=True)
    assert captured["clear_source"] is True
    assert captured["rows"] == []


@pytest.mark.asyncio
async def test_invalid_symbol_raises_valueerror(captured):
    with pytest.raises(ValueError):
        await hs_service.reconcile_and_upsert(
            "u1", "csv", [NormalizedHolding(symbol="AA PL", shares=1)]
        )


@pytest.mark.asyncio
async def test_preserved_p1_counted_from_fresh(captured):
    resp = await hs_service.reconcile_and_upsert(
        "u1", "csv",
        [NormalizedHolding(symbol="AAPL", shares=1), NormalizedHolding(symbol="MSFT", shares=2)],
    )
    # fake_reconcile attaches thesis only to AAPL
    assert resp.preserved_p1 == 1


@pytest.mark.asyncio
async def test_complete_set_contract_two_commits(captured):
    """Codex [high]: partial-commit then continue must send the COMPLETE set
    (already-persisted ∪ newly-accepted), never just the new delta. We assert
    the service forwards exactly what it is given as the full set both times;
    sending only the delta (the bug) would forward a 1-row set here."""
    first = [NormalizedHolding(symbol="AAPL", shares=1),
             NormalizedHolding(symbol="MSFT", shares=2)]
    await hs_service.reconcile_and_upsert("u1", "csv", first)
    assert {r.symbol for r in captured["rows"]} == {"AAPL", "MSFT"}

    # continue: FE rebuilds complete set = persisted ∪ new (NOT just NVDA)
    full = first + [NormalizedHolding(symbol="NVDA", shares=3)]
    await hs_service.reconcile_and_upsert("u1", "csv", full)
    assert {r.symbol for r in captured["rows"]} == {"AAPL", "MSFT", "NVDA"}, \
        "续修必须发完整集；只发增量会被 replace-by-source 反删先存行"


# --------------------------------------------------------------------------- #
# ③ db layer: P1 never serialized into the EF payload; clear_source passed
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_reconcile_portfolio_payload_omits_p1(monkeypatch):
    seen = {}

    async def fake_call(action, *, method="POST", params=None, body=None):
        seen["action"] = action
        seen["body"] = body
        return {"success": True, "data": []}

    monkeypatch.setattr(portfolio_db, "_call", fake_call)

    # HoldingInput deliberately carries P1 — db layer must NOT forward it
    rows = [HoldingInput(symbol="AAPL", shares=10, thesis="secret",
                         target=200, stop_loss=150, conviction=5,
                         external_account_id="acct-1")]
    await portfolio_db.reconcile_portfolio("u1", "csv", rows, clear_source=True)

    assert seen["action"] == "reconcile"
    body = seen["body"]
    assert body["user_id"] == "u1"
    assert body["source"] == "csv"
    assert body["clear_source"] is True
    assert len(body["rows"]) == 1
    payload_row = body["rows"][0]
    for f in P1:
        assert f not in payload_row, f"P1 {f} must never reach the EF payload"
    assert payload_row["symbol"] == "AAPL"
    assert payload_row["shares"] == 10
    assert payload_row["external_account_id"] == "acct-1"

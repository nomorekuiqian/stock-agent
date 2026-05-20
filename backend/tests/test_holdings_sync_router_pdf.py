"""PDF extract path — design §1.1(e) / §5 (M4).

Locks the cheap-first decision tree:
  ① Encrypted PDFs → 400 (no quota burn).
  ② Bad bytes → 400 (no quota burn).
  ③ Digital PDF (≥200 nonws/page) → text-LLM path, consumes 1 quota.
  ④ Sparse-text PDF (scanned) → vision fallback, renders ≤4 pages, consumes
     `amount=pages_rendered` quota atomically (whole-or-nothing).
  ⑤ Vision pages processed concurrently (4 pages ≤ one LLM-timeout
     wall-clock, not four).
  ⑥ All PDF guards run BEFORE quota consumption (Codex M2 [high] #1).
"""

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.features.holdings_sync import (
    agent as hs_agent,
    pdf_utils as hs_pdf,
    quota as hs_quota,
    resolver as hs_resolver,
    router as hs_router,
)
from app.features.holdings_sync.models import RawExtractedHolding, VisionExtractionOutput
from app.main import app


@pytest.fixture
def client_authed():
    async def _user():
        return "u-test"
    app.dependency_overrides[deps.verify_user_token] = _user
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _flag_on(*flags):
    async def _f(_uid):
        return set(flags)
    return _f


def _ent(allowed):
    async def _e(_uid, _feat):
        return allowed
    return _e


# Stage 1 default doesn't include pdf; widen for this test module since the
# stage gate is not what we're testing here (gating is covered by
# test_holdings_sync_router_guards.py — we only need pdf to reach the
# extract pipeline).
@pytest.fixture(autouse=True)
def _stage_widened(monkeypatch):
    monkeypatch.setattr(hs_router, "STAGE_ENABLED_SOURCES",
                        {"screenshot", "paste", "csv", "pdf"})


_PDF = ("x.pdf", b"%PDF-1.4\n...stub...", "application/pdf")


# --------------------------------------------------------------------------- #
# ① encrypted PDF → 400 + zero quota
# --------------------------------------------------------------------------- #


def test_encrypted_pdf_rejected_no_quota(client_authed, monkeypatch):
    quota_spy = AsyncMock()
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", quota_spy)
    # Pretend the probe says "encrypted" without actually parsing a PDF.
    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(
                            True, 3, "unsupported",
                            error="加密 PDF 不支持，请先解锁或改用截图"))

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    assert r.status_code == 400
    assert "加密" in r.json().get("detail", "")
    quota_spy.assert_not_called()


# --------------------------------------------------------------------------- #
# ② corrupt PDF → 400 + zero quota
# --------------------------------------------------------------------------- #


def test_corrupt_pdf_400_no_quota(client_authed, monkeypatch):
    quota_spy = AsyncMock()
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", quota_spy)
    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(
                            False, 0, "unsupported",
                            error="PDF 解析失败，请确认文件可正常打开"))

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    assert r.status_code == 400
    quota_spy.assert_not_called()


# --------------------------------------------------------------------------- #
# ③ digital PDF → text path consumes amount=1
# --------------------------------------------------------------------------- #


def test_digital_pdf_text_path_consumes_one(client_authed, monkeypatch):
    quota_calls = []
    async def fake_consume(uid, mode, amount=1):
        quota_calls.append((mode, amount))
        return amount
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", fake_consume)
    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(
                            False, 3, "text",
                            text="AAPL 10 shares\nMSFT 5 shares\n现金 1234"))

    extract_spy = []
    class _Out:
        looks_like_holdings = True
        holdings = [
            type("H", (), dict(symbol_or_name="AAPL", shares=10,
                               cost_basis=None, entry_price=None, weight_pct=None))(),
            type("H", (), dict(symbol_or_name="MSFT", shares=5,
                               cost_basis=None, entry_price=None, weight_pct=None))(),
        ]
    def fake_extract_text(text):
        extract_spy.append(len(text))
        return _Out()
    monkeypatch.setattr(hs_agent, "extract_from_text", fake_extract_text)

    async def fake_resolve(_ctx, raws):
        return [hs_resolver.Resolution(symbol=s, status="ok",
                                       confidence="high") for s in raws]
    monkeypatch.setattr(hs_resolver, "resolve_many", fake_resolve)

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "pdf"
    assert len(body["rows"]) == 2
    assert quota_calls == [("pdf-text", 1)]
    # extract_from_text was called once with the joined PDF text.
    assert len(extract_spy) == 1


# --------------------------------------------------------------------------- #
# ④ scanned PDF → vision fallback consumes amount=pages_rendered
# --------------------------------------------------------------------------- #


def test_scanned_pdf_vision_path_consumes_amount(client_authed, monkeypatch):
    quota_calls = []
    async def fake_consume(uid, mode, amount=1):
        quota_calls.append((mode, amount))
        return amount
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", fake_consume)

    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(False, 4, "vision"))
    # 3 pages render successfully
    monkeypatch.setattr(hs_pdf, "render_pages_for_vision",
                        lambda raw, max_pages=4: [b"\x89PNG\x00\x01", b"\x89PNG\x00\x02", b"\x89PNG\x00\x03"])

    img_calls = []
    syms = iter(["AAPL", "MSFT", "NVDA"])
    def fake_extract_image(img, mime):
        img_calls.append((len(img), mime))
        return VisionExtractionOutput(
            looks_like_holdings=True,
            holdings=[RawExtractedHolding(symbol_or_name=next(syms), shares=1)],
        )
    monkeypatch.setattr(hs_agent, "extract_from_image", fake_extract_image)

    async def fake_resolve(_ctx, raws):
        return [hs_resolver.Resolution(symbol=s, status="ok",
                                       confidence="high") for s in raws]
    monkeypatch.setattr(hs_resolver, "resolve_many", fake_resolve)

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "pdf"
    assert {row["symbol"] for row in body["rows"]} == {"AAPL", "MSFT", "NVDA"}
    # Whole-or-nothing quota: ONE call, amount=3 (pages rendered).
    assert quota_calls == [("pdf-vision", 3)]
    assert len(img_calls) == 3
    # All pages MIME-coded as png by the helper
    assert {mime for _len, mime in img_calls} == {"image/png"}


# --------------------------------------------------------------------------- #
# ⑤ render failure (empty list) → 400 + zero quota burn
# --------------------------------------------------------------------------- #


def test_vision_render_zero_pages_400_no_quota(client_authed, monkeypatch):
    quota_spy = AsyncMock()
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", quota_spy)
    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(False, 2, "vision"))
    monkeypatch.setattr(hs_pdf, "render_pages_for_vision",
                        lambda raw, max_pages=4: [])

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    assert r.status_code == 400
    quota_spy.assert_not_called()


# --------------------------------------------------------------------------- #
# ⑥ vision pages run CONCURRENTLY (not serially)
# --------------------------------------------------------------------------- #


def test_vision_pages_processed_concurrently(client_authed, monkeypatch):
    """4 pages each "taking" 0.3s in the LLM thread → wall-clock should be
    ~0.3s (parallel via asyncio.gather), not ~1.2s (serial). We allow a
    generous 1.0s upper bound to keep CI happy."""
    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(False, 4, "vision"))
    monkeypatch.setattr(hs_pdf, "render_pages_for_vision",
                        lambda raw, max_pages=4: [b"p1", b"p2", b"p3", b"p4"])

    async def fake_consume(uid, mode, amount=1):
        return amount
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", fake_consume)

    def fake_extract_image(img, mime):
        time.sleep(0.3)   # simulate per-page LLM latency
        return VisionExtractionOutput(looks_like_holdings=True, holdings=[])
    monkeypatch.setattr(hs_agent, "extract_from_image", fake_extract_image)

    t0 = time.time()
    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    # Serial would be ~1.2s; parallel ≤ ~0.5s. Generous 1.0s upper bound.
    assert elapsed < 1.0, f"vision pages appear serial: elapsed={elapsed:.2f}s"


# --------------------------------------------------------------------------- #
# ⑦ partial vision failure → salvage successful pages (Codex M4 [high])
# --------------------------------------------------------------------------- #


def test_vision_partial_failure_salvages_successful_pages(client_authed, monkeypatch):
    """One page raises mid-gather → the OTHER successful pages must still
    reach the user (quota already debited; we refuse to discard their
    spend). Returned draft carries a `dropped_note` warning."""
    quota_calls = []
    async def fake_consume(uid, mode, amount=1):
        quota_calls.append((mode, amount))
        return amount
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", fake_consume)

    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(False, 3, "vision"))
    monkeypatch.setattr(hs_pdf, "render_pages_for_vision",
                        lambda raw, max_pages=4: [b"p1", b"p2", b"p3"])

    seen = {"n": 0}
    def fake_extract_image(img, mime):
        seen["n"] += 1
        # Page 2 (1-indexed) blows up; pages 1 & 3 succeed.
        if seen["n"] == 2:
            raise RuntimeError("flaky vision page")
        return VisionExtractionOutput(
            looks_like_holdings=True,
            holdings=[RawExtractedHolding(symbol_or_name=f"SYM{seen['n']}", shares=1)],
        )
    monkeypatch.setattr(hs_agent, "extract_from_image", fake_extract_image)

    async def fake_resolve(_ctx, raws):
        return [hs_resolver.Resolution(symbol=s, status="ok",
                                       confidence="high") for s in raws]
    monkeypatch.setattr(hs_resolver, "resolve_many", fake_resolve)

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    assert r.status_code == 200, r.text  # NOT 504 — partial salvage
    body = r.json()
    syms = {row["symbol"] for row in body["rows"]}
    # The two successful pages survived; the failed one didn't poison them.
    assert "SYM1" in syms and "SYM3" in syms
    assert "SYM2" not in syms
    # Quota stayed prepaid for ALL rendered pages (whole-or-nothing policy
    # — we never refund the failed page; we just salvage what we can).
    assert quota_calls == [("pdf-vision", 3)]
    # Partial note must surface so the user knows the draft is incomplete.
    assert body.get("dropped_note")
    assert "失败" in body["dropped_note"] or "失败" in (body.get("dropped_note") or "")


# --------------------------------------------------------------------------- #
# ⑧ vision: ALL pages fail (timeout) → still 504 (no draft to salvage)
# --------------------------------------------------------------------------- #


def test_vision_all_pages_timeout_504(client_authed, monkeypatch):
    quota_calls = []
    async def fake_consume(uid, mode, amount=1):
        quota_calls.append((mode, amount))
        return amount
    monkeypatch.setattr(hs_router.hs_quota, "check_and_consume", fake_consume)

    monkeypatch.setattr(hs_pdf, "probe_pdf",
                        lambda raw: hs_pdf.PdfDecodeOutcome(False, 2, "vision"))
    monkeypatch.setattr(hs_pdf, "render_pages_for_vision",
                        lambda raw, max_pages=4: [b"p1", b"p2"])

    # Force per-page LLM call to raise TimeoutError. The router wraps each
    # page in `asyncio.wait_for`, so simulate by raising directly inside the
    # threadpool call (gather will collect it as a TimeoutError exception).
    def fake_extract_image(img, mime):
        raise asyncio.TimeoutError("simulated per-page timeout")
    monkeypatch.setattr(hs_agent, "extract_from_image", fake_extract_image)

    with patch.object(hs_router, "get_user_flags", _flag_on("holdings_sync_import")), \
         patch.object(hs_router, "has_entitlement", _ent(True)):
        r = client_authed.post(
            "/api/holdings-sync/extract",
            data={"mode": "pdf"},
            files={"file": _PDF},
        )
    assert r.status_code == 504
    # Prepaid quota: all pages already debited (whole-or-nothing).
    assert quota_calls == [("pdf-vision", 2)]


# --------------------------------------------------------------------------- #
# ⑨ probe_pdf on a REAL encrypted PDF — no exception escapes (Codex M4 [medium])
# --------------------------------------------------------------------------- #


def test_probe_pdf_real_encrypted_returns_clean_outcome():
    """The router relies on `probe_pdf` never raising so it can issue a
    400 before consuming quota. Earlier code accessed `reader.pages` on
    an encrypted file, which pypdf may refuse — the helper must guard
    that path. Test with a real pypdf-produced encrypted PDF (no stub)."""
    pypdf = pytest.importorskip("pypdf")
    import io as _io
    writer = pypdf.PdfWriter()
    # `PdfWriter.add_blank_page` is the cheapest way to get a valid PDF
    # without bundling a binary fixture.
    writer.add_blank_page(width=72, height=72)
    writer.encrypt(user_password="secret")
    buf = _io.BytesIO()
    writer.write(buf)
    raw = buf.getvalue()

    outcome = hs_pdf.probe_pdf(raw)
    assert outcome.path == "unsupported"
    assert outcome.is_encrypted is True
    assert "加密" in (outcome.error or "")
    # The fix removes `reader.pages` access on the encrypted branch — make
    # sure n_pages_total is 0 (telemetry, not a gate).
    assert outcome.n_pages_total == 0

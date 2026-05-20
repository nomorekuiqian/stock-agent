"""holdings_sync PDF helpers (design §1.1(e) / §5).

Two paths, **cheap-first** (router picks based on text density):

  · digital-PDF text path  → `pypdf` extracts text from up to 8 pages →
    `agent.extract_from_text` (one cheap LLM text call).
  · scanned-PDF vision path → `pypdfium2` renders up to 4 pages to PNG
    bytes → `agent.extract_from_image` per page → results merged.

Hard rules (design §5 / §7bis):
  · Reject encrypted PDFs (no password prompt — UX is "use a screenshot
    or unlock first").
  · Read into `io.BytesIO` only; never persist the raw bytes.
  · Defensive against deeply nested / huge PDFs: cap at the page limits
    we declare (do not iterate every page).
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import List, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

# Page caps + text-density threshold (design §1.1(e) / §5).
TEXT_MAX_PAGES = 8                 # pages of text we ship to the LLM
VISION_MAX_PAGES = 4               # pages we rasterize when the text is sparse
TEXT_DENSITY_PER_PAGE = 200        # avg non-whitespace chars/page above which
                                   # we count the PDF as "digital" — bias
                                   # toward the cheap path.
RENDER_SCALE = 2.0                 # ~144 DPI; balance fidelity vs payload size


@dataclass
class PdfDecodeOutcome:
    """What the router needs to know after a cheap text probe.

    `text` is only populated when the text path is viable. `n_pages_total`
    is the full document page count (for telemetry, not iterated further
    than the caps above)."""
    is_encrypted: bool
    n_pages_total: int
    path: str                       # "text" | "vision" | "unsupported"
    text: Optional[str] = None      # set when path == "text"
    error: Optional[str] = None     # human-readable when path == "unsupported"


def probe_pdf(raw: bytes) -> PdfDecodeOutcome:
    """Cheap cap-first probe.

    Decodes the PDF metadata, refuses encrypted, scans up to
    `TEXT_MAX_PAGES` for text density, and returns either the joined text
    (digital-PDF path) or a `"vision"` signal for the router to follow
    up with `render_pages_for_vision`. NEVER raises on a malformed PDF —
    surfaces the failure via `path="unsupported"` + `error` so the router
    can return a clean 400."""
    try:
        # Import inside the function so a missing optional dep never blocks
        # module import (e.g. tests that don't touch the PDF path).
        from pypdf import PdfReader
    except Exception as exc:  # noqa: BLE001
        return PdfDecodeOutcome(False, 0, "unsupported", error=f"pypdf missing: {exc}")

    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as exc:  # noqa: BLE001 — corrupt PDF / not a PDF
        logger.warning("pdf probe: PdfReader open failed: %s", exc)
        return PdfDecodeOutcome(False, 0, "unsupported",
                                error="PDF 解析失败，请确认文件可正常打开")

    # Encrypted PDFs: do NOT touch `reader.pages` — pypdf may raise on
    # accessing page metadata before decryption (Codex M4 [medium]).
    # We don't try to decrypt (UX is "unlock first or use a screenshot"),
    # so a page count of 0 is fine here — it's telemetry, not a gate.
    if reader.is_encrypted:
        return PdfDecodeOutcome(True, 0, "unsupported",
                                error="加密 PDF 不支持，请先解锁或改用截图")

    # `len(reader.pages)` itself can raise on malformed-but-openable PDFs
    # (e.g. trailer-less files that pypdf accepts but can't enumerate).
    # Wrap so the router still gets a clean 400, not a 500.
    try:
        n_pages = len(reader.pages)
    except Exception as exc:  # noqa: BLE001
        logger.warning("pdf probe: page enumeration failed: %s", exc)
        return PdfDecodeOutcome(False, 0, "unsupported",
                                error="PDF 解析失败，请确认文件可正常打开")
    if n_pages == 0:
        return PdfDecodeOutcome(False, 0, "unsupported", error="PDF 没有可读页")

    # Extract text from up to TEXT_MAX_PAGES; sum non-whitespace chars.
    scan_pages = min(n_pages, TEXT_MAX_PAGES)
    pieces: List[str] = []
    nonws_total = 0
    for i in range(scan_pages):
        try:
            t = reader.pages[i].extract_text() or ""
        except Exception as exc:  # noqa: BLE001 — bad page → skip
            logger.debug("pdf probe: page %d extract_text failed: %s", i, exc)
            t = ""
        pieces.append(t)
        nonws_total += sum(1 for ch in t if not ch.isspace())

    avg_per_page = nonws_total / scan_pages
    if avg_per_page >= TEXT_DENSITY_PER_PAGE:
        # Digital PDF: ship the joined text to the LLM text path.
        joined = "\n\n".join(p for p in pieces if p.strip())
        return PdfDecodeOutcome(False, n_pages, "text", text=joined)

    # Sparse text — likely a scanned brokerage statement. Tell the router
    # to take the vision fallback (rendering happens lazily so an OOM-y
    # huge PDF doesn't blow up just by being probed).
    return PdfDecodeOutcome(False, n_pages, "vision")


def render_pages_for_vision(raw: bytes, *, max_pages: int = VISION_MAX_PAGES) -> List[bytes]:
    """Render the first `max_pages` pages of `raw` to PNG bytes.

    Lazy import so `pypdfium2` only matters on the vision fallback. PDFium
    initializes / closes the document explicitly to avoid leaking handles.
    Returns a list of PNG byte blobs (one per page); empty list on failure
    so the router can degrade to a clean 400 ("无法渲染 PDF").
    """
    try:
        import pypdfium2 as pdfium
    except Exception as exc:  # noqa: BLE001 — optional dep
        logger.warning("pdf render: pypdfium2 missing (%s)", exc)
        return []

    try:
        pdf = pdfium.PdfDocument(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("pdf render: PdfDocument open failed: %s", exc)
        return []

    out: List[bytes] = []
    try:
        n = min(len(pdf), max_pages)
        for i in range(n):
            try:
                page = pdf[i]
                bitmap = page.render(scale=RENDER_SCALE)
                pil = bitmap.to_pil()
                buf = io.BytesIO()
                pil.save(buf, format="PNG")
                out.append(buf.getvalue())
            except Exception as exc:  # noqa: BLE001 — bad page → skip
                logger.warning("pdf render: page %d failed: %s", i, exc)
                continue
    finally:
        try:
            pdf.close()
        except Exception:  # noqa: BLE001
            pass

    return out

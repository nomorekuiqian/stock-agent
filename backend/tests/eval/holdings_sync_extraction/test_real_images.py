"""T2 ship gate — real screenshot extraction eval.

Auto-SKIPS when ``backend/scripts/holdings_sync_poc/samples/real/`` has no
gold pairs (so day-to-day CI passes). When populated, runs the same
precision/recall measurement the PoC ``evaluate.py --dir real`` does, and
asserts the **macro recall ≥ 0.9** ship gate (design §7 / runbook M2).

Drop ``<name>.png`` + ``<name>.gold.json`` pairs into
``samples/real/`` to enable this test — see the README there.

This test calls the real Gemini API (it's the whole point — flash-lite
must hold on real broker screenshots before we open the door). It
therefore requires ``GOOGLE_API_KEY`` and live network; pytest skips
when either is missing. Marked ``slow`` so the default ``pytest`` run
doesn't pick it up unless you opt in (``pytest -m slow``).
"""

import glob
import os

import pytest

POC_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..", "scripts", "holdings_sync_poc",
))
REAL_DIR = os.path.join(POC_DIR, "samples", "real")
RECALL_GATE = 0.90  # design §7 ship gate


def _gold_pairs() -> list[str]:
    if not os.path.isdir(REAL_DIR):
        return []
    out = []
    for gp in glob.glob(os.path.join(REAL_DIR, "*.gold.json")):
        stem = os.path.basename(gp)[:-len(".gold.json")]
        # Companion image must also exist (any common format).
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            if os.path.exists(os.path.join(REAL_DIR, stem + ext)):
                out.append(stem)
                break
    return sorted(out)


pytestmark = pytest.mark.slow  # opt-in: pytest -m slow


def test_real_screenshot_recall_meets_ship_gate():
    pairs = _gold_pairs()
    if not pairs:
        pytest.skip(
            "No real-screenshot fixtures under "
            f"{REAL_DIR} — add pairs to enable the T2 ship gate (see "
            "samples/real/README.md)."
        )
    if not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY not set — cannot exercise live LLM")

    # Lazy import: PoC harness has top-level GenAI imports.
    import sys
    sys.path.insert(0, POC_DIR)
    from evaluate import _score_one  # noqa: E402

    results = []
    for name in pairs:
        results.append(_score_one(name, base=REAL_DIR))

    holdings_rows = [r for r in results
                     if r.get("looks_like_holdings_pred") and "recall" in r]
    assert holdings_rows, (
        "No real samples produced holdings — looks_like_holdings=false on "
        "every input. Check sample quality / instructions.\n"
        + "\n".join(str(r) for r in results)
    )
    macro_recall = sum(r["recall"] for r in holdings_rows) / len(holdings_rows)
    macro_precision = sum(r["precision"] for r in holdings_rows) / len(holdings_rows)
    assert macro_recall >= RECALL_GATE, (
        f"T2 ship gate fails: macro recall {macro_recall:.3f} < {RECALL_GATE}\n"
        f"per-sample: precision={macro_precision:.3f}\n"
        + "\n".join(str(r) for r in results)
    )

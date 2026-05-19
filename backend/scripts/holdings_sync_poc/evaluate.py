"""Run extraction over samples/ and score precision/recall vs gold.

Symbol matching is normalization-light on purpose: the PoC measures the LLM
extraction layer only (design §2 resolver is a separate, mocked-in-tests layer).
We normalize a few obvious cases (cash synonyms -> $CASH, upper, strip) so the
score reflects extraction quality, not resolver work.
"""
from __future__ import annotations

import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import extract_holdings  # noqa: E402

SAMPLES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")
_CASH = {"$CASH", "CASH", "CASH & EQUIVALENTS", "CASH & EQUIV", "BUYING POWER",
         "CASH AND EQUIVALENTS", "现金"}


def _norm(sym: str) -> str:
    s = (sym or "").strip().upper()
    if s in _CASH or s.startswith("CASH"):
        return "$CASH"
    return s


def _score_one(name: str) -> dict:
    img = os.path.join(SAMPLES, f"{name}.png")
    with open(os.path.join(SAMPLES, f"{name}.gold.json")) as f:
        gold = json.load(f)
    with open(img, "rb") as fh:
        data = fh.read()
    out, latency, usage = extract_holdings(data)

    pred_syms = {_norm(h.symbol_or_name) for h in out.holdings}
    gold_syms = {_norm(r["symbol"]) for r in gold["rows"]}

    tp = len(pred_syms & gold_syms)
    fp = len(pred_syms - gold_syms)
    fn = len(gold_syms - pred_syms)
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0

    # quantity spot-check on matched symbols
    pred_by = {_norm(h.symbol_or_name): h for h in out.holdings}
    qty_ok = qty_tot = 0
    for r in gold["rows"]:
        s = _norm(r["symbol"])
        if s not in pred_by:
            continue
        for fld in ("shares", "weight_pct"):
            if fld in r:
                qty_tot += 1
                got = getattr(pred_by[s], fld, None)
                if got is not None and abs(float(got) - float(r[fld])) < 0.01:
                    qty_ok += 1

    llh_ok = bool(out.looks_like_holdings) == bool(gold["looks_like_holdings"])
    return {
        "name": name,
        "looks_like_holdings_pred": out.looks_like_holdings,
        "looks_like_holdings_ok": llh_ok,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "qty_match": f"{qty_ok}/{qty_tot}",
        "missing": sorted(gold_syms - pred_syms),
        "spurious": sorted(pred_syms - gold_syms),
        "latency_s": round(latency, 2),
        "usage": usage,
    }


def main() -> None:
    names = sorted(
        os.path.basename(p)[:-len(".gold.json")]
        for p in glob.glob(os.path.join(SAMPLES, "*.gold.json"))
    )
    if not names:
        print("No samples. Run gen_samples.py first.")
        raise SystemExit(1)

    results = []
    for n in names:
        try:
            r = _score_one(n)
        except Exception as e:  # noqa: BLE001 — PoC: surface any API/parse failure
            r = {"name": n, "error": f"{type(e).__name__}: {e}"}
        results.append(r)
        print(json.dumps(r, ensure_ascii=False))

    holdings_rows = [r for r in results if r.get("looks_like_holdings_pred") and "recall" in r]
    if holdings_rows:
        macro_r = sum(r["recall"] for r in holdings_rows) / len(holdings_rows)
        macro_p = sum(r["precision"] for r in holdings_rows) / len(holdings_rows)
        print(f"\nMACRO over holdings samples: precision={macro_p:.3f} recall={macro_r:.3f}"
              f"  (design gate: recall >= 0.90)")
    adv = [r for r in results if r["name"].startswith("sample_4")]
    if adv:
        print(f"Adversarial looks_like_holdings handled correctly: {adv[0].get('looks_like_holdings_ok')}")


if __name__ == "__main__":
    main()

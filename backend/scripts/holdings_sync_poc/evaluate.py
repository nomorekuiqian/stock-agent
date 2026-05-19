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


def _score_one(name: str, base: str = SAMPLES) -> dict:
    img = os.path.join(base, f"{name}.png")
    if not os.path.exists(img):
        # Real samples may be .jpg/.jpeg/.webp; pick whichever exists.
        for ext in (".jpg", ".jpeg", ".webp"):
            alt = os.path.join(base, f"{name}{ext}")
            if os.path.exists(alt):
                img = alt
                break
    with open(os.path.join(base, f"{name}.gold.json")) as f:
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


def _collect(subdir: str | None) -> list[str]:
    """Return sorted sample stems under SAMPLES[/subdir] (gold.json present)."""
    base = SAMPLES if not subdir else os.path.join(SAMPLES, subdir)
    if not os.path.isdir(base):
        return []
    return sorted(
        os.path.basename(p)[:-len(".gold.json")]
        for p in glob.glob(os.path.join(base, "*.gold.json"))
    )


RECALL_GATE = 0.90   # design §7 ship gate (matches test_real_images.py)


def _pretty(r: dict) -> str:
    """Human-readable one-sample diff. Per-sample line + nested
    missing/spurious/qty so the user can eyeball failures fast."""
    if "error" in r:
        return f"× {r['name']:<28} ERROR  {r['error']}"
    flag = "✓" if r.get("looks_like_holdings_ok") else "?"
    line = (
        f"{flag} {r['name']:<28} "
        f"P={r['precision']:.2f}  R={r['recall']:.2f}  "
        f"qty={r['qty_match']}  "
        f"lat={r['latency_s']:.1f}s"
    )
    extras = []
    if r.get("missing"):
        extras.append(f"  missing: {r['missing']}")
    if r.get("spurious"):
        extras.append(f"  spurious: {r['spurious']}")
    return "\n".join([line, *extras])


def main() -> None:
    """CLI: ``python evaluate.py [--dir <subdir>] [--json]``.

    ``--dir real`` scores user-provided real Robinhood/Fidelity screenshots
    under ``samples/real/`` (T2 ship gate). ``--json`` switches to
    machine-readable output (one JSON line per sample + a final summary
    object) — useful for CI eval reports.
    """
    subdir: str | None = None
    json_mode = "--json" in sys.argv
    if "--dir" in sys.argv:
        i = sys.argv.index("--dir")
        if i + 1 >= len(sys.argv):
            print("--dir requires a subpath, e.g. --dir real")
            raise SystemExit(2)
        subdir = sys.argv[i + 1]

    base = SAMPLES if not subdir else os.path.join(SAMPLES, subdir)
    names = _collect(subdir)
    if not names:
        print(f"No samples under {base}. Run gen_samples.py "
              "(synthetic) or drop real <name>.png + <name>.gold.json pairs in.")
        raise SystemExit(1)

    results = []
    for n in names:
        try:
            r = _score_one(n, base=base)
        except Exception as e:  # noqa: BLE001 — PoC: surface any API/parse failure
            r = {"name": n, "error": f"{type(e).__name__}: {e}"}
        results.append(r)
        if json_mode:
            print(json.dumps(r, ensure_ascii=False))
        else:
            print(_pretty(r))

    holdings_rows = [r for r in results
                     if r.get("looks_like_holdings_pred") and "recall" in r]
    summary: dict = {"count": len(results), "holdings_count": len(holdings_rows)}
    if holdings_rows:
        macro_r = sum(r["recall"] for r in holdings_rows) / len(holdings_rows)
        macro_p = sum(r["precision"] for r in holdings_rows) / len(holdings_rows)
        summary["macro_precision"] = round(macro_p, 3)
        summary["macro_recall"] = round(macro_r, 3)
        summary["recall_gate"] = RECALL_GATE
        summary["pass"] = macro_r >= RECALL_GATE
    adv = [r for r in results if r["name"].startswith("sample_4")]
    if adv:
        summary["adversarial_handled"] = bool(adv[0].get("looks_like_holdings_ok"))

    if json_mode:
        print(json.dumps({"summary": summary}, ensure_ascii=False))
    else:
        print()
        if "macro_recall" in summary:
            verdict = "PASS" if summary["pass"] else "FAIL"
            print(f"MACRO  P={summary['macro_precision']:.3f}  "
                  f"R={summary['macro_recall']:.3f}  "
                  f"(gate ≥{RECALL_GATE}: {verdict})")
        if "adversarial_handled" in summary:
            adv_ok = "✓" if summary["adversarial_handled"] else "✗"
            print(f"Adversarial looks_like_holdings={adv_ok}")

    if "pass" in summary and not summary["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

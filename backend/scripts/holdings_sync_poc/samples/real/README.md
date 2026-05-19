# Real-screenshot evaluation samples — T2 ship gate

This directory is the **hard ship gate** before Stage 1 (screenshot) goes live to
real users (design §7 / runbook M2 — recall ≥ 0.9 required on real samples).
The synthetic harness in the parent `samples/` directory proves the path is
correct but uses Pillow-generated images, which are easier than real broker
screenshots.

## How to add a sample

1. Take a screenshot of a real holdings page (Robinhood / Fidelity / Schwab /
   E*TRADE / brokerage native app etc.).
2. Save the image as `<name>.png` (or `.jpg`/`.jpeg`/`.webp`) here.
3. Create `<name>.gold.json` alongside it with the exact ground-truth holdings.

`gold.json` shape (mirrors the existing synthetic gold files; see
`../sample_1_clean.gold.json` for an example):

```json
{
  "looks_like_holdings": true,
  "rows": [
    {"symbol": "AAPL",  "shares": 10},
    {"symbol": "BRK.B", "shares": 1.5},
    {"symbol": "$CASH", "cost_basis": 1234.56}
  ]
}
```

Quantitative fields are optional per row — include only what's visible in the
screenshot (the LLM should likewise only extract what it sees).

## Running the eval

```bash
cd backend && source venv/bin/activate
python scripts/holdings_sync_poc/evaluate.py --dir real
```

Prints per-sample precision / recall / quantity match + a `MACRO over holdings
samples` line. **Ship gate: recall ≥ 0.90.**

## The pytest version

`backend/tests/eval/holdings_sync_extraction/test_real_images.py` auto-runs
the same eval. It is **skipped** when this directory is empty (so CI doesn't
fail) and is the explicit ship gate when populated.

## Privacy

Real screenshots may contain account numbers or balances. Treat them as
sensitive. If you commit them, redact accordingly (or commit gold-only without
the source image — the test will skip that pair).

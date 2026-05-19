# Real-screenshot evaluation samples — T2 ship gate

This directory is the **hard ship gate** before Stage 1 (screenshot) goes live to
real users (design §7 / runbook M2 — recall ≥ 0.9 required on real samples).
The synthetic harness in the parent `samples/` directory now covers nine
deterministic layouts (Robinhood-style mobile cards + Schwab / Fidelity /
E*TRADE-style desktop tables + a Chinese-broker layout + an adversarial
weather-card injection), but synthetic ≠ real:

- real screenshots have JPEG compression, font subpixel rendering, screen
  reflections, dark-mode vs light-mode quirks, modal overlays, OS UI chrome;
- real broker UIs change column orders and labels across version bumps
  (`Avg Cost` vs `Average Cost` vs `Avg Price`);
- real exports include rows we don't want — pending orders, options legs,
  bond fractional positions, custodial sub-accounts.

Until at least **5 real samples** sit here with verified gold, T2 (screenshot
launch to real users) must NOT ship.

## Fixture-quality checklist (read first)

A real sample is useful when it exercises something synthetic samples can't.
Target this distribution across your 5–10 fixtures:

| # | what | example |
|---|---|---|
| 1 | Robinhood mobile dark mode | iPhone screenshot of the Portfolio screen |
| 2 | Robinhood mobile percent view | the same account in % allocation mode |
| 3 | Fidelity desktop positions | desktop browser, has Cost Basis Per Share column |
| 4 | Schwab desktop positions | desktop browser, has "Qty (Quantity)" column |
| 5 | E*TRADE desktop positions | desktop browser, Purchase Price / Cost columns |
| 6 | Class shares present | account holding BRK.B + GOOG/GOOGL or BF.B / RDS.A |
| 7 | Cash + multiple currencies | $CASH row + a CNY/HKD holding if you have one |
| 8 | Long names + overflow | fund names truncated by ellipsis, two-line wrap |
| 9 | Light-mode browser export | Schwab "Print Friendly" or Fidelity PDF screenshot |
| 10 | Mobile horizontal table | a screenshot where columns scroll horizontally |

Avoid:

- redacted screenshots where the symbol column is blacked out (gives the LLM
  nothing to extract);
- composite images stitched from multiple screens (we test single-image
  extraction);
- screenshots of broker email confirmations rather than holdings pages.

## How to add a sample

1. Take a screenshot of a real holdings page following the checklist above.
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

Human-readable (default):
```bash
cd backend && source venv/bin/activate
python scripts/holdings_sync_poc/evaluate.py --dir real
```
Prints per-sample `✓ name P=0.95 R=0.92 qty=4/5 lat=4.2s` lines with
missing/spurious symbols nested underneath when present, then a
`MACRO P=… R=… (gate ≥0.90: PASS|FAIL)` summary. **Ship gate: recall ≥ 0.90.**
Exits non-zero on FAIL so this is shell-pipeable.

CI / machine output:
```bash
python scripts/holdings_sync_poc/evaluate.py --dir real --json
```
One JSON line per sample + a final `{"summary": {...}}` line including
`pass: true|false`. Use this in nightly eval reporting.

## The pytest version

`backend/tests/eval/holdings_sync_extraction/test_real_images.py` auto-runs
the same eval. It is **skipped** when this directory is empty (so CI doesn't
fail) and is the explicit ship gate when populated.

## Privacy

Real screenshots may contain account numbers or balances. Treat them as
sensitive. If you commit them, redact accordingly (or commit gold-only without
the source image — the test will skip that pair).

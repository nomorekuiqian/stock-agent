# holdings_sync vision-parse PoC

Proves the design §1.1(b)/§2.1/§5 screenshot→holdings path with the fixed model
`gemini-3.1-flash-lite-preview`. See `RESULTS.md` for measured results and the
design-impacting schema finding.

## Files
- `schema.py` — Pydantic mirror of design `VisionExtractionOutput` (NO P1 fields).
- `gen_samples.py` — renders **9 synthetic samples + gold** into `samples/`:
  · 1–5 Robinhood-style mobile cards (dark mode) covering the easy 80% +
    edges (Cash, percent-only view, BRK-B / 贵州茅台 / 9988.HK heterogeneity)
    and an adversarial weather/injection card.
  · 6–8 desktop broker tables (Schwab / Fidelity / E*TRADE) mirroring the
    parser broker-registry discriminators (Qty (Quantity) / Cost Basis Per
    Share / Purchase Price).
  · 9 Chinese broker layout (雪球/同花顺-style, Chinese headers + 600519/00700/
    09988 + Cash row).
- `extract.py` — Gemini flash-lite structured extraction (explicit nullable schema, post-parse 60 cap, hardened anti-injection prompt). Loads `GOOGLE_API_KEY` from env or `backend/.env`.
- `evaluate.py` — runs extraction over `samples/` (or a subdir via `--dir`),
  scores precision / recall / quantity / adversarial. Two output modes:
  human (per-sample `✓/×` line + nested missing/spurious + MACRO summary
  with PASS|FAIL verdict, exits non-zero on FAIL) and `--json` (one JSON
  line per sample + final summary object — for nightly eval CI).
- `samples/real/` — placeholder for real broker screenshots (T2 ship gate;
  see `samples/real/README.md` for the fixture-quality checklist).

## Run
```bash
cd backend/scripts/holdings_sync_poc
/path/to/backend/venv/bin/python gen_samples.py
/path/to/backend/venv/bin/python evaluate.py                # synthetic (9)
/path/to/backend/venv/bin/python evaluate.py --dir real     # T2 ship-gate
/path/to/backend/venv/bin/python evaluate.py --json         # CI JSON output
# single image:
/path/to/backend/venv/bin/python extract.py samples/sample_2_edges.png
```
Needs the backend venv (`google-genai`, `Pillow`) and a valid `GOOGLE_API_KEY`.

## Add real screenshots (T2 ship gate)
Drop `samples/real/<name>.png` + `samples/real/<name>.gold.json` — see
`samples/real/README.md` for the recommended fixture-quality checklist
(distribute across Robinhood / Fidelity / Schwab / E*TRADE / mobile vs
desktop / class shares / cash + multi-currency).
```json
{ "looks_like_holdings": true,
  "rows": [ {"symbol": "AAPL", "shares": 120}, {"symbol": "$CASH", "weight_pct": 4.5} ] }
```
Re-run `evaluate.py --dir real` (or `pytest -m slow
tests/eval/holdings_sync_extraction/`). Ship gate: macro recall ≥ 0.90.

## Status
PoC only — not wired into the app. Resolver/quote/cache/quota/reconcile are out
of scope (separately covered by the task breakdown). `requirements.txt` not yet
edited (task T0.1).

# holdings_sync vision-parse PoC

Proves the design §1.1(b)/§2.1/§5 screenshot→holdings path with the fixed model
`gemini-3.1-flash-lite-preview`. See `RESULTS.md` for measured results and the
design-impacting schema finding.

## Files
- `schema.py` — Pydantic mirror of design `VisionExtractionOutput` (NO P1 fields).
- `gen_samples.py` — renders synthetic Robinhood-style screenshots + gold JSON into `samples/`.
- `extract.py` — Gemini flash-lite structured extraction (explicit nullable schema, post-parse 60 cap, hardened anti-injection prompt). Loads `GOOGLE_API_KEY` from env or `backend/.env`.
- `evaluate.py` — runs extraction over `samples/`, scores precision/recall + quantity + adversarial.

## Run
```bash
cd backend/scripts/holdings_sync_poc
/path/to/backend/venv/bin/python gen_samples.py
/path/to/backend/venv/bin/python evaluate.py
# single image:
/path/to/backend/venv/bin/python extract.py samples/sample_2_edges.png
```
Needs the backend venv (`google-genai`, `Pillow`) and a valid `GOOGLE_API_KEY`.

## Add real screenshots (for design T2-EVAL)
Drop `samples/<name>.png` + `samples/<name>.gold.json`:
```json
{ "looks_like_holdings": true,
  "rows": [ {"symbol": "AAPL", "shares": 120}, {"symbol": "$CASH", "weight_pct": 4.5} ] }
```
Re-run `evaluate.py` — harness auto-discovers `*.gold.json`. Gate: macro recall ≥ 0.90.

## Status
PoC only — not wired into the app. Resolver/quote/cache/quota/reconcile are out
of scope (separately covered by the task breakdown). `requirements.txt` not yet
edited (task T0.1).
